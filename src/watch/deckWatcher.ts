import type { AppConfig } from "../config.js";
import { NextcloudClient } from "../nextcloud/client.js";
import * as deck from "../nextcloud/deck.js";
import { loadWatchState, saveWatchState } from "./state.js";
import type { WatchCardStatus, WatchSnapshot, WatchedCard, WatchState } from "./types.js";

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
};
type DeckStack = {
  id?: number;
  title?: string;
  cards?: DeckCard[] | null;
};
type DeckBoard = { id?: number; title?: string };

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

function cardAssignedTo(card: DeckCard, userId: string): boolean {
  const assignments = Array.isArray(card.assignedUsers) ? card.assignedUsers : [];
  return assignments.some((a) => {
    const uid = a.participant?.uid ?? a.participant?.primaryKey;
    return uid === userId;
  });
}

export class DeckWatcher {
  private readonly config: AppConfig;
  private readonly client: NextcloudClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pollInFlight = false;
  private state: WatchState = { version: 1, cards: {} };
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
      `[deck-watch] enabled; agent=${this.config.deckWatch.agentUser} owner=${this.config.deckWatch.ownerUser} interval=${this.config.deckWatch.intervalSec}s`
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
    return {
      enabled: this.enabled,
      agentUser: this.config.deckWatch.agentUser,
      ownerUser: this.config.deckWatch.ownerUser,
      intervalSec: this.config.deckWatch.intervalSec,
      lastPollAt: this.lastPollAt,
      lastPollError: this.lastPollError,
      pendingCount: cards.filter((c) => c.status === "pending").length,
      claimedCount: cards.filter((c) => c.status === "claimed").length,
      cards,
    };
  }

  pending(status: WatchCardStatus | "open" = "pending"): WatchedCard[] {
    const cards = Object.values(this.state.cards);
    if (status === "open") {
      return cards.filter((c) => c.status === "pending" || c.status === "claimed");
    }
    return cards.filter((c) => c.status === status);
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
      await this.scanAssignedCards();
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

  private async scanAssignedCards(): Promise<void> {
    const watch = this.config.deckWatch;
    const boards = asBoards(await deck.listBoards(this.client, false));
    const selected =
      watch.boardIds.length > 0
        ? boards.filter((b) => typeof b.id === "number" && watch.boardIds.includes(b.id))
        : boards;

    const seenIds = new Set<string>();

    for (const board of selected) {
      if (typeof board.id !== "number") continue;
      const stacks = asStacks(await deck.listStacks(this.client, board.id));
      for (const stack of stacks) {
        if (typeof stack.id !== "number") continue;
        for (const card of asCards(stack.cards)) {
          if (typeof card.id !== "number") continue;
          if (card.archived || (card.deletedAt ?? 0) > 0) continue;
          if (!cardAssignedTo(card, watch.agentUser)) continue;

          const key = String(card.id);
          seenIds.add(key);
          const existing = this.state.cards[key];
          if (!existing) {
            const created: WatchedCard = {
              cardId: card.id,
              boardId: board.id,
              stackId: stack.id,
              stackTitle: stack.title ?? "",
              title: card.title ?? `Card ${card.id}`,
              description: card.description ?? "",
              status: "pending",
              firstSeenAt: nowIso(),
              updatedAt: nowIso(),
            };
            this.state.cards[key] = created;
            console.log(
              `[deck-watch] new assignment card=${card.id} "${created.title}" board=${board.id}`
            );
            if (watch.autoAck) {
              try {
                await deck.createComment(
                  this.client,
                  card.id,
                  `@cursor-ack: queued by nextcloud-mcp watcher (assigned to ${watch.agentUser}).`
                );
              } catch (error) {
                created.lastError =
                  error instanceof Error ? error.message : String(error);
              }
            }
            await this.maybeSendWebhook(created);
          } else {
            existing.boardId = board.id;
            existing.stackId = stack.id;
            existing.stackTitle = stack.title ?? existing.stackTitle;
            existing.title = card.title ?? existing.title;
            existing.description = card.description ?? existing.description;
            existing.updatedAt = nowIso();
            if (existing.status === "completed") {
              // Re-opened by assigning agent again.
              existing.status = "pending";
              existing.completedAt = undefined;
              existing.claimedAt = undefined;
              existing.webhookSentAt = undefined;
              await this.maybeSendWebhook(existing);
            }
          }
        }
      }
    }

    // Drop open cards no longer assigned to the agent (unless completed — keep briefly).
    for (const [key, card] of Object.entries(this.state.cards)) {
      if (seenIds.has(key)) continue;
      if (card.status === "completed") continue;
      delete this.state.cards[key];
    }

    // Prune old completed entries (>7 days).
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, card] of Object.entries(this.state.cards)) {
      if (card.status !== "completed" || !card.completedAt) continue;
      if (Date.parse(card.completedAt) < cutoff) {
        delete this.state.cards[key];
      }
    }
  }

  private async maybeSendWebhook(card: WatchedCard): Promise<void> {
    const { webhookUrl, webhookToken, agentUser, ownerUser } =
      this.config.deckWatch;
    if (!webhookUrl || card.webhookSentAt) return;

    const body = {
      context: [
        "Nextcloud Deck watcher found a card assigned to the agent.",
        `Use the nextcloud MCP tools to claim and complete it.`,
        `cardId=${card.cardId} boardId=${card.boardId} stackId=${card.stackId}`,
        `title=${card.title}`,
        `agentUser=${agentUser} ownerUser=${ownerUser}`,
        "Steps: deck_watch_pending → deck_watch_claim → do the work → deck_watch_complete (assigns back to owner). Do not move the card unless the user asked.",
        card.description ? `description:\n${card.description}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      source: "nextcloud-mcp-deck-watch",
      card,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "nextcloud-mcp-deck-watch/1.0",
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
    card.webhookSentAt = nowIso();
    card.updatedAt = nowIso();
    console.log(`[deck-watch] webhook sent for card=${card.cardId}`);
  }

  async claim(
    cardId: number,
    message?: string,
    options: { targetStackId?: number } = {}
  ): Promise<{ card: WatchedCard; movedToStackId?: number }> {
    const card = this.requireCard(cardId);
    // Never auto-move. Only relocate when the caller explicitly passes targetStackId.
    const movedToStackId = await this.maybeMoveCard(card, options.targetStackId);

    await deck.createComment(
      this.client,
      card.cardId,
      message?.trim() ||
        `@cursor-ack: claimed. Working now as ${this.config.deckWatch.agentUser}.`
    );

    card.status = "claimed";
    card.claimedAt = nowIso();
    card.updatedAt = nowIso();
    await saveWatchState(this.config.deckWatch.statePath, this.state);
    return { card, movedToStackId };
  }

  async complete(
    cardId: number,
    summary: string,
    options: { assignOwner?: boolean; targetStackId?: number } = {}
  ): Promise<{ card: WatchedCard; assignedTo?: string; movedToStackId?: number }> {
    const card = this.requireCard(cardId);
    const assignOwner = options.assignOwner ?? true;
    const watch = this.config.deckWatch;

    // Stay on the current stack/board unless targetStackId is explicitly provided.
    const movedToStackId = await this.maybeMoveCard(card, options.targetStackId);

    await deck.createComment(
      this.client,
      card.cardId,
      `@cursor-done: ${summary}`
    );

    // Handoff: remove agent, assign owner.
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

  private requireCard(cardId: number): WatchedCard {
    const card = this.state.cards[String(cardId)];
    if (!card) {
      throw new Error(
        `Card ${cardId} is not in the watcher queue. Assign it to ${this.config.deckWatch.agentUser} and wait for the next poll (or call deck_watch_poll).`
      );
    }
    return card;
  }
}

/** Process-wide watcher instance for HTTP mode tools + /watch/status. */
let sharedWatcher: DeckWatcher | null = null;

export function setSharedWatcher(watcher: DeckWatcher | null): void {
  sharedWatcher = watcher;
}

export function getSharedWatcher(): DeckWatcher | null {
  return sharedWatcher;
}
