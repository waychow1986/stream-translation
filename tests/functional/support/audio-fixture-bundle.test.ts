import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAudioFixtureBundle } from "./audio-fixture-bundle";

async function bundle(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "audio-bundle-"));
  const audio = Buffer.alloc(1_920);
  await writeFile(join(root, "sample.pcm"), audio);
  const fixture = {
    id: "en",
    path: "sample.pcm",
    sha256: createHash("sha256").update(audio).digest("hex"),
    locale: "en-US",
    expectedSourceText: "hello",
    expectedChinese: ["你好"],
    continuousContent: true,
    contentSegments: [
      {
        id: "first-content",
        startFrame: 1,
        endFrame: 1,
        expectedSourceText: "hello",
        expectedChinese: ["你好"],
      },
      {
        id: "second-content",
        startFrame: 3,
        endFrame: 3,
        expectedSourceText: "again",
        expectedChinese: ["再见"],
      },
    ],
    silenceIntervals: [{ startFrame: 2, endFrame: 2 }],
    stages: [
      {
        id: "before-silence",
        kind: "speech",
        startFrame: 1,
        endFrame: 1,
        expectedSourceText: "hello",
        expectedChinese: ["你好"],
      },
      { id: "silence", kind: "silence", startFrame: 2, endFrame: 2 },
      {
        id: "after-silence",
        kind: "speech",
        startFrame: 3,
        endFrame: 3,
        expectedSourceText: "again",
        expectedChinese: ["再见"],
      },
    ],
    audioEndFrame: 3,
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
  it("keeps the checked-in IQA-003 stage schema aligned with runtime and example semantics", async () => {
    const fixturesRoot = join(import.meta.dirname, "..", "fixtures");
    const schema = JSON.parse(
      await readFile(join(fixturesRoot, "manifest.schema.json"), "utf8"),
    ) as {
      properties: {
        fixtures: {
          items: {
            properties: {
              stages: {
                prefixItems: {
                  additionalProperties: boolean;
                  required: string[];
                  properties: Record<string, unknown>;
                }[];
              };
            };
          };
        };
      };
    };
    const example = JSON.parse(
      await readFile(join(fixturesRoot, "manifest.example.json"), "utf8"),
    ) as { fixtures: { stages: Record<string, unknown>[] }[] };
    const stageSchemas =
      schema.properties.fixtures.items.properties.stages.prefixItems;
    const expectedContentFields = ["expectedChinese", "expectedSourceText"];

    expect(stageSchemas).toHaveLength(3);
    for (const [index, stageSchema] of stageSchemas.entries()) {
      const stage = example.fixtures[0]!.stages[index]!;
      const contentFields = Object.keys(stageSchema.properties)
        .filter((key) => expectedContentFields.includes(key))
        .sort();
      const requiredContentFields = stageSchema.required
        .filter((key) => expectedContentFields.includes(key))
        .sort();
      const expectedFields = stage.kind === "speech" ? expectedContentFields : [];

      expect(stageSchema.additionalProperties).toBe(false);
      expect(contentFields).toEqual(expectedFields);
      expect(requiredContentFields).toEqual(expectedFields);
      expect(Object.keys(stage).every((key) => key in stageSchema.properties)).toBe(true);
      expect(stageSchema.required.every((key) => key in stage)).toBe(true);
    }
  });

  it("validates semantics, stages, format, hash, complete locale coverage, and all IQA references", async () => {
    await expect(loadAudioFixtureBundle(await bundle(), ["en-US"])).resolves.toMatchObject({
      sourceApproval: "generated test audio",
      fixtures: [
        {
          expectedSourceText: "hello",
          expectedChinese: ["你好"],
          contentSegments: [
            { id: "first-content", expectedSourceText: "hello", expectedChinese: ["你好"] },
            { id: "second-content", expectedSourceText: "again", expectedChinese: ["再见"] },
          ],
          stages: [
            { id: "before-silence", kind: "speech" },
            { id: "silence", kind: "silence" },
            { id: "after-silence", kind: "speech" },
          ],
        },
      ],
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

    const missingSemantics = await bundle();
    const semanticGap = JSON.parse(await readFile(missingSemantics, "utf8")) as {
      fixtures: { expectedChinese?: string[] }[];
    };
    delete semanticGap.fixtures[0]!.expectedChinese;
    await writeFile(missingSemantics, JSON.stringify(semanticGap));
    await expect(loadAudioFixtureBundle(missingSemantics, ["en-US"])).rejects.toThrow(
      "expected translation",
    );

    const invalidStages = await bundle();
    const stageGap = JSON.parse(await readFile(invalidStages, "utf8")) as {
      fixtures: { stages: { id: string }[] }[];
    };
    stageGap.fixtures[0]!.stages = stageGap.fixtures[0]!.stages.filter(
      ({ id }) => id !== "after-silence",
    );
    await writeFile(invalidStages, JSON.stringify(stageGap));
    await expect(loadAudioFixtureBundle(invalidStages, ["en-US"])).rejects.toThrow(
      "three-stage semantics",
    );

    const missingContinuousContent = await bundle();
    const continuousGap = JSON.parse(await readFile(missingContinuousContent, "utf8")) as {
      fixtures: { contentSegments: unknown[] }[];
    };
    continuousGap.fixtures[0]!.contentSegments.pop();
    await writeFile(missingContinuousContent, JSON.stringify(continuousGap));
    await expect(loadAudioFixtureBundle(missingContinuousContent, ["en-US"])).rejects.toThrow(
      "two content segments",
    );

    const ambiguousContinuousContent = await bundle();
    const continuousSemanticGap = JSON.parse(
      await readFile(ambiguousContinuousContent, "utf8"),
    ) as {
      fixtures: { contentSegments: { expectedChinese: string[] }[] }[];
    };
    continuousSemanticGap.fixtures[0]!.contentSegments[1]!.expectedChinese = ["你好"];
    await writeFile(ambiguousContinuousContent, JSON.stringify(continuousSemanticGap));
    await expect(loadAudioFixtureBundle(ambiguousContinuousContent, ["en-US"])).rejects.toThrow(
      "two content segments",
    );

    const ambiguousRecovery = await bundle();
    const recoveryGap = JSON.parse(await readFile(ambiguousRecovery, "utf8")) as {
      fixtures: { stages: { expectedChinese?: string[] }[] }[];
    };
    recoveryGap.fixtures[0]!.stages[2]!.expectedChinese = ["你好"];
    await writeFile(ambiguousRecovery, JSON.stringify(recoveryGap));
    await expect(loadAudioFixtureBundle(ambiguousRecovery, ["en-US"])).rejects.toThrow(
      "three-stage semantics",
    );

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
