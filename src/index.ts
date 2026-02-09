/**
 * OpenClaw SimpleX Chat Channel Plugin.
 *
 * Entry point — called by the Gateway at startup.
 * Registers the SimpleX channel and starts the WebSocket monitor.
 *
 * Installation:
 *   1. Copy this directory to ~/.openclaw/extensions/simplex/
 *   2. Run: npm install (in the simplex directory)
 *   3. Add to openclaw.json:
 *        {
 *          "channels": {
 *            "simplex": {
 *              "wsUrl": "ws://localhost:5225",
 *              "autoAccept": true,
 *              "whisper": { "enabled": false }
 *            }
 *          }
 *        }
 *   4. Restart: openclaw gateway restart
 *
 * Prerequisites:
 *   - simplex-chat CLI running in WebSocket server mode:
 *       simplex-chat -p 5225
 *     Or via the included Docker container (see docker/)
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
  const rawConfig = api.config?.channels?.simplex || {};
  const config: SimplexPluginConfig = {
    wsUrl: rawConfig.wsUrl || "ws://localhost:5225",
    displayName: rawConfig.displayName || "openclaw",
    autoAccept: rawConfig.autoAccept !== false,
    whisper: {
      enabled: rawConfig.whisper?.enabled === true,
      apiUrl: rawConfig.whisper?.apiUrl || "http://localhost:9000/transcribe",
    },
  };

  // Validate
  if (!config.wsUrl) {
    log.error("[simplex] No wsUrl configured — plugin disabled");
    return;
  }

  log.info(`[simplex] Config: ws=${config.wsUrl} autoAccept=${config.autoAccept} whisper=${config.whisper.enabled}`);

  // Start the monitor (connects to SimpleX CLI WebSocket)
  startMonitor(config).catch((err) => {
    log.error("[simplex] Monitor startup failed:", err);
  });

  // Clean shutdown
  if (api.hooks?.on) {
    api.hooks.on("gateway:shutdown", () => {
      log.info("[simplex] Shutting down monitor");
      stopMonitor();
    });
  }
}
