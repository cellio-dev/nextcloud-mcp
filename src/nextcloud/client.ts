import type { AppConfig } from "../config.js";

export class NextcloudError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "NextcloudError";
    this.status = status;
    this.body = body;
  }
}

export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array | null;
  query?: Record<string, string | number | boolean | undefined | null>;
  expectJson?: boolean;
  /** When true, treat 2xx and listed statuses as success. */
  okStatuses?: number[];
};

export class NextcloudClient {
  readonly config: AppConfig;
  private readonly authHeader: string;

  constructor(config: AppConfig) {
    this.config = config;
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.username}:${config.appPassword}`, "utf8").toString(
        "base64"
      );
  }

  url(path: string, query?: RequestOptions["query"]): string {
    const base = this.config.nextcloudUrl.replace(/\/+$/, "");
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${base}${normalized}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "User-Agent": "nextcloud-mcp/1.0",
      ...options.headers,
    };

    let body: BodyInit | undefined;
    if (options.body === null || options.body === undefined) {
      body = undefined;
    } else if (typeof options.body === "string") {
      body = options.body;
    } else {
      body = Uint8Array.from(options.body);
    }

    const response = await fetch(this.url(path, options.query), {
      method,
      headers,
      body,
    });

    const okStatuses = options.okStatuses ?? [];
    const ok =
      (response.status >= 200 && response.status < 300) ||
      okStatuses.includes(response.status);

    if (!ok) {
      const body = await response.text();
      throw new NextcloudError(
        `Nextcloud ${method} ${path} failed (${response.status})`,
        response.status,
        body.slice(0, 2000)
      );
    }

    return response;
  }

  async requestJson<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const response = await this.request(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(path, options);
    return response.text();
  }

  async requestBuffer(
    path: string,
    options: RequestOptions = {}
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    const response = await this.request(path, options);
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type"),
    };
  }

  /** Deck REST API base (index.php path used by Deck docs). */
  deckPath(suffix: string): string {
    const clean = suffix.replace(/^\/+/, "");
    return `/index.php/apps/deck/api/v1.1/${clean}`;
  }

  /** OCS v2 API helper. */
  ocsPath(suffix: string): string {
    const clean = suffix.replace(/^\/+/, "");
    return `/ocs/v2.php/${clean}`;
  }

  webdavFilesPath(relativePath = ""): string {
    const root = this.config.filesRoot;
    const parts = [
      "remote.php/dav/files",
      encodeURIComponent(this.config.username),
    ];
    if (root) {
      for (const segment of root.split("/").filter(Boolean)) {
        parts.push(encodeURIComponent(segment));
      }
    }
    for (const segment of relativePath.split("/").filter(Boolean)) {
      parts.push(encodeURIComponent(segment));
    }
    return `/${parts.join("/")}`;
  }

  /** Absolute Destination header value for MOVE/COPY. */
  webdavDestination(relativePath: string): string {
    return this.url(this.webdavFilesPath(relativePath));
  }
}

export function textResult(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

export function errorResult(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  if (error instanceof NextcloudError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              status: error.status,
              body: safeParseBody(error.body),
            },
            null,
            2
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
  };
}

function safeParseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
