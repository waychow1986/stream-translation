import { describe, expect, it } from "vitest";

import { SessionStateMachine } from "../../src/server/session/state-machine";

describe("in-memory session model", () => {
  it("allocates monotonic ordinals, server sequences and revisions", () => {
    const session = new SessionStateMachine();
    expect(session.nextOrdinal()).toBe(1);
    expect(session.nextOrdinal()).toBe(2);
    expect(session.nextServerSequence()).toBe(1);
    expect(session.nextServerSequence()).toBe(2);
    expect(session.nextRevision("segment-1")).toBe(1);
    expect(session.nextRevision("segment-1")).toBe(2);
    expect(session.nextRevision("segment-2")).toBe(1);
  });

  it("clears revision and resource state when closed", () => {
    const session = new SessionStateMachine();
    session.nextRevision("segment-1");
    session.close();
    expect(session.resourceCount).toBe(0);
    expect(() => session.nextRevision("segment-1")).toThrow(/ended/);
  });
});
