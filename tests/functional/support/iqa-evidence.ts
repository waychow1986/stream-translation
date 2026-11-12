export type IqaEvidence = {
  scenarioId: "IQA-001" | "IQA-002" | "IQA-003";
  observedAt: string;
  candidate: { deliveryId: string; candidateSha: string };
  target: string;
  fixtureSha256: string;
  audioEnds: { fixtureId: string; frame: number; sentAt: string }[];
  stages: {
    fixtureId: string;
    id: string;
    startFrame: number;
    endFrame: number;
    subtitleCount: number;
  }[];
  events: {
    fixtureId: string;
    inputStage: string;
    observedFrame: number;
    beforeAudioEnd: boolean;
    serverSequence: number;
    ordinal: number;
    locale: string;
    subtitle: string;
    expectedChineseMatched: boolean;
  }[];
};

export function assertIqaEvidence(value: IqaEvidence): void {
  if (
    !value.observedAt ||
    !value.candidate.deliveryId ||
    !value.candidate.candidateSha ||
    !value.target ||
    !value.fixtureSha256 ||
    value.audioEnds.length === 0 ||
    value.audioEnds.some(
      ({ fixtureId, frame, sentAt }) =>
        !fixtureId || !Number.isSafeInteger(frame) || frame < 1 || !sentAt,
    ) ||
    value.stages.length === 0 ||
    value.events.length === 0
  ) {
    throw new Error("IQA evidence is incomplete");
  }
  if (
    value.stages.some(
      ({ fixtureId, id, startFrame, endFrame }) =>
        !fixtureId ||
        !id ||
        !Number.isSafeInteger(startFrame) ||
        !Number.isSafeInteger(endFrame) ||
        startFrame < 1 ||
        endFrame < startFrame,
    ) ||
    value.events.some(
      (event) =>
        !event.fixtureId ||
        !event.inputStage ||
        !Number.isSafeInteger(event.observedFrame) ||
        !Number.isSafeInteger(event.serverSequence) ||
        !Number.isSafeInteger(event.ordinal) ||
        !event.locale ||
        !event.subtitle ||
        !event.expectedChineseMatched,
    )
  ) {
    throw new Error("IQA stage or semantic evidence is invalid");
  }
}

export async function persistIqaEvidence(value: IqaEvidence): Promise<void> {
  assertIqaEvidence(value);
  const directory = process.env.AIDELIVERY_IQA_EVIDENCE_DIRECTORY;
  if (!directory) throw new Error("AIDELIVERY_IQA_EVIDENCE_DIRECTORY is required");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${value.scenarioId}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
