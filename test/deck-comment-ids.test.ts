import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { DeckWatcher } from "../src/watch/deckWatcher.js";

describe("deck comment id parsing", () => {
  it("queues comments when Deck returns string comment ids", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-str-id-"));
    const statePath = path.join(dir, "state.json");
    const webhooks: unknown[] = [];

    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "cursor";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";
    process.env.DECK_WATCH_ENABLED = "true";
    process.env.DECK_WATCH_STATE_PATH = statePath;
    process.env.DECK_WATCH_WEBHOOK_URL = "https://hooks.example.com/automation";
    process.env.DECK_WATCH_WEBHOOK_TOKEN = "whsec";

    const config = loadConfig({ requireMcpAuth: false });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("hooks.example.com")) {
        webhooks.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response("ok", { status: 200 });
      }
      if (url.endsWith("/boards")) {
        return Response.json([{ id: 1, title: "B" }]);
      }
      if (url.includes("/stacks")) {
        return Response.json([
          {
            id: 2,
            cards: [{ id: "88", title: "T", stackId: 2, lastModified: 1 }],
          },
        ]);
      }
      if (url.includes("/comments") && method === "GET") {
        return Response.json({
          ocs: {
            meta: { statuscode: 200 },
            data: [
              {
                id: "9001",
                message: "@cursor ping",
                actorId: "owner@test",
              },
            ],
          },
        });
      }
      return Response.json({});
    }) as typeof fetch;

    try {
      const watcher = new DeckWatcher(config);
      const snap = await watcher.pollOnce();
      assert.equal(snap.pendingCommentCount, 1);
      assert.equal(snap.comments[0]?.commentId, 9001);
      assert.equal(webhooks.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});