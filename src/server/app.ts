import { resolve } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";

import type { SpeechAdapter, TranslationAdapter } from "./adapters/types";
import { HealthState } from "./health";
import { LifecycleController } from "./lifecycle";
import { registerStaticWeb } from "./static-web";
import { registerTranslationWebSocket } from "./websocket/handler";

export type AppDependencies = {
  speechAdapter?: SpeechAdapter;
  translationAdapter?: TranslationAdapter;
  createSpeechAdapter?: () => SpeechAdapter;
  createTranslationAdapter?: () => TranslationAdapter;
  clientRoot?: string | false;
  health?: HealthState;
  lifecycle?: LifecycleController;
  appOrigin?: string;
};

export function createApp(dependencies: AppDependencies): FastifyInstance {
  if (
    (!dependencies.speechAdapter && !dependencies.createSpeechAdapter) ||
    (!dependencies.translationAdapter && !dependencies.createTranslationAdapter)
  ) {
    throw new Error("speech and translation adapters are required");
  }
  const app = Fastify({ logger: false });
  const health = dependencies.health ?? new HealthState();
  const lifecycle =
    dependencies.lifecycle ?? new LifecycleController(health, { gracePeriodMs: 30_000 });

  app.decorate(
    "createSpeechAdapter",
    dependencies.createSpeechAdapter ?? (() => dependencies.speechAdapter as SpeechAdapter),
  );
  app.decorate(
    "createTranslationAdapter",
    dependencies.createTranslationAdapter ??
      (() => dependencies.translationAdapter as TranslationAdapter),
  );
  app.decorate("healthState", health);
  app.decorate("lifecycle", lifecycle);

  app.get("/healthz", async (_request, reply) => {
    const result = health.status();
    return reply.code(result.statusCode).send(result.body);
  });

  app.register(async (scope) => {
    await registerTranslationWebSocket(scope, dependencies.appOrigin);
  });

  if (dependencies.clientRoot !== false) {
    const clientRoot = dependencies.clientRoot ?? resolve("dist/client");
    app.register(async (scope) => {
      await registerStaticWeb(scope, clientRoot);
    });
  }

  app.addHook("onClose", async () => {
    await Promise.all([
      dependencies.speechAdapter?.close(),
      dependencies.translationAdapter?.cancel(),
    ]);
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    createSpeechAdapter(): SpeechAdapter;
    createTranslationAdapter(): TranslationAdapter;
    healthState: HealthState;
    lifecycle: LifecycleController;
  }
}
