export type DeckWatchConfig = {
  enabled: boolean;
  boardIds: number[];
  agentUser: string;
  ownerUser: string;
  intervalSec: number;
  statePath: string;
  webhookUrl: string;
  webhookToken: string;
  /** Post watcher "seen/queued" comments when work is detected. */
  autoAck: boolean;
  /** Queue cards when assigned to the agent user. */
  assignmentTrigger: boolean;
  /** Watch card comments for mention triggers (e.g. @cursor). */
  commentTrigger: boolean;
  /** Case-insensitive mention token that must appear in a comment. */
  commentMention: string;
  /** deck_watch_claim posts no comment unless message is provided. */
  silentClaim: boolean;
  /** deck_watch_complete posts an @cursor-done comment on the card. */
  postDoneComment: boolean;
  /** On complete, unassign the agent user. */
  completeUnassignAgent: boolean;
  /** On complete, assign the owner user. */
  completeAssignOwner: boolean;
};

export type AppConfig = {
  nextcloudUrl: string;
  username: string;
  appPassword: string;
  mcpAuthToken: string;
  port: number;
  host: string;
  filesRoot: string;
  maxReadBytes: number;
  deckWatch: DeckWatchConfig;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function parseBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseBoardIds(raw: string): number[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function loadConfig(options: { requireMcpAuth?: boolean } = {}): AppConfig {
  const requireMcpAuth = options.requireMcpAuth ?? true;
  const nextcloudUrl = required("NEXTCLOUD_URL").replace(/\/+$/, "");
  const username = required("NEXTCLOUD_USERNAME");
  const appPassword = required("NEXTCLOUD_APP_PASSWORD");
  const mcpAuthToken = requireMcpAuth
    ? required("MCP_AUTH_TOKEN")
    : optional("MCP_AUTH_TOKEN", "");

  const port = Number.parseInt(optional("PORT", "3000"), 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const maxReadBytes = Number.parseInt(
    optional("NEXTCLOUD_MAX_READ_BYTES", "1048576"),
    10
  );
  if (!Number.isFinite(maxReadBytes) || maxReadBytes < 1024) {
    throw new Error("NEXTCLOUD_MAX_READ_BYTES must be an integer >= 1024");
  }

  const intervalSec = Number.parseInt(
    optional("DECK_WATCH_INTERVAL_SEC", "60"),
    10
  );
  if (!Number.isFinite(intervalSec) || intervalSec < 15) {
    throw new Error("DECK_WATCH_INTERVAL_SEC must be an integer >= 15");
  }

  const agentUser = optional("DECK_WATCH_AGENT_USER", username);
  const ownerUser = optional("DECK_WATCH_OWNER_USER", username);

  return {
    nextcloudUrl,
    username,
    appPassword,
    mcpAuthToken,
    port,
    host: optional("HOST", "0.0.0.0"),
    filesRoot: optional("NEXTCLOUD_FILES_ROOT", "").replace(/^\/+|\/+$/g, ""),
    maxReadBytes,
    deckWatch: {
      enabled: parseBool("DECK_WATCH_ENABLED", false),
      boardIds: parseBoardIds(optional("DECK_WATCH_BOARD_IDS", "")),
      agentUser,
      ownerUser,
      intervalSec,
      statePath: optional(
        "DECK_WATCH_STATE_PATH",
        "data/deck-watch-state.json"
      ),
      webhookUrl: optional("DECK_WATCH_WEBHOOK_URL", ""),
      webhookToken: optional("DECK_WATCH_WEBHOOK_TOKEN", ""),
      autoAck: parseBool("DECK_WATCH_AUTO_ACK", false),
      assignmentTrigger: parseBool("DECK_WATCH_ASSIGNMENT_TRIGGER", false),
      commentTrigger: parseBool("DECK_WATCH_COMMENT_TRIGGER", true),
      commentMention: optional("DECK_WATCH_COMMENT_MENTION", "@cursor"),
      silentClaim: parseBool("DECK_WATCH_SILENT_CLAIM", true),
      postDoneComment: parseBool("DECK_WATCH_POST_DONE_COMMENT", false),
      completeUnassignAgent: parseBool("DECK_WATCH_COMPLETE_UNASSIGN_AGENT", false),
      completeAssignOwner: parseBool("DECK_WATCH_COMPLETE_ASSIGN_OWNER", false),
    },
  };
}
