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
        "Show Deck watcher status including pending assignment cards and @cursor comment requests.",
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
        "Force an immediate poll for assignments and @cursor (or configured mention) comments on any board.",
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
        "List pending work: assigned cards and comment requests (status=pending|claimed|completed|open).",
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
          comments: watcher.pendingComments(status),
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
        "Claim a watched card. When DECK_WATCH_SILENT_CLAIM=true (default), posts no comment unless message is set.",
      inputSchema: {
        cardId: z.number().int().positive(),
        message: z
          .string()
          .optional()
          .describe("Optional claim comment; omit for silent claim"),
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
        "Mark watched work complete after deck_add_comment (required when DECK_WATCH_REQUIRE_REPLY_BEFORE_COMPLETE=true). Posts @cursor-done only when DECK_WATCH_POST_DONE_COMMENT=true.",
      inputSchema: {
        cardId: z.number().int().positive(),
        summary: z
          .string()
          .optional()
          .describe(
            "Optional; used only when DECK_WATCH_POST_DONE_COMMENT=true"
          ),
        assignOwner: z
          .boolean()
          .optional()
          .describe(
            "Only applies when DECK_WATCH_COMPLETE_ASSIGN_OWNER=true; cannot force assign when env is false"
          ),
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
          await watcher.complete(cardId, summary ?? "", {
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