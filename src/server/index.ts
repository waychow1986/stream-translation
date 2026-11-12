import type { AddressInfo } from "node:net";

import { createApp, type AppDependencies } from "./app";
import { HealthState } from "./health";
import { LifecycleController } from "./lifecycle";

export { createApp, type AppDependencies } from "./app";
export { HealthState, createLogRecord } from "./health";
export { LifecycleController, type LifecycleConnection } from "./lifecycle";
export { registerStaticWeb } from "./static-web";

type StartServerOptions = {
  dependencies: AppDependencies;
  host?: string;
  port: number;
  gracePeriodMs?: number;
  installSignalHandlers?: boolean;
};

export async function startServer(options: StartServerOptions) {
  const health = options.dependencies.health ?? new HealthState();
  const lifecycle =
    options.dependencies.lifecycle ??
    new LifecycleController(health, { gracePeriodMs: options.gracePeriodMs ?? 30_000 });
  const app = createApp({ ...options.dependencies, health, lifecycle });
  let stopping: Promise<void> | undefined;

  const shutdown = () => {
    stopping ??= lifecycle.shutdown().finally(async () => {
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
      await app.close();
    });
    return stopping;
  };
  const onSignal = () => {
    void shutdown();
  };

  if (options.installSignalHandlers ?? true) {
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  }

  try {
    await app.listen({ host: options.host ?? "0.0.0.0", port: options.port });
  } catch (error) {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
    await app.close();
    throw error;
  }

  return {
    app,
    lifecycle,
    address: app.server.address() as AddressInfo,
    shutdown,
  };
}
