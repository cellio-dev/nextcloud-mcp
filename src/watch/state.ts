import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { WatchState } from "./types.js";

export async function loadWatchState(statePath: string): Promise<WatchState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as WatchState;
    if (!parsed || parsed.version !== 1 || typeof parsed.cards !== "object") {
      return { version: 1, cards: {} };
    }
    return parsed;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") {
      return { version: 1, cards: {} };
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
