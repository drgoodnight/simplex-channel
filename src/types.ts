/**
 * SimpleX Chat channel plugin — shared types.
 */

export interface SimplexPluginConfig {
  wsUrl: string;
  displayName: string;
  autoAccept: boolean;
  whisper: {
    enabled: boolean;
    apiUrl: string;
  };
}

export interface SimplexCommand {
  corrId: string;
  cmd: string;
}

export interface SimplexEvent {
  corrId?: string;
  type?: string;
  [key: string]: any;
}

export interface InboundMessage {
  contactId: number | string;
  contactName: string;
  text: string;
  voiceFilePath?: string;
}
