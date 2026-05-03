// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/lambda
 *
 * AWS Lambda adapter for the pure-fx server module.
 *
 * Converts between API Gateway HTTP API v2 / Lambda Function URL events
 * and WHATWG Request/Response, so server handlers work unchanged in Lambda.
 *
 * Two export shapes cover different deployment targets:
 * - {@link toLambdaHandler}: buffered response, returns {@link LambdaResult}
 * - {@link toLambdaStreamHandler}: streaming response via awslambda.streamifyResponse
 *
 * All Lambda types are structural (zero dependencies on `@types/aws-lambda`).
 */

import type { ServerBuilder } from "../../server.js";

// ── Structural types (zero deps, no @types/aws-lambda) ─────────────────────

/** API Gateway HTTP API v2 / Lambda Function URL event shape. */
export interface LambdaEvent {
  readonly rawPath: string;
  readonly rawQueryString: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly requestContext: {
    readonly http: { readonly method: string };
  };
  readonly body?: string | undefined;
  readonly isBase64Encoded?: boolean | undefined;
}

/** Buffered Lambda response shape. */
export interface LambdaResult {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly isBase64Encoded: boolean;
}

/** Minimal structural type for Lambda streaming via awslambda.streamifyResponse. */
interface ResponseStream {
  write(chunk: Uint8Array | string): boolean;
  end(): void;
  setContentType(type: string): void;
}

// ── Event to Request conversion ─────────────────────────────────────────────

/**
 * Build a WHATWG Request from a Lambda event.
 * Handles base64-encoded bodies from API Gateway binary payloads.
 */
const toRequest = (event: LambdaEvent): Request => {
  const method = event.requestContext.http.method;
  const query = event.rawQueryString.length > 0 ? `?${event.rawQueryString}` : "";
  const host = event.headers["host"] ?? "lambda.local";
  const url = `https://${host}${event.rawPath}${query}`;

  let body: string | undefined;
  if (event.body !== undefined) {
    body = event.isBase64Encoded === true ? atob(event.body) : event.body;
  }

  const headerPairs: [string, string][] = [];
  const keys = Object.keys(event.headers);
  // biome-ignore lint/style/useForOf: hot-path, indexed loop avoids iterator allocation
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const val = event.headers[key];
    if (val !== undefined) {
      headerPairs.push([key, val]);
    }
  }

  return new Request(url, {
    method,
    headers: headerPairs,
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
  });
};

// ── Response to Lambda result conversion ────────────────────────────────────

/**
 * Flatten WHATWG Headers into a plain Record for Lambda.
 * Multi-value headers are collapsed by the Headers API itself (comma-separated).
 */
const flattenHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((v, k) => {
    result[k] = v;
  });
  return result;
};

/**
 * Determine whether a content-type is textual (safe to return as plain string).
 * Binary content must be base64-encoded in the Lambda response.
 */
const isTextContent = (contentType: string | null): boolean => {
  if (contentType === null) return true;
  return (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("yaml") ||
    contentType.includes("csv")
  );
};

/**
 * Convert a WHATWG Response into a buffered {@link LambdaResult}.
 * Text payloads are returned as-is; binary payloads are base64-encoded.
 */
const toResult = async (response: Response): Promise<LambdaResult> => {
  const contentType = response.headers.get("content-type");
  const isText = isTextContent(contentType);

  if (isText) {
    const body = await response.text();
    return {
      statusCode: response.status,
      headers: flattenHeaders(response.headers),
      body,
      isBase64Encoded: false,
    };
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Encode iteratively to avoid stack overflow from spreading large arrays
  let binary = "";
  // biome-ignore lint/style/useForOf: hot-path, indexed loop for binary encoding
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const body = btoa(binary);
  return {
    statusCode: response.status,
    headers: flattenHeaders(response.headers),
    body,
    isBase64Encoded: true,
  };
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a buffered Lambda handler from a server builder.
 *
 * Returns a function compatible with API Gateway HTTP API v2 and
 * Lambda Function URLs. The entire response body is buffered before
 * returning to Lambda.
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-fx";
 * import { toLambdaHandler } from "@igorjs/pure-fx/runtime/adapter/lambda";
 *
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }));
 *
 * export const handler = toLambdaHandler(app);
 * ```
 */
export const toLambdaHandler = (
  server: ServerBuilder,
): ((event: LambdaEvent) => Promise<LambdaResult>) => {
  const fetch = server.fetch;
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const request = toRequest(event);
    const response = await fetch(request);
    return toResult(response);
  };
};

/**
 * Create a streaming Lambda handler from a server builder.
 *
 * Returns a function that streams the response body chunk-by-chunk
 * via the `awslambda.streamifyResponse` ResponseStream protocol.
 * The caller wraps the returned function with `awslambda.streamifyResponse`.
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-fx";
 * import { toLambdaStreamHandler } from "@igorjs/pure-fx/runtime/adapter/lambda";
 *
 * const app = Server("api")
 *   .get("/stream", () => new Response("streamed"));
 *
 * // awslambda is the Lambda runtime global
 * export const handler = awslambda.streamifyResponse(
 *   toLambdaStreamHandler(app),
 * );
 * ```
 */
export const toLambdaStreamHandler = (
  server: ServerBuilder,
): ((event: LambdaEvent, responseStream: ResponseStream) => Promise<void>) => {
  const fetch = server.fetch;
  return async (event: LambdaEvent, responseStream: ResponseStream): Promise<void> => {
    const request = toRequest(event);
    const response = await fetch(request);

    const contentType = response.headers.get("content-type");
    if (contentType !== null) {
      responseStream.setContentType(contentType);
    }

    if (response.body === null) {
      responseStream.end();
      return;
    }

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        responseStream.end();
        return;
      }
      responseStream.write(value);
    }
  };
};
