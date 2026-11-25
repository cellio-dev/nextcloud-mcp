import type { AppConfig } from "../config.js";
import { NextcloudClient } from "../nextcloud/client.js";
import * as deck from "../nextcloud/deck.js";
import { formatDeckUserMention } from "../nextcloud/mentions.js";
import { loadWatchState, saveWatchState } from "./state.js";
import type {
  WatchCardStatus,
  WatchSnapshot,
  WatchedCard,
  WatchedComment,
  WatchState,
} from "./types.js";

type DeckUser = { uid?: string; primaryKey?: string };
type DeckAssignment = { participant?: DeckUser };
type DeckCard = {
  id?: number;
  title?: string;
  description?: string | null;
  stackId?: number;
  assignedUsers?: DeckAssignment[] | null;
  archived?: boolean;
  deletedAt?: number;
  lastModified?: number;
  commentsUnread?: number;
};
type DeckStack = {
  id?: number;
  title?: string;
  cards?: DeckCard[] | null;
};
type DeckBoard = { id?: number; title?: string };
type DeckComment = {
  id?: number;
  message?: string;
  actorId?: string;
  creationDateTime?: string;
};

const AGENT_REPLY_PREFIX =
  /^@(?:cursor-ack|cursor-done|cursor-update|cursor-blocked)\b/i;

