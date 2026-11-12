import { describe, expect, it } from "vitest";

import { parseServerConfig } from "../../src/server/config";

const validEnvironment = {
  PORT: "3000",
  APP_ORIGIN: "https://translation.example",
  AZURE_SPEECH_ENDPOINT: "https://speech.example",
  AZURE_SPEECH_CANDIDATE_LOCALES: "en-US,fr-FR",
  AZURE_FOUNDRY_ENDPOINT: "https://foundry.example",
  AZURE_FOUNDRY_DEPLOYMENT: "translation",
  AZURE_FOUNDRY_API_VERSION: "2026-01-01",
};

describe("server configuration", () => {
  it("parses only the approved server allowlist", () => {
    const config = parseServerConfig({ ...validEnvironment, AZURE_SECRET: "not-read" });
    expect(config).toEqual({
      port: 3000,
      appOrigin: "https://translation.example",
      speechEndpoint: "https://speech.example/",
      speechCandidateLocales: ["en-US", "fr-FR"],
      foundryEndpoint: "https://foundry.example/",
      foundryDeployment: "translation",
      foundryApiVersion: "2026-01-01",
    });
    expect(JSON.stringify(config)).not.toContain("not-read");
  });

  it.each(["PORT", "APP_ORIGIN", "AZURE_SPEECH_ENDPOINT", "AZURE_FOUNDRY_DEPLOYMENT"])(
    "rejects a missing %s",
    (key) => {
      const environment = { ...validEnvironment };
      delete environment[key as keyof typeof environment];
      expect(() => parseServerConfig(environment)).toThrow(key);
    },
  );

  it("rejects duplicate and malformed candidate locales", () => {
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        AZURE_SPEECH_CANDIDATE_LOCALES: "en-US,en-US",
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      parseServerConfig({
        ...validEnvironment,
        AZURE_SPEECH_CANDIDATE_LOCALES: "english",
      }),
    ).toThrow(/locale/);
  });
});
