import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { NextcloudClient } from "./nextcloud/client.js";
import { registerFileTools } from "./tools/files.js";
import { registerDeckTools } from "./tools/deck.js";
import { registerShareTools } from "./tools/shares.js";
import { registerNotesTools } from "./tools/notes.js";
import { registerSystemTools } from "./tools/system.js";
import { registerWatchTools } from "./tools/watch.js";

export const SERVER_NAME = "nextcloud-mcp";
export const SERVER_VERSION = "1.3.6";

export function createMcpServer(config: AppConfig): McpServer {
  const client = new NextcloudClient(config);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerSystemTools(server, client);
  registerFileTools(server, client);
  registerDeckTools(server, client, config.deckWatch);
  registerShareTools(server, client);
  registerNotesTools(server, client);
  registerWatchTools(server);

  const watch = config.deckWatch;
  server.registerResource(
    "nextcloud-overview",
    "nextcloud://overview",
    {
      mimeType: "text/markdown",
      description: "How to collaborate through this Nextcloud MCP server",
    },
    async () => ({
      contents: [
        {
          uri: "nextcloud://overview",
          mimeType: "text/markdown",
          text: `# Nextcloud MCP collaboration

Connected to: ${config.nextcloudUrl}
User: ${config.username}
Files root: ${config.filesRoot || "/"}
Deck watcher: ${watch.enabled ? `on (agent=${watch.agentUser}, owner=${watch.ownerUser})` : "off"}

## Suggested workflow
1. Call \`nextcloud_ping\` to verify access.
2. Use \`files_*\` tools for project docs, specs, and artifacts.
3. Use \`deck_*\` tools for task boards, cards, and comments.
4. With watcher enabled: assign a card to \`${watch.agentUser}\` **or** comment \`${watch.commentMention} …\` on any card → agent uses \`deck_watch_pending\` / \`deck_watch_claim\` / replies with \`deck_add_comment\` / \`deck_watch_complete\` (no auto-move unless asked).
5. Use \`notes_*\` for lightweight scratchpads (Notes app required).
6. Use \`shares_*\` when you need to share a path with a teammate or via public link.
`,
        },
      ],
    })
  );

  return server;
}
