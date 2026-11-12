import { describe, expect, it } from "vitest";

import { assertIqaEvidence } from "../support/iqa-evidence";
import { assertRemoteCandidateUrl } from "../support/remote-candidate";

describe("remote IQA suite readiness", () => {
  it("rejects incomplete evidence before it can be reported", () => {
    expect(() =>
      assertIqaEvidence({
        scenarioId: "IQA-001",
        observedAt: "",
        candidate: { deliveryId: "", candidateSha: "" },
        target: "",
        fixtureSha256: "",
        fixtures: [],
        audioEnds: [],
        stages: [],
        events: [],
      }),
    ).toThrow("incomplete");
  });

  it("accepts complete immutable-Candidate evidence", () => {
    expect(() =>
      assertIqaEvidence({
        scenarioId: "IQA-003",
        observedAt: "2026-11-12T00:00:00.000Z",
        candidate: { deliveryId: "DLV-test", candidateSha: "a".repeat(40) },
        target: "https://candidate.example.test",
        fixtureSha256: "b".repeat(64),
        fixtures: [
          {
            id: "en",
            locale: "en-US",
            expectedSourceText: "hello",
            expectedChinese: ["你好"],
          },
        ],
        audioEnds: [
          { fixtureId: "en", frame: 5, sentAt: "2026-11-12T00:00:01.000Z" },
        ],
        stages: [
          { fixtureId: "en", id: "before-silence", startFrame: 1, endFrame: 1, subtitleCount: 1 },
          { fixtureId: "en", id: "silence", startFrame: 2, endFrame: 3, subtitleCount: 0 },
          { fixtureId: "en", id: "after-silence", startFrame: 4, endFrame: 5, subtitleCount: 1 },
        ],
        events: [
          {
            fixtureId: "en",
            inputStage: "after-silence",
            observedFrame: 4,
            beforeAudioEnd: true,
            serverSequence: 4,
            ordinal: 2,
            locale: "en-US",
            subtitle: "恢复",
            expectedChineseMatched: true,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects evidence without actual stage, audio-end, and semantic observations", () => {
    expect(() =>
      assertIqaEvidence({
        scenarioId: "IQA-003",
        observedAt: "2026-11-12T00:00:00.000Z",
        candidate: { deliveryId: "DLV-test", candidateSha: "a".repeat(40) },
        target: "https://candidate.example.test",
        fixtureSha256: "b".repeat(64),
        fixtures: [
          {
            id: "en",
            locale: "en-US",
            expectedSourceText: "hello",
            expectedChinese: ["你好"],
          },
        ],
        audioEnds: [
          { fixtureId: "en", frame: 5, sentAt: "2026-11-12T00:00:01.000Z" },
        ],
        stages: [],
        events: [
          {
            fixtureId: "en",
            inputStage: "silence",
            observedFrame: 3,
            beforeAudioEnd: true,
            serverSequence: 4,
            ordinal: 2,
            locale: "en-US",
            subtitle: "invented",
            expectedChineseMatched: false,
          },
        ],
      }),
    ).toThrow("incomplete");
  });

  it("rejects local synthetic and credential-bearing targets before network access", () => {
    expect(() => assertRemoteCandidateUrl("http://127.0.0.1:3000")).toThrow("HTTPS deployment");
    const userInfoTarget = ["https://user", "candidate.example.test"].join("@");
    expect(() => assertRemoteCandidateUrl(userInfoTarget)).toThrow("HTTPS deployment");
    expect(assertRemoteCandidateUrl("https://candidate.example.test").hostname).toBe(
      "candidate.example.test",
    );
  });
});
