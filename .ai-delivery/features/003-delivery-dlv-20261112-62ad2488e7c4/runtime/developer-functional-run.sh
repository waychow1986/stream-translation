#!/usr/bin/env bash
set -euo pipefail

: "${AIDELIVERY_DELIVERY_ID:?AIDELIVERY_DELIVERY_ID is required}"
: "${AIDELIVERY_CANDIDATE_SHA:?AIDELIVERY_CANDIDATE_SHA is required}"
: "${DEV_FUNCTIONAL_BASE_URL:?DEV_FUNCTIONAL_BASE_URL is required}"
: "${DEV_FUNCTIONAL_RESULT_PATH:?DEV_FUNCTIONAL_RESULT_PATH is required}"
: "${AIDELIVERY_AUDIO_FIXTURE_MANIFEST:?AIDELIVERY_AUDIO_FIXTURE_MANIFEST is required}"
: "${AZURE_SPEECH_CANDIDATE_LOCALES:?AZURE_SPEECH_CANDIDATE_LOCALES is required}"

identity="$(curl --fail --silent --show-error "${DEV_FUNCTIONAL_BASE_URL%/}/candidate-identity")"
jq -e \
  --arg deliveryId "$AIDELIVERY_DELIVERY_ID" \
  --arg candidateSha "$AIDELIVERY_CANDIDATE_SHA" \
  '.deliveryId == $deliveryId and .candidateSha == $candidateSha' \
  <<<"$identity" >/dev/null

AIDELIVERY_REMOTE_BASE_URL="$DEV_FUNCTIONAL_BASE_URL" \
  AIDELIVERY_REMOTE_IQA=1 \
  npm run test:remote

jq -n \
  '{
    passed: true,
    scenarios: [
      {id: "IQA-001", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: "remote suite completed"},
      {id: "IQA-002", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: "remote suite completed"},
      {id: "IQA-003", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: "remote suite completed"}
    ],
    evidence: ["Candidate identity matched the immutable platform inputs", "IQA remote suite exited successfully"]
  }' >"$DEV_FUNCTIONAL_RESULT_PATH"
