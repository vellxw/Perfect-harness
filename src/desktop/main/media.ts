import { open, lstat, realpath, type FileHandle } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { parseRange, APP_ORIGIN } from "../contracts/protocol.js";
interface MediaEntry {
  handle: FileHandle;
  path: string;
  size: number;
  mime: string;
  mtime: number;
  hash: string;
  streams: Set<Readable>;
}
export class MediaBroker {
  private entries = new Map<string, MediaEntry>();
  constructor(readonly root: string) {}
  async add(input: {
    path: string;
    size: number;
    sha256: string;
    extension: string;
  }): Promise<{ url: string; mime: string }> {
    const mime: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".glb": "model/gltf-binary",
    };
    if (
      !mime[input.extension] ||
      input.size < 1 ||
      input.size > 150000000 ||
      (await realpath(dirname(input.path))) !== (await realpath(this.root))
    )
      throw Error("Recurso fuera del almacén autorizado");
    const st = await lstat(input.path);
    if (
      !st.isFile() ||
      st.isSymbolicLink() ||
      st.nlink !== 1 ||
      st.size !== input.size
    )
      throw Error("Recurso alterado");
    const handle = await open(
      input.path,
      constants.O_RDONLY |
        (process.platform === "win32" ? 0 : constants.O_NOFOLLOW),
    );
    try {
      const opened = await handle.stat();
      if (
        opened.ino !== st.ino ||
        opened.dev !== st.dev ||
        opened.size !== st.size ||
        opened.nlink !== 1
      )
        throw Error("Recurso cambió al abrir");
      const digest = createHash("sha256");
      for await (const chunk of handle.createReadStream({
        start: 0,
        autoClose: false,
      }))
        digest.update(chunk);
      if (digest.digest("hex") !== input.sha256)
        throw Error("Hash del recurso alterado");
      const header = Buffer.alloc(24);
      await handle.read(header, 0, 24, 0);
      const valid =
        input.extension === ".png"
          ? header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
          : input.extension === ".jpg" || input.extension === ".jpeg"
            ? header[0] === 255 && header[1] === 216
            : input.extension === ".webp"
              ? header.toString("ascii", 0, 4) === "RIFF" &&
                header.toString("ascii", 8, 12) === "WEBP"
              : input.extension === ".glb"
                ? header.toString("ascii", 0, 4) === "glTF" &&
                  header.readUInt32LE(4) === 2
                : input.extension === ".mp4"
                  ? header.toString("ascii", 4, 8) === "ftyp"
                  : header.subarray(0, 4).toString("hex") === "1a45dfa3";
      if (!valid)
        throw Error("La firma del archivo no coincide con su formato");
      if (this.entries.size >= 24) {
        const oldest = this.entries.keys().next().value!;
        await this.remove(oldest);
      }
      const token = randomUUID();
      this.entries.set(token, {
        handle,
        path: input.path,
        size: input.size,
        mime: mime[input.extension]!,
        mtime: opened.mtimeMs,
        hash: input.sha256,
        streams: new Set(),
      });
      return { url: `perfect://media/${token}`, mime: mime[input.extension]! };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async respond(request: Request): Promise<Response> {
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405 });
    const url = new URL(request.url),
      entry = this.entries.get(url.pathname.slice(1));
    if (!entry || url.search || url.hash)
      return new Response("No autorizado", { status: 403 });
    try {
      const current = await entry.handle.stat();
      if (
        current.size !== entry.size ||
        current.mtimeMs !== entry.mtime ||
        current.nlink !== 1
      )
        throw Error("Recurso modificado durante reproducción");
      const range = parseRange(request.headers.get("range"), entry.size);
      const headers = {
        "Content-Type": entry.mime,
        "Accept-Ranges": "bytes",
        "Content-Length": String(range.end - range.start + 1),
        ...(range.partial
          ? {
              "Content-Range": `bytes ${range.start}-${range.end}/${entry.size}`,
            }
          : {}),
        "Content-Security-Policy": "default-src 'none'",
        "Access-Control-Allow-Origin": APP_ORIGIN,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      };
      if (request.method === "HEAD")
        return new Response(null, {
          status: range.partial ? 206 : 200,
          headers,
        });
      const stream = entry.handle.createReadStream({
        start: range.start,
        end: range.end,
        autoClose: false,
      });
      entry.streams.add(stream);
      stream.once("close", () => entry.streams.delete(stream));
      stream.once("end", () => entry.streams.delete(stream));
      const abort = () => stream.destroy();
      request.signal.addEventListener("abort", abort, { once: true });
      stream.once("close", () =>
        request.signal.removeEventListener("abort", abort),
      );
      stream.once("end", () =>
        request.signal.removeEventListener("abort", abort),
      );
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        { status: range.partial ? 206 : 200, headers },
      );
    } catch {
      return new Response("Rango o recurso no válido", { status: 416 });
    }
  }
  private async remove(token: string) {
    const entry = this.entries.get(token);
    if (!entry) return;
    this.entries.delete(token);
    for (const stream of entry.streams) stream.destroy();
    await entry.handle.close().catch(() => {});
  }
  async clear() {
    await Promise.all(
      [...this.entries.keys()].map((token) => this.remove(token)),
    );
  }
}
