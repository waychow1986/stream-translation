import { describe, expect, it } from "vitest";

import { HealthState } from "../../src/server/adapters/types";

describe("HealthState", () => {
  it("is ready only before shutdown", () => {
    const health = new HealthState();
    expect(health.status()).toEqual({ statusCode: 200, body: { status: "ready" } });
    health.beginShutdown();
    expect(health.status()).toEqual({
      statusCode: 503,
      body: { status: "shutting_down" },
    });
  });
});
