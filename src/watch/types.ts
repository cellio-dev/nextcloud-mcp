export type WatchCardStatus = "pending" | "claimed" | "completed";

export type WatchedCard = {
  cardId: number;
  boardId: number;
  stackId: number;
  stackTitle: string;
  title: string;
  description: string;
  status: WatchCardStatus;
  firstSeenAt: string;
  updatedAt: string;
  webhookSentAt?: string;
  claimedAt?: string;
  completedAt?: string;
  lastError?: string;
};

export type WatchState = {
  version: 1;
  cards: Record<string, WatchedCard>;
};

export type WatchSnapshot = {
  enabled: boolean;
  agentUser: string;
  ownerUser: string;
  intervalSec: number;
  lastPollAt: string | null;
  lastPollError: string | null;
  pendingCount: number;
  claimedCount: number;
  cards: WatchedCard[];
};
