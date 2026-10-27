// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/body-limit
 *
 * Request body cap and plain-text replies shared by the Bun and Workers
 * adapters. Internal and not part of the package exports.
 */

const STATUS_PAYLOAD_TOO_LARGE = 413;

/** Tracks whether a request body went over the size limit while streaming. */
export interface BodyLimit {
  exceeded: boolean;
}

/** Pass chunks through, erroring the stream once more than `maxBodyBytes` have arrived. */
export const limitBodyStream = (
  body: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
  limit: BodyLimit,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let received = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > maxBodyBytes) {
        limit.exceeded = true;
        await reader.cancel();
        controller.error(new Error(`Request body exceeds ${maxBodyBytes} bytes`));
        return;
      }
      controller.enqueue(value);
    },
    cancel: reason => reader.cancel(reason),
  });
};

/** A plain-text response with the given status. */
export const plain = (status: number, message: string): Response =>
  new Response(message, { status, headers: { "content-type": "text/plain" } });

/** The 413 reply for a request body over the limit. */
export const payloadTooLarge = (): Response => plain(STATUS_PAYLOAD_TOO_LARGE, "Payload Too Large");
