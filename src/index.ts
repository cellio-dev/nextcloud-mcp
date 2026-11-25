#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createBearerAuth } from "./auth.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

function useStdio(): boolean {
  return process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";
}

async function startStdio(): Promise<void> {
  const config = loadConfig({ requireMcpAuth: false });
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} running on stdio → ${config.nextcloudUrl}`
  );
}

async function startHttp(): Promise<void> {
  const config = loadConfig({ requireMcpAuth: true });
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: SERVER_NAME,
      version: SERVER_VERSION,
      nextcloudUrl: config.nextcloudUrl,
      username: config.username,
    });
  });

  app.use("/mcp", createBearerAuth(config.mcpAuthToken));

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer(config);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for stateless Streamable HTTP.",
      },
      id: null,
    });
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Stateless mode has no sessions to delete.",
      },
      id: null,
    });
  });

  app.listen(config.port, config.host, () => {
    console.log(
      `${SERVER_NAME} v${SERVER_VERSION} listening on http://${config.host}:${config.port}/mcp`
    );
    console.log(`Nextcloud: ${config.nextcloudUrl} (user ${config.username})`);
  });
}

async function main(): Promise<void> {
  if (useStdio()) {
    await startStdio();
  } else {
    await startHttp();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
