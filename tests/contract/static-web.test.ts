import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerStaticWeb } from "../../src/server/static-web";

let clientRoot: string;

beforeAll(async () => {
  clientRoot = await mkdtemp(join(tmpdir(), "stream-translation-static-"));
  await mkdir(join(clientRoot, "assets"));
  await writeFile(join(clientRoot, "index.html"), "<main>stream translation</main>");
  await writeFile(join(clientRoot, "assets", "app.js"), "export {};");
});

afterAll(async () => {
  await rm(clientRoot, { recursive: true, force: true });
});

async function createApp() {
  const app = Fastify();
  app.get("/healthz", async () => ({ status: "ready" }));
  app.get("/ws/v1/translate", async (_, reply) => reply.code(426).send());
  await registerStaticWeb(app, clientRoot);
  return app;
}

describe("production static web contract", () => {
  it("serves the entry point at root and client-side routes", async () => {
    const app = await createApp();
    expect((await app.inject("/")).body).toContain("stream translation");
    expect((await app.inject("/meeting/current")).body).toContain("stream translation");
    await app.close();
  });

  it("serves static assets without covering service routes", async () => {
    const app = await createApp();
    expect((await app.inject("/assets/app.js")).body).toBe("export {};");
    expect((await app.inject("/healthz")).json()).toEqual({ status: "ready" });
    expect((await app.inject("/ws/v1/translate")).statusCode).toBe(426);
    await app.close();
  });
});
