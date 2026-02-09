/**
 * Whisper transcription client.
 *
 * Calls a local Whisper HTTP service to transcribe voice messages.
 * The Whisper service runs as an optional Docker sidecar — see
 * docker/whisper/ for the container.
 */

import { getLogger } from "./runtime.js";

export async function transcribe(
  filePath: string,
  apiUrl: string
): Promise<string | null> {
  const log = getLogger();

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: filePath }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      log.error(`[simplex] Whisper returned ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const text = (data.text || "").trim();

    if (text) {
      log.info(`[simplex] Transcribed voice (${data.language || "?"}): ${text.slice(0, 80)}`);
    }

    return text || null;
  } catch (err: any) {
    log.error("[simplex] Whisper transcription failed:", err.message);
    return null;
  }
}
