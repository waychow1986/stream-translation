import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export async function registerStaticWeb(app: FastifyInstance, clientRoot: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: clientRoot,
    serve: false,
  });

  app.get("/assets/*", async (request, reply) => {
    const asset = (request.params as { "*": string })["*"];
    return reply.sendFile(`assets/${asset}`);
  });
  app.get("/", async (_request, reply) => reply.sendFile("index.html"));
  app.get("/*", async (_request, reply) => reply.type("text/html").sendFile("index.html"));
}
