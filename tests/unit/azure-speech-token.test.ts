import { describe, expect, it, vi } from "vitest";

import {
  AzureSpeechAdapter,
  SPEECH_TOKEN_SCOPE,
  type SpeechRuntime,
} from "../../src/server/adapters/azure-speech";

describe("Azure Speech token lifecycle", () => {
  it("uses the Speech scope and refreshes the active Speech configuration before expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const getToken = vi
      .fn()
      .mockResolvedValueOnce({ token: "first", expiresOnTimestamp: 61_000 })
      .mockResolvedValueOnce({ token: "second", expiresOnTimestamp: 121_000 });
    const updateToken = vi.fn();
    const runtime: SpeechRuntime = {
      createSession: vi.fn(async () => ({
        write: vi.fn(),
        end: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        updateToken,
      })),
    };
    const adapter = new AzureSpeechAdapter({
      endpoint: "https://speech.example.test/",
      candidateLocales: ["en-US"],
      credential: { getToken },
      runtime,
      tokenRefreshLeadMs: 10_000,
    });

    await adapter.start(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(50_000);

    expect(getToken).toHaveBeenNthCalledWith(1, SPEECH_TOKEN_SCOPE);
    expect(getToken).toHaveBeenNthCalledWith(2, SPEECH_TOKEN_SCOPE);
    expect(updateToken).toHaveBeenCalledWith("second");
    await adapter.close();
    vi.useRealTimers();
  });

  it("does not expose failed token values and can be canceled after refresh failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const getToken = vi
      .fn()
      .mockResolvedValueOnce({ token: "private-token", expiresOnTimestamp: 2_000 })
      .mockRejectedValueOnce(new Error("credential unavailable"));
    const errors = vi.fn();
    const adapter = new AzureSpeechAdapter({
      endpoint: "https://speech.example.test/",
      candidateLocales: ["en-US"],
      credential: { getToken },
      runtime: {
        createSession: vi.fn(async () => ({
          write: vi.fn(),
          end: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
          updateToken: vi.fn(),
        })),
      },
      tokenRefreshLeadMs: 100,
    });

    await adapter.start(vi.fn(), errors);
    await vi.advanceTimersByTimeAsync(900);
    expect(errors).toHaveBeenCalledWith("speech");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("private-token");
    await expect(adapter.close()).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
