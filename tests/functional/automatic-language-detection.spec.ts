import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "./support/synthetic-adapters";
import { withBrowserApp } from "./support/browser-app";

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("automatic language detection browser scenario", () => {
    it("is executed by Playwright", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("starts without a source language and applies detected-locale Chinese subtitles", async () => {
    const sentMessages: Record<string, unknown>[] = [];
    await withBrowserApp(
      {
        speechAdapter: new SyntheticSpeechAdapter([
          { sourceLanguage: "en-US", sourceText: "meeting starts now" },
        ]),
        translationAdapter: new SyntheticTranslationAdapter({
          "meeting starts now": ["会议现在开始"],
        }),
      },
      async (page) => {
        page.on("websocket", (socket) => {
          if (!socket.url().includes("/ws/v1/translate")) return;
          socket.on("framesent", ({ payload }) => {
            if (typeof payload === "string") {
              sentMessages.push(JSON.parse(payload) as Record<string, unknown>);
            }
          });
        });
        await expect(page.getByRole("combobox")).toHaveCount(0);
        await page.getByRole("button", { name: "开始" }).click();
        await expect(page.getByRole("status")).toHaveText("正在翻译");
        await expect(page.getByRole("listitem")).toHaveText("会议现在开始");
        const sessionStart = sentMessages.find(({ type }) => type === "session.start");
        expect(sessionStart).toBeDefined();
        expect(sessionStart).not.toHaveProperty("sourceLanguage");
        await page.getByRole("button", { name: "停止" }).click();
        await expect(page.getByRole("status")).toHaveText("等待开始");
      },
    );
  });
}
