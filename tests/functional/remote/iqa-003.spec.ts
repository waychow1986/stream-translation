import { loadAudioFixtureBundle } from "../support/audio-fixture-bundle";
import { assertIqaEvidence } from "../support/iqa-evidence";
import { runRemoteScenario } from "../support/remote-candidate";

async function validateInputs() {
  const manifest = process.env.AIDELIVERY_AUDIO_FIXTURE_MANIFEST;
  const baseUrl = process.env.AIDELIVERY_REMOTE_BASE_URL;
  const locales = process.env.AZURE_SPEECH_CANDIDATE_LOCALES?.split(",").map((value) => value.trim());
  if (!manifest || !locales?.length || !baseUrl) {
    throw new Error("explicit remote base URL, locales, and fixture manifest are required");
  }
  const bundle = await loadAudioFixtureBundle(manifest, locales);
  if (!bundle.scenarios["IQA-003"]) throw new Error("IQA-003 fixture scenario is required");
  return {
    bundle,
    manifest,
    baseUrl,
  };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("IQA-003 remote Candidate scenario", () => {
    it("is discovered for explicit remote execution", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test.skip(process.env.AIDELIVERY_REMOTE_IQA !== "1", "requires deployed Candidate inputs");
  test("captures no invented silence output and a later recovered subtitle", async () => {
    const { bundle, manifest, baseUrl } = await validateInputs();
    const fixtures = bundle.fixtures.filter(({ id }) => bundle.scenarios["IQA-003"].includes(id));
    expect(fixtures.some(({ silenceIntervals }) => silenceIntervals?.length)).toBe(true);
    const evidence = await runRemoteScenario({
      scenarioId: "IQA-003",
      baseUrl,
      manifestPath: manifest,
      manifest: bundle,
    });
    assertIqaEvidence(evidence);
    for (const [index, event] of evidence.events.entries()) {
      const fixture = fixtures.find(({ id }) => event.inputStage.startsWith(`${id}:`));
      const frame = evidence.observations[index]?.inputFrame;
      expect(
        fixture?.silenceIntervals?.some(
          ({ startFrame, endFrame }) =>
            frame !== undefined && frame >= startFrame && frame <= endFrame,
        ) ?? false,
      ).toBe(false);
    }
    const finalSilenceFrame = Math.max(
      ...fixtures.flatMap(({ silenceIntervals = [] }) =>
        silenceIntervals.map(({ endFrame }) => endFrame),
      ),
    );
    expect(evidence.observations.some(({ inputFrame }) => inputFrame > finalSilenceFrame)).toBe(true);
  });
}
