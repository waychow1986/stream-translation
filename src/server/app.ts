import { resolve } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";

import type { SpeechAdapter, TranslationAdapter } from "./adapters/types";
import { HealthState } from "./health";
import { LifecycleController } from "./lifecycle";
import { registerStaticWeb } from "./static-web";

export type AppDependencies = {
  speechAdapter: SpeechAdapter;
  translationAdapter: TranslationAdapter;
  clientRoot?: string | false;
  health?: HealthState;
  lifecycle?: LifecycleController;
};

export function createApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const health = dependencies.health ?? new HealthState();
  const lifecycle =
    dependencies.lifecycle ?? new LifecycleController(health, { gracePeriodMs: 30_000 });

  app.decorate("speechAdapter", dependencies.speechAdapter);
  app.decorate("translationAdapter", dependencies.translationAdapter);
  app.decorate("healthState", health);
  app.decorate("lifecycle", lifecycle);

  app.get("/healthz", async (_request, reply) => {
    const result = health.status();
    return reply.code(result.statusCode).send(result.body);
  });

  if (dependencies.clientRoot !== false) {
    const clientRoot = dependencies.clientRoot ?? resolve("dist/client");
    app.register(async (scope) => {
      await registerStaticWeb(scope, clientRoot);
    });
  }

  app.addHook("onClose", async () => {
    await Promise.all([
      dependencies.speechAdapter.close(),
      dependencies.translationAdapter.cancel(),
    ]);
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    speechAdapter: SpeechAdapter;
    translationAdapter: TranslationAdapter;
    healthState: HealthState;
    lifecycle: LifecycleController;
  }
}
