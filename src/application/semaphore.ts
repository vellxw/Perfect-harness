export class Semaphore {
  private used = 0;
  private queue: Array<{
    resolve: (release: () => void) => void;
    reject: (reason: unknown) => void;
    signal: AbortSignal;
    abort: () => void;
  }> = [];
  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("Invalid semaphore capacity");
  }
  private release = () => {
    const next = this.queue.shift();
    if (next) {
      next.signal.removeEventListener("abort", next.abort);
      next.resolve(this.release);
    } else this.used--;
  };
  private acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    if (this.used < this.capacity) {
      this.used++;
      return Promise.resolve(this.release);
    }
    return new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        signal,
        abort: () => {
          this.queue = this.queue.filter((q) => q !== item);
          reject(signal.reason ?? new Error("Aborted"));
        },
      };
      this.queue.push(item);
      signal.addEventListener("abort", item.abort, { once: true });
    });
  }
  async use<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire(signal);
    try {
      signal.throwIfAborted();
      return await fn();
    } finally {
      release();
    }
  }
}
