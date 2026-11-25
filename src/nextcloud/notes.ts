import type { NextcloudClient } from "./client.js";

/**
 * Nextcloud Notes API (official Notes app).
 * Base: /index.php/apps/notes/api/v1
 */
function notesPath(suffix = ""): string {
  const clean = suffix.replace(/^\/+/, "");
  return `/index.php/apps/notes/api/v1/${clean}`.replace(/\/$/, "");
}

export async function listNotes(client: NextcloudClient): Promise<unknown> {
  return client.requestJson(notesPath("notes"), {
    headers: { Accept: "application/json" },
  });
}

export async function getNote(
  client: NextcloudClient,
  noteId: number
): Promise<unknown> {
  return client.requestJson(notesPath(`notes/${noteId}`), {
    headers: { Accept: "application/json" },
  });
}

export async function createNote(
  client: NextcloudClient,
  input: {
    title?: string;
    content?: string;
    category?: string;
    favorite?: boolean;
  }
): Promise<unknown> {
  return client.requestJson(notesPath("notes"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export async function updateNote(
  client: NextcloudClient,
  noteId: number,
  fields: Record<string, unknown>
): Promise<unknown> {
  return client.requestJson(notesPath(`notes/${noteId}`), {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
}

export async function deleteNote(
  client: NextcloudClient,
  noteId: number
): Promise<unknown> {
  return client.requestJson(notesPath(`notes/${noteId}`), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
}
