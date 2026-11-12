declare const sampleRate: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;

const TARGET_SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 320;

class PcmFrameProcessor extends AudioWorkletProcessor {
  #input = new Float32Array(0);
  #position = 0;
  #frame = new Int16Array(FRAME_SAMPLES);
  #frameOffset = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    const combined = new Float32Array(this.#input.length + channel.length);
    combined.set(this.#input);
    combined.set(channel, this.#input.length);

    const step = sampleRate / TARGET_SAMPLE_RATE;
    while (this.#position + 1 < combined.length) {
      const index = Math.floor(this.#position);
      const fraction = this.#position - index;
      const value =
        combined[index]! + (combined[index + 1]! - combined[index]!) * fraction;
      this.#frame[this.#frameOffset++] = Math.round(
        Math.max(-1, Math.min(1, value)) * (value < 0 ? 32_768 : 32_767),
      );
      this.#position += step;

      if (this.#frameOffset === FRAME_SAMPLES) {
        const bytes = new ArrayBuffer(FRAME_SAMPLES * Int16Array.BYTES_PER_ELEMENT);
        const view = new DataView(bytes);
        for (let index = 0; index < FRAME_SAMPLES; index += 1) {
          view.setInt16(index * Int16Array.BYTES_PER_ELEMENT, this.#frame[index]!, true);
        }
        this.port.postMessage(bytes, [bytes]);
        this.#frame = new Int16Array(FRAME_SAMPLES);
        this.#frameOffset = 0;
      }
    }

    const consumed = Math.floor(this.#position);
    this.#input = combined.slice(consumed);
    this.#position -= consumed;
    return true;
  }
}

registerProcessor("pcm-frame-processor", PcmFrameProcessor);
