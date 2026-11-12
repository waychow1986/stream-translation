import { WEBSOCKET_SUBPROTOCOL } from "../../../src/shared/protocol";

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
