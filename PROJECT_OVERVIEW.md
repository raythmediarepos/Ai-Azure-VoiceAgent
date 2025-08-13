## Ai-Azure-VoiceAgent — Production-Ready Azure Alloy Turbo Voice Agent

This repository contains an Azure Functions–based voice agent that uses Azure AI Speech (Alloy Turbo Multilingual), Azure OpenAI, Cosmos DB (SQL API), and Twilio to provide a natural conversational phone agent. Audio is synthesized by Azure Speech, cached to Azure Blob Storage, and streamed to callers via Twilio `<Play>` URLs. Conversations are logged to Cosmos DB for analytics and lead handling.

---

### What’s in this repo

```
Ai-Azure-VoiceAgent/
  host.json
  package.json
  package-lock.json

  speech-service.js                (legacy experiment; see shared/* for production)

  voice-twiml/
    function.json
    index.js                       (initial TwiML: plays Alloy Turbo greeting and opens Gather)

  voice-stream/
    function.json
    index.js                       (core conversation loop, OpenAI + Cosmos + Alloy Turbo voice)

  voice-test/
    function.json
    index.js                       (self-test diagnostics endpoint)

  lead-dashboard/
    function.json
    index.js                       (stub for BI/lead dashboard)

  shared/
    azureSpeechService.js          (Azure Speech + Blob Storage uploader + SSML)
    voiceManager.js                (all-or-nothing orchestration + TwiML builder)

  README.md                        (main docs)
  PROJECT_OVERVIEW.md              (this file)
  ENVIRONMENT_SETUP.md             (environment notes)
  FIX_SPEECH_SERVICE.md            (speech troubleshooting notes)
  SPEECH_SETUP_INSTRUCTIONS.md     (speech setup notes)
  EMERGENCY_DIAGNOSTIC.md          (ops notes)
  FIXES_APPLIED.md                 (change log)
```

---

## High-level architecture

- Twilio receives the inbound call and requests the Azure Function `voice-twiml`.
- `voice-twiml`:
  - Synthesizes a greeting using Alloy Turbo via `VoiceManager`.
  - Uploads the MP3 to Azure Blob Storage (`alloy-turbo-audio` container).
  - Returns TwiML with a single `<Play>` for that audio, then `<Gather input="speech">` posting to `voice-stream`.
- `voice-stream`:
  - Receives caller speech result from Twilio.
  - Logs user turn to Cosmos DB.
  - Calls Azure OpenAI to generate the next agent turn.
  - Synthesizes the response with Alloy Turbo, uploads to Blob Storage, returns TwiML that plays the single audio and opens a new `<Gather>`.
- Conversation continues until hangup/timeout.
- `voice-test`:
  - End-to-end diagnostics for OpenAI, Speech, Blob upload, and TwiML generation.

All speech is “all-or-nothing”: if Alloy Turbo synthesis or Blob upload fails, functions surface an error; there are no Twilio TTS fallbacks.

---

## Key components

### `shared/azureSpeechService.js`
- Creates `SpeechConfig` from `SPEECH_KEY` + `SPEECH_REGION`.
- Sets Alloy voice name: `en-US-AlloyMultilingualNeural` (see “Alloy voice notes”).
- Output format optimized for streaming to Twilio: `Audio24Khz96KBitRateMonoMp3`.
- `synthesizeSpeech(text, { rate, emotion, isEmergency })`
  - Builds simplified SSML using `style="chat"` and `prosody rate="…"` only (no pitch/emphasis) to avoid jitter.
  - Returns base64 audio on success.
- `cacheAudio(text, audioBase64)`
  - Lazily initializes `BlobServiceClient` from `AZURE_STORAGE_CONNECTION_STRING`.
  - Container: `alloy-turbo-audio` (public read).
  - Uploads MP3 with headers: `audio/mpeg`, `cacheControl: public, max-age=86400`.
  - Returns the public `https://<account>.blob.core.windows.net/...` URL.
- `getVoiceRate(isEmergency, urgencyLevel)`
  - Normalized to `medium` for natural conversational pacing.

#### Snippet — simplified SSML and synthesis

```js
// shared/azureSpeechService.js
createSSML(text, options = {}) {
  const { rate = 'medium' } = options;
  const cleanText = this.cleanTextForSSML(text);
  return `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="en-US-AlloyTurboMultilingualNeural">
        <mstts:express-as style="chat" styledegree="1.0">
          <prosody rate="${rate}">${cleanText}</prosody>
        </mstts:express-as>
      </voice>
    </speak>`;
}

async synthesizeSpeech(text, options = {}) {
  const ssml = this.createSSML(text, options);
  const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, null);
  return new Promise((resolve) => {
    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioBase64 = Buffer.from(result.audioData).toString('base64');
          resolve({ success: true, audioData: audioBase64, format: 'mp3', duration: result.audioDuration });
        } else {
          resolve({ success: false, error: result.errorDetails });
        }
      },
      error => { synthesizer.close(); resolve({ success: false, error: error.message }); }
    );
  });
}
```

