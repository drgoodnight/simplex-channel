/**
 * SimpleX inbound message monitor.
 *
 * Connects to the SimpleX CLI WebSocket, receives messages, and
 * dispatches them into OpenClaw's reply pipeline using the same
 * mechanism as built-in channels (Telegram, WhatsApp, etc.).
 */

import { SimplexCli } from "./simplex-cli.js";
import { parseEvent } from "./parser.js";
import { transcribe } from "./whisper.js";
import { getLogger, getApi } from "./runtime.js";
import type { SimplexEvent, SimplexPluginConfig, InboundMessage } from "./types.js";

let cli: SimplexCli | null = null;

export function getCli(): SimplexCli | null {
  return cli;
}

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

/* ------------------------------------------------------------------ */
/*  Event routing                                                     */
/* ------------------------------------------------------------------ */

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

  const messages = parseEvent(event);
  for (const msg of messages) {
    await processMessage(msg, config);
  }
}

/* ------------------------------------------------------------------ */
/*  Message dispatch                                                  */
/* ------------------------------------------------------------------ */

async function processMessage(
  msg: InboundMessage,
  config: SimplexPluginConfig
): Promise<void> {
  const log = getLogger();
  let text = msg.text || "";

  // Optional voice transcription
  if (msg.voiceFilePath && config.whisper.enabled) {
    const transcription = await transcribe(
      msg.voiceFilePath,
      config.whisper.apiUrl
    );
    if (transcription) {
      text = `[Voice] ${transcription}`;
    } else if (!text) {
      text = "[Voice message — transcription unavailable]";
    }
  }

  if (!text) return;

  log.info(`[simplex] ${msg.contactName}: ${text.slice(0, 100)}`);

  try {
    const api = getApi();
    const cfg = api.config;
    const sessionKey = `agent:main:simplex:dm:${msg.contactName}`;
    const messageId = `simplex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build the inbound context payload (same shape all channels use)
    const ctx: Record<string, any> = {
      Body: text,
      BodyForAgent: text,
      BodyForCommands: text,
      RawBody: text,
      From: msg.contactName,
      To: config.displayName || "openclaw",
      Surface: "simplex",
      Provider: "simplex",
      SessionKey: sessionKey,
      OriginatingChannel: "simplex",
      OriginatingTo: msg.contactName,
      AccountId: "default",
      MessageSid: messageId,
      SenderId: String(msg.contactId || msg.contactName),
      SenderName: msg.contactName,
    };

    // Record inbound session metadata
    try {
      api.runtime.channel.session.recordInboundSession({
        sessionKey,
        channel: "simplex",
        from: msg.contactName,
        to: config.displayName || "openclaw",
        accountId: "default",
      });
    } catch (e: any) {
      // Non-fatal — session tracking is optional
    }

    // Dispatch via OpenClaw's buffered reply pipeline.
    // The `deliver` callback is invoked with each chunk of the agent's
    // response, which we forward back to the SimpleX contact.
    const { dispatchReplyWithBufferedBlockDispatcher } =
      api.runtime.channel.reply;

    await dispatchReplyWithBufferedBlockDispatcher({
      ctx,
      cfg,
      dispatcherOptions: {
        deliver: async (payload: any, _info: any) => {
          const replyText =
            typeof payload === "string"
              ? payload
              : payload?.text ||
                payload?.body ||
                payload?.Body ||
                String(payload);

          if (!replyText || !cli?.connected) return;

          const chunks = chunkMessage(replyText, 4000);
          for (const chunk of chunks) {
            await cli.sendMessage(msg.contactName, chunk);
          }
        },
      },
    });
  } catch (err: any) {
    log.error(`[simplex] Dispatch failed: ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf("\n", maxLen);
    if (breakAt < maxLen * 0.5) breakAt = remaining.lastIndexOf(" ", maxLen);
    if (breakAt < maxLen * 0.3) breakAt = maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  return chunks;
}
