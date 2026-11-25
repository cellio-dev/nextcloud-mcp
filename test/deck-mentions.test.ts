import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDeckUserMention } from "../src/nextcloud/mentions.js";

describe("formatDeckUserMention", () => {
  it("quotes email-style uids", () => {
    assert.equal(
      formatDeckUserMention("chadelliott80@gmail.com"),
      '@"chadelliott80@gmail.com"'
    );
  });

  it("quotes uids with spaces", () => {
    assert.equal(formatDeckUserMention("Test User"), '@"Test User"');
  });

  it("uses plain @ for simple uids", () => {
    assert.equal(formatDeckUserMention("cursor"), "@cursor");
  });
});