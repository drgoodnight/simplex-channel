/**
 * SimpleX event parser.
 *
 * Extracts InboundMessage objects from the wide variety of event shapes
 * emitted by the SimpleX CLI WebSocket protocol.
 */

import type { SimplexEvent, InboundMessage } from "./types.js";

/**
 * Parse a raw SimpleX CLI event into zero or more InboundMessage objects.
 * Returns an empty array for events that aren't inbound text messages.
 */
export function parseEvent(event: SimplexEvent): InboundMessage[] {
  const type = event.type || "";

  // ── Direct message received ────────────────────────────────────
  if (type === "newChatItems" && Array.isArray(event.chatItems)) {
    return event.chatItems
      .map(parseChatItem)
      .filter((m): m is InboundMessage => m !== null);
  }

  // ── Single chat item (older protocol) ──────────────────────────
  if (type === "newChatItem" && event.chatItem) {
    const msg = parseChatItem(event.chatItem);
    return msg ? [msg] : [];
  }

  // ── Contact message (alternative shape) ────────────────────────
  if (type === "contactMessage" || type === "receivedMessage") {
    const contact = event.contact || {};
    const text = event.message?.text || event.msgBody || "";
    if (!text) return [];
    return [
      {
        contactId: contact.contactId ?? contact.localDisplayName ?? "unknown",
        contactName: contact.localDisplayName ?? "unknown",
        text,
      },
    ];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function parseChatItem(item: any): InboundMessage | null {
  const chatInfo = item.chatInfo ?? {};
  const chatItem = item.chatItem ?? {};
  const content = chatItem.content ?? {};
  const msg = content.msgContent ?? {};

  // Only process received messages (not sent by us)
  const dir = chatItem.chatDir?.type || chatItem.chatDir || "";
  if (typeof dir === "string" && dir.includes("snd")) return null;
  if (typeof dir === "object" && dir?.type?.includes("snd")) return null;

  // Extract text
  const text = msg.text || msg.message || "";
  if (!text && !msg.type?.includes("voice")) return null;

  // Extract contact info
  const contact =
    chatInfo.contact ??
    chatInfo.direct?.contact ??
    chatItem.chatDir?.contact ??
    {};
  const contactId = contact.contactId ?? contact.localDisplayName ?? "unknown";
  const contactName = contact.localDisplayName ?? "unknown";

  // Check for voice file
  const file = chatItem.file ?? null;
  const voiceFilePath =
    file?.fileStatus === "rcvComplete" ? file.filePath : undefined;

  return { contactId, contactName, text, voiceFilePath };
}
