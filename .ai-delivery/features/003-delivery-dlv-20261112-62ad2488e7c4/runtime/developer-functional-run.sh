#!/usr/bin/env bash
set -euo pipefail

: "${AIDELIVERY_DELIVERY_ID:?AIDELIVERY_DELIVERY_ID is required}"
: "${AIDELIVERY_CANDIDATE_SHA:?AIDELIVERY_CANDIDATE_SHA is required}"
: "${DEV_FUNCTIONAL_BASE_URL:?DEV_FUNCTIONAL_BASE_URL is required}"
: "${DEV_FUNCTIONAL_RESULT_PATH:?DEV_FUNCTIONAL_RESULT_PATH is required}"
: "${AIDELIVERY_AUDIO_FIXTURE_MANIFEST:?AIDELIVERY_AUDIO_FIXTURE_MANIFEST is required}"
: "${AZURE_SPEECH_CANDIDATE_LOCALES:?AZURE_SPEECH_CANDIDATE_LOCALES is required}"

evidence_root="$(mktemp -d)"
trap 'rm -rf "$evidence_root"' EXIT
contract_evidence="$evidence_root/contracts"
iqa_evidence="$evidence_root/iqa"
mkdir -p "$contract_evidence" "$iqa_evidence"

identity="$(curl --fail --silent --show-error "${DEV_FUNCTIONAL_BASE_URL%/}/candidate-identity")"
jq -e \
  --arg deliveryId "$AIDELIVERY_DELIVERY_ID" \
  --arg candidateSha "$AIDELIVERY_CANDIDATE_SHA" \
  '.deliveryId == $deliveryId and .candidateSha == $candidateSha' \
  <<<"$identity" >/dev/null

AIDELIVERY_REMOTE_SPEECH=1 \
  AIDELIVERY_REMOTE_FOUNDRY=1 \
  AIDELIVERY_CONTRACT_EVIDENCE_DIRECTORY="$contract_evidence" \
  npm run test:contract:remote

AIDELIVERY_REMOTE_BASE_URL="$DEV_FUNCTIONAL_BASE_URL" \
  AIDELIVERY_REMOTE_IQA=1 \
  AIDELIVERY_IQA_EVIDENCE_DIRECTORY="$iqa_evidence" \
  npm run test:remote

for contract in azure-speech foundry-translation; do
  jq -e '.passed == true' "$contract_evidence/$contract.json" >/dev/null
done
for scenario in IQA-001 IQA-002 IQA-003; do
  jq -e \
    --arg scenario "$scenario" \
    --arg deliveryId "$AIDELIVERY_DELIVERY_ID" \
    --arg candidateSha "$AIDELIVERY_CANDIDATE_SHA" \
    --arg target "$DEV_FUNCTIONAL_BASE_URL" \
    '.scenarioId == $scenario
      and .candidate.deliveryId == $deliveryId
      and .candidate.candidateSha == $candidateSha
      and .target == $target
      and (.audioEnds | length > 0)
      and (.stages | length > 0)
      and (.events | length > 0)
      and all(.events[]; .expectedChineseMatched == true)' \
    "$iqa_evidence/$scenario.json" >/dev/null
done

jq -n \
  --slurpfile speech "$contract_evidence/azure-speech.json" \
  --slurpfile foundry "$contract_evidence/foundry-translation.json" \
  --slurpfile iqa1 "$iqa_evidence/IQA-001.json" \
  --slurpfile iqa2 "$iqa_evidence/IQA-002.json" \
  --slurpfile iqa3 "$iqa_evidence/IQA-003.json" \
  '{
    passed: true,
    scenarios: [
      {id: "IQA-001", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: ($iqa1[0] | tojson)},
      {id: "IQA-002", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: ($iqa2[0] | tojson)},
      {id: "IQA-003", passed: true, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: ($iqa3[0] | tojson)}
    ],
    evidence: [
      "Candidate identity matched the immutable platform inputs",
      ($speech[0] | tojson),
      ($foundry[0] | tojson)
    ]
  }' >"$DEV_FUNCTIONAL_RESULT_PATH"
