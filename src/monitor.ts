/**
 * SimpleX channel monitor.
 *
 * Listens for incoming messages on the SimpleX CLI WebSocket connection,
 * parses them, handles voice transcription, and dispatches to OpenClaw's
 * auto-reply system for agent processing.
 */

import { SimplexCli } from "./simplex-cli.js";
import { parseEvent } from "./parser.js";
import { transcribe } from "./whisper.js";
import { getLogger, getRuntime, getConfig } from "./runtime.js";
import type { SimplexEvent, SimplexPluginConfig, InboundMessage } from "./types.js";

let cli: SimplexCli | null = null;

export function getCli(): SimplexCli | null {
  return cli;
}

/**
 * Start the SimpleX monitor.
 *
 * Connects to the SimpleX CLI WebSocket server and begins
 * processing inbound messages.
 */
export async function startMonitor(pluginConfig: SimplexPluginConfig): Promise<void> {
  const log = getLogger();

  cli = new SimplexCli(pluginConfig.wsUrl);

  cli.onEvent(async (event: SimplexEvent) => {
    await handleEvent(event, pluginConfig);
  });

  await cli.connect();
  log.info(`[simplex] Monitor started → ${pluginConfig.wsUrl}`);
}

export function stopMonitor(): void {
  if (cli) {
    cli.disconnect();
    cli = null;
  }
}

/**
 * Handle a raw SimpleX event.
 */
async function handleEvent(
  event: SimplexEvent,
  config: SimplexPluginConfig
): Promise<void> {
  const log = getLogger();
  const type = event.type || "";

  // Auto-accept contact requests
  if (type === "contactRequest" && config.autoAccept) {
    const name =
      event.contactRequest?.localDisplayName ||
      event.contactRequest?.profile?.displayName;
    if (name && cli) {
      log.info(`[simplex] Auto-accepting contact: ${name}`);
      await cli.acceptContact(name);
    }
    return;
  }

  // Parse message events
  const messages = parseEvent(event);
  for (const msg of messages) {
    await processMessage(msg, config);
  }
}

/**
 * Process a single inbound message:
 *  1. Transcribe voice if applicable
 *  2. Dispatch to OpenClaw's agent/auto-reply system
 */
async function processMessage(
  msg: InboundMessage,
  config: SimplexPluginConfig
): Promise<void> {
  const log = getLogger();
  let text = msg.text || "";

  // Voice transcription
  if (msg.voiceFilePath && config.whisper.enabled) {
    const transcription = await transcribe(msg.voiceFilePath, config.whisper.apiUrl);
    if (transcription) {
      text = `[🎤 Voice] ${transcription}`;
    } else if (!text) {
      text = "[Voice message received — transcription unavailable]";
    }
  }

  if (!text) return;

  log.info(`[simplex] ${msg.contactName}: ${text.slice(0, 100)}`);

  // -----------------------------------------------------------------------
  // Dispatch to OpenClaw auto-reply system.
  //
  // This is the key integration point. The runtime.handleAutoReply() method
  // feeds the message into the agent pipeline — the same path that
  // WhatsApp, Telegram, and other channels use.
  //
  // The sessionKey format follows OpenClaw's convention:
  //   agent:<agentId>:<channel>:dm:<contactIdentifier>
  //
  // If the exact API differs in your OpenClaw version, this is the one
  // function call to adjust.
  // -----------------------------------------------------------------------

  try {
    const runtime = getRuntime();
    const sessionKey = `agent:main:simplex:dm:${msg.contactName}`;

    await runtime.handleAutoReply({
      channel: "simplex",
      channelType: "dm",
      sessionKey,
      sender: {
        id: String(msg.contactId || msg.contactName),
        displayName: msg.contactName,
      },
      text,
      // Pass file metadata if present
      ...(msg.fileInfo && {
        media: {
          type: "file",
          path: msg.fileInfo.path,
          name: msg.fileInfo.name,
          size: msg.fileInfo.size,
        },
      }),
    });
  } catch (err: any) {
    log.error(`[simplex] Failed to dispatch message: ${err.message}`);
  }
}
