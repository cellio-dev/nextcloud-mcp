import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { NextcloudClient } from "../src/nextcloud/client.js";
import { listDirectory } from "../src/nextcloud/webdav.js";

const SAMPLE_PROPFIND = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/alice/Projects/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getlastmodified>Mon, 01 Jan 2024 00:00:00 GMT</d:getlastmodified>
        <oc:permissions>RGDNVCK</oc:permissions>
        <oc:fileid>1</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Projects/readme.md</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>12</d:getcontentlength>
        <d:getcontenttype>text/markdown</d:getcontenttype>
        <d:getetag>&quot;abc&quot;</d:getetag>
        <d:getlastmodified>Mon, 01 Jan 2024 01:00:00 GMT</d:getlastmodified>
        <oc:permissions>RGDNVW</oc:permissions>
        <oc:fileid>2</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alice/Projects/notes/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <oc:fileid>3</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe("webdav listDirectory parsing", () => {
  it("parses PROPFIND multistatus into relative entries", async () => {
    const previous = { ...process.env };
    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "alice";
    process.env.NEXTCLOUD_APP_PASSWORD = "app-pass";
    process.env.NEXTCLOUD_FILES_ROOT = "Projects";
    process.env.MCP_AUTH_TOKEN = "token";

    const config = loadConfig();
    const client = new NextcloudClient(config);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(SAMPLE_PROPFIND, {
        status: 207,
        headers: { "Content-Type": "application/xml" },
      })) as typeof fetch;

    try {
      const entries = await listDirectory(client, "");
      assert.equal(entries.length, 2);
      assert.deepEqual(
        entries.map((e) => ({ path: e.path, isDirectory: e.isDirectory, name: e.name })),
        [
          { path: "readme.md", isDirectory: false, name: "readme.md" },
          { path: "notes", isDirectory: true, name: "notes" },
        ]
      );
      assert.equal(entries[0]?.size, 12);
      assert.equal(entries[0]?.contentType, "text/markdown");
    } finally {
      globalThis.fetch = originalFetch;
      process.env = previous;
    }
  });
});

describe("config", () => {
  it("requires Nextcloud settings", () => {
    const previous = { ...process.env };
    delete process.env.NEXTCLOUD_URL;
    delete process.env.NEXTCLOUD_USERNAME;
    delete process.env.NEXTCLOUD_APP_PASSWORD;
    delete process.env.MCP_AUTH_TOKEN;
    try {
      assert.throws(() => loadConfig(), /NEXTCLOUD_URL/);
    } finally {
      process.env = previous;
    }
  });

  it("strips trailing slash from URL", () => {
    const previous = { ...process.env };
    process.env.NEXTCLOUD_URL = "https://cloud.example.com/";
    process.env.NEXTCLOUD_USERNAME = "alice";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";
    try {
      const config = loadConfig();
      assert.equal(config.nextcloudUrl, "https://cloud.example.com");
    } finally {
      process.env = previous;
    }
  });
});

describe("client paths", () => {
  it("builds webdav and deck paths", () => {
    const previous = { ...process.env };
    process.env.NEXTCLOUD_URL = "https://cloud.example.com";
    process.env.NEXTCLOUD_USERNAME = "alice";
    process.env.NEXTCLOUD_APP_PASSWORD = "pass";
    process.env.MCP_AUTH_TOKEN = "token";
    process.env.NEXTCLOUD_FILES_ROOT = "Projects/Work";
    try {
      const client = new NextcloudClient(loadConfig());
      assert.equal(
        client.webdavFilesPath("docs/a.md"),
        "/remote.php/dav/files/alice/Projects/Work/docs/a.md"
      );
      assert.equal(
        client.deckPath("boards/1/stacks"),
        "/index.php/apps/deck/api/v1.1/boards/1/stacks"
      );
      assert.equal(
        client.ocsPath("cloud/capabilities"),
        "/ocs/v2.php/cloud/capabilities"
      );
    } finally {
      process.env = previous;
    }
  });
});
