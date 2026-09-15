import { Blocked } from "../../domain/util.js";

/** Service metadata only. Never retain content, tool arguments, reasoning or headers with credentials. */
export interface TransportObservation {
  model?: string;
  reasoning?: string;
  responseId?: string;
  usageReported: boolean;
  reasoningTokensReported: boolean;
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function observeResponse(
  event: unknown,
  into: TransportObservation,
  expected: { model: string; reasoning?: string },
): void {
  const envelope = object(event);
  if (!envelope) return;
  const data = object(envelope.response) ?? envelope;
  if (typeof data.model === "string") {
    if (data.model !== expected.model)
      throw new Blocked(
        "ROUTE_RESPONSE_MISMATCH",
        `Requested ${expected.model}; service reported ${data.model}`,
      );
    into.model = data.model;
  }
  const reasoning = object(data.reasoning)?.effort ?? data.reasoning_effort;
  if (typeof reasoning === "string") {
    if (reasoning !== expected.reasoning)
      throw new Blocked(
        "REASONING_RESPONSE_MISMATCH",
        `Requested ${expected.reasoning ?? "off"}; service reported ${reasoning}`,
      );
    into.reasoning = reasoning;
  }
  if (typeof data.id === "string" && data.id.length <= 512)
    into.responseId = data.id;
  const usage = object(data.usage);
  if (usage) {
    const input = usage.input_tokens ?? usage.prompt_tokens;
    const output = usage.output_tokens ?? usage.completion_tokens;
    const valid = (value: unknown) =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    if (input !== undefined || output !== undefined) {
      if (!valid(input) || !valid(output))
        throw new Blocked("USAGE_INVALID", "Malformed service token counters");
      into.usageReported = true;
    }
    const details = object(
      usage.output_tokens_details ?? usage.completion_tokens_details,
    );
    if (details?.reasoning_tokens !== undefined) {
      if (!valid(details.reasoning_tokens))
        throw new Blocked("USAGE_INVALID", "Malformed reasoning token count");
      into.reasoningTokensReported = true;
    }
  }
}

/** Bounded, chunk-independent SSE decoder. Pass complete events only after validating metadata. */
export function metadataStream(
  observation: TransportObservation,
  expected: { model: string; reasoning?: string },
  onError: (error: unknown) => void,
  maxEventBytes = 4_000_000,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder(),
    encoder = new TextEncoder();
  let pending = "";
  const emit = (
    raw: string,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) => {
    const data = raw
      .split(/\r\n|\n|\r/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data && data.trim() !== "[DONE]")
      observeResponse(JSON.parse(data), observation, expected);
    controller.enqueue(encoder.encode(raw));
  };
  const consume = (
    controller: TransformStreamDefaultController<Uint8Array>,
    final = false,
  ) => {
    let match: RegExpExecArray | null;
    while ((match = /\r\n\r\n|\n\n|\r\r/.exec(pending))) {
      const end = match.index + match[0].length;
      if (Buffer.byteLength(pending.slice(0, end)) > maxEventBytes)
        throw new Blocked(
          "SSE_EVENT_LIMIT",
          "Provider event exceeds bounded transport buffer",
        );
      emit(pending.slice(0, end), controller);
      pending = pending.slice(end);
    }
    if (Buffer.byteLength(pending) > maxEventBytes)
      throw new Blocked(
        "SSE_EVENT_LIMIT",
        "Provider event exceeds bounded transport buffer",
      );
    if (final && pending) {
      emit(pending, controller);
      pending = "";
    }
  };
  return new TransformStream({
    transform(chunk, controller) {
      try {
        pending += decoder.decode(chunk, { stream: true });
        consume(controller);
      } catch (error) {
        onError(error);
        throw error;
      }
    },
    flush(controller) {
      try {
        pending += decoder.decode();
        consume(controller, true);
      } catch (error) {
        onError(error);
        throw error;
      }
    },
  });
}

/** Explicit fetch injection, not a global monkey patch. The actual endpoint cannot change silently. */
export function auditedFetch(
  underlying: typeof globalThis.fetch,
  observation: TransportObservation,
  expected: { endpoint: string; model: string; reasoning?: string },
  onError: (error: unknown) => void,
): typeof globalThis.fetch {
  return async (input, init) => {
    try {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (
        url.origin !== new URL(expected.endpoint).origin ||
        url.username ||
        url.password
      )
        throw new Blocked(
          "ENDPOINT_MISMATCH",
          "Provider request changed its authorized origin",
        );
      const response = await underlying(input, { ...init, redirect: "error" });
      if (!response.ok || !response.body) return response;
      if (!response.headers.get("content-type")?.includes("text/event-stream"))
        throw new Blocked(
          "TRANSPORT_UNOBSERVABLE",
          "Expected SSE; refusing an unaudited successful provider response",
        );
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(
        response.body.pipeThrough(
          metadataStream(observation, expected, onError),
        ),
        {
          status: response.status,
          statusText: response.statusText,
          headers,
        },
      );
    } catch (error) {
      onError(error);
      throw error;
    }
  };
}
