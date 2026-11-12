import type {
  SpeechAdapter,
  SpeechSegment,
  TranslationAdapter,
  TranslationInput,
} from "../../../src/server/adapters/types";

export class SyntheticSpeechAdapter implements SpeechAdapter {
  readonly #segments: readonly Omit<SpeechSegment, "segmentId" | "ordinal">[];
  #onSegment?: (segment: SpeechSegment) => void;
  #ordinal = 0;
  #closed = false;

  constructor(segments: readonly Omit<SpeechSegment, "segmentId" | "ordinal">[]) {
    this.#segments = segments;
  }

  async start(onSegment: (segment: SpeechSegment) => void): Promise<void> {
    this.#onSegment = onSegment;
  }

  async write(): Promise<void> {
    if (this.#closed) throw new Error("synthetic speech adapter is closed");
    const segment = this.#segments[this.#ordinal];
    if (segment) {
      this.#ordinal += 1;
      this.#onSegment?.({
        ...segment,
        ordinal: this.#ordinal,
        segmentId: `00000000-0000-4000-8000-${String(this.#ordinal).padStart(12, "0")}`,
      });
    }
  }

  async end(): Promise<void> {}

  async close(): Promise<void> {
    this.#closed = true;
    this.#onSegment = undefined;
  }
}

export class SyntheticTranslationAdapter implements TranslationAdapter {
  constructor(
    private readonly translations: Readonly<Record<string, readonly string[]>>,
    private readonly failures: ReadonlySet<string> = new Set(),
  ) {}

  async translate(input: TranslationInput, onPartial: (text: string) => void): Promise<string> {
    if (this.failures.has(input.sourceText)) {
      throw new Error("synthetic translation failure");
    }
    const outputs = this.translations[input.sourceText] ?? [];
    for (const output of outputs.slice(0, -1)) onPartial(output);
    return outputs.at(-1) ?? "";
  }

  async cancel(): Promise<void> {}
}
