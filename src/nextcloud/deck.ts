import type { NextcloudClient } from "./client.js";

const DECK_HEADERS = {
  "OCS-APIRequest": "true",
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function deckJson<T>(
  client: NextcloudClient,
  suffix: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {}
): Promise<T> {
  return client.requestJson<T>(client.deckPath(suffix), {
    method: options.method,
    query: options.query,
    headers: DECK_HEADERS,
    body: options.body === undefined ? null : JSON.stringify(options.body),
  });
}

export async function listBoards(
  client: NextcloudClient,
  details = false
): Promise<unknown> {
  return deckJson(client, "boards", {
    query: details ? { details: true } : undefined,
  });
}

export async function getBoard(
  client: NextcloudClient,
  boardId: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}`);
}

export async function createBoard(
  client: NextcloudClient,
  title: string,
  color: string
): Promise<unknown> {
  return deckJson(client, "boards", {
    method: "POST",
    body: { title, color: color.replace(/^#/, "") },
  });
}

export async function updateBoard(
  client: NextcloudClient,
  boardId: number,
  fields: Record<string, unknown>
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}`, {
    method: "PUT",
    body: fields,
  });
}

export async function deleteBoard(
  client: NextcloudClient,
  boardId: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}`, { method: "DELETE" });
}

export async function listStacks(
  client: NextcloudClient,
  boardId: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/stacks`);
}

export async function createStack(
  client: NextcloudClient,
  boardId: number,
  title: string,
  order: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/stacks`, {
    method: "POST",
    body: { title, order },
  });
}

export async function updateStack(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  title: string,
  order: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/stacks/${stackId}`, {
    method: "PUT",
    body: { title, order },
  });
}

export async function deleteStack(
  client: NextcloudClient,
  boardId: number,
  stackId: number
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/stacks/${stackId}`, {
    method: "DELETE",
  });
}

export async function getCard(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}`
  );
}

export async function createCard(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  input: {
    title: string;
    type?: string;
    order?: number;
    description?: string;
    duedate?: string | null;
  }
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/stacks/${stackId}/cards`, {
    method: "POST",
    body: {
      title: input.title,
      type: input.type ?? "plain",
      order: input.order ?? 999,
      description: input.description,
      duedate: input.duedate ?? null,
    },
  });
}

export async function updateCard(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  fields: Record<string, unknown>
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}`,
    {
      method: "PUT",
      body: fields,
    }
  );
}

export async function deleteCard(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}`,
    { method: "DELETE" }
  );
}

export async function reorderCard(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  order: number,
  targetStackId: number
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}/reorder`,
    {
      method: "PUT",
      body: { order, stackId: targetStackId },
    }
  );
}

export async function assignLabel(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  labelId: number
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}/assignLabel`,
    { method: "PUT", body: { labelId } }
  );
}

export async function removeLabel(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  labelId: number
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}/removeLabel`,
    { method: "PUT", body: { labelId } }
  );
}

export async function assignUser(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  userId: string
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}/assignUser`,
    { method: "PUT", body: { userId } }
  );
}

export async function unassignUser(
  client: NextcloudClient,
  boardId: number,
  stackId: number,
  cardId: number,
  userId: string
): Promise<unknown> {
  return deckJson(
    client,
    `boards/${boardId}/stacks/${stackId}/cards/${cardId}/unassignUser`,
    { method: "PUT", body: { userId } }
  );
}

export async function createLabel(
  client: NextcloudClient,
  boardId: number,
  title: string,
  color: string
): Promise<unknown> {
  return deckJson(client, `boards/${boardId}/labels`, {
    method: "POST",
    body: { title, color: color.replace(/^#/, "") },
  });
}

export async function listComments(
  client: NextcloudClient,
  cardId: number,
  limit = 20,
  offset = 0
): Promise<unknown> {
  // Comments live under OCS path in Deck API docs for some versions;
  // Deck exposes /index.php/apps/deck/api/v1.1/cards/{id}/comments as well.
  return deckJson(client, `cards/${cardId}/comments`, {
    query: { limit, offset },
  });
}

export async function createComment(
  client: NextcloudClient,
  cardId: number,
  message: string,
  parentId: number | null = null
): Promise<unknown> {
  return deckJson(client, `cards/${cardId}/comments`, {
    method: "POST",
    body: { message, parentId },
  });
}
