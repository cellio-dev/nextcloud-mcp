export type WatchCardStatus = "pending" | "claimed" | "completed";

export type WatchedCard = {
  cardId: number;
  boardId: number;
  stackId: number;
  stackTitle: string;
  title: string;
  description: string;
  status: WatchCardStatus;
  trigger: "assignment" | "comment";
  firstSeenAt: string;
  updatedAt: string;
  webhookSentAt?: string;
  claimedAt?: string;
  completedAt?: string;
  lastError?: string;
};

export type WatchedComment = {
  commentId: number;
  cardId: number;
  boardId: number;
  stackId: number;
  stackTitle: string;
  cardTitle: string;
  message: string;
  author: string;
  createdAt: string;
  status: WatchCardStatus;
  firstSeenAt: string;
  updatedAt: string;
  webhookSentAt?: string;
  claimedAt?: string;
  completedAt?: string;
  lastError?: string;
};

export type WatchState = {
  version: 2;
  cards: Record<string, WatchedCard>;
  comments: Record<string, WatchedComment>;
  /** commentId -> true once handled or ignored */
  processedCommentIds: Record<string, true>;
  /** cardId -> last Deck lastModified we scanned for comments */
  cardLastModified: Record<string, number>;
};

export type WatchSnapshot = {
  enabled: boolean;
  agentUser: string;
  ownerUser: string;
  intervalSec: number;
  commentTrigger: boolean;
  commentMention: string;
  lastPollAt: string | null;
  lastPollError: string | null;
  pendingCount: number;
  claimedCount: number;
  pendingCommentCount: number;
  cards: WatchedCard[];
  comments: WatchedComment[];
};
