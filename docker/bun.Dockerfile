# Bun: install + build + test (fully independent)
ARG BASE=debian:bookworm-slim
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip && \
    rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

COPY package.json ./
RUN bun install

ENV PATH="/app/node_modules/.bin:${PATH}"

COPY . .
RUN bun scripts/build.mjs

ENTRYPOINT ["sh", "-c", "bun tests/smoke-platform.mjs && bun tests/smoke-core.mjs"]
