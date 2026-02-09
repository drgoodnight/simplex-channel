/**
 * SimpleX CLI WebSocket Client.
 *
 * Connects to simplex-chat running in WebSocket server mode (-p PORT).
 * Handles the corrId-based request/response protocol and emits async events.
 */

import WebSocket from "ws";
import type { SimplexCommand, SimplexResponse, SimplexEvent } from "./types.js";
import { getLogger } from "./runtime.js";

type EventCallback = (event: SimplexEvent) => void | Promise<void>;

export class SimplexCli {
  private ws: WebSocket | null = null;
  private url: string;
  private pending = new Map<string, (resp: SimplexEvent) => void>();
  private eventHandler: EventCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private corrCounter = 0;

  constructor(url: string) {
    this.url = url;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onEvent(handler: EventCallback): void {
    this.eventHandler = handler;
  }

  async connect(): Promise<void> {
    this.running = true;
    this._connect();
  }

  private _connect(): void {
    const log = getLogger();

    if (!this.running) return;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    log.info(`[simplex] Connecting to ${this.url}`);
    const ws = new WebSocket(this.url, { maxPayload: 10 * 1024 * 1024 });

    ws.on("open", () => {
      log.info("[simplex] Connected to SimpleX CLI");
      this.ws = ws;
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg: SimplexResponse = JSON.parse(data.toString());
        const corrId = msg.corrId || "";
        const resp = msg.resp;

        if (!resp) return;

        // Resolve pending command
        if (corrId && this.pending.has(corrId)) {
          const resolve = this.pending.get(corrId)!;
          this.pending.delete(corrId);
          resolve(resp);
          return;
        }

        // Async event — dispatch to handler
        if (this.eventHandler) {
          Promise.resolve(this.eventHandler(resp)).catch((err) => {
            log.error("[simplex] Event handler error:", err);
          });
        }
      } catch {
        // Non-JSON message or parse error — skip
      }
    });

    ws.on("close", () => {
      log.warn("[simplex] Connection closed");
      this.ws = null;
      this._scheduleReconnect();
    });

    ws.on("error", (err) => {
      log.error("[simplex] WebSocket error:", err.message);
      // 'close' will fire after this, triggering reconnect
    });
  }

  private _scheduleReconnect(): void {
    if (!this.running) return;
    if (this.reconnectTimer) return;

    const log = getLogger();
    const delay = 5000;
    log.info(`[simplex] Reconnecting in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  /**
   * Send a CLI command and wait for the correlated response.
   */
  async sendCommand(cmd: string, timeoutMs = 30000): Promise<SimplexEvent> {
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
   */
  async sendMessage(contact: string, text: string): Promise<SimplexEvent> {
    // SimpleX CLI syntax for DMs: @displayName message text
    return this.sendCommand(`@${contact} ${text}`);
  }

  /**
   * Accept a contact request by display name.
   */
  async acceptContact(displayName: string): Promise<SimplexEvent> {
    return this.sendCommand(`/accept ${displayName}`);
  }

  /**
   * Get or create the bot's SimpleX address.
   */
  async getAddress(): Promise<string | null> {
    const resp = await this.sendCommand("/address");
    if (resp.type === "userContactLink") {
      return resp.contactLink?.connLinkContact?.connFullLink || null;
    }
    // Try creating
    const createResp = await this.sendCommand("/address create");
    return createResp.connLinkContact?.connFullLink || null;
  }

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