### `shared/voiceManager.js`
- Orchestrates Alloy-only flow.
- Base URL is the deployed app:
  - `https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api`
- `generateVoiceResponse(text, context)`
  - Synthesizes main audio only (removed “follow-up” second audio to avoid double-intro and latency).
  - Uploads to Blob; returns TwiML with one `<Play>`, a single `<Gather input="speech" action="{baseUrl}/voice-stream">`, and a `<Redirect>` to `voice-twiml` on timeout.
- Enforces all-or-nothing: throws on synthesis/upload failures.

#### Snippet — single-audio TwiML per turn

```js
// shared/voiceManager.js
return `
  <Response>
    <Play>${audioUrl}</Play>
    <Gather input="speech" timeout="${timeout}" speechTimeout="auto" action="${this.baseUrl}/voice-stream" method="POST"></Gather>
    <Redirect>${this.baseUrl}/voice-twiml</Redirect>
  </Response>`;
```

### `voice-twiml/index.js`
- Initial TwiML entry for inbound call.
- Uses `VoiceManager.generateVoiceResponse` for greeting, e.g.:
  - “Hello! Thank you for calling Blue Caller HVAC. I'm Sarah, your AI assistant. How can I help you today?”
- Returns Alloy Turbo speech URL in `<Play>`, then `<Gather>` → `voice-stream`.

#### Snippet — greeting using VoiceManager

```js
// voice-twiml/index.js
const greeting = "Hello! Thank you for calling Blue Caller HVAC. I'm Sarah, your AI assistant. How can I help you today?";
const voiceResponse = await voiceManager.generateVoiceResponse(greeting, { emotion: 'friendly', urgencyLevel: 'normal' });
context.res = { headers: { 'Content-Type': 'text/xml' }, body: voiceResponse };
```

### `voice-stream/index.js`
- Validates OpenAI + Cosmos connections.
- Saves user transcripts and assistant responses to Cosmos DB.
- Confidence checks for caller speech; asks for clarification if confidence < threshold.
- Uses `VoiceManager.generateVoiceResponse` for replies (single audio per turn).

### `voice-test/index.js`
- HTML diagnostics page for:
  - Environment checks (presence of keys).
  - Azure OpenAI connectivity.
  - Azure Speech synthesis + Blob upload sample.
  - VoiceManager integration.
  - Cosmos DB connectivity.

---

## Request/response flow

1. Twilio webhook → `GET/POST {base}/voice-twiml`.
2. Function synthesizes greeting, uploads to blob, returns TwiML:
   - Single `<Play>` to blob URL
   - `<Gather input="speech" action="{base}/voice-stream">`
3. Twilio posts recognized speech → `POST {base}/voice-stream`.
4. Function logs, calls OpenAI, synthesizes reply, uploads, returns next TwiML (same pattern).
5. Repeat.

---

## Environment variables

Set in Function App → Configuration → Application settings:

- `SPEECH_KEY` — Azure AI Speech key
- `SPEECH_REGION` — Azure AI Speech region (e.g., `westus`)
- `AZURE_STORAGE_CONNECTION_STRING` — Storage account connection string (blob public access required for `alloy-turbo-audio`)
- `OPENAI_ENDPOINT` — Azure OpenAI endpoint
- `OPENAI_KEY` — Azure OpenAI key
- `COSMOS_CONN` — Cosmos DB SQL API connection string (`AccountEndpoint=…;AccountKey=…;`)
- Optional ops:
  - `APPLICATIONINSIGHTS_CONNECTION_STRING`
  - `WEBSITE_RUN_FROM_PACKAGE = 1` (recommended; see Ops section)

Note: The CLI may show `null` values; the portal values are the source of truth.

---

## Twilio configuration

- Voice webhook: `https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api/voice-twiml`.
- TwiML returned by functions contains:
  - One `<Play>` per turn (no duplicate audio)
  - `<Gather input="speech" action="{base}/voice-stream" method="POST">`

---

## Alloy voice notes

- Gallery label “Alloy Turbo Multilingual” maps to Speech SDK voice short names. Current code uses:
  - `en-US-AlloyMultilingualNeural`
- If Azure releases a new “Turbo” short name, update `speechSynthesisVoiceName` accordingly.

---

## Audio and SSML strategy

- Format: `Audio24Khz96KBitRateMonoMp3` for lower latency and high intelligibility with Twilio.
- SSML kept simple for stability:
  - style `chat`, styledegree `1.0`
  - `prosody rate="medium"`
- Removed emphasis/pitch and “follow-up” second audio to eliminate jitter, double intro, and speed-shift artifacts.

---

## Cosmos DB data model (conceptual)

- Database: `voiceAgent`
- Containers:
  - `transcripts` — per-call turn logs (caller text, AI text, timestamps, confidences)
  - `leads` — extracted lead info and scoring
- `voice-stream` writes both user and assistant messages per turn.

---

## Deployment

Local prerequisites:

