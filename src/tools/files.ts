import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NextcloudClient } from "../nextcloud/client.js";
import { errorResult, textResult } from "../nextcloud/client.js";
import * as webdav from "../nextcloud/webdav.js";

const pathSchema = z
  .string()
  .describe(
    "Path relative to the Nextcloud Files root (or NEXTCLOUD_FILES_ROOT). Use '' or '/' for the root."
  );

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function registerFileTools(
  server: McpServer,
  client: NextcloudClient
): void {
  server.registerTool(
    "files_list",
    {
      description:
        "List files and folders in a Nextcloud Files directory (WebDAV PROPFIND).",
      inputSchema: {
        path: pathSchema.default(""),
      },
    },
    async ({ path }) => {
      try {
        const entries = await webdav.listDirectory(client, normalizePath(path));
        return textResult({ path: normalizePath(path) || "/", entries });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_stat",
    {
      description: "Get metadata for a single file or folder.",
      inputSchema: { path: pathSchema },
    },
    async ({ path }) => {
      try {
        const entry = await webdav.statPath(client, normalizePath(path));
        return textResult(entry);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_read",
    {
      description:
        "Read a file from Nextcloud Files. Text is returned as utf8; binary as base64.",
      inputSchema: { path: pathSchema },
    },
    async ({ path }) => {
      try {
        const result = await webdav.readFile(client, normalizePath(path));
        return textResult({ path: normalizePath(path), ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_write",
    {
      description:
        "Create or overwrite a file in Nextcloud Files. Use encoding=base64 for binary content.",
      inputSchema: {
        path: pathSchema,
        content: z.string().describe("File contents"),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      },
    },
    async ({ path, content, encoding }) => {
      try {
        const result = await webdav.writeFile(
          client,
          normalizePath(path),
          content,
          encoding
        );
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_mkdir",
    {
      description: "Create a directory in Nextcloud Files (MKCOL).",
      inputSchema: { path: pathSchema },
    },
    async ({ path }) => {
      try {
        const result = await webdav.createDirectory(
          client,
          normalizePath(path)
        );
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_delete",
    {
      description: "Delete a file or folder (recursive for folders).",
      inputSchema: { path: pathSchema },
    },
    async ({ path }) => {
      try {
        const result = await webdav.deletePath(client, normalizePath(path));
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_move",
    {
      description: "Move or rename a file/folder.",
      inputSchema: {
        from: pathSchema.describe("Source path"),
        to: pathSchema.describe("Destination path"),
        overwrite: z.boolean().default(true),
      },
    },
    async ({ from, to, overwrite }) => {
      try {
        const result = await webdav.movePath(
          client,
          normalizePath(from),
          normalizePath(to),
          overwrite
        );
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "files_copy",
    {
      description: "Copy a file or folder.",
      inputSchema: {
        from: pathSchema.describe("Source path"),
        to: pathSchema.describe("Destination path"),
        overwrite: z.boolean().default(true),
      },
    },
    async ({ from, to, overwrite }) => {
      try {
        const result = await webdav.copyPath(
          client,
          normalizePath(from),
          normalizePath(to),
          overwrite
        );
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
