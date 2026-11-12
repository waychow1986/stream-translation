import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIO_FORMAT, PROTOCOL_VERSION } from "../../../src/shared/protocol";
import { loadAudioFixtureBundle } from "../support/audio-fixture-bundle";
import { assertIqaEvidence, type IqaEvidence } from "../support/iqa-evidence";
import { openCandidateSocket, readCandidateIdentity } from "../support/remote-candidate";

async function exerciseIqa002() {
  const baseUrl = process.env.AIDELIVERY_REMOTE_BASE_URL;
  const manifestPath = process.env.AIDELIVERY_AUDIO_FIXTURE_MANIFEST;
  const locales = process.env.AZURE_SPEECH_CANDIDATE_LOCALES?.split(",").map((item) =>
    item.trim(),
  );
  if (!baseUrl || !manifestPath || !locales?.length) {
    throw new Error("explicit remote base URL, candidate locales, and fixture manifest are required");
  }
  const manifest = await loadAudioFixtureBundle(manifestPath, locales);
  const identity = await readCandidateIdentity(baseUrl);
  const evidence: IqaEvidence = {
    scenarioId: "IQA-002",
    observedAt: new Date().toISOString(),
    candidate: identity,
    target: baseUrl,
    fixtureSha256: manifest.fixtures.map(({ sha256 }) => sha256).join(","),
    events: [],
  };

  for (const fixture of manifest.fixtures) {
    const socket = openCandidateSocket(baseUrl);
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Candidate WebSocket failed")), {
        once: true,
      });
    });
    socket.send(
      JSON.stringify({
        type: "session.start",
        version: PROTOCOL_VERSION,
        sequence: 1,
        audio: AUDIO_FORMAT,
      }),
    );
    const audio = await readFile(resolve(dirname(manifestPath), fixture.path));
    let sequence = 2;
    for (let offset = 0; offset < audio.length; offset += 640) {
      socket.send(
        JSON.stringify({
          type: "audio.chunk",
          version: PROTOCOL_VERSION,
          sequence: sequence++,
          byteLength: 640,
        }),
      );
      socket.send(audio.subarray(offset, offset + 640));
    }
    socket.send(JSON.stringify({ type: "audio.end", version: PROTOCOL_VERSION, sequence }));
    await new Promise<void>((resolveEnd) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.type === "subtitle.final") {
          evidence.events.push({
            inputStage: fixture.id,
            serverSequence: Number(message.sequence),
            ordinal: Number(message.ordinal),
            locale: String(message.sourceLanguage),
            subtitle: String(message.text),
          });
        }
        if (message.type === "session.end") resolveEnd();
      });
    });
    socket.close();
  }

  assertIqaEvidence(evidence);
  return { evidence, locales };
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("IQA-002 remote Candidate scenario", () => {
    it("is discovered but executed only by the explicit remote Playwright suite", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test.skip(
    process.env.AIDELIVERY_REMOTE_IQA !== "1",
    "requires an explicitly configured deployed Candidate and external audio bundle",
  );
  test("IQA-002 validates every eligible locale without a source-language input", async () => {
    const { evidence, locales } = await exerciseIqa002();
    expect(new Set(evidence.events.map(({ locale }) => locale))).toEqual(new Set(locales));
  });
}
