export type ServerConfig = Readonly<{
  port: number;
  appOrigin: string;
  speechEndpoint: string;
  speechCandidateLocales: readonly string[];
  foundryEndpoint: string;
  foundryDeployment: string;
  foundryApiVersion: string;
  deliveryId: string;
  candidateSha: string;
  azureClientId?: string;
}>;

const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?-[A-Z]{2}$|^[a-z]{2,3}-[A-Z]{2}$/;

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function httpsUrl(environment: NodeJS.ProcessEnv, key: string): string {
  const value = required(environment, key);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${key} must be a credential-free HTTPS URL`);
  }
  return url.toString();
}

export function parseServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const rawPort = required(environment, "PORT");
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }

  const locales = required(environment, "AZURE_SPEECH_CANDIDATE_LOCALES")
    .split(",")
    .map((locale) => locale.trim());
  if (locales.some((locale) => !LOCALE_PATTERN.test(locale))) {
    throw new Error("AZURE_SPEECH_CANDIDATE_LOCALES contains an invalid locale");
  }
  if (new Set(locales).size !== locales.length) {
    throw new Error("AZURE_SPEECH_CANDIDATE_LOCALES contains a duplicate locale");
  }

  const appOrigin = httpsUrl(environment, "APP_ORIGIN");
  const candidateSha = required(environment, "AIDELIVERY_CANDIDATE_SHA");
  if (!/^[0-9a-f]{40}$/i.test(candidateSha)) {
    throw new Error("AIDELIVERY_CANDIDATE_SHA must be a 40-character commit SHA");
  }
  const config: ServerConfig = {
    port,
    appOrigin: appOrigin.endsWith("/") ? appOrigin.slice(0, -1) : appOrigin,
    speechEndpoint: httpsUrl(environment, "AZURE_SPEECH_ENDPOINT"),
    speechCandidateLocales: Object.freeze(locales),
    foundryEndpoint: httpsUrl(environment, "AZURE_FOUNDRY_ENDPOINT"),
    foundryDeployment: required(environment, "AZURE_FOUNDRY_DEPLOYMENT"),
    foundryApiVersion: required(environment, "AZURE_FOUNDRY_API_VERSION"),
    deliveryId: required(environment, "AIDELIVERY_DELIVERY_ID"),
    candidateSha,
    ...(environment.AZURE_CLIENT_ID?.trim()
      ? { azureClientId: environment.AZURE_CLIENT_ID.trim() }
      : {}),
  };
  return Object.freeze(config);
}
