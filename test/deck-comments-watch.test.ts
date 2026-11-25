import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { DeckWatcher } from "../src/watch/deckWatcher.js";

function withEnv(env: Record<string, string>, fn: () => Promise<void>) {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("NEXTCLOUD_") ||
      key.startsWith("DECK_WATCH_") ||
      key === "MCP_AUTH_TOKEN"
    ) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, env);
  return fn().finally(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
}

describe("deck comment triggers", () => {
  it("queues @cursor comments and webhooks them", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-comment-"));
    const statePath = path.join(dir, "state.json");
    const webhooks: unknown[] = [];

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
        DECK_WATCH_COMMENT_TRIGGER: "true",
        DECK_WATCH_COMMENT_MENTION: "@cursor",
        DECK_WATCH_WEBHOOK_URL: "https://hooks.example.com/automation",
        DECK_WATCH_WEBHOOK_TOKEN: "whsec",
        DECK_WATCH_INTERVAL_SEC: "30",
      },
      async () => {
        const config = loadConfig();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (
          input: RequestInfo | URL,
          init?: RequestInit
        ) => {
          const url = String(input);
          const method = (init?.method ?? "GET").toUpperCase();

          if (url.includes("hooks.example.com")) {
            webhooks.push(JSON.parse(String(init?.body ?? "{}")));
            return new Response("ok", { status: 200 });
          }
          if (url.endsWith("/boards") && method === "GET") {
            return Response.json([{ id: 10, title: "Projects" }]);
          }
          if (url.includes("/boards/10/stacks") && method === "GET") {
            return Response.json([
              {
                id: 36,
                title: "Planned",
                cards: [
                  {
                    id: 214,
                    title: "Cursor test",
                    description: "",
                    stackId: 36,
                    lastModified: 100,
                    assignedUsers: [],
                  },
                ],
              },
            ]);
          }
          if (
            url.includes("/ocs/v2.php/apps/deck/api/v1.0/cards/214/comments") &&
            method === "GET"
          ) {
            return Response.json({
              ocs: {
                meta: { status: "ok", statuscode: 200, message: "OK" },
                data: [
                  {
                    id: 501,
                    message: "@cursor please leave a test reply",
                    actorId: "alice",
                    creationDateTime: "2026-11-25T16:00:00Z",
                  },
                ],
              },
            });
          }
          if (
            url.includes("/ocs/v2.php/apps/deck/api/v1.0/cards/214/comments") &&
            method === "POST"
          ) {
            return Response.json({
              ocs: {
                meta: { status: "ok", statuscode: 200, message: "OK" },
                data: { id: 502, message: "ack" },
              },
            });
          }
          return new Response(`unexpected ${method} ${url}`, { status: 500 });
        }) as typeof fetch;

        try {
          const watcher = new DeckWatcher(config);
          const snap = await watcher.pollOnce();
          assert.equal(snap.pendingCommentCount, 1);
          assert.equal(snap.comments[0]?.commentId, 501);
          assert.equal(snap.comments[0]?.cardId, 214);
          assert.ok(snap.cards.some((c) => c.cardId === 214));
          assert.equal(webhooks.length, 1);
          const payload = webhooks[0] as {
            kind: string;
            context: string;
          };
          assert.equal(payload.kind, "comment");
          assert.match(payload.context, /please leave a test reply/);
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    );
  });
});
