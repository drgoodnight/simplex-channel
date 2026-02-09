/**
 * SimpleX message parser.
 *
 * Extracts contact info, text content, voice files, and attachments
 * from the various event structures the SimpleX CLI emits.
 */

import type { SimplexEvent, InboundMessage } from "./types.js";

/**
 * Parse a SimpleX event into zero or more InboundMessage objects.
 * Returns empty array if the event isn't a user message.
 */
export function parseEvent(event: SimplexEvent): InboundMessage[] {
  const type = event.type || "";

  if (type === "newChatItems") {
    const items = event.chatItems || [];
    return items.map(parseItem).filter(Boolean) as InboundMessage[];
  }

  if (type === "newChatItem") {
    const msg = parseItem(event);
    return msg ? [msg] : [];
  }

  return [];
}

function parseItem(item: any): InboundMessage | null {
  const chatInfo = item.chatInfo || {};
  const chatItem = item.chatItem || item;

  // Extract contact
  const contactName = extractContactName(chatInfo, chatItem);
  if (!contactName) return null;

  const contactId = extractContactId(chatInfo);

  // Extract content from nested structures
  const content = chatItem.chatItem || chatItem;
  const msgContent = content.content || content.msgContent || {};
  const innerContent =
    typeof msgContent === "object" ? msgContent.msgContent || msgContent : msgContent;

  // Text
  const text = extractText(innerContent);

  // Voice message
  const voiceFilePath = extractVoiceFile(innerContent, content);

  // File attachment (non-voice)
  const fileInfo = extractFile(content);

  // Skip if no actionable content
  if (!text && !voiceFilePath) return null;

  return {
    contactName,
    contactId,
    text: text || undefined,
    voiceFilePath: voiceFilePath || undefined,
    fileInfo: fileInfo || undefined,
    raw: item,
  };
}

function extractContactName(chatInfo: any, chatItem: any): string | null {
  // Direct contact field
  const contact = chatInfo.contact || chatInfo.chatInfo?.contact;
  if (contact?.localDisplayName) return contact.localDisplayName;

  // Nested structures (varies by SimpleX CLI version)
  for (const key of ["directChat", "chatInfo"]) {
    const sub = chatInfo[key];
    if (sub?.contact?.localDisplayName) return sub.contact.localDisplayName;
  }

  // ChatItem-level meta
  const meta = chatItem.meta || chatItem.chatItem?.meta;
  if (meta?.contact) return meta.contact;
  if (meta?.localDisplayName) return meta.localDisplayName;

  return null;
}

function extractContactId(chatInfo: any): number | undefined {
  const contact = chatInfo.contact || chatInfo.chatInfo?.contact;
  return contact?.contactId;
}

function extractText(content: any): string | null {
  if (typeof content === "string") return content;
  if (typeof content !== "object" || !content) return null;

  if (content.text) return content.text;

  const t = content.type || "";
  if (t === "text" || t === "msgText") return content.text || null;

  return null;
}

function extractVoiceFile(content: any, chatItem: any): string | null {
  if (typeof content !== "object" || !content) return null;

  // Check if it's a voice message type
  const isVoice =
    content.type === "voice" ||
    chatItem.file?.voice === true ||
    content.file?.voice === true;

  if (!isVoice) return null;

  const file = chatItem.file || content.file;
  if (!file?.filePath) return null;

  return file.filePath;
}

function extractFile(chatItem: any): any | null {
  const file = chatItem.file;
  if (!file?.filePath) return null;
  if (file.voice) return null; // Voice handled separately

  return {
    path: file.filePath,
    name: file.fileName || "",
    size: file.fileSize || 0,
  };
}
