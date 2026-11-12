import { describe, expect, it, vi } from "vitest";

import type { TranslationAdapter } from "../../src/server/adapters/types";
import { TranslationCoordinator } from "../../src/server/session/coordinator";
import { SessionStateMachine } from "../../src/server/session/state-machine";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";

describe("TranslationCoordinator", () => {
  it("serializes segments and emits cumulative partials, one final, and increasing wire values", async () => {
    const active = { count: 0, maximum: 0 };
    const released: string[] = [];
    const adapter: TranslationAdapter = {
      async translate(input, onPartial) {
        active.count += 1;
        active.maximum = Math.max(active.maximum, active.count);
        onPartial(input.ordinal === 1 ? "你" : "世");
        onPartial(input.ordinal === 1 ? "你好" : "世界");
        active.count -= 1;
        released.push(input.sourceText);
        return input.ordinal === 1 ? "你好" : "世界";
      },
      cancel: vi.fn(async () => undefined),
    };
    const state = new SessionStateMachine();
    state.start(1);
    const events: Record<string, unknown>[] = [];
    const coordinator = new TranslationCoordinator({
      adapter,
      sessionId: SESSION_ID,
      state,
      send: (event) => events.push(event as unknown as Record<string, unknown>),
    });

    coordinator.enqueue({
      segmentId: "00000000-0000-4000-8000-000000000011",
      ordinal: 1,
      sourceLanguage: "en-US",
      sourceText: "hello",
    });
    coordinator.enqueue({
      segmentId: "00000000-0000-4000-8000-000000000012",
      ordinal: 2,
      sourceLanguage: "fr-FR",
      sourceText: "world",
    });
    await coordinator.drain();

    expect(active.maximum).toBe(1);
    expect(events.map(({ type }) => type)).toEqual([
      "subtitle.partial",
      "subtitle.partial",
      "subtitle.final",
      "subtitle.partial",
      "subtitle.partial",
      "subtitle.final",
    ]);
    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.map(({ revision }) => revision)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(events.filter(({ type }) => type === "subtitle.final")).toHaveLength(2);
    expect(released).toEqual(["hello", "world"]);
  });

  it("isolates a failed segment and continues with the next segment", async () => {
    const adapter: TranslationAdapter = {
      async translate(input) {
        if (input.ordinal === 1) throw new Error("provider content must not escape");
        return "恢复";
      },
      cancel: vi.fn(async () => undefined),
    };
    const state = new SessionStateMachine();
    state.start(1);
    const events: Record<string, unknown>[] = [];
    const coordinator = new TranslationCoordinator({
      adapter,
      sessionId: SESSION_ID,
      state,
      send: (event) => events.push(event as unknown as Record<string, unknown>),
    });

    for (const ordinal of [1, 2]) {
      coordinator.enqueue({
        segmentId: `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
        ordinal,
        sourceLanguage: "en-US",
        sourceText: `private-${ordinal}`,
      });
    }
    await coordinator.drain();

    expect(events.map(({ type }) => type)).toEqual(["segment.error", "subtitle.final"]);
    expect(JSON.stringify(events)).not.toContain("provider content");
    expect(JSON.stringify(events)).not.toContain("private-");
  });
});
