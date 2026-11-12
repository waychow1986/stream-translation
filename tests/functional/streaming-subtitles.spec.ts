import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect, test } from "@playwright/test";
import { createServer } from "vite";

import { createApp } from "../../src/server/app";
import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "./support/synthetic-adapters";

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

test("renders ordered Chinese subtitles through App, microphone, AudioWorklet, and SubtitleView", async () => {
  const audioRoot = await mkdtemp(join(tmpdir(), "stream-translation-browser-"));
  const audioPath = join(audioRoot, "input.wav");
  await writeFile(audioPath, waveFile(1));
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
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "开始" }).click();
    await expect(page.getByRole("status")).toHaveText("正在翻译");
    const subtitles = page.getByRole("list", { name: "中文字幕" }).getByRole("listitem");
    await expect(subtitles).toHaveText(["第一", "第二"]);
    expect(await page.getByText("第一").isVisible()).toBe(true);
    expect(await page.getByText("第二").isVisible()).toBe(true);
    expect(pageErrors).toEqual([]);
    await page.getByRole("button", { name: "停止" }).click();
    await expect(page.getByRole("status")).toHaveText("等待开始");
  } finally {
    await browser.close();
    await vite.close();
    await app.close();
  }
});
