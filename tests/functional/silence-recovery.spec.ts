import { TranslationSocket } from "../../src/client/api/translation-socket";
import { createApp } from "../../src/server/app";
import type { SpeechAdapter, SpeechSegment } from "../../src/server/adapters/types";
import { SyntheticTranslationAdapter } from "./support/synthetic-adapters";

class SilenceSpeechAdapter implements SpeechAdapter {
  #onSegment?: (segment: SpeechSegment) => void;
  #writes = 0;
  async start(onSegment: (segment: SpeechSegment) => void) {
    this.#onSegment = onSegment;
  }
  async write() {
    this.#writes += 1;
    if (this.#writes === 2) {
      this.#onSegment?.({
        segmentId: "00000000-0000-4000-8000-000000000002",
        ordinal: 1,
        sourceLanguage: "en-US",
        sourceText: "after silence",
      });
    }
  }
  async end() {}
  async close() {}
}

async function exerciseSilenceRecovery() {
  const app = createApp({
    speechAdapter: new SilenceSpeechAdapter(),
    translationAdapter: new SyntheticTranslationAdapter({ "after silence": ["静音后恢复"] }),
    clientRoot: false,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const subtitles: string[] = [];
  const client = new TranslationSocket({
    url: `${address.replace("http:", "ws:")}/ws/v1/translate`,
    onSubtitle: (event) => subtitles.push(event.text),
  });
  await client.connect();
  await client.sendAudio(new Uint8Array(640));
  const duringSilence = [...subtitles];
  await client.sendAudio(new Uint8Array(640));
  client.endAudio();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await app.close();
  return { duringSilence, subtitles };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("silence recovery browser scenario", () => {
    it("is executed by Playwright", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("does not invent subtitles during silence and resumes later", async () => {
    await expect(exerciseSilenceRecovery()).resolves.toEqual({
      duringSilence: [],
      subtitles: ["静音后恢复"],
    });
  });
}
