export type AppConfig = {
  nextcloudUrl: string;
  username: string;
  appPassword: string;
  mcpAuthToken: string;
  port: number;
  host: string;
  filesRoot: string;
  maxReadBytes: number;
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

  return {
    nextcloudUrl,
    username,
    appPassword,
    mcpAuthToken,
    port,
    host: optional("HOST", "0.0.0.0"),
    filesRoot: optional("NEXTCLOUD_FILES_ROOT", "").replace(/^\/+|\/+$/g, ""),
    maxReadBytes,
  };
}
