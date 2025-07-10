export interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: string;
  reactions?: Reaction[];
  replyTo?: {
    id: string;
    user: string;
    text: string;
  };
}

export interface Reaction {
  emoji: string;
  users: string[];
}

export interface CallState {
  isCallActive: boolean;
  remoteUser: string | null;
  isIncoming: boolean;
  isOutgoing: boolean;
} 