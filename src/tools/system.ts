import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NextcloudClient } from "../nextcloud/client.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import * as shares from "../nextcloud/shares.js";

export function registerSystemTools(
  server: McpServer,
  client: NextcloudClient
): void {
  server.registerTool(
    "nextcloud_ping",
    {
      description:
        "Verify connectivity and auth against Nextcloud. Returns user + selected capabilities.",
      inputSchema: {},
    },
    async () => {
      try {
        const [user, capabilities] = await Promise.all([
          shares.getUserStatus(client),
          shares.getCapabilities(client),
        ]);
        return textResult({
          ok: true,
          url: client.config.nextcloudUrl,
          username: client.config.username,
          filesRoot: client.config.filesRoot || "/",
          user,
          capabilities,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_search",
    {
      description:
        "Search files via Nextcloud Unified Search (files provider).",
      inputSchema: {
        term: z.string().min(1),
        limit: z.number().int().positive().max(100).default(25),
      },
    },
    async ({ term, limit }) => {
      try {
        return textResult(await shares.searchFiles(client, term, limit));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
