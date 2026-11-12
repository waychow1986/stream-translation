export class HealthState {
  #shuttingDown = false;

  beginShutdown(): void {
    this.#shuttingDown = true;
  }

  status():
    | { statusCode: 200; body: { status: "ready" } }
    | { statusCode: 503; body: { status: "shutting_down" } } {
    return this.#shuttingDown
      ? { statusCode: 503, body: { status: "shutting_down" } }
      : { statusCode: 200, body: { status: "ready" } };
  }
}

type LogInput = {
  level: "info" | "warn" | "error";
  event: string;
  correlationId?: string;
  sessionState?: "connected" | "streaming" | "draining" | "ended";
  durationMs?: number;
  errorCategory?: "speech" | "translation" | "protocol";
  [key: string]: unknown;
};

export function createLogRecord(input: LogInput) {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    event: input.event,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.sessionState ? { sessionState: input.sessionState } : {}),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.errorCategory ? { errorCategory: input.errorCategory } : {}),
  };
}
