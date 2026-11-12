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
  const bundle = await loadAudioFixtureBundle(manifest, locales);
  if (!bundle.scenarios["IQA-001"]) throw new Error("IQA-001 fixture scenario is required");
  return {
    bundle,
    manifest,
    baseUrl,
  };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("IQA-001 remote Candidate scenario", () => {
    it("is discovered for explicit remote execution", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test.skip(process.env.AIDELIVERY_REMOTE_IQA !== "1", "requires deployed Candidate inputs");
  test("captures multiple ordered subtitles before the audio.end boundary", async () => {
    const { bundle, manifest, baseUrl } = await validateInputs();
    const evidence = await runRemoteScenario({
      scenarioId: "IQA-001",
      baseUrl,
      manifestPath: manifest,
      manifest: bundle,
    });
    assertIqaEvidence(evidence);
    expect(evidence.fixtures).toHaveLength(1);
    const fixture = evidence.fixtures[0]!;
    const expectedSegments = fixture.contentSegments!.map(({ id }) => id);
    expect(expectedSegments.length).toBeGreaterThanOrEqual(2);
    expect(evidence.events.map(({ semanticUnitId }) => semanticUnitId)).toEqual(expectedSegments);
    expect(
      evidence.events.every(
        ({ expectedChineseMatched, localeMatched }) => expectedChineseMatched && localeMatched,
      ),
    ).toBe(true);
    expect(evidence.events.map(({ ordinal }) => ordinal)).toEqual(
      [...evidence.events.map(({ ordinal }) => ordinal)].sort((left, right) => left - right),
    );
    expect(evidence.events[0]?.beforeAudioEnd).toBe(true);
    await persistIqaEvidence(evidence);
  });
}
