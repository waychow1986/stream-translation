const modulePath = process.env.CANDIDATE_SERVER_MODULE;

if (!modulePath) {
  throw new Error("CANDIDATE_SERVER_MODULE is required");
}

const { startServer } = await import(modulePath);
const dependencies = globalThis.__AIDELIVERY_TEST_ADAPTERS__;

if (!dependencies) {
  throw new Error("test adapters must be injected by the image harness");
}

const runtime = await startServer({
  dependencies,
  host: "0.0.0.0",
  port: 3000,
  gracePeriodMs: 500,
  installSignalHandlers: true,
});
process.stdout.write(`${JSON.stringify({ address: runtime.address })}\n`);
