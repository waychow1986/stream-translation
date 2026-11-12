import type { ServerEvent } from "../../shared/protocol";
import type { SpeechSegment, TranslationAdapter } from "../adapters/types";
import type { SessionStateMachine } from "./state-machine";

type CoordinatorOptions = {
  adapter: TranslationAdapter;
  sessionId: string;
  state: SessionStateMachine;
  send(event: ServerEvent): void;
};

export class TranslationCoordinator {
  readonly #options: CoordinatorOptions;
  readonly #queue: SpeechSegment[] = [];
  #processing?: Promise<void>;
  #closed = false;

  constructor(options: CoordinatorOptions) {
    this.#options = options;
  }

  enqueue(segment: SpeechSegment): void {
    if (this.#closed) return;
    this.#options.state.observeOrdinal(segment.ordinal);
    this.#queue.push({ ...segment });
    this.#processing ??= this.#process().finally(() => {
      this.#processing = undefined;
      if (this.#queue.length > 0 && !this.#closed) this.enqueueProcessing();
    });
  }

  async drain(): Promise<void> {
    while (this.#processing || this.#queue.length > 0) {
      await this.#processing;
    }
  }

  async cancel(): Promise<void> {
    this.#closed = true;
    this.#queue.length = 0;
    await this.#options.adapter.cancel();
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#queue.length = 0;
  }

  private enqueueProcessing(): void {
    this.#processing ??= this.#process().finally(() => {
      this.#processing = undefined;
      if (this.#queue.length > 0 && !this.#closed) this.enqueueProcessing();
    });
  }

  async #process(): Promise<void> {
    while (!this.#closed) {
      const segment = this.#queue.shift();
      if (!segment) return;
      let latest = "";
      try {
        const final = await this.#options.adapter.translate(segment, (text) => {
          const value = text.trim();
          if (!value || value === latest) return;
          latest = value;
          this.#options.send({
            type: "subtitle.partial",
            version: 1,
            sequence: this.#options.state.nextServerSequence(),
            sessionId: this.#options.sessionId,
            segmentId: segment.segmentId,
            ordinal: segment.ordinal,
            revision: this.#options.state.nextRevision(segment.segmentId),
            sourceLanguage: segment.sourceLanguage,
            text: value,
          });
        });
        const text = final.trim();
        if (!text) throw new Error("translation output is empty");
        this.#options.send({
          type: "subtitle.final",
          version: 1,
          sequence: this.#options.state.nextServerSequence(),
          sessionId: this.#options.sessionId,
          segmentId: segment.segmentId,
          ordinal: segment.ordinal,
          revision: this.#options.state.nextRevision(segment.segmentId),
          sourceLanguage: segment.sourceLanguage,
          text,
        });
      } catch {
        this.#options.send({
          type: "segment.error",
          version: 1,
          sequence: this.#options.state.nextServerSequence(),
          sessionId: this.#options.sessionId,
          segmentId: segment.segmentId,
          ordinal: segment.ordinal,
          category: "translation",
          recoverable: true,
        });
      } finally {
        segment.sourceText = "";
      }
    }
  }
}
