import type { ClientEventMap } from "../types/client.js";

/**
 * Minimal dependency-free event emitter for the client's `"request"` /
 * `"response"` observability events (the zero-runtime-deps invariant rules
 * out eventemitter3, and `node:events` would break browser/edge neutrality).
 */
export class ClientEvents {
  // Listener return values are ignored (`=> unknown`, not `=> void`): the
  // plain-void type would reject expression-body arrows and a void union
  // would reject value-returning ones — this accepts both, plus async.
  private readonly listeners = new Map<keyof ClientEventMap, Set<(payload: never) => unknown>>();

  on<K extends keyof ClientEventMap>(
    event: K,
    listener: (payload: ClientEventMap[K]) => unknown,
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<K extends keyof ClientEventMap>(
    event: K,
    listener: (payload: ClientEventMap[K]) => unknown,
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof ClientEventMap>(event: K, payload: ClientEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Snapshot so a listener that unsubscribes (itself or a peer) mid-dispatch
    // cannot skip or double-invoke anyone in this emission.
    for (const listener of [...set]) {
      try {
        const result = (listener as (p: ClientEventMap[K]) => unknown)(payload);
        // An async listener's rejection would otherwise be unhandled and
        // crash the process under Node's default --unhandled-rejections.
        if (
          result !== null &&
          typeof result === "object" &&
          typeof (result as PromiseLike<unknown>).then === "function"
        ) {
          void Promise.resolve(result).catch(() => {
            // Async observers must never fail (or crash) what they observe.
          });
        }
      } catch {
        // Observers must never fail (or retry) the request they observe.
      }
    }
  }
}
