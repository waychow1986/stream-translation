import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

import type { SpeechAdapter, TranslationAdapter } from "../../../src/server/adapters/types";
import { createApp } from "../../../src/server/app";

function waveFile(seconds: number): Buffer {
  const sampleRate = 48_000;
  const samples = sampleRate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    data.writeInt16LE(Math.round(Math.sin((index / sampleRate) * Math.PI * 440) * 8_000), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function withBrowserApp(
  options: {
    speechAdapter: SpeechAdapter;
    translationAdapter: TranslationAdapter;
    audioSeconds?: number;
  },
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const audioRoot = await mkdtemp(join(tmpdir(), "stream-translation-browser-"));
  const audioPath = join(audioRoot, "input.wav");
  await writeFile(audioPath, waveFile(options.audioSeconds ?? 1));
  const app = createApp({
    speechAdapter: options.speechAdapter,
    translationAdapter: options.translationAdapter,
    clientRoot: false,
  });
  const backend = await app.listen({ host: "127.0.0.1", port: 0 });
  const vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: { "/ws": { target: backend, ws: true } },
    },
  });
  await vite.listen();
  const url = vite.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite browser test URL is unavailable");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}`,
    ],
  });
  const context = await browser.newContext();
  await context.grantPermissions(["microphone"], { origin: new URL(url).origin });
  const page = await context.newPage();
  try {
    await page.goto(url);
    await run(page);
  } finally {
    await browser.close();
    await vite.close();
    await app.close();
    await rm(audioRoot, { recursive: true, force: true });
  }
}
