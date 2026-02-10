/**
 * SimpleX Chat channel definition.
 *
 * Registered with OpenClaw via api.registerChannel().  Handles outbound
 * message delivery (agent → SimpleX contact).  Inbound is handled by
 * the monitor (monitor.ts).
 */

import { getCli } from "./monitor.js";
import { getLogger } from "./runtime.js";

export const simplexChannel = {
  id: "simplex",
  meta: {
    label: "SimpleX Chat",
    docsPath: "/channels/simplex",
    blurb:
      "Private messaging via SimpleX Chat — no user IDs, no metadata.",
    aliases: ["sx"],
  },
  capabilities: {
    chatTypes: ["direct"] as const,
  },
  config: {
    listAccountIds: async () => ["default"],
    resolveAccount: async () => ({
      id: "default",
      label: "SimpleX",
    }),
  },
  outbound: {
    deliveryMode: "direct" as const,
    sendText: async ({
      text,
      target,
      sessionKey,
    }: {
      text: string;
      target: string;
      sessionKey?: string;
    }) => {
      const log = getLogger();
      const cli = getCli();
      if (!cli?.connected) {
        log.error("[simplex] Cannot send — CLI not connected");
        return;
      }

      // Derive contact name from target or session key
      const contact =
        target || sessionKey?.split(":").pop() || "unknown";

      log.info(
        `[simplex] Outbound → ${contact}: ${text.slice(0, 80)}…`
      );
      await cli.sendMessage(contact, text);
    },
  },
};
