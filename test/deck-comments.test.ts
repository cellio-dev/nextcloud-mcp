import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { NextcloudClient } from "../src/nextcloud/client.js";
import { createComment, listComments } from "../src/nextcloud/deck.js";

describe("deck comments OCS path", () => {
  it("POSTs comments to /ocs/v2.php/apps/deck/api/v1.0/...", async () => {
    const previous = { ...process.env };
    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "cursor";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";

    const calls: Array<{ method: string; url: string; body: string | null }> =
      [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        method,
        url,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return Response.json({
        ocs: {
          meta: { status: "ok", statuscode: 200, message: "OK" },
          data: { id: 9, message: "hello" },
        },
      });
    }) as typeof fetch;

    try {
      const client = new NextcloudClient(loadConfig());
      await createComment(client, 214, "test from cursor");
      await listComments(client, 214, 10, 0);

      assert.equal(calls.length, 2);
      assert.match(
        calls[0]!.url,
        /\/ocs\/v2\.php\/apps\/deck\/api\/v1\.0\/cards\/214\/comments/
      );
      assert.equal(calls[0]!.method, "POST");
      assert.ok(!calls[0]!.url.includes("/index.php/apps/deck/"));
      assert.match(
        calls[1]!.url,
        /\/ocs\/v2\.php\/apps\/deck\/api\/v1\.0\/cards\/214\/comments/
      );
    } finally {
      globalThis.fetch = originalFetch;
      process.env = previous;
    }
  });
});
