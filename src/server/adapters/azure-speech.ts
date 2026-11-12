import { randomUUID } from "node:crypto";

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import * as SpeechSdk from "microsoft-cognitiveservices-speech-sdk";

import type { SpeechAdapter, SpeechSegment } from "./types";

export const SPEECH_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default";

export type SpeechRuntimeCallbacks = {
  recognized(result: { reason: "recognized" | "noMatch"; text: string; language: string }): void;
  canceled(): Promise<void>;
};

export type SpeechRuntimeSession = {
  write(frame: Uint8Array): void;
  end(): Promise<void>;
  close(): Promise<void>;
  updateToken(token: string): void;
};

export interface SpeechRuntime {
  createSession(
    token: string,
    options: { endpoint: string; candidateLocales: readonly string[] },
    callbacks: SpeechRuntimeCallbacks,
  ): Promise<SpeechRuntimeSession>;
}

class AzureSpeechRuntime implements SpeechRuntime {
  async createSession(
    token: string,
    options: { endpoint: string; candidateLocales: readonly string[] },
    callbacks: SpeechRuntimeCallbacks,
  ): Promise<SpeechRuntimeSession> {
    const speechConfig = SpeechSdk.SpeechConfig.fromEndpoint(new URL(options.endpoint));
    speechConfig.authorizationToken = token;
    const languageConfig = SpeechSdk.AutoDetectSourceLanguageConfig.fromLanguages([
      ...options.candidateLocales,
    ]);
    languageConfig.mode = SpeechSdk.LanguageIdMode.Continuous;
    const format = SpeechSdk.AudioStreamFormat.getWaveFormatPCM(16_000, 16, 1);
    const stream = SpeechSdk.AudioInputStream.createPushStream(format);
    const audioConfig = SpeechSdk.AudioConfig.fromStreamInput(stream);
    const recognizer = SpeechSdk.SpeechRecognizer.FromConfig(
      speechConfig,
      languageConfig,
      audioConfig,
    );
    recognizer.recognized = (_sender, event) => {
      if (event.result.reason !== SpeechSdk.ResultReason.RecognizedSpeech) {
        callbacks.recognized({ reason: "noMatch", text: "", language: "" });
        return;
      }
      callbacks.recognized({
        reason: "recognized",
        text: event.result.text,
        language: SpeechSdk.AutoDetectSourceLanguageResult.fromResult(event.result).language,
      });
    };
    recognizer.canceled = () => {
      void callbacks.canceled();
    };
    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(resolve, reject);
    });

    return {
      write(frame) {
        stream.write(Uint8Array.from(frame).buffer);
      },
      async end() {
        stream.close();
        await new Promise<void>((resolve, reject) => {
          recognizer.stopContinuousRecognitionAsync(resolve, reject);
        });
      },
      async close() {
        stream.close();
        recognizer.close();
        audioConfig.close();
      },
      updateToken(nextToken) {
        speechConfig.authorizationToken = nextToken;
        recognizer.authorizationToken = nextToken;
      },
    };
  }
}

export type AzureSpeechAdapterOptions = {
  endpoint: string;
  candidateLocales: readonly string[];
  azureClientId?: string;
  credential?: Pick<TokenCredential, "getToken">;
  runtime?: SpeechRuntime;
  tokenRefreshLeadMs?: number;
};

export class AzureSpeechAdapter implements SpeechAdapter {
  readonly #options: AzureSpeechAdapterOptions;
  readonly #credential: Pick<TokenCredential, "getToken">;
  readonly #runtime: SpeechRuntime;
  readonly #candidateLocales: ReadonlySet<string>;
  #session?: SpeechRuntimeSession;
  #onSegment?: (segment: SpeechSegment) => void;
  #onError?: (category: "speech") => void;
  #ordinal = 0;
  #closed = false;
  #recovery?: Promise<void>;
  #refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(options: AzureSpeechAdapterOptions) {
    if (options.candidateLocales.length === 0) throw new Error("candidate locales are required");
    this.#options = options;
    this.#candidateLocales = new Set(options.candidateLocales);
    this.#credential =
      options.credential ??
      new DefaultAzureCredential(
        options.azureClientId ? { managedIdentityClientId: options.azureClientId } : undefined,
      );
    this.#runtime = options.runtime ?? new AzureSpeechRuntime();
  }

  async start(
    onSegment: (segment: SpeechSegment) => void,
    onError: (category: "speech") => void,
  ): Promise<void> {
    if (this.#session || this.#closed) throw new Error("speech adapter cannot be started");
    this.#onSegment = onSegment;
    this.#onError = onError;
    await this.#createSession();
  }

  async write(frame: Uint8Array): Promise<void> {
    if (frame.byteLength !== 640) throw new Error("PCM frame must contain 640 bytes");
    await this.#recovery;
    if (this.#closed || !this.#session) throw new Error("speech adapter is not running");
    this.#session.write(frame);
  }

  async end(): Promise<void> {
    await this.#recovery;
    await this.#session?.end();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    await this.#recovery;
    await this.#session?.close();
    this.#session = undefined;
    this.#onSegment = undefined;
    this.#onError = undefined;
  }

  async #createSession(): Promise<void> {
    const accessToken = await this.#credential.getToken(SPEECH_TOKEN_SCOPE);
    if (!accessToken) throw new Error("Speech access token is unavailable");
    this.#session = await this.#runtime.createSession(
      accessToken.token,
      {
        endpoint: this.#options.endpoint,
        candidateLocales: this.#options.candidateLocales,
      },
      {
        recognized: (result) => {
          const text = result.text.trim();
          if (
            result.reason !== "recognized" ||
            text === "" ||
            !this.#candidateLocales.has(result.language)
          ) {
            return;
          }
          this.#ordinal += 1;
          this.#onSegment?.({
            segmentId: randomUUID(),
            ordinal: this.#ordinal,
            sourceLanguage: result.language,
            sourceText: text,
          });
        },
        canceled: async () => {
          if (this.#closed || this.#recovery) return;
          this.#onError?.("speech");
          this.#recovery = this.#rebuildAfterCancellation().finally(() => {
            this.#recovery = undefined;
          });
          await this.#recovery;
        },
      },
    );
    this.#scheduleRefresh(accessToken.expiresOnTimestamp);
  }

  async #rebuildAfterCancellation(): Promise<void> {
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    await this.#session?.close();
    this.#session = undefined;
    await this.#createSession();
  }

  #scheduleRefresh(expiresOnTimestamp: number): void {
    const lead = this.#options.tokenRefreshLeadMs ?? 5 * 60_000;
    const delay = Math.max(1, expiresOnTimestamp - Date.now() - lead);
    this.#refreshTimer = setTimeout(() => {
      void this.#refreshToken();
    }, delay);
    this.#refreshTimer.unref?.();
  }

  async #refreshToken(): Promise<void> {
    try {
      const accessToken = await this.#credential.getToken(SPEECH_TOKEN_SCOPE);
      if (!accessToken || this.#closed) return;
      this.#session?.updateToken(accessToken.token);
      this.#scheduleRefresh(accessToken.expiresOnTimestamp);
    } catch {
      this.#onError?.("speech");
    }
  }
}
