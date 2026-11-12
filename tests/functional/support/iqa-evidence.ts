export type IqaEvidence = {
  scenarioId: "IQA-001" | "IQA-002" | "IQA-003";
  observedAt: string;
  candidate: { deliveryId: string; candidateSha: string };
  target: string;
  fixtureSha256: string;
  events: {
    inputStage: string;
    serverSequence: number;
    ordinal: number;
    locale: string;
    subtitle: string;
  }[];
};

export function assertIqaEvidence(value: IqaEvidence): void {
  if (
    !value.observedAt ||
    !value.candidate.deliveryId ||
    !value.candidate.candidateSha ||
    !value.target ||
    !value.fixtureSha256 ||
    value.events.length === 0
  ) {
    throw new Error("IQA evidence is incomplete");
  }
}
