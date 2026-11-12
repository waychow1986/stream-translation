import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIO_FORMAT, PROTOCOL_VERSION, WEBSOCKET_SUBPROTOCOL } from "../../../src/shared/protocol";
import type { AudioFixture, AudioFixtureManifest } from "./audio-fixture-bundle";
import type { IqaEvidence } from "./iqa-evidence";

export type CandidateIdentity = { deliveryId: string; candidateSha: string };

export async function readCandidateIdentity(baseUrl: string): Promise<CandidateIdentity> {
  const response = await fetch(new URL("/candidate-identity", baseUrl));
  if (!response.ok) throw new Error("candidate identity endpoint failed");
  const value = (await response.json()) as Partial<CandidateIdentity>;
  if (!value.deliveryId || !value.candidateSha) throw new Error("candidate identity is incomplete");
  return { deliveryId: value.deliveryId, candidateSha: value.candidateSha };
}

export function candidateWebSocketUrl(baseUrl: string): string {
  const url = new URL("/ws/v1/translate", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function openCandidateSocket(baseUrl: string): WebSocket {
  return new WebSocket(candidateWebSocketUrl(baseUrl), WEBSOCKET_SUBPROTOCOL);
}

export async function runRemoteScenario(options: {
  scenarioId: "IQA-001" | "IQA-003";
  baseUrl: string;
  manifestPath: string;
  manifest: AudioFixtureManifest;
}): Promise<IqaEvidence & { observations: { inputFrame: number; beforeAudioEnd: boolean }[] }> {
  const identity = await readCandidateIdentity(options.baseUrl);
  const fixtureIds = new Set(options.manifest.scenarios[options.scenarioId]);
  const fixtures = options.manifest.fixtures.filter(({ id }) => fixtureIds.has(id));
  const evidence: IqaEvidence = {
    scenarioId: options.scenarioId,
    observedAt: new Date().toISOString(),
    candidate: identity,
    target: options.baseUrl,
    fixtureSha256: fixtures.map(({ sha256 }) => sha256).join(","),
    events: [],
  };
  const observations: { inputFrame: number; beforeAudioEnd: boolean }[] = [];

  for (const fixture of fixtures) {
    await streamFixture(options.baseUrl, options.manifestPath, fixture, evidence, observations);
  }
  return { ...evidence, observations };
}

async function streamFixture(
  baseUrl: string,
  manifestPath: string,
  fixture: AudioFixture,
  evidence: IqaEvidence,
  observations: { inputFrame: number; beforeAudioEnd: boolean }[],
): Promise<void> {
  const audio = await readFile(resolve(dirname(manifestPath), fixture.path));
  const socket = openCandidateSocket(baseUrl);
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Candidate WebSocket failed")), {
      once: true,
    });
  });
  let inputFrame = 0;
  let audioEnded = false;
  const ended = new Promise<void>((resolveEnd, reject) => {
    socket.addEventListener("error", () => reject(new Error("Candidate WebSocket failed")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type === "subtitle.final") {
        evidence.events.push({
          inputStage: `${fixture.id}:frame-${inputFrame}`,
          serverSequence: Number(message.sequence),
          ordinal: Number(message.ordinal),
          locale: String(message.sourceLanguage),
          subtitle: String(message.text),
        });
        observations.push({ inputFrame, beforeAudioEnd: !audioEnded });
      }
      if (message.type === "session.end") resolveEnd();
      if (message.type === "protocol.error") reject(new Error("Candidate rejected fixture protocol"));
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
  let sequence = 2;
  for (let offset = 0; offset < fixture.audioEndFrame * 640; offset += 640) {
    inputFrame += 1;
    socket.send(
      JSON.stringify({
        type: "audio.chunk",
        version: PROTOCOL_VERSION,
        sequence: sequence++,
        byteLength: 640,
      }),
    );
    socket.send(audio.subarray(offset, offset + 640));
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
  }
  audioEnded = true;
  socket.send(JSON.stringify({ type: "audio.end", version: PROTOCOL_VERSION, sequence }));
  await ended;
  socket.close();
}
