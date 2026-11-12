import { TranslationSocket } from "../../src/client/api/translation-socket";
import { createApp } from "../../src/server/app";
import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "./support/synthetic-adapters";

async function exerciseStreaming() {
  const app = createApp({
    speechAdapter: new SyntheticSpeechAdapter([
      { sourceLanguage: "en-US", sourceText: "first" },
      { sourceLanguage: "fr-FR", sourceText: "second" },
    ]),
    translationAdapter: new SyntheticTranslationAdapter({
      first: ["第", "第一"],
      second: ["第", "第二"],
    }),
    clientRoot: false,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const events: string[] = [];
  const client = new TranslationSocket({
    url: `${address.replace("http:", "ws:")}/ws/v1/translate`,
    onSubtitle: (event) => events.push(`${event.ordinal}:${event.type}:${event.text}`),
  });
  await client.connect();
  await client.sendAudio(new Uint8Array(640));
  await client.sendAudio(new Uint8Array(640));
  client.endAudio();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await app.close();
  return events;
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("streaming subtitle browser scenario", () => {
    it("is executed by Playwright", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("emits ordered subtitle updates before input ends", async () => {
    await expect(exerciseStreaming()).resolves.toEqual([
      "1:subtitle.partial:第",
      "1:subtitle.final:第一",
      "2:subtitle.partial:第",
      "2:subtitle.final:第二",
    ]);
  });
}
