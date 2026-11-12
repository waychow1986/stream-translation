export type SessionState = "connected" | "streaming" | "draining" | "ended";

type Closable = { close(): void };

export class SessionStateMachine {
  #state: SessionState = "connected";
  #nextClientSequence = 1;
  #serverSequence = 0;
  #ordinal = 0;
  readonly #revisions = new Map<string, number>();
  readonly #resources = new Set<Closable>();

  get state(): SessionState {
    return this.#state;
  }

  get resourceCount(): number {
    return this.#resources.size;
  }

  start(sequence: number): void {
    this.#requireState("connected");
    this.#acceptClientSequence(sequence);
    this.#state = "streaming";
  }

  acceptChunk(sequence: number): void {
    this.#requireState("streaming");
    this.#acceptClientSequence(sequence);
  }

  endInput(sequence: number): void {
    this.#requireState("streaming");
    this.#acceptClientSequence(sequence);
    this.#state = "draining";
  }

  completeDrain(): void {
    this.#requireState("draining");
    this.#finish();
  }

  nextServerSequence(): number {
    this.#requireActive();
    this.#serverSequence += 1;
    return this.#serverSequence;
  }

  nextOrdinal(): number {
    this.#requireActive();
    this.#ordinal += 1;
    return this.#ordinal;
  }

  nextRevision(segmentId: string): number {
    this.#requireActive();
    const revision = (this.#revisions.get(segmentId) ?? 0) + 1;
    this.#revisions.set(segmentId, revision);
    return revision;
  }

  trackResource(resource: Closable): void {
    this.#requireActive();
    this.#resources.add(resource);
  }

  close(): void {
    if (this.#state !== "ended") this.#finish();
  }

  #acceptClientSequence(sequence: number): void {
    if (sequence !== this.#nextClientSequence) {
      throw new Error(`invalid client sequence: expected ${this.#nextClientSequence}`);
    }
    this.#nextClientSequence += 1;
  }

  #requireState(expected: SessionState): void {
    if (this.#state !== expected) {
      throw new Error(`invalid session state: expected ${expected}, received ${this.#state}`);
    }
  }

  #requireActive(): void {
    if (this.#state === "ended") throw new Error("session has ended");
  }

  #finish(): void {
    for (const resource of this.#resources) resource.close();
    this.#resources.clear();
    this.#revisions.clear();
    this.#state = "ended";
  }
}
