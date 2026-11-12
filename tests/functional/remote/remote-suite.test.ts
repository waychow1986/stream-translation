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
        events: [
          {
            inputStage: "after-silence",
            serverSequence: 4,
            ordinal: 2,
            locale: "en-US",
            subtitle: "恢复",
          },
        ],
      }),
    ).not.toThrow();
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
