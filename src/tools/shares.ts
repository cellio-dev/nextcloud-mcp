import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NextcloudClient } from "../nextcloud/client.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import * as shares from "../nextcloud/shares.js";

/**
 * Share types (Nextcloud):
 * 0 user, 1 group, 3 public link, 4 email, 6 federated cloud, 7 circle, 10 Talk room
 */
export function registerShareTools(
  server: McpServer,
  client: NextcloudClient
): void {
  server.registerTool(
    "shares_list",
    {
      description: "List shares you created, optionally filtered by path.",
      inputSchema: {
        path: z.string().optional(),
        sharedWithMe: z.boolean().default(false),
      },
    },
    async ({ path, sharedWithMe }) => {
      try {
        return textResult(await shares.listShares(client, path, sharedWithMe));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "shares_create",
    {
      description:
        "Create a share. shareType: 0=user, 1=group, 3=public link, 4=email, 7=circle, 10=Talk. permissions bitmask: 1 read, 2 update, 4 create, 8 delete, 16 share (default 1).",
      inputSchema: {
        path: z.string().min(1).describe("Nextcloud path, e.g. /Projects/plan.md"),
        shareType: z.number().int(),
        shareWith: z
          .string()
          .optional()
          .describe("Required for user/group/email/circle/Talk shares"),
        permissions: z.number().int().default(1),
        password: z.string().optional(),
        expireDate: z
          .string()
          .optional()
          .describe("YYYY-MM-DD expiration date"),
        note: z.string().optional(),
        label: z.string().optional(),
      },
    },
    async (input) => {
      try {
        return textResult(await shares.createShare(client, input));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "shares_delete",
    {
      description: "Delete a share by id.",
      inputSchema: { shareId: z.number().int().positive() },
    },
    async ({ shareId }) => {
      try {
        return textResult(await shares.deleteShare(client, shareId));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
