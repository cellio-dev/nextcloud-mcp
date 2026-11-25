import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NextcloudClient } from "../nextcloud/client.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import * as deck from "../nextcloud/deck.js";
import { formatDeckUserMention } from "../nextcloud/mentions.js";
import type { DeckWatchConfig } from "../config.js";
import { getSharedWatcher } from "../watch/deckWatcher.js";

const id = z.number().int().positive();

export function registerDeckTools(
  server: McpServer,
  client: NextcloudClient,
  deckWatch: DeckWatchConfig
): void {
  server.registerTool(
    "deck_list_boards",
    {
      description: "List Nextcloud Deck boards. Set details=true for stacks/labels.",
      inputSchema: { details: z.boolean().default(false) },
    },
    async ({ details }) => {
      try {
        return textResult(await deck.listBoards(client, details));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_get_board",
    {
      description: "Get a Deck board including labels, ACL, and settings.",
      inputSchema: { boardId: id },
    },
    async ({ boardId }) => {
      try {
        return textResult(await deck.getBoard(client, boardId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_create_board",
    {
      description: "Create a new Deck board.",
      inputSchema: {
        title: z.string().min(1).max(100),
        color: z
          .string()
          .describe("Hex color without or with #, e.g. 0082c9")
          .default("0082c9"),
      },
    },
    async ({ title, color }) => {
      try {
        return textResult(await deck.createBoard(client, title, color));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_update_board",
    {
      description: "Update Deck board fields (title, color, archived, etc.).",
      inputSchema: {
        boardId: id,
        title: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
        archived: z.boolean().optional(),
      },
    },
    async ({ boardId, ...fields }) => {
      try {
        const body: Record<string, unknown> = { ...fields };
        if (typeof body.color === "string") {
          body.color = body.color.replace(/^#/, "");
        }
        return textResult(await deck.updateBoard(client, boardId, body));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_delete_board",
    {
      description: "Delete a Deck board.",
      inputSchema: { boardId: id },
    },
    async ({ boardId }) => {
      try {
        return textResult(await deck.deleteBoard(client, boardId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_list_stacks",
    {
      description:
        "List stacks (columns) on a board, including cards in each stack.",
      inputSchema: { boardId: id },
    },
    async ({ boardId }) => {
      try {
        return textResult(await deck.listStacks(client, boardId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_create_stack",
    {
      description: "Create a stack (column) on a board.",
      inputSchema: {
        boardId: id,
        title: z.string().min(1).max(100),
        order: z.number().int().default(999),
      },
    },
    async ({ boardId, title, order }) => {
      try {
        return textResult(await deck.createStack(client, boardId, title, order));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_update_stack",
    {
      description: "Update a stack title/order.",
      inputSchema: {
        boardId: id,
        stackId: id,
        title: z.string().min(1).max(100),
        order: z.number().int(),
      },
    },
    async ({ boardId, stackId, title, order }) => {
      try {
        return textResult(
          await deck.updateStack(client, boardId, stackId, title, order)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_delete_stack",
    {
      description: "Delete a stack and its cards.",
      inputSchema: { boardId: id, stackId: id },
    },
    async ({ boardId, stackId }) => {
      try {
        return textResult(await deck.deleteStack(client, boardId, stackId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_get_card",
    {
      description: "Get a Deck card with description, labels, and assignments.",
      inputSchema: { boardId: id, stackId: id, cardId: id },
    },
    async ({ boardId, stackId, cardId }) => {
      try {
        return textResult(
          await deck.getCard(client, boardId, stackId, cardId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_create_card",
    {
      description: "Create a card on a Deck stack.",
      inputSchema: {
        boardId: id,
        stackId: id,
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        order: z.number().int().default(999),
        duedate: z
          .string()
          .nullable()
          .optional()
          .describe("ISO-8601 datetime or null"),
      },
    },
    async ({ boardId, stackId, title, description, order, duedate }) => {
      try {
        return textResult(
          await deck.createCard(client, boardId, stackId, {
            title,
            description,
            order,
            duedate: duedate ?? null,
          })
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_update_card",
    {
      description:
        "Update a card. Include owner when required by your Deck version. Set archived/done as needed.",
      inputSchema: {
        boardId: id,
        stackId: id,
        cardId: id,
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        owner: z.string().optional(),
        order: z.number().int().optional(),
        type: z.string().default("plain"),
        duedate: z.string().nullable().optional(),
        archived: z.boolean().optional(),
        done: z.string().nullable().optional(),
      },
    },
    async ({ boardId, stackId, cardId, type, ...fields }) => {
      try {
        const body: Record<string, unknown> = { ...fields, type: type ?? "plain" };
        return textResult(
          await deck.updateCard(client, boardId, stackId, cardId, body)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_delete_card",
    {
      description: "Delete a Deck card.",
      inputSchema: { boardId: id, stackId: id, cardId: id },
    },
    async ({ boardId, stackId, cardId }) => {
      try {
        return textResult(
          await deck.deleteCard(client, boardId, stackId, cardId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_move_card",
    {
      description:
        "Reorder a card and/or move it to another stack on the same board.",
      inputSchema: {
        boardId: id,
        stackId: id.describe("Current stack id"),
        cardId: id,
        targetStackId: id.describe("Destination stack id"),
        order: z.number().int().default(0),
      },
    },
    async ({ boardId, stackId, cardId, targetStackId, order }) => {
      try {
        return textResult(
          await deck.reorderCard(
            client,
            boardId,
            stackId,
            cardId,
            order,
            targetStackId
          )
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_assign_label",
    {
      description: "Assign a board label to a card.",
      inputSchema: { boardId: id, stackId: id, cardId: id, labelId: id },
    },
    async ({ boardId, stackId, cardId, labelId }) => {
      try {
        return textResult(
          await deck.assignLabel(client, boardId, stackId, cardId, labelId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_remove_label",
    {
      description: "Remove a label from a card.",
      inputSchema: { boardId: id, stackId: id, cardId: id, labelId: id },
    },
    async ({ boardId, stackId, cardId, labelId }) => {
      try {
        return textResult(
          await deck.removeLabel(client, boardId, stackId, cardId, labelId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_assign_user",
    {
      description: "Assign a Nextcloud user to a card.",
      inputSchema: {
        boardId: id,
        stackId: id,
        cardId: id,
        userId: z.string().min(1),
      },
    },
    async ({ boardId, stackId, cardId, userId }) => {
      try {
        return textResult(
          await deck.assignUser(client, boardId, stackId, cardId, userId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_unassign_user",
    {
      description: "Remove a user assignment from a card.",
      inputSchema: {
        boardId: id,
        stackId: id,
        cardId: id,
        userId: z.string().min(1),
      },
    },
    async ({ boardId, stackId, cardId, userId }) => {
      try {
        return textResult(
          await deck.unassignUser(client, boardId, stackId, cardId, userId)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_create_label",
    {
      description: "Create a label on a board.",
      inputSchema: {
        boardId: id,
        title: z.string().min(1),
        color: z.string().default("31CC7C"),
      },
    },
    async ({ boardId, title, color }) => {
      try {
        return textResult(await deck.createLabel(client, boardId, title, color));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_list_comments",
    {
      description: "List comments on a Deck card.",
      inputSchema: {
        cardId: id,
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().nonnegative().default(0),
      },
    },
    async ({ cardId, limit, offset }) => {
      try {
        return textResult(
          await deck.listComments(client, cardId, limit, offset)
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "deck_format_user_mention",
    {
      description:
        "Format a Nextcloud uid for Deck @-mentions (required for email logins: @\"user@example.com\", not display name).",
      inputSchema: {
        userId: z.string().min(1).describe("Nextcloud login uid (actorId from comments)"),
      },
    },
    async ({ userId }) => {
      return textResult({
        userId: userId.trim(),
        mention: formatDeckUserMention(userId),
      });
    }
  );

  server.registerTool(
    "deck_add_comment",
    {
      description:
        "Add a comment to a Deck card. Use notifyUserId with the author's Nextcloud uid (not display name) to trigger notifications.",
      inputSchema: {
        cardId: id,
        message: z.string().min(1),
        parentId: z.number().int().positive().nullable().default(null),
        notifyUserId: z
          .string()
          .optional()
          .describe(
            "Nextcloud uid to @-mention (optional; auto-filled from watcher when DECK_WATCH_AUTO_MENTION_REPLY=true)."
          ),
      },
    },
    async ({ cardId, message, parentId, notifyUserId }) => {
      try {
        const watcher = getSharedWatcher();
        watcher?.validateAgentComment(cardId, message);

        let text = message;
        let uid = notifyUserId?.trim();
        if (!uid && deckWatch.autoMentionReply) {
          uid =
            watcher?.notifyUserIdForCard(cardId) ??
            deckWatch.ownerUser?.trim() ||
            undefined;
        }
        if (uid) {
          const mention = formatDeckUserMention(uid);
          if (!text.includes(mention)) {
            text = `${mention} ${text}`;
          }
        }
        const result = await deck.createComment(client, cardId, text, parentId);
        if (watcher) {
          await watcher.recordAgentReply(cardId);
        }
        return textResult({
          postedMessage: text,
          api: result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
