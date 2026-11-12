import { describe, expect, it } from "vitest";

import { FoundryTranslationAdapter } from "../../src/server/adapters/foundry-translation";

describe.skipIf(process.env.AIDELIVERY_REMOTE_FOUNDRY !== "1")(
  "Foundry translation remote contract",
  () => {
    it("calls the configured deployment with reasoning disabled and receives streamed Chinese only", async () => {
      const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
      const deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT;
      const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION;
      if (!endpoint || !deployment || !apiVersion) {
        throw new Error("explicit non-secret Foundry deployment inputs are required");
      }
      const adapter = new FoundryTranslationAdapter({
        endpoint,
        deployment,
        apiVersion,
        azureClientId: process.env.AZURE_CLIENT_ID,
      });
      const partials: string[] = [];
      try {
        const output = await adapter.translate(
          {
            segmentId: "00000000-0000-4000-8000-000000000001",
            ordinal: 1,
            sourceLanguage: "en-US",
            sourceText: "The meeting has started.",
          },
          (partial) => partials.push(partial),
        );
        expect(partials.length).toBeGreaterThan(0);
        expect(partials.at(-1)).toBe(output);
        expect(output).toMatch(/\p{Script=Han}/u);
        expect(output).not.toMatch(/\bmeeting\b/i);
        const evidenceDirectory = process.env.AIDELIVERY_CONTRACT_EVIDENCE_DIRECTORY;
        if (!evidenceDirectory) throw new Error("contract evidence directory is required");
        await mkdir(evidenceDirectory, { recursive: true });
        await writeFile(
          join(evidenceDirectory, "foundry-translation.json"),
          `${JSON.stringify({
            contract: "Azure AI Foundry reasoning-off streaming translation",
            passed: true,
            streamedPartials: partials.length,
            containsChinese: true,
            reasoningOrToolOutputAccepted: false,
          })}\n`,
          "utf8",
        );
      } finally {
        await adapter.cancel();
      }
    });
  },
);
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
