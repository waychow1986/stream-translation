import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAudioFixtureBundle } from "./audio-fixture-bundle";

async function bundle(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "audio-bundle-"));
  const audio = Buffer.alloc(1_280);
  await writeFile(join(root, "sample.pcm"), audio);
  const fixture = {
    id: "en",
    path: "sample.pcm",
    sha256: createHash("sha256").update(audio).digest("hex"),
    locale: "en-US",
    continuousContent: true,
    silenceIntervals: [{ startFrame: 0, endFrame: 1 }],
    audioEndFrame: 2,
  };
  const manifest = {
    sourceApproval: "generated test audio",
    audioFormat: {
      encoding: "pcm_s16le",
      sampleRateHz: 16_000,
      bitsPerSample: 16,
      channels: 1,
    },
    fixtures: [fixture],
    scenarios: { "IQA-001": ["en"], "IQA-002": ["en"], "IQA-003": ["en"] },
    ...overrides,
  };
  const path = join(root, "manifest.json");
  await writeFile(path, JSON.stringify(manifest));
  return path;
}

describe("external audio fixture bundle", () => {
  it("validates format, hash, complete locale coverage, and all IQA references", async () => {
    await expect(loadAudioFixtureBundle(await bundle(), ["en-US"])).resolves.toMatchObject({
      sourceApproval: "generated test audio",
    });
  });

  it("fails before networking for manifest, file, hash, format, locale, and scenario gaps", async () => {
    await expect(
      loadAudioFixtureBundle(await bundle({ fixtures: [] }), ["en-US"]),
    ).rejects.toThrow("fixtures");
    const invalidFormat = await bundle({
      audioFormat: {
        encoding: "pcm_s16le",
        sampleRateHz: 8_000,
        bitsPerSample: 16,
        channels: 1,
      },
    });
    await expect(loadAudioFixtureBundle(invalidFormat, ["en-US"])).rejects.toThrow("16 kHz");

    const invalidPath = await bundle();
    const escaped = JSON.parse(await readFile(invalidPath, "utf8")) as {
      fixtures: { path: string; sha256: string }[];
    };
    escaped.fixtures[0]!.path = "../outside.pcm";
    await writeFile(invalidPath, JSON.stringify(escaped));
    await expect(loadAudioFixtureBundle(invalidPath, ["en-US"])).rejects.toThrow("escapes");

    const invalidHash = await bundle();
    const mismatched = JSON.parse(await readFile(invalidHash, "utf8")) as {
      fixtures: { sha256: string }[];
    };
    mismatched.fixtures[0]!.sha256 = "f".repeat(64);
    await writeFile(invalidHash, JSON.stringify(mismatched));
    await expect(loadAudioFixtureBundle(invalidHash, ["en-US"])).rejects.toThrow("SHA-256");

    await expect(loadAudioFixtureBundle(await bundle(), ["fr-FR"])).rejects.toThrow(
      "missing fixture",
    );
    await expect(
      loadAudioFixtureBundle(
        await bundle({ scenarios: { "IQA-001": ["missing"], "IQA-002": ["en"], "IQA-003": ["en"] } }),
        ["en-US"],
      ),
    ).rejects.toThrow("unknown fixture");
  });
});
