import type { SpeechAdapter, SpeechSegment } from "../../src/server/adapters/types";
import { withBrowserApp } from "./support/browser-app";
import { SyntheticTranslationAdapter } from "./support/synthetic-adapters";

class SilenceSpeechAdapter implements SpeechAdapter {
  #onSegment?: (segment: SpeechSegment) => void;
  #writes = 0;
  async start(onSegment: (segment: SpeechSegment) => void) {
    this.#onSegment = onSegment;
  }
  async write() {
    this.#writes += 1;
    if (this.#writes === 25) {
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

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("silence recovery browser scenario", () => {
    it("is executed by Playwright", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("does not invent subtitles during silence and resumes later", async () => {
    await withBrowserApp(
      {
        speechAdapter: new SilenceSpeechAdapter(),
        translationAdapter: new SyntheticTranslationAdapter({
          "after silence": ["静音后恢复"],
        }),
        audioSeconds: 2,
      },
      async (page) => {
        await page.getByRole("button", { name: "开始" }).click();
        await expect(page.getByRole("status")).toHaveText("正在翻译");
        await page.waitForTimeout(100);
        await expect(page.getByRole("listitem")).toHaveCount(0);
        await expect(page.getByText("中文字幕将在识别到外语语音后显示。")).toBeVisible();
        await expect(page.getByRole("listitem")).toHaveText("静音后恢复");
        await page.getByRole("button", { name: "停止" }).click();
        await expect(page.getByRole("status")).toHaveText("等待开始");
      },
    );
  });
}