/** Automation sometimes posts these as an extra comment before the real answer. */
const AGENT_STATUS_COMMENT =
  /(?:seen your comment|i(?:'|’)ll work|working on it|queued|claimed\.?\s*working)/i;

function nowIso(): string {
  return new Date().toISOString();
}

function asCards(value: unknown): DeckCard[] {
  return Array.isArray(value) ? (value as DeckCard[]) : [];
}

function asStacks(value: unknown): DeckStack[] {
  return Array.isArray(value) ? (value as DeckStack[]) : [];
}

function asBoards(value: unknown): DeckBoard[] {
  return Array.isArray(value) ? (value as DeckBoard[]) : [];
}

function asComments(value: unknown): DeckComment[] {
  return Array.isArray(value) ? (value as DeckComment[]) : [];
}

function cardAssignedTo(card: DeckCard, userId: string): boolean {
  const assignments = Array.isArray(card.assignedUsers) ? card.assignedUsers : [];
  return assignments.some((a) => {
    const uid = a.participant?.uid ?? a.participant?.primaryKey;
    return uid === userId;
  });
}

function mentionRegex(mention: string): RegExp {
  const token = mention.trim() || "@cursor";
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export class DeckWatcher {
  private readonly config: AppConfig;
  private readonly client: NextcloudClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pollInFlight = false;
  private state: WatchState = {
    version: 2,
    cards: {},
    comments: {},
    processedCommentIds: {},
    cardLastModified: {},
  };
  private lastPollAt: string | null = null;
  private lastPollError: string | null = null;

  constructor(config: AppConfig, client?: NextcloudClient) {
    this.config = config;
    this.client = client ?? new NextcloudClient(config);
  }

  get enabled(): boolean {
    return this.config.deckWatch.enabled;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.state = await loadWatchState(this.config.deckWatch.statePath);
    this.running = true;
    console.log(
      `[deck-watch] enabled; agent=${this.config.deckWatch.agentUser} owner=${this.config.deckWatch.ownerUser} comments=${this.config.deckWatch.commentTrigger} mention=${this.config.deckWatch.commentMention} interval=${this.config.deckWatch.intervalSec}s`
    );
    await this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.config.deckWatch.intervalSec * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  snapshot(): WatchSnapshot {
    const cards = Object.values(this.state.cards).sort((a, b) =>
      a.firstSeenAt.localeCompare(b.firstSeenAt)
    );
    const comments = Object.values(this.state.comments).sort((a, b) =>
      a.firstSeenAt.localeCompare(b.firstSeenAt)
    );
    const w = this.config.deckWatch;
    return {
      enabled: this.enabled,
      agentUser: w.agentUser,
      ownerUser: w.ownerUser,
      ownerMention: formatDeckUserMention(w.ownerUser),
      intervalSec: w.intervalSec,
      autoAck: w.autoAck,
      assignmentTrigger: w.assignmentTrigger,
      commentTrigger: w.commentTrigger,
      commentMention: w.commentMention,
      silentClaim: w.silentClaim,
      postDoneComment: w.postDoneComment,
      completeUnassignAgent: w.completeUnassignAgent,
      completeAssignOwner: w.completeAssignOwner,
      autoMentionReply: w.autoMentionReply,
      oneReplyPerJob: w.oneReplyPerJob,
      requireReplyBeforeComplete: w.requireReplyBeforeComplete,
      lastPollAt: this.lastPollAt,
      lastPollError: this.lastPollError,
      pendingCount: cards.filter((c) => c.status === "pending").length,
      claimedCount: cards.filter((c) => c.status === "claimed").length,
      pendingCommentCount: comments.filter((c) => c.status === "pending").length,
      cards,
      comments,
    };
  }

  pending(status: WatchCardStatus | "open" = "pending"): WatchedCard[] {
    const cards = Object.values(this.state.cards);
    if (status === "open") {
      return cards.filter((c) => c.status === "pending" || c.status === "claimed");
    }
    return cards.filter((c) => c.status === status);
  }

  pendingComments(
    status: WatchCardStatus | "open" = "pending"
  ): WatchedComment[] {
    const comments = Object.values(this.state.comments);
    if (status === "open") {
      return comments.filter(
        (c) => c.status === "pending" || c.status === "claimed"
      );
    }
    return comments.filter((c) => c.status === status);
  }

  async pollOnce(): Promise<WatchSnapshot> {
    if (!this.enabled) {
      return this.snapshot();
    }
    if (this.pollInFlight) {
      return this.snapshot();
    }
    this.pollInFlight = true;
    try {
      await this.scanBoards();
      this.lastPollAt = nowIso();
      this.lastPollError = null;
      await saveWatchState(this.config.deckWatch.statePath, this.state);
    } catch (error) {
      this.lastPollError =
        error instanceof Error ? error.message : String(error);
      console.error("[deck-watch] poll failed:", this.lastPollError);
    } finally {
      this.pollInFlight = false;
    }
    return this.snapshot();
  }

  private async scanBoards(): Promise<void> {
    const watch = this.config.deckWatch;
    const boards = asBoards(await deck.listBoards(this.client, false));
    const selected =
      watch.boardIds.length > 0
        ? boards.filter(
            (b) => typeof b.id === "number" && watch.boardIds.includes(b.id)
          )
        : boards;

    const assignedSeen = new Set<string>();
    const mention = mentionRegex(watch.commentMention);

    for (const board of selected) {
      if (typeof board.id !== "number") continue;
      const stacks = asStacks(await deck.listStacks(this.client, board.id));
      for (const stack of stacks) {
        if (typeof stack.id !== "number") continue;
        for (const card of asCards(stack.cards)) {
          if (typeof card.id !== "number") continue;
          if (card.archived || (card.deletedAt ?? 0) > 0) continue;

          const assigned = cardAssignedTo(card, watch.agentUser);
          if (assigned && watch.assignmentTrigger) {
            assignedSeen.add(String(card.id));
            await this.upsertAssignedCard(board.id, stack, card);
          }

          if (watch.commentTrigger) {
            await this.maybeScanCardComments(
              board.id,
              stack,
              card,
              mention,
              assigned
            );
          }
        }
      }
    }

    // Drop assignment-triggered open cards no longer assigned (keep comment-triggered).
    for (const [key, card] of Object.entries(this.state.cards)) {
      if (card.status === "completed") continue;
      if (card.trigger === "comment") continue;
      if (assignedSeen.has(key)) continue;
      // Keep if there is still an open comment request on this card.
      const openComment = Object.values(this.state.comments).some(
        (c) =>
          c.cardId === card.cardId &&
          (c.status === "pending" || c.status === "claimed")
      );
      if (!openComment) {
        delete this.state.cards[key];
      }
    }

    this.pruneCompleted();
  }

  private async upsertAssignedCard(
    boardId: number,
    stack: DeckStack,
    card: DeckCard
  ): Promise<void> {
    const watch = this.config.deckWatch;
    if (typeof card.id !== "number" || typeof stack.id !== "number") return;
    const key = String(card.id);
    const existing = this.state.cards[key];
    if (!existing) {
      const created: WatchedCard = {
        cardId: card.id,
        boardId,
        stackId: stack.id,
        stackTitle: stack.title ?? "",
        title: card.title ?? `Card ${card.id}`,
        description: card.description ?? "",
        status: "pending",
        trigger: "assignment",
        firstSeenAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.state.cards[key] = created;
      console.log(
        `[deck-watch] assignment card=${card.id} "${created.title}" board=${boardId}`
      );
      if (watch.autoAck) {
        await this.safeAck(
          created,
          `@cursor-ack: queued (assigned to ${watch.agentUser}). Comment with ${watch.commentMention} to send instructions.`
        );
      }
      await this.maybeSendCardWebhook(created);
      return;
    }

    existing.boardId = boardId;
    existing.stackId = stack.id;
    existing.stackTitle = stack.title ?? existing.stackTitle;
    existing.title = card.title ?? existing.title;
    existing.description = card.description ?? existing.description;
    existing.updatedAt = nowIso();
    if (existing.status === "completed") {
      existing.status = "pending";
      existing.trigger = "assignment";
      existing.completedAt = undefined;
      existing.claimedAt = undefined;
      existing.webhookSentAt = undefined;
      existing.lastError = undefined;
      await this.maybeSendCardWebhook(existing);
    } else if (watch.autoAck && existing.status === "pending" && existing.lastError) {
      await this.safeAck(
        existing,
        `@cursor-ack: queued (assigned to ${watch.agentUser}).`
      );
    }
  }

  private async maybeScanCardComments(
    boardId: number,
    stack: DeckStack,
    card: DeckCard,
    mention: RegExp,
    assigned: boolean
  ): Promise<void> {
    if (typeof card.id !== "number" || typeof stack.id !== "number") return;
    const key = String(card.id);
    const lastModified = Number(card.lastModified ?? 0);
    const prev = this.state.cardLastModified[key] ?? 0;
    const hasOpenComment = Object.values(this.state.comments).some(
      (c) =>
        c.cardId === card.id &&
        (c.status === "pending" || c.status === "claimed")
    );
    const shouldScan =
      assigned ||
      hasOpenComment ||
      (card.commentsUnread ?? 0) > 0 ||
      lastModified > prev ||
      prev === 0;

    if (!shouldScan) return;

    let comments: DeckComment[] = [];
    try {
      comments = asComments(await deck.listComments(this.client, card.id, 30, 0));
    } catch (error) {
      console.error(
        `[deck-watch] list comments failed card=${card.id}:`,
        error instanceof Error ? error.message : error
      );
      return;
    }

    this.state.cardLastModified[key] = Math.max(lastModified, prev);

    for (const comment of comments) {
      if (typeof comment.id !== "number" || !comment.message) continue;
      const commentKey = String(comment.id);
      if (this.state.processedCommentIds[commentKey]) continue;
      if (this.state.comments[commentKey]) continue;

      const author = comment.actorId ?? "";
      if (author === this.config.deckWatch.agentUser) {
        this.state.processedCommentIds[commentKey] = true;
        continue;
      }
      if (AGENT_REPLY_PREFIX.test(comment.message.trim())) {
        this.state.processedCommentIds[commentKey] = true;
        continue;
      }
      if (!mention.test(comment.message)) {
        continue;
      }

      // New @cursor on this card supersedes any stuck pending/claimed jobs.
      for (const c of Object.values(this.state.comments)) {
        if (
          c.cardId === card.id &&
          (c.status === "pending" || c.status === "claimed")
        ) {
          c.status = "completed";
          c.completedAt = nowIso();
          c.updatedAt = nowIso();
        }
      }

      const watched: WatchedComment = {
        commentId: comment.id,
        cardId: card.id,
        boardId,
        stackId: stack.id,
        stackTitle: stack.title ?? "",
        cardTitle: card.title ?? `Card ${card.id}`,
        message: comment.message,
        author,
        createdAt: comment.creationDateTime ?? nowIso(),
        status: "pending",
        firstSeenAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.state.comments[commentKey] = watched;
      console.log(
        `[deck-watch] comment trigger comment=${comment.id} card=${card.id} author=${author}`
      );

      // Ensure a card queue entry exists for claim/complete tools.
      if (!this.state.cards[key]) {
        this.state.cards[key] = {
          cardId: card.id,
          boardId,
          stackId: stack.id,
          stackTitle: stack.title ?? "",
          title: card.title ?? `Card ${card.id}`,
          description: card.description ?? "",
          status: "pending",
          trigger: "comment",
          firstSeenAt: nowIso(),
          updatedAt: nowIso(),
        };
      } else if (this.state.cards[key]!.status === "completed") {
        this.state.cards[key]!.status = "pending";
        this.state.cards[key]!.completedAt = undefined;
        this.state.cards[key]!.claimedAt = undefined;
        this.state.cards[key]!.updatedAt = nowIso();
      }
      const queuedCard = this.state.cards[key];
      if (queuedCard) {
        queuedCard.status = "pending";
        queuedCard.agentRepliedAt = undefined;
        queuedCard.updatedAt = nowIso();
      }
      watched.agentRepliedAt = undefined;

      if (this.config.deckWatch.autoAck) {
        try {
          await deck.createComment(
            this.client,
            card.id,
            `@cursor-ack: seen your comment (${comment.id}). I'll work this and reply here.`
          );
        } catch (error) {
          watched.lastError =
            error instanceof Error ? error.message : String(error);
        }
      }

      await this.maybeSendCommentWebhook(watched);
      this.state.processedCommentIds[commentKey] = true;
    }
  }

  private async safeAck(card: WatchedCard, message: string): Promise<void> {
    try {
      await deck.createComment(this.client, card.cardId, message);
      card.lastError = undefined;
    } catch (error) {
      card.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private pruneCompleted(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, card] of Object.entries(this.state.cards)) {
      if (card.status !== "completed" || !card.completedAt) continue;
      if (Date.parse(card.completedAt) < cutoff) delete this.state.cards[key];
    }
    for (const [key, comment] of Object.entries(this.state.comments)) {
      if (comment.status !== "completed" || !comment.completedAt) continue;
      if (Date.parse(comment.completedAt) < cutoff) {
        delete this.state.comments[key];
      }
    }
  }

  private async postWebhook(body: unknown): Promise<void> {
    const { webhookUrl, webhookToken } = this.config.deckWatch;
    if (!webhookUrl) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "nextcloud-mcp-deck-watch/1.1",
    };
    if (webhookToken) {
      headers.Authorization = `Bearer ${webhookToken}`;
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Webhook failed (${response.status}): ${text.slice(0, 500)}`
      );
    }
  }

  private async maybeSendCardWebhook(card: WatchedCard): Promise<void> {
    if (!this.config.deckWatch.webhookUrl || card.webhookSentAt) return;
    const { agentUser, ownerUser, commentMention } = this.config.deckWatch;
    await this.postWebhook({
      context: [
        "Nextcloud Deck: card assigned to the agent.",
        `cardId=${card.cardId} boardId=${card.boardId} stackId=${card.stackId}`,
        `title=${card.title}`,
        `agentUser=${agentUser} ownerUser=${ownerUser}`,
        `Use nextcloud MCP: deck_watch_pending → deck_watch_claim (silent) → one deck_add_comment → deck_watch_complete.`,
        `Do not move the card unless the user asked. Prefer a single user-facing reply comment.`,
        card.description ? `description:\n${card.description}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      source: "nextcloud-mcp-deck-watch",
      kind: "assignment",
      card,
    });
    card.webhookSentAt = nowIso();
    card.updatedAt = nowIso();
    console.log(`[deck-watch] assignment webhook card=${card.cardId}`);
  }

  private async maybeSendCommentWebhook(
    comment: WatchedComment
  ): Promise<void> {
    if (!this.config.deckWatch.webhookUrl || comment.webhookSentAt) return;
    const { agentUser, ownerUser } = this.config.deckWatch;
    await this.postWebhook({
      context: [
        "Nextcloud Deck: new card comment requesting agent action.",
        `Reply on the same card with deck_add_comment. Do not move unless asked.`,
        `cardId=${comment.cardId} boardId=${comment.boardId} stackId=${comment.stackId} commentId=${comment.commentId}`,
        `cardTitle=${comment.cardTitle}`,
        `author=${comment.author}`,
        `authorMention=${formatDeckUserMention(comment.author)}`,
        `ownerMention=${formatDeckUserMention(ownerUser)}`,
        `agentUser=${agentUser} ownerUser=${ownerUser}`,
        "Steps: deck_watch_claim (no message) → do the requested card/file changes → exactly ONE deck_add_comment confirming what you did (required even for description-only tasks) → deck_watch_complete.",
        `User comment:\n${comment.message}`,
      ].join("\n"),
      source: "nextcloud-mcp-deck-watch",
      kind: "comment",
      comment,
    });
    comment.webhookSentAt = nowIso();
    comment.updatedAt = nowIso();
    console.log(
      `[deck-watch] comment webhook comment=${comment.commentId} card=${comment.cardId}`
    );
  }

  async claim(
    cardId: number,
    message?: string,
    options: { targetStackId?: number } = {}
  ): Promise<{ card: WatchedCard; movedToStackId?: number }> {
    const card = this.requireCard(cardId);
    const movedToStackId = await this.maybeMoveCard(card, options.targetStackId);
    const watch = this.config.deckWatch;
    const text = message?.trim();
    if (text) {
      await deck.createComment(this.client, card.cardId, text);
    } else if (!watch.silentClaim) {
      await deck.createComment(
        this.client,
        card.cardId,
        `@cursor-ack: claimed. Working now as ${watch.agentUser}.`
      );
    }

    card.status = "claimed";
    card.claimedAt = nowIso();
    card.updatedAt = nowIso();
    for (const comment of Object.values(this.state.comments)) {
      if (
        comment.cardId === cardId &&
        (comment.status === "pending" || comment.status === "claimed")
      ) {
        comment.status = "claimed";
        comment.claimedAt = nowIso();
        comment.updatedAt = nowIso();
      }
    }
    await saveWatchState(this.config.deckWatch.statePath, this.state);
    return { card, movedToStackId };
  }

  async complete(
    cardId: number,
    summary = "",
    options: { assignOwner?: boolean; targetStackId?: number } = {}
  ): Promise<{
    card: WatchedCard;
    assignedTo?: string;
    movedToStackId?: number;
  }> {
    const card = this.requireCard(cardId);
    const watch = this.config.deckWatch;
    // Env must allow assign-back; automation cannot override when env is false.
    const assignOwner =
      watch.completeAssignOwner && (options.assignOwner ?? true);
    const movedToStackId = await this.maybeMoveCard(card, options.targetStackId);

    const doneText = summary.trim();
    if (watch.requireReplyBeforeComplete) {
      const cardReplied = Boolean(card.agentRepliedAt);
      const commentReplied = Object.values(this.state.comments).some(
        (c) =>
          c.cardId === cardId &&
          (c.status === "pending" || c.status === "claimed") &&
          Boolean(c.agentRepliedAt)
      );
      const doneViaSummary = watch.postDoneComment && doneText.length > 0;
      if (!cardReplied && !commentReplied && !doneViaSummary) {
        throw new Error(
          `Card ${cardId}: post deck_add_comment with the result for the user before deck_watch_complete. That comment is their notification; complete alone is silent.`
        );
      }
    }
    if (watch.postDoneComment && doneText) {
      await deck.createComment(
        this.client,
        card.cardId,
        doneText.startsWith("@cursor-done:")
          ? doneText
          : `@cursor-done: ${doneText}`
      );
    }

    if (watch.completeUnassignAgent) {
      try {
        await deck.unassignUser(
          this.client,
          card.boardId,
          card.stackId,
          card.cardId,
          watch.agentUser
        );
      } catch (error) {
        card.lastError =
          error instanceof Error ? error.message : String(error);
      }
    }

    let assignedTo: string | undefined;
    if (assignOwner && watch.ownerUser) {
      try {
        await deck.assignUser(
          this.client,
          card.boardId,
          card.stackId,
          card.cardId,
          watch.ownerUser
        );
        assignedTo = watch.ownerUser;
      } catch (error) {
        card.lastError =
          error instanceof Error ? error.message : String(error);
      }
    }

    card.status = "completed";
    card.completedAt = nowIso();
    card.updatedAt = nowIso();
    for (const comment of Object.values(this.state.comments)) {
      if (
        comment.cardId === cardId &&
        (comment.status === "pending" || comment.status === "claimed")
      ) {
        comment.status = "completed";
        comment.completedAt = nowIso();
        comment.updatedAt = nowIso();
      }
    }
    await saveWatchState(this.config.deckWatch.statePath, this.state);
    return { card, assignedTo, movedToStackId };
  }

  private async maybeMoveCard(
    card: WatchedCard,
    targetStackId?: number
  ): Promise<number | undefined> {
    if (!targetStackId || targetStackId === card.stackId) {
      return undefined;
    }
    const stacks = asStacks(await deck.listStacks(this.client, card.boardId));
    const target = stacks.find((s) => s.id === targetStackId);
    if (!target || typeof target.id !== "number") {
      throw new Error(
        `Stack ${targetStackId} was not found on board ${card.boardId}.`
      );
    }
    await deck.reorderCard(
      this.client,
      card.boardId,
      card.stackId,
      card.cardId,
      0,
      target.id
    );
    card.stackId = target.id;
    card.stackTitle = target.title ?? card.stackTitle;
    card.updatedAt = nowIso();
    return target.id;
  }

  /** User to @-mention on the agent's reply for this card (comment author or owner). */
  notifyUserIdForCard(cardId: number): string | undefined {
    const w = this.config.deckWatch;
    const openComments = Object.values(this.state.comments)
      .filter(
        (c) =>
          c.cardId === cardId &&
          (c.status === "pending" || c.status === "claimed")
      )
      .sort((a, b) => b.commentId - a.commentId);
    const top = openComments[0];
    if (top?.author) {
      return top.author;
    }
    const card = this.state.cards[String(cardId)];
    if (card && (card.status === "pending" || card.status === "claimed")) {
      return w.ownerUser;
    }
    return undefined;
  }

  validateAgentComment(cardId: number, message: string): void {
    const w = this.config.deckWatch;
    const text = message.trim();
    if (AGENT_REPLY_PREFIX.test(text) || AGENT_STATUS_COMMENT.test(text)) {
      throw new Error(
        "Do not post watcher-style ack/status comments. Send one deck_add_comment with only the answer, then deck_watch_complete."
      );
    }
    if (!w.oneReplyPerJob) return;
    const open = Object.values(this.state.comments).filter(
      (c) =>
        c.cardId === cardId &&
        (c.status === "pending" || c.status === "claimed")
    );
    if (open.length === 0) return;
    const waiting = open.filter((c) => !c.agentRepliedAt);
    if (waiting.length === 0) {
      throw new Error(
        `Card ${cardId}: open jobs already have a reply. Call deck_watch_complete, or post a new @cursor comment on the card.`
      );
    }
  }

  /** Clear stuck queue rows for a card (e.g. after a failed automation run). */
  async resetCard(cardId: number): Promise<{ cleared: boolean }> {
    const key = String(cardId);
    let cleared = false;
    if (this.state.cards[key]) {
      delete this.state.cards[key];
      cleared = true;
    }
    for (const [commentKey, comment] of Object.entries(this.state.comments)) {
      if (comment.cardId === cardId) {
        delete this.state.comments[commentKey];
        cleared = true;
      }
    }
    if (cleared) {
      await saveWatchState(this.config.deckWatch.statePath, this.state);
    }
    return { cleared };
  }

  async recordAgentReply(cardId: number): Promise<void> {
    const at = nowIso();
    const cardKey = String(cardId);
    const card = this.state.cards[cardKey];
    if (card) {
      card.agentRepliedAt = at;
      card.updatedAt = at;
    }
    for (const comment of Object.values(this.state.comments)) {
      if (
        comment.cardId === cardId &&
        (comment.status === "pending" || comment.status === "claimed")
      ) {
        comment.agentRepliedAt = at;
        comment.updatedAt = at;
      }
    }
    await saveWatchState(this.config.deckWatch.statePath, this.state);
  }

  private requireCard(cardId: number): WatchedCard {
    const card = this.state.cards[String(cardId)];
    if (!card) {
      throw new Error(
        `Card ${cardId} is not in the watcher queue. Assign it to ${this.config.deckWatch.agentUser} or comment with ${this.config.deckWatch.commentMention}, then call deck_watch_poll.`
      );
    }
    return card;
  }
}

let sharedWatcher: DeckWatcher | null = null;

export function setSharedWatcher(watcher: DeckWatcher | null): void {
  sharedWatcher = watcher;
}

export function getSharedWatcher(): DeckWatcher | null {
  return sharedWatcher;
}
