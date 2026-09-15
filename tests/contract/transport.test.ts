import test from "node:test";
import assert from "node:assert/strict";
import {
  metadataStream,
  observeResponse,
  auditedFetch,
  type TransportObservation,
} from "../../src/adapters/pi/transport-audit.js";
const fresh = (): TransportObservation => ({
  usageReported: false,
  reasoningTokensReported: false,
});
const expected = { model: "contract-model", reasoning: "xhigh" };

test("SSE metadata survives byte-wise UTF8/CRLF chunks without retaining content", async () => {
  const observation = fresh();
  const payload =
    "data: " +
    JSON.stringify({
      type: "response.completed",
      response: {
        model: expected.model,
        reasoning: { effort: "xhigh" },
        id: "resp-1",
        output: [{ text: "secreto ñ 😃" }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 2 },
        },
      },
    }) +
    "\r\n\r\ndata: [DONE]\r\n\r\n";
  const bytes = new TextEncoder().encode(payload);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const output = await new Response(
    source.pipeThrough(metadataStream(observation, expected, () => {})),
  ).text();
  assert.equal(output, payload);
  assert.deepEqual(observation, {
    model: "contract-model",
    reasoning: "xhigh",
    responseId: "resp-1",
    usageReported: true,
    reasoningTokensReported: true,
  });
  assert.equal(JSON.stringify(observation).includes("secreto"), false);
});

test("absence is unknown; legitimate zero service usage is not absence", () => {
  const data = fresh();
  observeResponse(
    { type: "response.completed", response: { status: "completed" } },
    data,
    expected,
  );
  assert.deepEqual(data, fresh());
  observeResponse(
    { usage: { prompt_tokens: 0, completion_tokens: 0 } },
    data,
    expected,
  );
  assert.equal(data.usageReported, true);
  assert.equal(data.reasoningTokensReported, false);
  assert.throws(
    () =>
      observeResponse(
        { usage: { input_tokens: -1, output_tokens: 5 } },
        data,
        expected,
      ),
    /USAGE_INVALID/,
  );
});

for (const [name, response, code] of [
  ["different model", { model: "unexpected-model" }, "ROUTE_RESPONSE_MISMATCH"],
  [
    "downgraded reasoning",
    { model: "contract-model", reasoning: { effort: "high" } },
    "REASONING_RESPONSE_MISMATCH",
  ],
] as const)
  test(`stream rejects ${name} before SDK can execute its tool output`, async () => {
    let error: unknown;
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify({ response })}\n\n`,
    );
    const source = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    });
    await assert.rejects(
      new Response(
        source.pipeThrough(
          metadataStream(fresh(), expected, (e) => {
            error = e;
          }),
        ),
      ).text(),
      new RegExp(code),
    );
    assert.ok(error);
  });

test("oversized SSE event fails closed", async () => {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("data: " + "x".repeat(100)));
      c.close();
    },
  });
  await assert.rejects(
    new Response(
      source.pipeThrough(metadataStream(fresh(), expected, () => {}, 40)),
    ).text(),
    /SSE_EVENT_LIMIT/,
  );
});

test("fetch origin mismatch blocks before sending credentials", async () => {
  let called = false;
  const transport = auditedFetch(
    async () => {
      called = true;
      return new Response();
    },
    fresh(),
    { ...expected, endpoint: "https://example.com/v1" },
    () => {},
  );
  await assert.rejects(
    transport("https://evil.example/v1"),
    /ENDPOINT_MISMATCH/,
  );
  assert.equal(called, false);
});

test("Retry-After supports seconds and HTTP dates without shortening provider cooldown", async () => {
  const { parseRetryAfter } = await import("../../src/adapters/pi/runtime.js");
  assert.equal(parseRetryAfter("120"), 120000);
  assert.equal(
    parseRetryAfter(
      "Mon, 14 Sep 2026 12:02:00 GMT",
      Date.parse("2026-09-14T12:00:00Z"),
    ),
    120000,
  );
  assert.equal(parseRetryAfter("garbage"), 0);
  assert.equal(parseRetryAfter(undefined), 0);
});
