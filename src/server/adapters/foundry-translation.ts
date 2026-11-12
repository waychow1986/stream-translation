import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

import type { TranslationAdapter, TranslationInput } from "./types";

export const FOUNDRY_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default";

type FoundryRequest = {
  url: string;
  token: string;
  body: Record<string, unknown>;
};

type FoundryEvent = {
  type: string;
  delta?: string;
  [key: string]: unknown;
};

export interface FoundryTransport {
  stream(request: FoundryRequest): AsyncIterable<FoundryEvent>;
  cancel(): Promise<void>;
}

class FetchFoundryTransport implements FoundryTransport {
  #controller?: AbortController;

  async *stream(request: FoundryRequest): AsyncIterable<FoundryEvent> {
    this.#controller = new AbortController();
    const response = await fetch(request.url, {
      method: "POST",
      headers: {
        authorization: ["Bearer", request.token].join(" "),
        "content-type": "application/json",
      },
      body: JSON.stringify(request.body),
      signal: this.#controller.signal,
    });
    if (!response.ok || !response.body) {
      throw Object.assign(new Error("Foundry request failed"), { status: response.status });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const records = pending.split(/\r?\n\r?\n/);
      pending = records.pop() ?? "";
      for (const record of records) {
        const data = record
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (data && data !== "[DONE]") yield JSON.parse(data) as FoundryEvent;
      }
      if (done) break;
    }
  }

  async cancel(): Promise<void> {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}

export type FoundryTranslationAdapterOptions = {
  endpoint: string;
  deployment: string;
  apiVersion: string;
  azureClientId?: string;
  credential?: Pick<TokenCredential, "getToken">;
  transport?: FoundryTransport;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class FoundryTranslationAdapter implements TranslationAdapter {
  readonly #options: FoundryTranslationAdapterOptions;
  readonly #credential: Pick<TokenCredential, "getToken">;
  readonly #transport: FoundryTransport;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: FoundryTranslationAdapterOptions) {
    this.#options = options;
    this.#credential =
      options.credential ??
      new DefaultAzureCredential(
        options.azureClientId ? { managedIdentityClientId: options.azureClientId } : undefined,
      );
    this.#transport = options.transport ?? new FetchFoundryTransport();
    this.#sleep =
      options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async translate(input: TranslationInput, onPartial: (text: string) => void): Promise<string> {
    let attempt = 0;
    while (true) {
      let output = "";
      try {
        const accessToken = await this.#credential.getToken(FOUNDRY_TOKEN_SCOPE);
        if (!accessToken) throw new Error("Foundry access token is unavailable");
        const url = new URL("openai/v1/responses", this.#options.endpoint);
        url.searchParams.set("api-version", this.#options.apiVersion);
        const body = {
          model: this.#options.deployment,
          instructions:
            "仅将输入文本翻译为简体中文。不得解释、总结、回答、添加标签或输出其他内容。",
          input: `[${input.sourceLanguage}] ${input.sourceText}`,
          stream: true,
          reasoning: { effort: "none" },
        };
        let completed = false;
        for await (const event of this.#transport.stream({
          url: url.toString(),
          token: accessToken.token,
          body,
        })) {
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            output += event.delta;
            if (output.trim()) onPartial(output);
          } else if (event.type === "response.completed") {
            completed = true;
          } else if (event.type.includes("reasoning") || event.type.includes("tool")) {
            throw new Error("translation response contains a forbidden event");
          } else if (event.type === "error" || event.type === "response.failed") {
            throw new Error("translation response failed");
          }
        }
        if (!completed || !output.trim()) throw new Error("translation response is empty");
        return output;
      } catch (error) {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : undefined;
        const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
        if (attempt === 0 && output === "" && retryable) {
          attempt += 1;
          await this.#sleep(0);
          continue;
        }
        throw new Error("translation response failed", { cause: error });
      }
    }
  }

  async cancel(): Promise<void> {
    await this.#transport.cancel();
  }
}
