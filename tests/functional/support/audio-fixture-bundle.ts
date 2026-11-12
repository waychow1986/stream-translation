import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type AudioFixture = {
  id: string;
  path: string;
  sha256: string;
  locale: string;
  expectedSourceText: string;
  expectedChinese: string[];
  continuousContent: boolean;
  silenceIntervals?: { startFrame: number; endFrame: number }[];
  stages?: {
    id: "before-silence" | "silence" | "after-silence";
    kind: "speech" | "silence";
    startFrame: number;
    endFrame: number;
  }[];
  audioEndFrame: number;
};

export type AudioFixtureManifest = {
  sourceApproval: string;
  audioFormat: {
    encoding: "pcm_s16le";
    sampleRateHz: 16000;
    bitsPerSample: 16;
    channels: 1;
  };
  fixtures: AudioFixture[];
  scenarios: Record<"IQA-001" | "IQA-002" | "IQA-003", string[]>;
};

const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-[A-Z]{2}$|^[a-z]{2,3}-[A-Z]{2}$/;
const HASH = /^[a-f0-9]{64}$/;

function assertManifest(value: unknown): asserts value is AudioFixtureManifest {
  if (!value || typeof value !== "object") throw new Error("fixture manifest must be an object");
  const manifest = value as Partial<AudioFixtureManifest>;
  if (!manifest.sourceApproval?.trim()) throw new Error("sourceApproval is required");
  if (
    manifest.audioFormat?.encoding !== "pcm_s16le" ||
    manifest.audioFormat.sampleRateHz !== 16_000 ||
    manifest.audioFormat.bitsPerSample !== 16 ||
    manifest.audioFormat.channels !== 1
  ) {
    throw new Error("fixture audio format must be 16 kHz/16-bit/mono PCM");
  }
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) {
    throw new Error("fixtures are required");
  }
  for (const fixture of manifest.fixtures) {
    if (
      !fixture.id?.trim() ||
      !fixture.path?.trim() ||
      !HASH.test(fixture.sha256) ||
      !LOCALE.test(fixture.locale) ||
      !fixture.expectedSourceText?.trim() ||
      !Array.isArray(fixture.expectedChinese) ||
      fixture.expectedChinese.length === 0 ||
      fixture.expectedChinese.some((text) => !text.trim()) ||
      typeof fixture.continuousContent !== "boolean" ||
      !Number.isSafeInteger(fixture.audioEndFrame) ||
      fixture.audioEndFrame < 1
    ) {
      throw new Error("fixture entry is invalid or expected translation is missing");
    }
  }
  for (const scenario of ["IQA-001", "IQA-002", "IQA-003"] as const) {
    if (!Array.isArray(manifest.scenarios?.[scenario]) || manifest.scenarios[scenario].length === 0) {
      throw new Error(`${scenario} fixture references are required`);
    }
  }
}

export async function loadAudioFixtureBundle(
  manifestPath: string,
  candidateLocales: readonly string[],
): Promise<AudioFixtureManifest> {
  const root = await realpath(dirname(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  assertManifest(manifest);
  const ids = new Set(manifest.fixtures.map(({ id }) => id));
  if (ids.size !== manifest.fixtures.length) throw new Error("fixture ids must be unique");

  for (const fixture of manifest.fixtures) {
    if (isAbsolute(fixture.path)) throw new Error("fixture path must be relative");
    const resolved = resolve(root, fixture.path);
    const relativePath = relative(root, resolved);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("fixture path escapes bundle root");
    }
    const bytes = await readFile(resolved);
    if (bytes.length === 0 || bytes.length % 640 !== 0) {
      throw new Error("fixture PCM must contain complete 640-byte frames");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== fixture.sha256) throw new Error("fixture SHA-256 mismatch");
    if (fixture.audioEndFrame > bytes.length / 640) throw new Error("audio.end boundary exceeds fixture");
  }

  for (const locale of candidateLocales) {
    if (!manifest.fixtures.some((fixture) => fixture.locale === locale)) {
      throw new Error(`missing fixture for candidate locale ${locale}`);
    }
  }
  for (const references of Object.values(manifest.scenarios)) {
    if (references.some((id) => !ids.has(id))) throw new Error("scenario references unknown fixture");
  }
  for (const id of manifest.scenarios["IQA-003"]) {
    const fixture = manifest.fixtures.find((candidate) => candidate.id === id)!;
    const stages = fixture.stages;
    if (
      stages?.length !== 3 ||
      stages.map(({ id: stageId }) => stageId).join(",") !==
        "before-silence,silence,after-silence" ||
      stages.map(({ kind }) => kind).join(",") !== "speech,silence,speech" ||
      stages.some(
        ({ startFrame, endFrame }) =>
          !Number.isSafeInteger(startFrame) ||
          !Number.isSafeInteger(endFrame) ||
          startFrame < 1 ||
          endFrame < startFrame ||
          endFrame > fixture.audioEndFrame,
      )
    ) {
      throw new Error("IQA-003 fixture requires explicit three-stage boundaries");
    }
  }
  return manifest;
}
