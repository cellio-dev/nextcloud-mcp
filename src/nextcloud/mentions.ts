/**
 * Format a Deck card comment @-mention for a Nextcloud user id (uid).
 * Display names do not work — use the login uid. Uids containing @, space, or |
 * must use the quoted form (@"user@example.com") or Deck shows "Unknown account".
 */
export function formatDeckUserMention(userId: string): string {
  const uid = userId.trim();
  if (!uid) return "";
  if (/[\s@|]/.test(uid)) {
    const escaped = uid.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `@"${escaped}"`;
  }
  return `@${uid}`;
}