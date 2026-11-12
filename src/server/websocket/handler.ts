import { randomUUID } from "node:crypto";

import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";

import {
  AUDIO_FORMAT,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  WEBSOCKET_SUBPROTOCOL,
  type ProtocolErrorCode,
  type ServerEvent,
} from "../../shared/protocol";
import { parseClientMessage, validatePcmFrame } from "../../shared/schemas";
import { TranslationCoordinator } from "../session/coordinator";
import { SessionStateMachine } from "../session/state-machine";

type WebSocketConnection = {
  readonly OPEN: number;
  readonly readyState: number;
  send(value: string): void;
  close(code?: number): void;
  on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): void;
  once(event: "close", listener: () => void): void;
};

function send(socket: WebSocketConnection, event: ServerEvent): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
}

export async function registerTranslationWebSocket(
  app: FastifyInstance,
  appOrigin?: string,
): Promise<void> {
  await app.register(websocket);
  app.get(
    "/ws/v1/translate",
    {
      websocket: true,
      preValidation(request, reply, done) {
        const origin = request.headers.origin;
        const protocols = request.headers["sec-websocket-protocol"]
          ?.split(",")
          .map((value) => value.trim());
        if ((appOrigin && origin !== appOrigin) || !protocols?.includes(WEBSOCKET_SUBPROTOCOL)) {
          void reply.code(403).send();
          return;
        }
        done();
      },
    },
    (socket) => {
      const speechAdapter = app.createSpeechAdapter();
      const translationAdapter = app.createTranslationAdapter();
      const state = new SessionStateMachine();
      const sessionId = randomUUID();
      let expectedBinary = false;
      let chain = Promise.resolve();
      let unregister: () => void = () => undefined;
      const coordinator = new TranslationCoordinator({
        adapter: translationAdapter,
        sessionId,
        state,
        send: (event) => send(socket, event),
      });

      const protocolError = (code: ProtocolErrorCode) => {
        let sequence = 1;
        try {
          sequence = state.nextServerSequence();
        } catch {
          // A stable protocol error remains available even after terminal cleanup.
        }
        send(socket, { type: "protocol.error", version: PROTOCOL_VERSION, sequence, code });
        socket.close(1008);
      };

      const closeResources = async () => {
        await Promise.allSettled([coordinator.close(), speechAdapter.close()]);
        state.close();
        unregister();
      };

      try {
        unregister = app.lifecycle.register({
          async drain() {
            if (state.state === "streaming") await speechAdapter.end();
            await coordinator.drain();
          },
          async cancel() {
            await Promise.allSettled([coordinator.cancel(), speechAdapter.close()]);
          },
          async close() {
            socket.close(1001);
            await closeResources();
          },
        });
      } catch {
        socket.close(1013);
        return;
      }

      socket.on("message", (data: Buffer, isBinary: boolean) => {
        chain = chain
          .then(async () => {
            if (isBinary) {
              if (!expectedBinary) {
                protocolError("expected_binary_frame");
                return;
              }
              expectedBinary = false;
              await speechAdapter.write(validatePcmFrame(data));
              return;
            }
            if (expectedBinary) {
              protocolError("expected_binary_frame");
              return;
            }
            let raw: unknown;
            try {
              raw = JSON.parse(data.toString());
            } catch {
              protocolError("invalid_message");
              return;
            }
            const message = parseClientMessage(raw);
            if (message.type === "session.start") {
              state.start(message.sequence);
              await speechAdapter.start(
                (segment) => coordinator.enqueue(segment),
                () =>
                  send(socket, {
                    type: "segment.error",
                    version: PROTOCOL_VERSION,
                    sequence: state.nextServerSequence(),
                    sessionId,
                    category: "speech",
                    recoverable: true,
                  }),
              );
              send(socket, {
                type: "session.started",
                version: PROTOCOL_VERSION,
                sequence: state.nextServerSequence(),
                sessionId,
                audio: AUDIO_FORMAT,
              });
            } else if (message.type === "audio.chunk") {
              state.acceptChunk(message.sequence);
              expectedBinary = true;
            } else {
              state.endInput(message.sequence);
              await speechAdapter.end();
              await coordinator.drain();
              const lastOrdinal = state.lastOrdinal;
              send(socket, {
                type: "session.end",
                version: PROTOCOL_VERSION,
                sequence: state.nextServerSequence(),
                sessionId,
                lastOrdinal,
              });
              state.completeDrain();
              socket.close(1000);
            }
          })
          .catch((error: unknown) => {
            const code =
              error instanceof ProtocolValidationError
                ? error.code
                : error instanceof Error && error.message.includes("sequence")
                  ? "invalid_sequence"
                  : error instanceof Error && error.message.includes("state")
                    ? "invalid_state"
                    : "invalid_message";
            protocolError(code);
          });
      });
      socket.once("close", () => {
        void closeResources();
      });
    },
  );
}
