import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

async function exerciseImageLifecycle(
  expectStatus: (actual: () => Promise<number>, expected: number) => Promise<void>,
) {
  const script = `
    import { startServer } from "./dist/server/index.js";
    const speech = { start: async () => {}, write: async () => {}, end: async () => {}, close: async () => {} };
    const translation = { translate: async () => "", cancel: async () => {} };
    const runtime = await startServer({
      dependencies: { speechAdapter: speech, translationAdapter: translation, clientRoot: false },
      host: "127.0.0.1",
      port: 0,
      gracePeriodMs: 500,
      installSignalHandlers: true
    });
    runtime.lifecycle.register({
      drain: () => new Promise(() => {}),
      cancel: async () => process.stdout.write("cancelled\\n"),
      close: async () => process.stdout.write("closed\\n")
    });
    process.stdout.write(JSON.stringify({ port: runtime.address.port }) + "\\n");
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const port = await readPort(child);
    await expectStatus(
      async () => (await fetch(`http://127.0.0.1:${port}/healthz`)).status,
      200,
    );

    const exited = once(child, "exit") as Promise<[number | null]>;
    child.kill("SIGTERM");

    await expectStatus(
      async () => (await fetch(`http://127.0.0.1:${port}/healthz`)).status,
      503,
    );
    const [exitCode] = await exited;
    if (exitCode !== 0) throw new Error(`expected server exit code 0, received ${exitCode}`);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

if (process.env.VITEST) {
  const { describe, it } = await import("vitest");
  describe.skip("image lifecycle functional scenario", () => {
    it("is executed by Playwright against the production build", () => undefined);
  });
} else {
  const { expect, test } = await import("@playwright/test");
  test("built server exposes 503 while SIGTERM drains, then cancels and exits", async () => {
    await exerciseImageLifecycle(async (actual, expected) => {
      await expect.poll(actual).toBe(expected);
    });
  });
}

async function readPort(child: ChildProcess): Promise<number> {
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr) throw new Error("child process pipes are unavailable");

  return await new Promise<number>((resolve, reject) => {
    let output = "";
    let errors = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split("\n").find((candidate) => candidate.startsWith('{"port":'));
      if (line) resolve((JSON.parse(line) as { port: number }).port);
    };
    stdout.on("data", onData);
    stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString();
    });
    child.once("exit", (code) => reject(new Error(`server exited ${code}: ${errors}`)));
  });
}
