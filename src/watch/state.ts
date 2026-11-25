import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { WatchState, WatchedCard } from "./types.js";

function emptyState(): WatchState {
  return {
    version: 2,
    cards: {},
    comments: {},
    processedCommentIds: {},
    cardLastModified: {},
  };
}

function migrate(raw: unknown): WatchState {
  if (!raw || typeof raw !== "object") return emptyState();
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2 && typeof obj.cards === "object" && obj.cards) {
    return {
      version: 2,
      cards: obj.cards as WatchState["cards"],
      comments: (obj.comments as WatchState["comments"]) ?? {},
      processedCommentIds:
        (obj.processedCommentIds as WatchState["processedCommentIds"]) ?? {},
      cardLastModified:
        (obj.cardLastModified as WatchState["cardLastModified"]) ?? {},
    };
  }
  if (obj.version === 1 && typeof obj.cards === "object" && obj.cards) {
    const cards: Record<string, WatchedCard> = {};
    for (const [key, value] of Object.entries(
      obj.cards as Record<string, WatchedCard>
    )) {
      cards[key] = {
        ...value,
        trigger: value.trigger ?? "assignment",
      };
    }
    return {
      version: 2,
      cards,
      comments: {},
      processedCommentIds: {},
      cardLastModified: {},
    };
  }
  return emptyState();
}

export async function loadWatchState(statePath: string): Promise<WatchState> {
  try {
    const raw = await readFile(statePath, "utf8");
    return migrate(JSON.parse(raw));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") {
      return emptyState();
    }
    throw error;
  }
}

export async function saveWatchState(
  statePath: string,
  state: WatchState
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, statePath);
}
