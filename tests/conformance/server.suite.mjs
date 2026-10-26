// SPDX-License-Identifier: Apache-2.0
/** Request bodies, Set-Cookie, body limit and Host handling through the real adapter. */
const SMALL_LIMIT = 16;
const OVERSIZE = 64;
const STATUS_TOO_LARGE = 413;

export async function run(lib, t) {
  const { Server, json } = lib;
  const readAll = async req => {
    let bytes = 0;
    for await (const chunk of req.body) bytes += chunk.byteLength;
    return bytes;
  };
  const app = Server("conformance")
    .get("/ready", () => json({ ok: true }))
    .post("/json", async ctx => json({ echoed: await ctx.req.json() }, { status: 201 }))
    .post("/size", async ctx => json({ bytes: await readAll(ctx.req) }))
    .get("/url", ctx => json({ url: ctx.req.url }))
    .get("/cookies", () => {
      const headers = new Headers();
      headers.append("set-cookie", "a=1; Path=/");
      headers.append("set-cookie", "b=2; Path=/");
      return new Response("ok", { headers });
    });

  t.section("app.fetch");
  const direct = await app.fetch(
    new Request("http://localhost/json", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 1 }),
    }),
  );
  t.eq(direct.status, 201, "POST JSON status");
  t.eq((await direct.json()).echoed.n, 1, "POST JSON body round trip");
  const directCookies = (
    await app.fetch(new Request("http://localhost/cookies"))
  ).headers.getSetCookie();
  t.eq(directCookies.length, 2, "Set-Cookie stays two values");

  t.section("adapter");
  const chunked = (count, bytes) =>
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < count; i++) controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    });

  const server = await t.env.serve(app, {
    maxBodyBytes: SMALL_LIMIT,
    publicOrigin: "https://api.example.com",
  });
  try {
    const cookies = (await server.send("/cookies")).headers.getSetCookie();
    t.check(
      cookies.length === 2 && cookies[0].startsWith("a=1") && cookies[1].startsWith("b=2"),
      "two Set-Cookie values reach the client separately",
    );

    const small = await server.send("/size", { method: "POST", body: new Uint8Array(8) });
    t.eq((await small.json()).bytes, 8, "body under the limit is read in full");

    const streamed = await server.send("/size", {
      method: "POST",
      body: chunked(2, 4),
      duplex: "half",
    });
    t.eq((await streamed.json()).bytes, 8, "streamed body under the limit is read in full");

    const declared = await server.send("/size", { method: "POST", body: new Uint8Array(OVERSIZE) });
    t.eq(declared.status, STATUS_TOO_LARGE, "413 when Content-Length is over the limit");

    const overStream = await server.send("/size", {
      method: "POST",
      body: chunked(OVERSIZE / 8, 8),
      duplex: "half",
    });
    t.eq(overStream.status, STATUS_TOO_LARGE, "413 when a streamed body goes over the limit");
  } finally {
    await server.close();
  }

  t.section("host");
  if (t.env.rawRequest === undefined) {
    t.skip(
      "forged Host header",
      `not applicable on ${t.env.runtime}: the platform supplies request.url`,
    );
    return;
  }
  const origin = "https://api.example.com";
  const hosted = await t.env.serve(app, { publicOrigin: origin });
  try {
    const forged = await hosted.rawGet("/url", "Host: evil.example");
    t.eq(forged.status, 200, "forged Host header is served");
    t.eq(
      JSON.parse(forged.body.match(/\{.*\}/)[0]).url,
      `${origin}/url`,
      "forged Host does not change the origin",
    );
    const malformed = await hosted.rawGet("/url", "Host: not a host<>/\\@");
    t.check(
      malformed.status !== 200 ||
        JSON.parse(malformed.body.match(/\{.*\}/)[0]).url === `${origin}/url`,
      "malformed Host does not change the origin",
    );
  } finally {
    await hosted.close();
  }
}
