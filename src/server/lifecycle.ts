import type { HealthState } from "./health";

export type LifecycleConnection = {
  drain(): Promise<void>;
  cancel(): Promise<void>;
  close(): Promise<void>;
};

type LifecycleOptions = {
  gracePeriodMs: number;
};

export class LifecycleController {
  readonly #health: HealthState;
  readonly #gracePeriodMs: number;
  readonly #connections = new Set<LifecycleConnection>();
  #acceptingConnections = true;
  #shutdown?: Promise<void>;

  constructor(health: HealthState, options: LifecycleOptions) {
    if (!Number.isSafeInteger(options.gracePeriodMs) || options.gracePeriodMs < 0) {
      throw new Error("gracePeriodMs must be a non-negative integer");
    }
    this.#health = health;
    this.#gracePeriodMs = options.gracePeriodMs;
  }

  get acceptingConnections(): boolean {
    return this.#acceptingConnections;
  }

  get activeConnectionCount(): number {
    return this.#connections.size;
  }

  register(connection: LifecycleConnection): () => void {
    if (!this.#acceptingConnections) throw new Error("server is shutting down");
    this.#connections.add(connection);
    return () => {
      this.#connections.delete(connection);
    };
  }

  shutdown(): Promise<void> {
    this.#shutdown ??= this.#performShutdown();
    return this.#shutdown;
  }

  async #performShutdown(): Promise<void> {
    this.#health.beginShutdown();
    this.#acceptingConnections = false;
    const connections = [...this.#connections];
    if (connections.length === 0) return;

    const drained = Promise.all(connections.map((connection) => connection.drain())).then(
      () => true,
      () => false,
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), this.#gracePeriodMs);
    });
    const completed = await Promise.race([drained, expired]);
    if (timeout) clearTimeout(timeout);

    if (!completed) {
      await Promise.allSettled(connections.map((connection) => connection.cancel()));
    }
    await Promise.allSettled(connections.map((connection) => connection.close()));
    this.#connections.clear();
  }
}
