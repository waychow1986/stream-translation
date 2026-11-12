import {
  AUDIO_FORMAT,
  AUDIO_FRAME_BYTES,
  PROTOCOL_VERSION,
  WEBSOCKET_SUBPROTOCOL,
  type ServerEvent,
  type SubtitleEvent,
} from "../../shared/protocol";
import { parseServerEvent, validatePcmFrame } from "../../shared/schemas";

type SocketLike = {
  protocol: string;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  send(value: string | ArrayBuffer | ArrayBufferView): void;
  close(): void;
};

export type TranslationSocketOptions = {
  url?: string;
  createWebSocket?: (url: string, protocol: string) => SocketLike;
  onSubtitle: (event: SubtitleEvent) => void;
  onEvent?: (event: ServerEvent) => void;
};

function defaultUrl(): string {
  const url = new URL("/ws/v1/translate", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class TranslationSocket {
  readonly #options: TranslationSocketOptions;
  #socket?: SocketLike;
  #nextClientSequence = 1;
  #nextServerSequence = 1;
  readonly #revisions = new Map<string, number>();

  constructor(options: TranslationSocketOptions) {
    this.#options = options;
  }

  connect(): Promise<void> {
    if (this.#socket) throw new Error("translation socket is already connected");
    const create =
      this.#options.createWebSocket ??
      ((url: string, protocol: string) =>
        new WebSocket(url, protocol) as unknown as SocketLike);
    const socket = create(this.#options.url ?? defaultUrl(), WEBSOCKET_SUBPROTOCOL);
    this.#socket = socket;

    return new Promise<void>((resolve, reject) => {
      socket.onerror = () => reject(new Error("translation WebSocket connection failed"));
      socket.onopen = () => {
        if (socket.protocol && socket.protocol !== WEBSOCKET_SUBPROTOCOL) {
          socket.close();
          reject(new Error("translation WebSocket subprotocol was not negotiated"));
          return;
        }
        socket.send(
          JSON.stringify({
            type: "session.start",
            version: PROTOCOL_VERSION,
            sequence: this.#nextClientSequence++,
            audio: AUDIO_FORMAT,
          }),
        );
        resolve();
      };
      socket.onmessage = (message: { data: unknown }) => this.#receive(message.data);
    });
  }

  sendAudio(frame: ArrayBuffer | ArrayBufferView): void {
    const bytes = validatePcmFrame(frame);
    const socket = this.#requireSocket();
    socket.send(
      JSON.stringify({
        type: "audio.chunk",
        version: PROTOCOL_VERSION,
        sequence: this.#nextClientSequence++,
        byteLength: AUDIO_FRAME_BYTES,
      }),
    );
    socket.send(bytes);
  }

  endAudio(): void {
    this.#requireSocket().send(
      JSON.stringify({
        type: "audio.end",
        version: PROTOCOL_VERSION,
        sequence: this.#nextClientSequence++,
      }),
    );
  }

  close(): void {
    this.#socket?.close();
    this.#socket = undefined;
  }

  #receive(value: unknown): void {
    if (typeof value !== "string") throw new Error("server control event must be text");
    const event = parseServerEvent(JSON.parse(value) as unknown);
    if (event.sequence !== this.#nextServerSequence) {
      throw new Error("server sequence is not strictly increasing");
    }
    this.#nextServerSequence += 1;
    if (event.type === "subtitle.partial" || event.type === "subtitle.final") {
      const previousRevision = this.#revisions.get(event.segmentId) ?? 0;
      if (event.revision <= previousRevision) return;
      this.#revisions.set(event.segmentId, event.revision);
      this.#options.onSubtitle(event);
    }
    this.#options.onEvent?.(event);
  }

  #requireSocket(): SocketLike {
    if (!this.#socket) throw new Error("translation socket is not connected");
    return this.#socket;
  }
}
