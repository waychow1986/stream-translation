import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server/app";
import type { SpeechAdapter, TranslationAdapter } from "../../src/server/adapters/types";
import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "../functional/support/synthetic-adapters";

describe("synthetic adapter contract", () => {
  it("implements deterministic production interfaces and error injection", async () => {
    const speech: SpeechAdapter = new SyntheticSpeechAdapter([
      { sourceText: "hello", sourceLanguage: "en-US" },
    ]);
    const translation: TranslationAdapter = new SyntheticTranslationAdapter({
      hello: ["你", "你好"],
    });
    const segments: string[] = [];

    await speech.start((segment) => segments.push(segment.sourceText), () => undefined);
    await speech.write(new Uint8Array(640));
    expect(segments).toEqual(["hello"]);
    await expect(
      translation.translate(
        { segmentId: "segment-1", ordinal: 1, sourceLanguage: "en-US", sourceText: "hello" },
        () => undefined,
      ),
    ).resolves.toBe("你好");

    const failing = new SyntheticTranslationAdapter({}, new Set(["failed"]));
    await expect(
      failing.translate(
        { segmentId: "segment-2", ordinal: 2, sourceLanguage: "en-US", sourceText: "failed" },
        () => undefined,
      ),
    ).rejects.toThrow("synthetic translation failure");
  });

  it("allows adapters only through server-side dependency injection", async () => {
    const app = createApp({
      speechAdapter: new SyntheticSpeechAdapter([]),
      translationAdapter: new SyntheticTranslationAdapter({}),
      clientRoot: false,
    });
    const health = await app.inject("/healthz?adapter=synthetic");
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ready" });
    await app.close();
  });
});
