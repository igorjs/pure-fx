# Deno: install + run smoke tests against pre-built dist/
ARG BASE=debian:bookworm-slim
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl ca-certificates unzip bash; \
    else \
      apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates unzip && \
      rm -rf /var/lib/apt/lists/*; \
    fi

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --no-modify-path

COPY package.json ./
COPY dist/ ./dist/
COPY tests/ ./tests/

ENTRYPOINT ["sh", "-c", "deno run --allow-all tests/smoke-platform.mjs && deno run --allow-all tests/smoke-core.mjs"]