- Node 18+
- Azure Functions Core Tools
- `npm install`

Deploy (remote build preferred):

```bash
func azure functionapp publish func-blucallerai --javascript --build remote --force
```

Endpoints (after deploy):

- `.../api/voice-twiml`
- `.../api/voice-stream`
- `.../api/voice-test`
- `.../api/lead-dashboard`

---

## Operations, reliability, and recent production fixes

- **All-or-nothing Alloy**: if Azure Speech or Blob upload fails, functions raise errors; no TTS fallback.
- **Single audio per turn**: removed second “follow-up” `<Play>` to avoid double intros and buffering.
- **Streaming stability**:
  - Reduced bitrate to 96k mono MP3 at 24kHz; improved start time and smoothness.
- **Base URL**:
  - `voiceManager` uses the new regionalized Function URL:
    - `https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api`.
- **Blob Storage**:
  - Container `alloy-turbo-audio` created as public read; `createIfNotExists({ access: 'blob' })`.
  - Caching headers `max-age=86400`.

### Sync triggers / “web app is stopped” 403

- If Function App shows “Disabled” and restart is greyed out:
  - Enable **System Assigned Managed Identity**:
    - Function App → Identity → System assigned → On → Save.
    - Assign “Storage Blob Data Contributor” role on the storage account to this identity if using Azure AD auth for storage ops.
  - **Resource Explorer re-enable**:
    - `https://resources.azure.com` → Read/Write → subscription → resource group → `Microsoft.Web/sites/func-blucallerai` → Edit → set `"enabled": true` → Patch.
  - **WEBSITE_RUN_FROM_PACKAGE**:
    - Ensure `WEBSITE_RUN_FROM_PACKAGE = 1`. Conflicts can block startup.
  - If portal claims “daily quota exceeded” but Subscription > Cost shows ~0 usage:
    - Treat as false positive; use Resource Explorer patch and verify identity/permissions.
  - If triggers won’t sync with “Forbidden/Unauthorized”:
    - Check Identity → System assigned = On.
    - Verify `AzureWebJobsStorage`/Storage permissions and Cosmos credentials.

### Observability

- Use `voice-test` to verify:
  - Azure OpenAI connectivity
  - Alloy synthesis success
  - Blob upload URL accessibility
  - Cosmos connectivity
- Enable Application Insights for detailed traces and live metrics.

---

## Security

- Do not expose secrets in code or logs.
- Keep Function App → Configuration values in Azure; avoid committing `.env`.
- Prefer Managed Identity where possible; assign least-privilege roles.
- Blob container must be public read only if Twilio needs to access audio; for private access you’d need signed URLs (SAS) and expiring links.

---

## Cost controls

- MP3 files are small (tens–hundreds of KB per turn).
- To cap storage growth:
  - Lifecycle policy on `alloy-turbo-audio` (e.g., delete after 7 days).
- Conversation safety:
  - Limit max turns per call and “no speech” timeout to end politely.

---

## Testing

- Health page:
  - Open `.../api/voice-test` in browser for environment readiness and sample audio playback links.
- Twilio test call:
  - Expect single greeting, no duplicate intros.
  - Natural pace (not too slow/fast).
- Conversation:
  - Speak a short query. Response should synthesize smoothly, then prompt for next input.

---

## Common pitfalls and fixes

- **Double intro**: Caused by two `<Play>` audios (main + “I’m listening”). Fixed by returning a single `<Play>`.
- **Base64 audio in TwiML**: Twilio `<Play>` doesn’t accept base64. We upload to Blob and return the public URL.
- **“Application error” after speaking**: Often the `Gather action` pointed at an old hostname. Ensure `voiceManager.baseUrl` matches the deployed app.
- **Triggers won’t sync; app Disabled; no Start button**: Use Resource Explorer to set `enabled=true`, verify `WEBSITE_RUN_FROM_PACKAGE=1`, and enable System Assigned Managed Identity.
- **Forbidden/Unauthorized**: Missing Managed Identity or inadequate RBAC to dependent services.

---

## Roadmap

- Content caching: reuse MP3 for identical replies to cut synthesis and egress.
- Lead extraction: enrich and score leads using OpenAI function calling + Cosmos.
- Web dashboard for live transcripts + BI.
- Signed URLs instead of public blobs (pre-signed SAS per request).
- Automated cleanup policies for `alloy-turbo-audio`.

---

## Quick commands

Deploy:

```bash
func azure functionapp publish func-blucallerai --javascript --build remote --force
```

Restart app (when enabled):

```bash
az functionapp restart --name func-blucallerai --resource-group rg-blucallerai
```

Metrics (portal recommended for accuracy): Function App → Monitoring → Metrics → Data In/Out, Executions.

---

- Documentation reflects the current, working “single audio per turn” Alloy Turbo pipeline.
- Captures ops runbooks for “403 web app is stopped”, trigger sync, Managed Identity, and Resource Explorer re-enable.
- Documents all core files (`voice-twiml`, `voice-stream`, `shared/*`) and how they interact.


