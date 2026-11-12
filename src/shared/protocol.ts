export const PROTOCOL_VERSION = 1 as const;
export const WEBSOCKET_SUBPROTOCOL = "stream-translation.v1";
export const AUDIO_FRAME_BYTES = 640;

export const AUDIO_FORMAT = Object.freeze({
  encoding: "pcm_s16le" as const,
  sampleRateHz: 16_000 as const,
  channels: 1 as const,
  frameDurationMs: 20 as const,
});

export type AudioFormat = typeof AUDIO_FORMAT;

export type ClientMessage =
  | {
      type: "session.start";
      version: typeof PROTOCOL_VERSION;
      sequence: number;
      audio: AudioFormat;
    }
  | {
      type: "audio.chunk";
      version: typeof PROTOCOL_VERSION;
      sequence: number;
      byteLength: typeof AUDIO_FRAME_BYTES;
    }
  | {
      type: "audio.end";
      version: typeof PROTOCOL_VERSION;
      sequence: number;
    };

type EventBase = {
  version: typeof PROTOCOL_VERSION;
  sequence: number;
  sessionId: string;
};

export type SubtitleEvent = EventBase & {
  type: "subtitle.partial" | "subtitle.final";
  segmentId: string;
  ordinal: number;
  revision: number;
  sourceLanguage: string;
  text: string;
};

export type ServerEvent =
  | (EventBase & { type: "session.started"; audio: AudioFormat })
  | SubtitleEvent
  | (EventBase & {
      type: "segment.error";
      segmentId?: string;
      ordinal?: number;
      category: "speech" | "translation";
      recoverable: true;
    })
  | (EventBase & { type: "session.end"; lastOrdinal: number })
  | {
      type: "protocol.error";
      version: typeof PROTOCOL_VERSION;
      sequence: number;
      code: ProtocolErrorCode;
    };

export type ProtocolErrorCode =
  | "invalid_message"
  | "invalid_sequence"
  | "invalid_state"
  | "expected_binary_frame"
  | "invalid_frame_size";

export class ProtocolValidationError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolValidationError";
  }
}
