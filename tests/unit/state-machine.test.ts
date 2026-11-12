import { describe, expect, it } from "vitest";

import { SessionStateMachine } from "../../src/server/session/state-machine";

describe("SessionStateMachine", () => {
  it("moves through connected, streaming, draining and ended", () => {
    const session = new SessionStateMachine();
    expect(session.state).toBe("connected");
    session.start(1);
    expect(session.state).toBe("streaming");
    session.acceptChunk(2);
    session.endInput(3);
    expect(session.state).toBe("draining");
    session.completeDrain();
    expect(session.state).toBe("ended");
  });

  it("rejects illegal transitions and non-contiguous client sequence", () => {
    const session = new SessionStateMachine();
    expect(() => session.acceptChunk(1)).toThrow(/state/);
    session.start(1);
    expect(() => session.acceptChunk(3)).toThrow(/sequence/);
    expect(() => session.start(2)).toThrow(/state/);
  });

  it("closes from every non-ended state and releases tracked work", () => {
    const session = new SessionStateMachine();
    session.start(1);
    session.trackResource({ close: () => undefined });
    session.close();
    expect(session.state).toBe("ended");
    expect(session.resourceCount).toBe(0);
    session.close();
  });
});
