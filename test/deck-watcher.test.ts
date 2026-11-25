import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { DeckWatcher } from "../src/watch/deckWatcher.js";

function withEnv(env: Record<string, string>, fn: () => Promise<void> | void) {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXTCLOUD_") || key.startsWith("DECK_WATCH_") || key === "MCP_AUTH_TOKEN" || key === "PORT" || key === "HOST") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, env);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    });
}

describe("deck watcher config", () => {
  it("parses watch settings", async () => {
    await withEnv(
      {
        NEXTCLOUD_URL: "https://cloud.example.com",
        NEXTCLOUD_USERNAME: "alice",
        NEXTCLOUD_APP_PASSWORD: "pass",
        MCP_AUTH_TOKEN: "token",
        DECK_WATCH_ENABLED: "true",
        DECK_WATCH_AGENT_USER: "cursor",
        DECK_WATCH_OWNER_USER: "alice",
        DECK_WATCH_BOARD_IDS: "3,7",
        DECK_WATCH_INTERVAL_SEC: "30",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.deckWatch.enabled, true);
        assert.equal(config.deckWatch.agentUser, "cursor");
        assert.equal(config.deckWatch.ownerUser, "alice");
        assert.deepEqual(config.deckWatch.boardIds, [3, 7]);
        assert.equal(config.deckWatch.intervalSec, 30);
      }
    );
  });
});

describe("deck watcher queue", () => {
  it("enqueues cards assigned to the agent and claims/completes them", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-watch-"));
    const statePath = path.join(dir, "state.json");

    await withEnv(
      {
        NEXTCLOUD_URL: "https://cloud.example.com",
        NEXTCLOUD_USERNAME: "cursor",
        NEXTCLOUD_APP_PASSWORD: "pass",
        MCP_AUTH_TOKEN: "token",
        DECK_WATCH_ENABLED: "true",
        DECK_WATCH_AGENT_USER: "cursor",
        DECK_WATCH_OWNER_USER: "alice",
        DECK_WATCH_STATE_PATH: statePath,
        DECK_WATCH_AUTO_ACK: "false",
        DECK_WATCH_INTERVAL_SEC: "30",
      },
      async () => {
        const config = loadConfig();
        const calls: string[] = [];

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = (init?.method ?? "GET").toUpperCase();
          calls.push(`${method} ${url}`);

          if (url.endsWith("/boards") && method === "GET") {
            return Response.json([{ id: 1, title: "Agent" }]);
          }
          if (url.includes("/boards/1/stacks") && method === "GET") {
            return Response.json([
              {
                id: 10,
                title: "Inbox",
                cards: [
                  {
                    id: 42,
                    title: "Ship watcher",
                    description: "Implement deck watcher",
                    stackId: 10,
                    assignedUsers: [{ participant: { uid: "cursor" } }],
                  },
                ],
              },
              { id: 11, title: "Doing", cards: [] },
              { id: 12, title: "Done", cards: [] },
            ]);
          }
          if (url.includes("/reorder") && method === "PUT") {
            return Response.json({ ok: true });
          }
          if (url.includes("/comments") && method === "POST") {
            return Response.json({ id: 1, message: "ok" });
          }
          if (url.includes("/unassignUser") && method === "PUT") {
            return Response.json({ ok: true });
          }
          if (url.includes("/assignUser") && method === "PUT") {
            return Response.json({ ok: true });
          }
          return new Response(`unexpected ${method} ${url}`, { status: 500 });
        }) as typeof fetch;

        try {
          const watcher = new DeckWatcher(config);
          const snap = await watcher.pollOnce();
          assert.equal(snap.pendingCount, 1);
          assert.equal(snap.cards[0]?.cardId, 42);
          assert.equal(snap.cards[0]?.status, "pending");

          const claimed = await watcher.claim(42);
          assert.equal(claimed.card.status, "claimed");
          assert.equal(claimed.movedToStackId, 11);

          const completed = await watcher.complete(42, "Watcher shipped");
          assert.equal(completed.card.status, "completed");
          assert.equal(completed.assignedTo, "alice");
          assert.equal(completed.movedToStackId, 12);

          const saved = JSON.parse(await readFile(statePath, "utf8")) as {
            cards: Record<string, { status: string }>;
          };
          assert.equal(saved.cards["42"]?.status, "completed");
          assert.ok(calls.some((c) => c.includes("/assignUser")));
          assert.ok(calls.some((c) => c.includes("/unassignUser")));
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    );
  });
});
