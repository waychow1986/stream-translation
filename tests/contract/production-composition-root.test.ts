import { describe, expect, it, vi } from "vitest";

import type { SpeechAdapter, TranslationAdapter } from "../../src/server/adapters/types";
import { createProductionDependencies, startServer } from "../../src/server/index";

describe("production composition root", () => {
  it("creates only real Azure adapters from validated server configuration", () => {
    const dependencies = createProductionDependencies({
      port: 3000,
      appOrigin: "https://app.example.test",
      speechEndpoint: "https://speech.example.test/",
      speechCandidateLocales: ["en-US"],
      foundryEndpoint: "https://foundry.example.test/",
      foundryDeployment: "translation",
      foundryApiVersion: "2026-01-01",
      deliveryId: "DLV-test",
      candidateSha: "a".repeat(40),
    });

    expect(dependencies.createSpeechAdapter?.().constructor.name).toBe("AzureSpeechAdapter");
    expect(dependencies.createTranslationAdapter?.().constructor.name).toBe(
      "FoundryTranslationAdapter",
    );
    expect(JSON.stringify(dependencies)).not.toContain("Synthetic");
  });

  it("exposes immutable Candidate identity separately from readiness", async () => {
    const app = (
      await startServer({
        dependencies: {
          speechAdapter: {
            start: vi.fn(async () => undefined),
            write: vi.fn(async () => undefined),
            end: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
          },
          translationAdapter: {
            translate: vi.fn(async () => ""),
            cancel: vi.fn(async () => undefined),
          },
          candidateIdentity: {
            deliveryId: "DLV-test",
            candidateSha: "a".repeat(40),
          },
          clientRoot: false,
        },
        port: 0,
        installSignalHandlers: false,
      })
    ).app;

    const response = await app.inject({ method: "GET", url: "/candidate-identity" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deliveryId: "DLV-test",
      candidateSha: "a".repeat(40),
    });
    await app.close();
  });

  it("closes already-created resources when application startup fails", async () => {
    const speechAdapter: SpeechAdapter = {
      start: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const translationAdapter: TranslationAdapter = {
      translate: vi.fn(async () => ""),
      cancel: vi.fn(async () => undefined),
    };
    await expect(
      startServer({
        dependencies: { speechAdapter, translationAdapter, clientRoot: false },
        port: -1,
        installSignalHandlers: false,
      }),
    ).rejects.toThrow();
    expect(speechAdapter.close).toHaveBeenCalledOnce();
    expect(translationAdapter.cancel).toHaveBeenCalledOnce();
  });
});
