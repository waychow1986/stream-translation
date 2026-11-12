import { describe, expect, it } from "vitest";

import {
  AUDIO_FORMAT,
  parseClientMessage,
  parseServerEvent,
  validatePcmFrame,
} from "../../src/shared/schemas";

describe("WebSocket v1 schemas", () => {
  it("accepts the fixed session.start contract without a source language", () => {
    expect(
      parseClientMessage({
        type: "session.start",
        version: 1,
        sequence: 1,
        audio: AUDIO_FORMAT,
      }),
    ).toEqual({
      type: "session.start",
      version: 1,
      sequence: 1,
      audio: AUDIO_FORMAT,
    });
  });

  it.each([
    { type: "session.start", version: 1, sequence: 1, audio: AUDIO_FORMAT, sourceLanguage: "en-US" },
    { type: "audio.chunk", version: 1, sequence: 2, byteLength: 639 },
    { type: "audio.end", version: 2, sequence: 2 },
    { type: "unknown", version: 1, sequence: 2 },
  ])("rejects malformed or open control messages", (message) => {
    expect(() => parseClientMessage(message)).toThrow();
  });

  it("requires positive integer sequence values", () => {
    expect(() =>
      parseClientMessage({ type: "audio.end", version: 1, sequence: 0 }),
    ).toThrow(/sequence/);
  });

  it("validates the paired fixed-size PCM frame", () => {
    expect(validatePcmFrame(new Uint8Array(640))).toHaveLength(640);
    expect(() => validatePcmFrame(new Uint8Array(638))).toThrow(/640/);
  });

  it("accepts a closed subtitle event and rejects HTML-shaped extras", () => {
    const event = {
      type: "subtitle.final",
      version: 1,
      sequence: 4,
      sessionId: "4e4e4988-bb7f-4b79-9c2c-c03642acec82",
      segmentId: "50452001-a29c-4c0f-b4f5-dd819f9ff75b",
      ordinal: 1,
      revision: 2,
      sourceLanguage: "en-US",
      text: "你好",
    };

    expect(parseServerEvent(event)).toEqual(event);
    expect(() => parseServerEvent({ ...event, html: "<b>你好</b>" })).toThrow();
  });
});
