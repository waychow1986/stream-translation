const modulePath = process.env.CANDIDATE_SERVER_MODULE;

if (!modulePath) {
  throw new Error("CANDIDATE_SERVER_MODULE is required");
}

const { createApp } = await import(modulePath);
const dependencies = globalThis.__AIDELIVERY_TEST_ADAPTERS__;

if (!dependencies) {
  throw new Error("test adapters must be injected by the image harness");
}

const app = createApp(dependencies);
await app.listen({ host: "127.0.0.1", port: 0 });
