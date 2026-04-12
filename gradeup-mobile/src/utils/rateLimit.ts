/**
 * Client-side rate limiting utilities for preventing API abuse.
 *
 * - `RateLimiter`: sliding-window limiter — rejects calls that exceed N
 *   invocations within a time window.
 * - `Cooldown`: simple per-key cooldown — rejects a repeat call for the
 *   same key until the cooldown elapses.
 * - `debounceAsync`: trailing-edge debounce for async functions — only the
 *   last call within `ms` actually fires.
 */

export class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxCalls: number,
    private windowMs: number,
  ) {}

  /** Returns `true` if the call is allowed, `false` if rate-limited. */
  attempt(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxCalls) return false;
    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }
}

export class Cooldown {
  private lastCall = new Map<string, number>();
  constructor(private cooldownMs: number) {}

  /** Returns `true` if the action is allowed for this key. */
  attempt(key: string): boolean {
    const now = Date.now();
    const prev = this.lastCall.get(key) ?? 0;
    if (now - prev < this.cooldownMs) return false;
    this.lastCall.set(key, now);
    return true;
  }

  reset(key?: string): void {
    if (key) this.lastCall.delete(key);
    else this.lastCall.clear();
  }
}

export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void fn(...args);
    }, ms);
  };
}
