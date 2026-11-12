import { describe, expect, it, vi } from "vitest";

import { HealthState } from "../../src/server/health";
import { LifecycleController } from "../../src/server/lifecycle";

describe("process lifecycle contract", () => {
  it("marks health unavailable, rejects new connections, and drains active work in order", async () => {
    const events: string[] = [];
    const health = new HealthState();
    const lifecycle = new LifecycleController(health, { gracePeriodMs: 100 });
    const release = lifecycle.register({
      drain: async () => {
        events.push("drain");
      },
      cancel: async () => {
        events.push("cancel");
      },
      close: async () => {
        events.push("close");
      },
    });

    await lifecycle.shutdown();

    expect(health.status()).toEqual({
      statusCode: 503,
      body: { status: "shutting_down" },
    });
    expect(lifecycle.acceptingConnections).toBe(false);
    expect(() =>
      lifecycle.register({
        drain: async () => undefined,
        cancel: async () => undefined,
        close: async () => undefined,
      }),
    ).toThrow("server is shutting down");
    expect(events).toEqual(["drain", "close"]);
    expect(lifecycle.activeConnectionCount).toBe(0);
    release();
  });

  it("cancels provider work and closes connections after the grace period", async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const lifecycle = new LifecycleController(new HealthState(), { gracePeriodMs: 25 });
      lifecycle.register({
        drain: () => new Promise<void>(() => undefined),
        cancel: async () => {
          events.push("cancel");
        },
        close: async () => {
          events.push("close");
        },
      });

      const shutdown = lifecycle.shutdown();
      await vi.advanceTimersByTimeAsync(25);
      await shutdown;

      expect(events).toEqual(["cancel", "close"]);
      expect(lifecycle.activeConnectionCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is idempotent when shutdown is requested more than once", async () => {
    const drain = vi.fn(async () => undefined);
    const lifecycle = new LifecycleController(new HealthState(), { gracePeriodMs: 100 });
    lifecycle.register({
      drain,
      cancel: async () => undefined,
      close: async () => undefined,
    });

    await Promise.all([lifecycle.shutdown(), lifecycle.shutdown()]);

    expect(drain).toHaveBeenCalledTimes(1);
  });
});
