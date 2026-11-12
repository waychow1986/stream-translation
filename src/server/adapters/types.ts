export type SpeechSegment = {
  segmentId: string;
  ordinal: number;
  sourceLanguage: string;
  sourceText: string;
};

export type TranslationInput = SpeechSegment;

export interface SpeechAdapter {
  start(
    onSegment: (segment: SpeechSegment) => void,
    onError: (category: "speech") => void,
  ): Promise<void>;
  write(frame: Uint8Array): Promise<void>;
  end(): Promise<void>;
  close(): Promise<void>;
}

export interface TranslationAdapter {
  translate(input: TranslationInput, onPartial: (text: string) => void): Promise<string>;
  cancel(): Promise<void>;
}

export { createLogRecord, HealthState } from "../health";
