/**
 * SimpleX channel plugin definition.
 *
 * This object is registered with OpenClaw via api.registerChannel().
 * It defines how the gateway discovers accounts, sends outbound messages,
 * and what capabilities the channel supports.
 */

import { getCli } from "./monitor.js";
import { getLogger } from "./runtime.js";

export const simplexChannel = {
  id: "simplex",

  meta: {
    id: "simplex",
    label: "SimpleX Chat",
    selectionLabel: "SimpleX Chat (CLI WebSocket)",
    docsPath: "/channels/simplex",
    blurb: "Private messaging via SimpleX Chat — no user IDs, no metadata.",
    aliases: ["sx"],
  },

  capabilities: {
    chatTypes: ["direct"] as const,
  },

  config: {
    /**
     * List configured account IDs.
     * SimpleX is single-identity per CLI instance, so we use "default".
     */
    listAccountIds: (cfg: any): string[] => {
      const simplexCfg = cfg.channels?.simplex;
      if (!simplexCfg) return [];
      if (simplexCfg.accounts) return Object.keys(simplexCfg.accounts);
      return ["default"];
    },

    /**
     * Resolve account config by ID.
     */
    resolveAccount: (cfg: any, accountId?: string): any => {
      const simplexCfg = cfg.channels?.simplex;
      if (!simplexCfg) return { accountId: accountId || "default" };

      if (simplexCfg.accounts) {
        return simplexCfg.accounts[accountId || "default"] || { accountId };
      }

      return { ...simplexCfg, accountId: accountId || "default" };
    },
  },

  outbound: {
    /**
     * Direct delivery — responses go straight to the contact.
     */
    deliveryMode: "direct" as const,

    /**
     * Send a text message back to a SimpleX contact.
     *
     * Called by the auto-reply system when the agent produces a response.
     * The `target` field contains the contact identifier (display name).
     */
    sendText: async ({
      text,
      target,
      sessionKey,
    }: {
      text: string;
      target?: string;
      sessionKey?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      const log = getLogger();
      const cli = getCli();

      if (!cli || !cli.connected) {
        log.error("[simplex] Cannot send — not connected to SimpleX CLI");
        return { ok: false, error: "SimpleX CLI not connected" };
      }

      // Extract contact name from target or sessionKey
      // sessionKey format: agent:main:simplex:dm:<contactName>
      let contact = target;
      if (!contact && sessionKey) {
        const parts = sessionKey.split(":");
        contact = parts[parts.length - 1];
      }

      if (!contact) {
        log.error("[simplex] Cannot send — no target contact");
        return { ok: false, error: "No target contact" };
      }

      try {
        // Chunk long messages (SimpleX has ~15KB message limit)
        const chunks = chunkMessage(text, 4000);
        for (const chunk of chunks) {
          await cli.sendMessage(contact, chunk);
        }
        return { ok: true };
      } catch (err: any) {
        log.error(`[simplex] Send failed: ${err.message}`);
        return { ok: false, error: err.message };
      }
    },
  },
};

/**
 * Split long messages into chunks at line boundaries.
 */
function chunkMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (newline, then space)
    let breakAt = remaining.lastIndexOf("\n", maxLen);
    if (breakAt < maxLen * 0.5) {
      breakAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (breakAt < maxLen * 0.3) {
      breakAt = maxLen;
    }

    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }

  return chunks;
}
