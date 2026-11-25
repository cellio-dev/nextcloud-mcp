import type { NextcloudClient } from "./client.js";

type OcsEnvelope<T> = {
  ocs: {
    meta: { status: string; statuscode: number; message: string };
    data: T;
  };
};

async function ocsJson<T>(
  client: NextcloudClient,
  suffix: string,
  options: {
    method?: string;
    body?: URLSearchParams | Record<string, string> | null;
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {}
): Promise<T> {
  let body: string | null = null;
  const headers: Record<string, string> = {
    "OCS-APIRequest": "true",
    Accept: "application/json",
  };

  if (options.body instanceof URLSearchParams) {
    body = options.body.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (options.body) {
    const params = new URLSearchParams(options.body);
    body = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const envelope = await client.requestJson<OcsEnvelope<T>>(
    client.ocsPath(suffix),
    {
      method: options.method,
      query: options.query,
      headers,
      body,
    }
  );

  if (envelope?.ocs?.meta && envelope.ocs.meta.statuscode >= 400) {
    throw new Error(
      `OCS error ${envelope.ocs.meta.statuscode}: ${envelope.ocs.meta.message}`
    );
  }

  return envelope.ocs.data;
}

export async function listShares(
  client: NextcloudClient,
  path?: string,
  sharedWithMe = false
): Promise<unknown> {
  return ocsJson(client, "apps/files_sharing/api/v1/shares", {
    query: {
      path: path || undefined,
      shared_with_me: sharedWithMe ? "true" : undefined,
    },
  });
}

export async function createShare(
  client: NextcloudClient,
  input: {
    path: string;
    shareType: number;
    shareWith?: string;
    permissions?: number;
    password?: string;
    expireDate?: string;
    note?: string;
    label?: string;
  }
): Promise<unknown> {
  const body = new URLSearchParams();
  body.set("path", input.path);
  body.set("shareType", String(input.shareType));
  if (input.shareWith) body.set("shareWith", input.shareWith);
  if (input.permissions !== undefined) {
    body.set("permissions", String(input.permissions));
  }
  if (input.password) body.set("password", input.password);
  if (input.expireDate) body.set("expireDate", input.expireDate);
  if (input.note) body.set("note", input.note);
  if (input.label) body.set("label", input.label);

  return ocsJson(client, "apps/files_sharing/api/v1/shares", {
    method: "POST",
    body,
  });
}

export async function deleteShare(
  client: NextcloudClient,
  shareId: number
): Promise<unknown> {
  return ocsJson(client, `apps/files_sharing/api/v1/shares/${shareId}`, {
    method: "DELETE",
  });
}

export async function getCapabilities(client: NextcloudClient): Promise<unknown> {
  return ocsJson(client, "cloud/capabilities");
}

export async function getUserStatus(client: NextcloudClient): Promise<unknown> {
  return ocsJson(client, "cloud/user");
}

export async function searchFiles(
  client: NextcloudClient,
  term: string,
  limit = 25
): Promise<unknown> {
  return ocsJson(client, "search/providers/files/search", {
    query: { term, limit },
  });
}
