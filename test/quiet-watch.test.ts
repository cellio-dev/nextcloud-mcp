import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { DeckWatcher } from "../src/watch/deckWatcher.js";

function withEnv(env: Record<string, string>, fn: () => void | Promise<void>) {
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
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
}

describe("quiet deck comments defaults", () => {
  it("defaults to comment-only quiet mode", async () => {
    await withEnv(
      {
        NEXTCLOUD_URL: "https://cloud.example.com",
        NEXTCLOUD_USERNAME: "cursor",
        NEXTCLOUD_APP_PASSWORD: "pass",
        MCP_AUTH_TOKEN: "token",
      },
      () => {
        const w = loadConfig().deckWatch;
        assert.equal(w.autoAck, false);
        assert.equal(w.assignmentTrigger, false);
        assert.equal(w.silentClaim, true);
        assert.equal(w.postDoneComment, false);
        assert.equal(w.completeUnassignAgent, false);
        assert.equal(w.completeAssignOwner, false);
      }
    );
  });

  it("silent claim and complete do not post comments", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "quiet-"));
    const statePath = path.join(dir, "state.json");
    const posts: string[] = [];

    await withEnv(
      {
        NEXTCLOUD_URL: "https://cloud.example.com",
        NEXTCLOUD_USERNAME: "cursor",
        NEXTCLOUD_APP_PASSWORD: "pass",
        MCP_AUTH_TOKEN: "token",
        DECK_WATCH_ENABLED: "true",
        DECK_WATCH_STATE_PATH: statePath,
        DECK_WATCH_ASSIGNMENT_TRIGGER: "true",
        DECK_WATCH_SILENT_CLAIM: "true",
        DECK_WATCH_POST_DONE_COMMENT: "false",
        DECK_WATCH_COMMENT_TRIGGER: "false",
      },
      async () => {
        const config = loadConfig();
        globalThis.fetch = (async (
          input: RequestInfo | URL,
          init?: RequestInit
        ) => {
          const url = String(input);
          const method = (init?.method ?? "GET").toUpperCase();
          if (url.includes("/comments") && method === "POST") {
            posts.push(String(init?.body));
          }
          if (url.endsWith("/boards")) {
            return Response.json([{ id: 1, title: "B" }]);
          }
          if (url.includes("/stacks")) {
            return Response.json([
              {
                id: 2,
                title: "S",
                cards: [
                  {
                    id: 99,
                    title: "T",
                    stackId: 2,
                    assignedUsers: [{ participant: { uid: "cursor" } }],
                  },
                ],
              },
            ]);
          }
          if (method === "PUT" && url.includes("User")) {
            return Response.json({ ok: true });
          }
          return Response.json({ ok: true });
        }) as typeof fetch;

        const watcher = new DeckWatcher(config);
        await watcher.pollOnce();
        await watcher.claim(99);
        await watcher.complete(99, "ignored summary");
        assert.equal(posts.length, 0);
      }
    );
  });

  it("ignores assignOwner override when DECK_WATCH_COMPLETE_ASSIGN_OWNER is false", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nc-quiet-"));
    const statePath = path.join(dir, "state.json");
    const assignCalls: string[] = [];
    await withEnv(
      {
        NEXTCLOUD_URL: "https://cloud.example.com",
        NEXTCLOUD_USERNAME: "cursor",
        NEXTCLOUD_APP_PASSWORD: "pass",
        MCP_AUTH_TOKEN: "token",
        DECK_WATCH_ENABLED: "true",
        DECK_WATCH_STATE_PATH: statePath,
        DECK_WATCH_OWNER_USER: "owner@example.com",
        DECK_WATCH_ASSIGNMENT_TRIGGER: "true",
        DECK_WATCH_COMMENT_TRIGGER: "false",
        DECK_WATCH_COMPLETE_ASSIGN_OWNER: "false",
      },
      async () => {
        const config = loadConfig();
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = (init?.method ?? "GET").toUpperCase();
          if (url.includes("/assignUser") && method === "PUT") {
            assignCalls.push(String(init?.body));
          }
          if (url.endsWith("/boards")) {
            return Response.json([{ id: 1, title: "B" }]);
          }
          if (url.includes("/stacks")) {
            return Response.json([
              {
                id: 2,
                title: "S",
                cards: [
                  {
                    id: 50,
                    title: "T",
                    stackId: 2,
                    assignedUsers: [{ participant: { uid: "cursor" } }],
                  },
                ],
              },
            ]);
          }
          return Response.json({ ok: true });
        }) as typeof fetch;

        const watcher = new DeckWatcher(config);
        await watcher.pollOnce();
        await watcher.claim(50);
        await watcher.complete(50, "", { assignOwner: true });
        assert.equal(assignCalls.length, 0);
      }
    );
  });
});