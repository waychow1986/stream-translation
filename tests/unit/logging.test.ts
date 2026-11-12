import { describe, expect, it } from "vitest";

import { createLogRecord } from "../../src/server/adapters/types";

describe("structured logging boundary", () => {
  it("keeps only non-content allowlisted fields", () => {
    const record = createLogRecord({
      level: "info",
      event: "segment.completed",
      correlationId: "correlation-1",
      sessionState: "streaming",
      durationMs: 14,
      errorCategory: undefined,
      sourceText: "customer speech",
      translatedText: "客户语音",
      token: "secret",
    });
    const serialized = JSON.stringify(record);
    expect(record).toMatchObject({
      level: "info",
      event: "segment.completed",
      correlationId: "correlation-1",
    });
    expect(serialized).not.toContain("customer speech");
    expect(serialized).not.toContain("客户语音");
    expect(serialized).not.toContain("secret");
  });
});
