/**
 * SimpleX Chat CLI WebSocket protocol types.
 *
 * The CLI runs as a WebSocket server (-p flag). Communication uses JSON:
 *   Client → CLI: { corrId: "id123", cmd: "..." }
 *   CLI → Client: { corrId: "id123", resp: {...} }  (command response)
 *   CLI → Client: { corrId: "",      resp: {...} }  (async event)
 */

// -- Outbound commands --------------------------------------------------------

export interface SimplexCommand {
  corrId: string;
  cmd: string;
}

// -- Inbound responses --------------------------------------------------------

export interface SimplexResponse {
  corrId: string;
  resp: SimplexEvent;
}

export interface SimplexEvent {
  type: string;
  [key: string]: any;
}

// -- Chat item structures -----------------------------------------------------

export interface SimplexChatItem {
  chatInfo?: SimplexChatInfo;
  chatItem?: SimplexChatItemContent;
  chatItems?: SimplexChatItemContent[];
}

export interface SimplexChatInfo {
  type?: string;
  contact?: SimplexContact;
  chatInfo?: {
    contact?: SimplexContact;
  };
}

export interface SimplexContact {
  contactId?: number;
  localDisplayName?: string;
  profile?: {
    displayName?: string;
    fullName?: string;
  };
}

export interface SimplexChatItemContent {
  chatItem?: {
    content?: SimplexMsgContent;
    meta?: Record<string, any>;
  };
  file?: SimplexFileInfo;
  chatInfo?: SimplexChatInfo;
}

export interface SimplexMsgContent {
  type?: string;
  text?: string;
  msgContent?: {
    type?: string;
    text?: string;
  };
}

export interface SimplexFileInfo {
  fileId?: number;
  fileName?: string;
  fileSize?: number;
  filePath?: string;
  fileStatus?: string;
}

// -- Plugin config ------------------------------------------------------------

export interface SimplexPluginConfig {
  wsUrl: string;
  displayName: string;
  autoAccept: boolean;
  whisper: {
    enabled: boolean;
    apiUrl: string;
  };
}

// -- Parsed inbound message ---------------------------------------------------

export interface InboundMessage {
  contactName: string;
  contactId?: number;
  text?: string;
  voiceFilePath?: string;
  fileInfo?: SimplexFileInfo;
  raw: SimplexEvent;
}
