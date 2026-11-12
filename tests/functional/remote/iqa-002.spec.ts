import { loadAudioFixtureBundle } from "../support/audio-fixture-bundle";
import { assertIqaEvidence, persistIqaEvidence } from "../support/iqa-evidence";
import { runRemoteScenario } from "../support/remote-candidate";

async function validateInputs() {
  const manifest = process.env.AIDELIVERY_AUDIO_FIXTURE_MANIFEST;
  const baseUrl = process.env.AIDELIVERY_REMOTE_BASE_URL;
  const locales = process.env.AZURE_SPEECH_CANDIDATE_LOCALES?.split(",").map((value) => value.trim());
  if (!manifest || !locales?.length || !baseUrl) {
    throw new Error("explicit remote base URL, locales, and fixture manifest are required");
  }
  return {
    bundle: await loadAudioFixtureBundle(manifest, locales),
    manifest,
    baseUrl,
    locales,
  };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("IQA-002 remote Candidate scenario", () => {
    it("is discovered for explicit remote execution", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test.skip(process.env.AIDELIVERY_REMOTE_IQA !== "1", "requires deployed Candidate inputs");
  test("validates every eligible locale and its expected Chinese meaning without a language input", async () => {
    const { bundle, manifest, baseUrl, locales } = await validateInputs();
    const evidence = await runRemoteScenario({
      scenarioId: "IQA-002",
      baseUrl,
      manifestPath: manifest,
      manifest: bundle,
    });
    assertIqaEvidence(evidence);
    expect(new Set(evidence.events.map(({ locale }) => locale))).toEqual(new Set(locales));
    expect(evidence.events.every(({ expectedChineseMatched }) => expectedChineseMatched)).toBe(true);
    await persistIqaEvidence(evidence);
  });
}
