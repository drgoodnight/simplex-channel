/**
 * SimpleX CLI WebSocket client.
 *
 * Connects to a simplex-chat instance running in WebSocket server mode
 * (`simplex-chat -p 5225`) and provides a typed command/event interface.
 */

import WebSocket from "ws";
import { getLogger } from "./runtime.js";
import type { SimplexCommand, SimplexEvent } from "./types.js";

type EventHandler = (event: SimplexEvent) => void | Promise<void>;

export class SimplexCli {
  private ws: WebSocket | null = null;
  private url: string;
  private corrCounter = 0;
  private pending = new Map<string, (resp: SimplexEvent) => void>();
  private handlers: EventHandler[] = [];
  private running = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** True when the WebSocket connection is open. */
  connected = false;

  constructor(url: string) {
    this.url = url;
  }

  /* ---------------------------------------------------------------- */
  /*  Connection lifecycle                                            */
  /* ---------------------------------------------------------------- */

  async connect(): Promise<void> {
    const log = getLogger();
    log.info(`[simplex] Connecting to ${this.url}`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.connected = true;
        log.info("[simplex] Connected to SimpleX CLI");
        resolve();
      });

      this.ws.on("message", (raw: Buffer) => {
        try {
          const data = JSON.parse(raw.toString());
          const resp: SimplexEvent = data.resp ?? data;

          // Resolve pending command if correlated
          if (resp.corrId && this.pending.has(resp.corrId)) {
            const cb = this.pending.get(resp.corrId)!;
            this.pending.delete(resp.corrId);
            cb(resp);
          }

          // Fan-out to event listeners
          for (const handler of this.handlers) {
            Promise.resolve(handler(resp)).catch((err) =>
              log.error(`[simplex] Event handler error: ${err.message}`)
            );
          }
        } catch {
          // Ignore unparseable frames
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        log.info("[simplex] WebSocket closed");
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        this.connected = false;
        log.error(`[simplex] WebSocket error: ${err.message}`);
        if (!this.connected) reject(err);
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    const log = getLogger();
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      log.info("[simplex] Reconnecting...");
      try {
        await this.connect();
      } catch {
        // connect() will schedule another attempt via on("error")
      }
    }, 5_000);
  }

  /* ---------------------------------------------------------------- */
  /*  Commands                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Send a CLI command and wait for the correlated response.
   */
  async sendCommand(cmd: string, timeoutMs = 30_000): Promise<SimplexEvent> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("SimpleX CLI not connected");
    }

    const corrId = `oc_${++this.corrCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(corrId);
        reject(new Error(`Command timed out: ${cmd.slice(0, 80)}`));
      }, timeoutMs);

      this.pending.set(corrId, (resp) => {
        clearTimeout(timer);
        resolve(resp);
      });

      const payload: SimplexCommand = { corrId, cmd };
      this.ws!.send(JSON.stringify(payload));
    });
  }

  /**
   * Send a text message to a SimpleX contact.
   * Single-quotes around the name handle display names with spaces.
   */
  async sendMessage(contact: string, text: string): Promise<SimplexEvent> {
    return this.sendCommand(`@'${contact}' ${text}`);
  }

  /**
   * Accept a contact request by display name.
   */
  async acceptContact(displayName: string): Promise<SimplexEvent> {
    return this.sendCommand(`/accept ${displayName}`);
  }

  /**
   * Get or create the bot's SimpleX address (invitation link).
   */
  async getAddress(): Promise<string | null> {
    const resp = await this.sendCommand("/address");
    if (resp.type === "userContactLink") {
      return resp.contactLink?.connLinkContact?.connFullLink || null;
    }
    const createResp = await this.sendCommand("/address create");
    return createResp.connLinkContact?.connFullLink || null;
  }

  /* ---------------------------------------------------------------- */
  /*  Event subscriptions                                             */
  /* ---------------------------------------------------------------- */

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /* ---------------------------------------------------------------- */
  /*  Teardown                                                        */
  /* ---------------------------------------------------------------- */

  disconnect(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
