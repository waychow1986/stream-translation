import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

import { AzureSpeechAdapter } from "./adapters/azure-speech";
import { FoundryTranslationAdapter } from "./adapters/foundry-translation";
import { createApp, type AppDependencies } from "./app";
import { parseServerConfig, type ServerConfig } from "./config";
import { HealthState } from "./health";
import { LifecycleController } from "./lifecycle";

export { createApp, type AppDependencies } from "./app";
export { HealthState, createLogRecord } from "./health";
export { LifecycleController, type LifecycleConnection } from "./lifecycle";
export { registerStaticWeb } from "./static-web";

export function createProductionDependencies(config: ServerConfig): AppDependencies {
  return {
    createSpeechAdapter: () =>
      new AzureSpeechAdapter({
        endpoint: config.speechEndpoint,
        candidateLocales: config.speechCandidateLocales,
        ...(config.azureClientId ? { azureClientId: config.azureClientId } : {}),
      }),
    createTranslationAdapter: () =>
      new FoundryTranslationAdapter({
        endpoint: config.foundryEndpoint,
        deployment: config.foundryDeployment,
        apiVersion: config.foundryApiVersion,
        ...(config.azureClientId ? { azureClientId: config.azureClientId } : {}),
      }),
    appOrigin: config.appOrigin,
    candidateIdentity: {
      deliveryId: config.deliveryId,
      candidateSha: config.candidateSha,
    },
  };
}

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

export async function startProductionServer(environment: NodeJS.ProcessEnv = process.env) {
  const config = parseServerConfig(environment);
  const dependencies = createProductionDependencies(config);
  return startServer({ dependencies, port: config.port });
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startProductionServer().catch(() => {
    process.exitCode = 1;
  });
}
