import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Blocked } from "../domain/util.js";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:0:|db8:|2:|10:|20:)/i.test(address) &&
      !/^2002:/i.test(address)
    );
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19].includes(b)) ||
    (a === 192 && b === 0 && [0, 2].includes(c)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** Pin the connection to validated DNS results; never re-resolve during TLS connect. */
async function fetchPinned(
  url: URL,
  addresses: { address: string; family: number }[],
  signal: AbortSignal,
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        agent: false,
        lookup: (_host, options, callback) => {
          // Node may request all addresses (autoSelectFamily) or a single pinned address.
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0]!.address, addresses[0]!.family);
        },
        headers: {
          Accept: "text/plain,text/html,application/json",
          "User-Agent": "PerfectHarness/0.1 documentation fetch",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          resolve({ status, location: response.headers.location, body: "" });
          response.destroy();
          return;
        }
        const type = response.headers["content-type"] ?? "";
        if (!/^text\/(?:plain|html)|^application\/json/i.test(type)) {
          response.destroy();
          reject(
            new Blocked(
              "RESEARCH_FORMAT",
              "Only text documentation is supported",
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 200000) {
            response.destroy();
            reject(new Blocked("RESEARCH_SIZE", "Reference exceeds 200 KB"));
          } else chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () =>
          resolve({ status, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.once("error", reject);
    req.end();
  });
}

/** Opt-in public docs, no cookies/authorization, with validation repeated on each redirect. */
export async function fetchReference(
  raw: string,
  allowedHosts: string[],
  signal: AbortSignal,
): Promise<string> {
  let url = new URL(raw);
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  for (let redirects = 0; redirects < 4; redirects++) {
    bounded.throwIfAborted();
    if (
      url.protocol !== "https:" ||
      (url.port && url.port !== "443") ||
      url.username ||
      url.password ||
      !allowedHosts.includes(url.hostname) ||
      isIP(url.hostname)
    )
      throw new Blocked("RESEARCH_HOST", url.hostname);
    const addresses = await lookup(url.hostname, { all: true });
    bounded.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Blocked("RESEARCH_ADDRESS", "Private or ambiguous destination");
    const result = await fetchPinned(url, addresses, bounded);
    if (result.status >= 300 && result.status < 400) {
      if (!result.location) throw new Error("Redirect without location");
      url = new URL(result.location, url);
      continue;
    }
    if (result.status < 200 || result.status >= 300)
      throw new Error(`Documentation HTTP ${result.status}`);
    return `UNTRUSTED DOCUMENTATION FROM ${url.href}\n${result.body}`;
  }
  throw new Error("Too many documentation redirects");
}
