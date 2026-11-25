import { XMLParser } from "fast-xml-parser";
import type { NextcloudClient } from "./client.js";

export type FileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  permissions?: string;
  fileId?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeHrefPath(href: string, username: string, filesRoot: string): string {
  let pathname = href;
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) {
      pathname = new URL(href).pathname;
    }
  } catch {
    // keep raw href
  }

  const marker = `/remote.php/dav/files/${encodeURIComponent(username)}/`;
  const markerRaw = `/remote.php/dav/files/${username}/`;
  let relative = pathname;
  const idxEnc = pathname.indexOf(marker);
  const idxRaw = pathname.indexOf(markerRaw);
  if (idxEnc >= 0) {
    relative = pathname.slice(idxEnc + marker.length);
  } else if (idxRaw >= 0) {
    relative = pathname.slice(idxRaw + markerRaw.length);
  }

  relative = decodeURIComponent(relative).replace(/^\/+|\/+$/g, "");

  if (filesRoot) {
    const prefix = filesRoot.replace(/^\/+|\/+$/g, "");
    if (relative === prefix) return "";
    if (relative.startsWith(`${prefix}/`)) {
      relative = relative.slice(prefix.length + 1);
    }
  }

  return relative;
}

function parsePropfind(
  xml: string,
  client: NextcloudClient,
  includeSelf: boolean
): FileEntry[] {
  const doc = parser.parse(xml);
  const responses = asArray(doc?.multistatus?.response);
  const entries: FileEntry[] = [];

  for (const [index, response] of responses.entries()) {
    const href = String(response?.href ?? "");
    const propstat = asArray(response?.propstat)[0];
    const prop = propstat?.prop ?? {};
    const isDirectory = Boolean(prop?.resourcetype?.collection !== undefined);
    const path = decodeHrefPath(
      href,
      client.config.username,
      client.config.filesRoot
    );

    if (!includeSelf && index === 0) {
      // First response is usually the queried collection itself.
      continue;
    }

    const name =
      path.split("/").filter(Boolean).pop() ??
      (path === "" ? "/" : path);

    entries.push({
      path,
      name,
      isDirectory,
      size:
        prop.getcontentlength !== undefined
          ? Number(prop.getcontentlength)
          : undefined,
      contentType: prop.getcontenttype
        ? String(prop.getcontenttype)
        : undefined,
      etag: prop.getetag ? String(prop.getetag).replaceAll('"', "") : undefined,
      lastModified: prop.getlastmodified
        ? String(prop.getlastmodified)
        : undefined,
      permissions: prop.permissions ? String(prop.permissions) : undefined,
      fileId: prop.fileid !== undefined ? String(prop.fileid) : undefined,
    });
  }

  return entries;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
    <d:getetag/>
    <oc:permissions/>
    <oc:fileid/>
  </d:prop>
</d:propfind>`;

export async function listDirectory(
  client: NextcloudClient,
  path = "",
  depth: 0 | 1 = 1
): Promise<FileEntry[]> {
  const xml = await client.requestText(client.webdavFilesPath(path), {
    method: "PROPFIND",
    headers: {
      Depth: String(depth),
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: PROPFIND_BODY,
    okStatuses: [207],
  });
  return parsePropfind(xml, client, depth === 0);
}

export async function statPath(
  client: NextcloudClient,
  path: string
): Promise<FileEntry> {
  const entries = await listDirectory(client, path, 0);
  const entry = entries[0];
  if (!entry) {
    throw new Error(`Path not found: ${path || "/"}`);
  }
  return entry;
}

export async function readFile(
  client: NextcloudClient,
  path: string
): Promise<{ content: string; encoding: "utf8" | "base64"; contentType: string | null; bytes: number }> {
  const { buffer, contentType } = await client.requestBuffer(
    client.webdavFilesPath(path)
  );

  if (buffer.byteLength > client.config.maxReadBytes) {
    throw new Error(
      `File is ${buffer.byteLength} bytes; max allowed is ${client.config.maxReadBytes}. Increase NEXTCLOUD_MAX_READ_BYTES or use a smaller file.`
    );
  }

  const looksBinary =
    Boolean(contentType && !/^text\/|json|xml|javascript|svg/i.test(contentType)) ||
    buffer.includes(0);

  if (looksBinary) {
    return {
      content: buffer.toString("base64"),
      encoding: "base64",
      contentType,
      bytes: buffer.byteLength,
    };
  }

  return {
    content: buffer.toString("utf8"),
    encoding: "utf8",
    contentType,
    bytes: buffer.byteLength,
  };
}

export async function writeFile(
  client: NextcloudClient,
  path: string,
  content: string,
  encoding: "utf8" | "base64" = "utf8"
): Promise<{ path: string; bytes: number }> {
  const buffer =
    encoding === "base64"
      ? Buffer.from(content, "base64")
      : Buffer.from(content, "utf8");

  await client.request(client.webdavFilesPath(path), {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buffer.byteLength),
    },
    body: buffer,
    okStatuses: [201, 204],
  });

  return { path, bytes: buffer.byteLength };
}

export async function createDirectory(
  client: NextcloudClient,
  path: string
): Promise<{ path: string }> {
  await client.request(client.webdavFilesPath(path), {
    method: "MKCOL",
    okStatuses: [201],
  });
  return { path };
}

export async function deletePath(
  client: NextcloudClient,
  path: string
): Promise<{ path: string; deleted: true }> {
  await client.request(client.webdavFilesPath(path), {
    method: "DELETE",
    okStatuses: [204, 200],
  });
  return { path, deleted: true };
}

export async function movePath(
  client: NextcloudClient,
  from: string,
  to: string,
  overwrite = true
): Promise<{ from: string; to: string }> {
  await client.request(client.webdavFilesPath(from), {
    method: "MOVE",
    headers: {
      Destination: client.webdavDestination(to),
      Overwrite: overwrite ? "T" : "F",
    },
    okStatuses: [201, 204],
  });
  return { from, to };
}

export async function copyPath(
  client: NextcloudClient,
  from: string,
  to: string,
  overwrite = true
): Promise<{ from: string; to: string }> {
  await client.request(client.webdavFilesPath(from), {
    method: "COPY",
    headers: {
      Destination: client.webdavDestination(to),
      Overwrite: overwrite ? "T" : "F",
    },
    okStatuses: [201, 204],
  });
  return { from, to };
}
