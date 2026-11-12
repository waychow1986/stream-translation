import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { chromium } from "@playwright/test";

import type { AudioFixture, AudioFixtureManifest } from "./audio-fixture-bundle";
import type { IqaEvidence } from "./iqa-evidence";

export type CandidateIdentity = { deliveryId: string; candidateSha: string };

export function assertRemoteCandidateUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  ) {
    throw new Error("remote Candidate URL must be a credential-free HTTPS deployment target");
  }
  return url;
}

export async function readCandidateIdentity(baseUrl: string): Promise<CandidateIdentity> {
  const response = await fetch(new URL("/candidate-identity", assertRemoteCandidateUrl(baseUrl)));
  if (!response.ok) throw new Error("candidate identity endpoint failed");
  const value = (await response.json()) as Partial<CandidateIdentity>;
  if (!value.deliveryId || !value.candidateSha) throw new Error("candidate identity is incomplete");
  return { deliveryId: value.deliveryId, candidateSha: value.candidateSha };
}

function waveFile(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function matchesExpected(subtitle: string, expected: readonly string[]): boolean {
  return expected.some((value) => subtitle.includes(value) || value.includes(subtitle));
}

function semanticUnits(
  scenarioId: "IQA-001" | "IQA-002" | "IQA-003",
  fixture: AudioFixture,
): { id: string; expectedChinese: string[] }[] {
  if (scenarioId === "IQA-001") {
    return fixture.contentSegments ?? [];
  }
  if (scenarioId === "IQA-003") {
    return (fixture.stages ?? [])
      .filter(
        (stage): stage is typeof stage & { expectedChinese: string[] } =>
          stage.kind === "speech" && Boolean(stage.expectedChinese),
      )
      .map(({ id, expectedChinese }) => ({ id, expectedChinese }));
  }
  return [{ id: fixture.id, expectedChinese: fixture.expectedChinese }];
}

export async function runRemoteScenario(options: {
  scenarioId: "IQA-001" | "IQA-002" | "IQA-003";
  baseUrl: string;
  manifestPath: string;
  manifest: AudioFixtureManifest;
}): Promise<IqaEvidence> {
  const identity = await readCandidateIdentity(options.baseUrl);
  const fixtureIds = new Set(options.manifest.scenarios[options.scenarioId]);
  const fixtures = options.manifest.fixtures.filter(({ id }) => fixtureIds.has(id));
  const evidence: IqaEvidence = {
    scenarioId: options.scenarioId,
    observedAt: new Date().toISOString(),
    candidate: identity,
    target: options.baseUrl,
    fixtureSha256: fixtures.map(({ sha256 }) => sha256).join(","),
    fixtures: fixtures.map(
      ({ id, locale, expectedSourceText, expectedChinese, contentSegments, stages }) => ({
      id,
      locale,
      expectedSourceText,
      expectedChinese,
      contentSegments: contentSegments?.map(
        ({ id: segmentId, expectedSourceText: segmentSource, expectedChinese: segmentChinese }) => ({
          id: segmentId,
          expectedSourceText: segmentSource,
          expectedChinese: segmentChinese,
        }),
      ),
      stages: stages?.map(
        ({ id: stageId, kind, expectedSourceText: stageSource, expectedChinese: stageChinese }) => ({
          id: stageId,
          kind,
          expectedSourceText: stageSource,
          expectedChinese: stageChinese,
        }),
      ),
    })),
    audioEnds: [],
    stages: [],
    events: [],
  };
  for (const fixture of fixtures) {
    await runFixtureInBrowser(
      options.scenarioId,
      options.baseUrl,
      options.manifestPath,
      fixture,
      evidence,
    );
  }
  return evidence;
}

async function runFixtureInBrowser(
  scenarioId: "IQA-001" | "IQA-002" | "IQA-003",
  baseUrl: string,
  manifestPath: string,
  fixture: AudioFixture,
  evidence: IqaEvidence,
): Promise<void> {
  const pcm = await readFile(resolve(dirname(manifestPath), fixture.path));
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "stream-translation-remote-"));
  const wavePath = join(temporaryDirectory, `${fixture.id}.wav`);
  await writeFile(wavePath, waveFile(pcm));
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wavePath}%noloop`,
    ],
  });
  const context = await browser.newContext();
  await context.grantPermissions(["microphone"], {
    origin: assertRemoteCandidateUrl(baseUrl).origin,
  });
  const page = await context.newPage();
  let inputFrame = 0;
  let audioEnded = false;
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/v1/translate")) return;
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      const message = JSON.parse(payload) as Record<string, unknown>;
      if (message.type === "audio.chunk") inputFrame += 1;
      if (message.type === "audio.end") {
        audioEnded = true;
        evidence.audioEnds.push({
          fixtureId: fixture.id,
          frame: inputFrame,
          sentAt: new Date().toISOString(),
        });
      }
    });
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      const message = JSON.parse(payload) as Record<string, unknown>;
      if (message.type !== "subtitle.final") return;
      const observedFrame = Math.min(fixture.audioEndFrame, Math.max(1, inputFrame));
      const subtitle = String(message.text);
      const matchingUnits = semanticUnits(scenarioId, fixture).filter(({ expectedChinese }) =>
        matchesExpected(subtitle, expectedChinese),
      );
      const semanticUnitId = matchingUnits.length === 1 ? matchingUnits[0]!.id : "unmatched";
      const locale = String(message.sourceLanguage);
      evidence.events.push({
        fixtureId: fixture.id,
        inputStage: semanticUnitId,
        semanticUnitId,
        observedFrame,
        beforeAudioEnd: !audioEnded,
        serverSequence: Number(message.sequence),
        ordinal: Number(message.ordinal),
        locale,
        declaredLocale: fixture.locale,
        localeMatched: locale === fixture.locale,
        subtitle,
        expectedChineseMatched: matchingUnits.length === 1,
      });
    });
  });
  try {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "开始" }).click();
    await page.getByRole("status").filter({ hasText: "正在翻译" }).waitFor();
    const audioDeadline = Date.now() + Math.max(10_000, fixture.audioEndFrame * 40);
    while (inputFrame < fixture.audioEndFrame && Date.now() < audioDeadline) {
      await page.waitForTimeout(20);
    }
    if (inputFrame < fixture.audioEndFrame) {
      throw new Error("browser did not stream the declared audio.end boundary");
    }
    await page.getByRole("button", { name: "停止" }).click();
    await page.getByRole("status").filter({ hasText: "等待开始" }).waitFor();
    if (!evidence.audioEnds.some(({ fixtureId }) => fixtureId === fixture.id)) {
      throw new Error("browser did not send the audio.end boundary");
    }
    const fixtureEvents = evidence.events.filter(({ fixtureId }) => fixtureId === fixture.id);
    for (const event of fixtureEvents) {
      await page.getByRole("listitem").filter({ hasText: event.subtitle }).waitFor();
    }
    const stages =
      scenarioId === "IQA-001"
        ? fixture.contentSegments!
        : (fixture.stages ?? [
            {
              id: "content",
              startFrame: 1,
              endFrame: fixture.audioEndFrame,
            },
          ]);
    for (const stage of stages) {
      evidence.stages.push({
        fixtureId: fixture.id,
        id: stage.id,
        startFrame: stage.startFrame,
        endFrame: stage.endFrame,
        subtitleCount: fixtureEvents.filter(({ semanticUnitId }) => semanticUnitId === stage.id)
          .length,
      });
    }
  } finally {
    await browser.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
