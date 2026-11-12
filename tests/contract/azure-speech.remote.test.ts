import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AzureSpeechAdapter } from "../../src/server/adapters/azure-speech";
import { loadAudioFixtureBundle } from "../functional/support/audio-fixture-bundle";

const enabled = process.env.AIDELIVERY_REMOTE_SPEECH === "1";

describe.skipIf(!enabled)("Azure Speech remote contract", () => {
  it("uses managed identity, fixed PCM, continuous LID, and every candidate locale", async () => {
    const manifestPath = process.env.AIDELIVERY_AUDIO_FIXTURE_MANIFEST;
    const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
    const locales = process.env.AZURE_SPEECH_CANDIDATE_LOCALES?.split(",").map((item) =>
      item.trim(),
    );
    if (!manifestPath || !endpoint || !locales?.length) {
      throw new Error("explicit Speech endpoint, candidate locales, and fixture manifest are required");
    }
    const manifest = await loadAudioFixtureBundle(manifestPath, locales);
    const observed: { sourceLanguage: string; sourceText: string }[] = [];
    const adapter = new AzureSpeechAdapter({
      endpoint,
      candidateLocales: locales,
      azureClientId: process.env.AZURE_CLIENT_ID,
    });
    await adapter.start(
      ({ sourceLanguage, sourceText }) => observed.push({ sourceLanguage, sourceText }),
      () => undefined,
    );
    const fixtureResults: {
      fixtureId: string;
      declaredLocale: string;
      actualLocales: string[];
      sourceTextMatched: boolean;
    }[] = [];
    try {
      for (const fixture of manifest.fixtures) {
        const observedStart = observed.length;
        const audio = await readFile(resolve(dirname(manifestPath), fixture.path));
        for (let offset = 0; offset < audio.length; offset += 640) {
          await adapter.write(audio.subarray(offset, offset + 640));
          await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        }
        const normalizedExpected = fixture.expectedSourceText
          .normalize("NFKC")
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "");
        const deadline = Date.now() + 15_000;
        let recognized = observed.slice(observedStart);
        while (
          !recognized
            .map(({ sourceText }) => sourceText)
            .join("")
            .normalize("NFKC")
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, "")
            .includes(normalizedExpected) &&
          Date.now() < deadline
        ) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
          recognized = observed.slice(observedStart);
        }
        const sourceTextMatched = recognized
          .map(({ sourceText }) => sourceText)
          .join("")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, "")
          .includes(normalizedExpected);
        const actualLocales = [...new Set(recognized.map(({ sourceLanguage }) => sourceLanguage))];
        expect(sourceTextMatched, `source text for ${fixture.id}`).toBe(true);
        expect(actualLocales, `locale for ${fixture.id}`).toEqual([fixture.locale]);
        fixtureResults.push({
          fixtureId: fixture.id,
          declaredLocale: fixture.locale,
          actualLocales,
          sourceTextMatched,
        });
      }
      await adapter.end();
    } finally {
      await adapter.close();
    }
    expect(new Set(fixtureResults.map(({ declaredLocale }) => declaredLocale))).toEqual(
      new Set(locales),
    );
    const evidenceDirectory = process.env.AIDELIVERY_CONTRACT_EVIDENCE_DIRECTORY;
    if (!evidenceDirectory) throw new Error("contract evidence directory is required");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      join(evidenceDirectory, "azure-speech.json"),
      `${JSON.stringify({
        contract: "Azure Speech continuous LID",
        passed: true,
        audioFormat: "pcm_s16le/16000/16/mono",
        sessionCount: 1,
        candidateLocales: locales,
        fixtures: fixtureResults,
      })}\n`,
      "utf8",
    );
  });
});
