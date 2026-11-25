import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NextcloudClient } from "../nextcloud/client.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import * as notes from "../nextcloud/notes.js";

export function registerNotesTools(
  server: McpServer,
  client: NextcloudClient
): void {
  server.registerTool(
    "notes_list",
    {
      description:
        "List notes from the Nextcloud Notes app (requires Notes app installed).",
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(await notes.listNotes(client));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "notes_get",
    {
      description: "Get a note by id.",
      inputSchema: { noteId: z.number().int().positive() },
    },
    async ({ noteId }) => {
      try {
        return textResult(await notes.getNote(client, noteId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "notes_create",
    {
      description: "Create a note.",
      inputSchema: {
        title: z.string().optional(),
        content: z.string().optional(),
        category: z.string().optional(),
        favorite: z.boolean().optional(),
      },
    },
    async (input) => {
      try {
        return textResult(await notes.createNote(client, input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "notes_update",
    {
      description: "Update a note.",
      inputSchema: {
        noteId: z.number().int().positive(),
        title: z.string().optional(),
        content: z.string().optional(),
        category: z.string().optional(),
        favorite: z.boolean().optional(),
      },
    },
    async ({ noteId, ...fields }) => {
      try {
        return textResult(await notes.updateNote(client, noteId, fields));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "notes_delete",
    {
      description: "Delete a note.",
      inputSchema: { noteId: z.number().int().positive() },
    },
    async ({ noteId }) => {
      try {
        return textResult(await notes.deleteNote(client, noteId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
