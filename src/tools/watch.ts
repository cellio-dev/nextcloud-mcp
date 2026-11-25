import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import { getSharedWatcher } from "../watch/deckWatcher.js";

function requireWatcher() {
  const watcher = getSharedWatcher();
  if (!watcher) {
    throw new Error(
      "Deck watcher is not running. Set DECK_WATCH_ENABLED=true and run the HTTP server (Docker), then retry."
    );
  }
  if (!watcher.enabled) {
    throw new Error("Deck watcher is disabled (DECK_WATCH_ENABLED=false).");
  }
  return watcher;
}

export function registerWatchTools(server: McpServer): void {
  server.registerTool(
    "deck_watch_status",
    {
      description:
        "Show Deck watcher status: last poll, pending/claimed counts, and queued cards assigned to the agent user on any board.",
      inputSchema: {},
    },
    async () => {
      try {
        const watcher = requireWatcher();
        return textResult(watcher.snapshot());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_watch_poll",
    {
      description:
        "Force an immediate Deck watcher poll for cards assigned to the agent user (any board/stack).",
      inputSchema: {},
    },
    async () => {
      try {
        const watcher = requireWatcher();
        return textResult(await watcher.pollOnce());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_watch_pending",
    {
      description:
        "List watched cards from any board. status=pending (default), claimed, completed, or open (pending+claimed).",
      inputSchema: {
        status: z
          .enum(["pending", "claimed", "completed", "open"])
          .default("pending"),
      },
    },
    async ({ status }) => {
      try {
        const watcher = requireWatcher();
        return textResult({
          status,
          cards: watcher.pending(status),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_watch_claim",
    {
      description:
        "Claim a watched card and post an ack comment. Does not move the card unless targetStackId is explicitly provided.",
      inputSchema: {
        cardId: z.number().int().positive(),
        message: z.string().optional(),
        targetStackId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional: only set when the user asked to move the card"),
      },
    },
    async ({ cardId, message, targetStackId }) => {
      try {
        const watcher = requireWatcher();
        return textResult(
          await watcher.claim(cardId, message, { targetStackId })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_watch_complete",
    {
      description:
        "Finish a watched card: post @cursor-done summary, unassign agent, assign owner back. Does not move the card unless targetStackId is explicitly provided.",
      inputSchema: {
        cardId: z.number().int().positive(),
        summary: z
          .string()
          .min(1)
          .describe("What was done; posted as an @cursor-done comment"),
        assignOwner: z.boolean().default(true),
        targetStackId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional: only set when the user asked to move the card"),
      },
    },
    async ({ cardId, summary, assignOwner, targetStackId }) => {
      try {
        const watcher = requireWatcher();
        return textResult(
          await watcher.complete(cardId, summary, {
            assignOwner,
            targetStackId,
          })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
