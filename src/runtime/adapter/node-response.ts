// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/node-response
 *
 * Writes WHATWG Responses to a Node.js ServerResponse. Internal to the Node
 * adapter and not part of the package exports.
 */

const STATUS_INTERNAL_SERVER_ERROR = 500;
const SET_COOKIE = "set-cookie";

/** Subset of node:http ServerResponse used by this adapter. */
export interface NodeResponse {
  readonly headersSent: boolean;
  readonly destroyed?: boolean | undefined;
  writeHead(status: number, headers: Record<string, string | string[]>): void;
  write(chunk: Uint8Array): boolean;
  end(body?: string | Uint8Array): void;
  destroy(err?: Error): void;
  once(event: "drain" | "close", cb: () => void): void;
  removeListener(event: "drain" | "close", cb: () => void): void;
}

/** Reply with a plain-text status on a response whose headers have not been sent yet. */
export const sendPlain = (nodeRes: NodeResponse, status: number, message: string): void => {
  // Closing the connection also drops any unread request body.
  nodeRes.writeHead(status, { "content-type": "text/plain", connection: "close" });
  nodeRes.end(message);
};

/** Reply 500 on a response whose headers have not been sent yet. */
export const sendInternalError = (nodeRes: NodeResponse): void => {
  sendPlain(nodeRes, STATUS_INTERNAL_SERVER_ERROR, "Internal Server Error");
};

/**
 * Write a WHATWG Response back to Node.js ServerResponse.
 * Chunks are streamed via res.write(), pausing for `drain` when the socket
 * buffer is full. A body read error sends 500 if no header has gone out yet,
 * otherwise destroys the response, then rethrows for the caller to report.
 */
export const writeResponse = async (response: Response, nodeRes: NodeResponse): Promise<void> => {
  // Headers are written with the first chunk so a failure before it can still become a 500.
  const sendHead = (): void => {
    if (nodeRes.headersSent) return;
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((v, k) => {
      if (k !== SET_COOKIE) headers[k] = v;
    });
    // forEach joins Set-Cookie values into one line, which breaks the cookies.
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers[SET_COOKIE] = cookies;
    nodeRes.writeHead(response.status, headers);
  };

  if (response.body === null) {
    sendHead();
    nodeRes.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      sendHead();
      if (done) {
        nodeRes.end();
        return;
      }
      if (nodeRes.destroyed === true) {
        await reader.cancel();
        return;
      }
      if (!nodeRes.write(value)) {
        await new Promise<void>(resolve => {
          const settle = (): void => {
            nodeRes.removeListener("drain", settle);
            nodeRes.removeListener("close", settle);
            resolve();
          };
          nodeRes.once("drain", settle);
          nodeRes.once("close", settle);
        });
      }
    }
  } catch (err: unknown) {
    if (nodeRes.headersSent) {
      nodeRes.destroy(err instanceof Error ? err : undefined);
    } else {
      sendInternalError(nodeRes);
    }
    throw err;
  }
};
