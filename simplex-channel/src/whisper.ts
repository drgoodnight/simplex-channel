/**
 * Whisper voice transcription client.
 *
 * Sends a file path to a local Whisper HTTP server and returns the
 * transcribed text.  Used when whisper.enabled = true in plugin config.
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
    });
    if (!resp.ok) {
      log.error(`[simplex] Whisper returned ${resp.status}`);
      return null;
    }
    const data = (await resp.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err: any) {
    log.error(`[simplex] Whisper error: ${err.message}`);
    return null;
  }
}
