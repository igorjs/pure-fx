# Bun: install + build + test (fully independent)
ARG VARIANT=debian
FROM oven/bun:${VARIANT}

WORKDIR /app

COPY package.json ./
RUN bun install

ENV PATH="/app/node_modules/.bin:${PATH}"

COPY . .
RUN bun scripts/build.mjs

ENTRYPOINT ["sh", "-c", "bun tests/smoke-platform.mjs && bun tests/smoke-core.mjs"]
