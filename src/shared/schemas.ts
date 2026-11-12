import {
  AUDIO_FORMAT,
  AUDIO_FRAME_BYTES,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  type ClientMessage,
  type ServerEvent,
} from "./protocol";

export { AUDIO_FORMAT };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-[A-Z]{2}$|^[a-z]{2,3}-[A-Z]{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new ProtocolValidationError("invalid_message", "message contains invalid fields");
  }
}

function assertVersionAndSequence(value: Record<string, unknown>): void {
  if (value.version !== PROTOCOL_VERSION) {
    throw new ProtocolValidationError("invalid_message", "unsupported protocol version");
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    throw new ProtocolValidationError("invalid_sequence", "sequence must be a positive integer");
  }
}

function assertAudioFormat(value: unknown): void {
  if (!isRecord(value)) {
    throw new ProtocolValidationError("invalid_message", "audio format is required");
  }
  assertExactKeys(value, ["encoding", "sampleRateHz", "channels", "frameDurationMs"]);
  for (const [key, expected] of Object.entries(AUDIO_FORMAT)) {
    if (value[key] !== expected) {
      throw new ProtocolValidationError("invalid_message", "unsupported audio format");
    }
  }
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ProtocolValidationError("invalid_message", `${field} must be a UUID`);
  }
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ProtocolValidationError("invalid_message", `${field} must be a positive integer`);
  }
}

export function parseClientMessage(input: unknown): ClientMessage {
  if (!isRecord(input) || typeof input.type !== "string") {
    throw new ProtocolValidationError("invalid_message", "control message must be an object");
  }

  if (input.type === "session.start") {
    assertExactKeys(input, ["type", "version", "sequence", "audio"]);
    assertVersionAndSequence(input);
    assertAudioFormat(input.audio);
    return input as ClientMessage;
  }
  if (input.type === "audio.chunk") {
    assertExactKeys(input, ["type", "version", "sequence", "byteLength"]);
    assertVersionAndSequence(input);
    if (input.byteLength !== AUDIO_FRAME_BYTES) {
      throw new ProtocolValidationError("invalid_frame_size", "byteLength must be 640");
    }
    return input as ClientMessage;
  }
  if (input.type === "audio.end") {
    assertExactKeys(input, ["type", "version", "sequence"]);
    assertVersionAndSequence(input);
    return input as ClientMessage;
  }
  throw new ProtocolValidationError("invalid_message", "unknown control message type");
}

export function validatePcmFrame(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  const frame =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (frame.byteLength !== AUDIO_FRAME_BYTES) {
    throw new ProtocolValidationError("invalid_frame_size", "PCM frame must contain 640 bytes");
  }
  return frame;
}

export function parseServerEvent(input: unknown): ServerEvent {
  if (!isRecord(input) || typeof input.type !== "string") {
    throw new ProtocolValidationError("invalid_message", "server event must be an object");
  }

  if (input.type === "subtitle.partial" || input.type === "subtitle.final") {
    assertExactKeys(input, [
      "type",
      "version",
      "sequence",
      "sessionId",
      "segmentId",
      "ordinal",
      "revision",
      "sourceLanguage",
      "text",
    ]);
    assertVersionAndSequence(input);
    assertUuid(input.sessionId, "sessionId");
    assertUuid(input.segmentId, "segmentId");
    assertPositiveInteger(input.ordinal, "ordinal");
    assertPositiveInteger(input.revision, "revision");
    if (
      typeof input.sourceLanguage !== "string" ||
      !LOCALE_PATTERN.test(input.sourceLanguage) ||
      typeof input.text !== "string" ||
      input.text.trim() === ""
    ) {
      throw new ProtocolValidationError("invalid_message", "invalid subtitle payload");
    }
    return input as ServerEvent;
  }

  throw new ProtocolValidationError("invalid_message", "unsupported server event");
}
