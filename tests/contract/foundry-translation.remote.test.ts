import { describe, expect, it } from "vitest";

describe.skipIf(process.env.AIDELIVERY_REMOTE_FOUNDRY !== "1")(
  "Foundry translation remote contract",
  () => {
    it("requires explicit non-secret deployment inputs before the remote runner composes the adapter", () => {
      expect(process.env.AZURE_FOUNDRY_ENDPOINT).toMatch(/^https:\/\//);
      expect(process.env.AZURE_FOUNDRY_DEPLOYMENT).toBeTruthy();
      expect(process.env.AZURE_FOUNDRY_API_VERSION).toBeTruthy();
    });
  },
);
