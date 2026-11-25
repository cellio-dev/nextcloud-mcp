import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { formatDeckUserMention } from "../src/nextcloud/mentions.js";
import { DeckWatcher } from "../src/watch/deckWatcher.js";

describe("agent reply guardrails", () => {
  it("notifyUserIdForCard returns comment author", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nc-reply-"));
    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "cursor";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";
    process.env.DECK_WATCH_STATE_PATH = path.join(dir, "s.json");
    const config = loadConfig({ requireMcpAuth: false });
    const watcher = new DeckWatcher(config);
    (watcher as unknown as { state: { comments: Record<string, unknown> } }).state =
      {
        comments: {
          "9": {
            commentId: 9,
            cardId: 7,
            boardId: 1,
            stackId: 2,
            status: "claimed",
            author: "chadelliott80@gmail.com",
          },
        },
        cards: {},
        processedCommentIds: {},
        cardLastModified: {},
        version: 2,
      };
    assert.equal(
      watcher.notifyUserIdForCard(7),
      "chadelliott80@gmail.com"
    );
    assert.equal(
      formatDeckUserMention(watcher.notifyUserIdForCard(7)!),
      '@"chadelliott80@gmail.com"'
    );
  });

  it("rejects status fluff and duplicate replies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nc-reply2-"));
    process.env.DECK_WATCH_STATE_PATH = path.join(dir, "s2.json");
    const config = loadConfig({ requireMcpAuth: false });
    const watcher = new DeckWatcher(config);
    (watcher as unknown as { state: Record<string, unknown> }).state = {
      version: 2,
      cards: { "7": { cardId: 7, status: "claimed", agentRepliedAt: "t" } },
      comments: {},
      processedCommentIds: {},
      cardLastModified: {},
    };
    assert.throws(
      () => watcher.validateAgentComment(7, "Hello!"),
      /already has an agent reply/
    );
    assert.throws(
      () =>
        watcher.validateAgentComment(8, "seen your comment — I'll work this"),
      /ack\/status/
    );
  });

  it("complete requires a user reply comment first", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nc-reply3-"));
    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "cursor";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";
    process.env.DECK_WATCH_STATE_PATH = path.join(dir, "s3.json");
    process.env.DECK_WATCH_REQUIRE_REPLY_BEFORE_COMPLETE = "true";
    const config = loadConfig({ requireMcpAuth: false });
    const watcher = new DeckWatcher(config);
    (watcher as unknown as { state: Record<string, unknown> }).state = {
      version: 2,
      cards: {
        "3": {
          cardId: 3,
          boardId: 1,
          stackId: 2,
          status: "claimed",
          title: "T",
          description: "",
          stackTitle: "",
          trigger: "comment",
          firstSeenAt: "t",
          updatedAt: "t",
        },
      },
      comments: {},
      processedCommentIds: {},
      cardLastModified: {},
    };
    await assert.rejects(
      () => watcher.complete(3),
      /deck_add_comment/
    );
  });
});