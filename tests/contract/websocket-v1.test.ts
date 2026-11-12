import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/server/app";
import { AUDIO_FORMAT, PROTOCOL_VERSION, WEBSOCKET_SUBPROTOCOL } from "../../src/shared/protocol";
import {
  SyntheticSpeechAdapter,
  SyntheticTranslationAdapter,
} from "../functional/support/synthetic-adapters";

const apps: ReturnType<typeof createApp>[] = [];

async function open(origin = "https://app.example.test", protocol = WEBSOCKET_SUBPROTOCOL) {
  const app = createApp({
    speechAdapter: new SyntheticSpeechAdapter([
      { sourceLanguage: "en-US", sourceText: "hello" },
    ]),
    translationAdapter: new SyntheticTranslationAdapter({ hello: ["你", "你好"] }),
    appOrigin: "https://app.example.test",
    clientRoot: false,
  });
  apps.push(app);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const socket = new WebSocket(address.replace("http:", "ws:") + "/ws/v1/translate", protocol, {
    origin,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

function nextJson(socket: Awaited<ReturnType<typeof open>>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.once("message", (data: Buffer) =>
      resolve(JSON.parse(data.toString()) as Record<string, unknown>),
    );
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("WebSocket v1 contract", () => {
  it("validates state, sequence, metadata/binary pairing, and drains after audio.end", async () => {
    const socket = await open();
    socket.send(
      JSON.stringify({
        type: "session.start",
        version: PROTOCOL_VERSION,
        sequence: 1,
        audio: AUDIO_FORMAT,
      }),
    );
    expect((await nextJson(socket)).type).toBe("session.started");
    const types: unknown[] = [];
    const ended = new Promise<void>((resolve) => {
      socket.on("message", (data: Buffer) => {
        const type = (JSON.parse(data.toString()) as Record<string, unknown>).type;
        types.push(type);
        if (type === "session.end") resolve();
      });
    });
    socket.send(
      JSON.stringify({
        type: "audio.chunk",
        version: PROTOCOL_VERSION,
        sequence: 2,
        byteLength: 640,
      }),
    );
    socket.send(new Uint8Array(640));
    socket.send(JSON.stringify({ type: "audio.end", version: PROTOCOL_VERSION, sequence: 3 }));

    await ended;
    expect(types).toEqual([
      "subtitle.partial",
      "subtitle.final",
      "session.end",
    ]);
  });

  it("returns a stable content-free protocol error for an invalid sequence", async () => {
    const socket = await open();
    socket.send(
      JSON.stringify({
        type: "session.start",
        version: PROTOCOL_VERSION,
        sequence: 2,
        audio: AUDIO_FORMAT,
        privateContent: "must-not-echo",
      }),
    );
    const event = await nextJson(socket);
    expect(event).toMatchObject({ type: "protocol.error", code: "invalid_message" });
    expect(JSON.stringify(event)).not.toContain("must-not-echo");
  });
});
