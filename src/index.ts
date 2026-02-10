/**
 * OpenClaw SimpleX Chat Channel Plugin.
 *
 * Entry point — called by the Gateway at startup.
 * Registers the SimpleX channel and starts the WebSocket monitor.
 *
 * Installation:
 *   1. Clone into ~/.openclaw/extensions/simplex/
 *   2. Run: npm install
 *   3. Add to openclaw.json  →  plugins.entries.simplex
 *   4. Restart: openclaw gateway restart
 *
 * Prerequisites:
 *   - simplex-chat CLI running in WebSocket server mode:
 *       simplex-chat -p 5225
 *     Either bare-metal or via the included Docker container.
 */

import { setApi } from "./runtime.js";
import { simplexChannel } from "./channel.js";
import { startMonitor, stopMonitor } from "./monitor.js";
import type { SimplexPluginConfig } from "./types.js";

export default function register(api: any): void {
  setApi(api);
  const log = api.logger;
  log.info("[simplex] Loading SimpleX Chat channel plugin");

  // Register the channel with OpenClaw
  api.registerChannel({ plugin: simplexChannel });

  // Resolve plugin config with defaults
  const rawConfig =
    api.config?.channels?.simplex || api.pluginConfig || {};
  const config: SimplexPluginConfig = {
    wsUrl: rawConfig.wsUrl || "ws://localhost:5225",
    displayName: rawConfig.displayName || "openclaw",
    autoAccept: rawConfig.autoAccept !== false,
    whisper: {
      enabled: rawConfig.whisper?.enabled === true,
      apiUrl:
        rawConfig.whisper?.apiUrl || "http://localhost:9000/transcribe",
    },
  };

  if (!config.wsUrl) {
    log.error("[simplex] No wsUrl configured — plugin disabled");
    return;
  }

  log.info(
    `[simplex] Config: ws=${config.wsUrl} autoAccept=${config.autoAccept} whisper=${config.whisper.enabled}`
  );

  startMonitor(config).catch((err: any) => {
    log.error("[simplex] Monitor startup failed:", err);
  });

  if (api.on) {
    api.on("gateway:shutdown", () => {
      log.info("[simplex] Shutting down monitor");
      stopMonitor();
    });
  }
}
