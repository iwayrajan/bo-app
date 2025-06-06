export interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: string;
  reactions?: Reaction[];
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