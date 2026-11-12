import { createApp } from "../../../src/server/app";

import { SyntheticSpeechAdapter, SyntheticTranslationAdapter } from "./synthetic-adapters";

export function createSyntheticTestApp() {
  return createApp({
    speechAdapter: new SyntheticSpeechAdapter([]),
    translationAdapter: new SyntheticTranslationAdapter({}),
    clientRoot: false,
  });
}
