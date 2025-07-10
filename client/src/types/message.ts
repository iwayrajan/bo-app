export interface Message {
  id?: string;
  user: string;
  text: string;
  timestamp: Date;
  replyTo?: {
    id: string;
    user: string;
    text: string;
  };
} 