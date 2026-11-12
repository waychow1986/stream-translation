import websocket from "@fastify/websocket";

import { TranslationSocket } from "../../src/client/api/translation-socket";
import type { SpeechAdapter, TranslationAdapter } from "../../src/server/adapters/types";
import { createApp } from "../../src/server/app";
import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "./support/synthetic-adapters";

async function exerciseAutomaticLanguageDetection() {
  const speech: SpeechAdapter = new SyntheticSpeechAdapter([
    { sourceLanguage: "en-US", sourceText: "meeting starts now" },
  ]);
  const translation: TranslationAdapter = new SyntheticTranslationAdapter({
    "meeting starts now": ["会议现在开始"],
  });
  const app = createApp({ speechAdapter: speech, translationAdapter: translation, clientRoot: false });
  let sourceLanguageWasSent = false;
  await app.register(websocket);
  app.get("/ws/v1/translate", { websocket: true }, (socket) => {
    let serverSequence = 1;
    const sessionId = "00000000-0000-4000-8000-000000000001";
    void speech.start(
      (segment) => {
        void translation.translate(segment, () => undefined).then((text) => {
          socket.send(
            JSON.stringify({
              type: "subtitle.final",
              version: 1,
              sequence: serverSequence++,
              sessionId,
              segmentId: segment.segmentId,
              ordinal: segment.ordinal,
              revision: 1,
              sourceLanguage: segment.sourceLanguage,
              text,
            }),
          );
        });
      },
      () => undefined,
    );
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") {
        const bytes =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new Uint8Array(event.data as ArrayBuffer);
        void speech.write(bytes);
        return;
      }
      const message = JSON.parse(event.data) as Record<string, unknown>;
      if (message.type === "session.start") {
        sourceLanguageWasSent = "sourceLanguage" in message;
        socket.send(
          JSON.stringify({
            type: "session.started",
            version: 1,
            sequence: serverSequence++,
            sessionId,
            audio: message.audio,
          }),
        );
      }
    };
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const subtitles: { sourceLanguage: string; text: string }[] = [];
  const received = new Promise<void>((resolve) => {
    const client = new TranslationSocket({
      url: `${address.replace("http:", "ws:")}/ws/v1/translate`,
      onSubtitle: (event) => {
        subtitles.push({ sourceLanguage: event.sourceLanguage, text: event.text });
        resolve();
      },
    });
    void client.connect().then(() => client.sendAudio(new Uint8Array(640)));
  });
  await received;
  await app.close();
  return { sourceLanguageWasSent, subtitles };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("automatic language detection browser scenario", () => {
    it("is executed by Playwright", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("starts without a source language and applies detected-locale Chinese subtitles", async () => {
    await expect(exerciseAutomaticLanguageDetection()).resolves.toEqual({
      sourceLanguageWasSent: false,
      subtitles: [{ sourceLanguage: "en-US", text: "会议现在开始" }],
    });
  });
}
