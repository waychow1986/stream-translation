import { describe, expect, it, vi } from "vitest";

import {
  FoundryTranslationAdapter,
  type FoundryTransport,
} from "../../src/server/adapters/foundry-translation";

const input = {
  segmentId: "00000000-0000-4000-8000-000000000001",
  ordinal: 1,
  sourceLanguage: "en-US",
  sourceText: "hello",
};

describe("FoundryTranslationAdapter", () => {
  it("requests only Simplified Chinese with streaming and reasoning disabled", async () => {
    const requests: Record<string, unknown>[] = [];
    const transport: FoundryTransport = {
      async *stream(request) {
        requests.push(request.body);
        yield { type: "response.output_text.delta", delta: "你" };
        yield { type: "response.output_text.delta", delta: "好" };
        yield { type: "response.completed" };
      },
      cancel: vi.fn(async () => undefined),
    };
    const adapter = new FoundryTranslationAdapter({
      endpoint: "https://foundry.example.test/",
      deployment: "translation",
      apiVersion: "2026-01-01",
      credential: {
        getToken: vi.fn(async () => ({ token: "opaque", expiresOnTimestamp: Date.now() + 60_000 })),
      },
      transport,
    });
    const partials: string[] = [];

    await expect(adapter.translate(input, (text) => partials.push(text))).resolves.toBe("你好");

    expect(partials).toEqual(["你", "你好"]);
    expect(requests[0]).toMatchObject({
      stream: true,
      reasoning: { effort: "none" },
      input: expect.stringContaining("hello"),
      instructions: expect.stringMatching(/简体中文/),
    });
  });

  it.each([
    [{ type: "response.reasoning.delta", delta: "hidden" }],
    [{ type: "response.tool_call", name: "unexpected" }],
    [{ type: "response.completed" }],
  ])("rejects reasoning, tool, and empty completed output without logging content", async (events) => {
    const transport: FoundryTransport = {
      async *stream() {
        yield events;
      },
      cancel: vi.fn(async () => undefined),
    };
    const adapter = new FoundryTranslationAdapter({
      endpoint: "https://foundry.example.test/",
      deployment: "translation",
      apiVersion: "2026-01-01",
      credential: {
        getToken: vi.fn(async () => ({ token: "opaque", expiresOnTimestamp: Date.now() + 60_000 })),
      },
      transport,
    });

    await expect(adapter.translate(input, vi.fn())).rejects.toThrow("translation response");
  });

  it("retries one retryable failure only before any output", async () => {
    let attempts = 0;
    const transport: FoundryTransport = {
      async *stream() {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error("busy"), { status: 429 });
        yield { type: "response.output_text.delta", delta: "完成" };
        yield { type: "response.completed" };
      },
      cancel: vi.fn(async () => undefined),
    };
    const adapter = new FoundryTranslationAdapter({
      endpoint: "https://foundry.example.test/",
      deployment: "translation",
      apiVersion: "2026-01-01",
      credential: {
        getToken: vi.fn(async () => ({ token: "opaque", expiresOnTimestamp: Date.now() + 60_000 })),
      },
      transport,
      sleep: async () => undefined,
    });

    await expect(adapter.translate(input, vi.fn())).resolves.toBe("完成");
    expect(attempts).toBe(2);
  });
});
