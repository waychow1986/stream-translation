import { describe, expect, it, vi } from "vitest";

import {
  AzureSpeechAdapter,
  type SpeechRuntime,
  type SpeechRuntimeCallbacks,
  type SpeechRuntimeSession,
} from "../../src/server/adapters/azure-speech";

class RuntimeDouble implements SpeechRuntime {
  callbacks?: SpeechRuntimeCallbacks;
  readonly writes: Uint8Array[] = [];
  readonly sessions: SpeechRuntimeSession[] = [];
  createCount = 0;

  async createSession(
    _token: string,
    options: { endpoint: string; candidateLocales: readonly string[] },
    callbacks: SpeechRuntimeCallbacks,
  ): Promise<SpeechRuntimeSession> {
    expect(options).toEqual({
      endpoint: "https://speech.example.test/",
      candidateLocales: ["en-US", "fr-FR"],
    });
    this.callbacks = callbacks;
    this.createCount += 1;
    const session = {
      write: vi.fn((frame: Uint8Array) => {
        this.writes.push(frame);
      }),
      end: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      updateToken: vi.fn(),
    };
    this.sessions.push(session);
    return session;
  }
}

function createAdapter(runtime: RuntimeDouble) {
  return new AzureSpeechAdapter({
    endpoint: "https://speech.example.test/",
    candidateLocales: ["en-US", "fr-FR"],
    credential: {
      getToken: vi.fn(async () => ({ token: "opaque", expiresOnTimestamp: Date.now() + 60_000 })),
    },
    runtime,
  });
}

describe("AzureSpeechAdapter", () => {
  it("uses fixed PCM, continuous LID candidates, and emits only allowlisted final segments", async () => {
    const runtime = new RuntimeDouble();
    const adapter = createAdapter(runtime);
    const segments: unknown[] = [];
    await adapter.start((segment) => segments.push(segment), vi.fn());

    runtime.callbacks?.recognized({ reason: "recognized", text: " hello ", language: "en-US" });
    runtime.callbacks?.recognized({ reason: "noMatch", text: "", language: "" });
    runtime.callbacks?.recognized({ reason: "recognized", text: "ignored", language: "de-DE" });

    expect(segments).toEqual([
      expect.objectContaining({ ordinal: 1, sourceLanguage: "en-US", sourceText: "hello" }),
    ]);
    await adapter.write(new Uint8Array(640));
    expect(runtime.writes[0]).toHaveLength(640);
    await expect(adapter.write(new Uint8Array(639))).rejects.toThrow("640 bytes");
  });

  it("rebuilds after cancellation without replaying consumed audio", async () => {
    const runtime = new RuntimeDouble();
    const adapter = createAdapter(runtime);
    const errors = vi.fn();
    await adapter.start(vi.fn(), errors);
    await adapter.write(new Uint8Array(640).fill(1));

    await runtime.callbacks?.canceled();
    await adapter.write(new Uint8Array(640).fill(2));

    expect(errors).toHaveBeenCalledWith("speech");
    expect(runtime.createCount).toBe(2);
    expect(runtime.sessions[0]?.close).toHaveBeenCalledOnce();
    expect(runtime.writes.map((frame) => frame[0])).toEqual([1, 2]);
  });
});
