# Deno: install + run smoke tests against pre-built dist/
# Requires docker build --build-context node-build=docker-image://... or a prior node build.
ARG BASE=ubuntu:24.04
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl ca-certificates unzip git bash libstdc++ gcompat; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates unzip git && \
      rm -rf /var/lib/apt/lists/*; \
    elif command -v dnf >/dev/null 2>&1; then \
      dnf install -y curl ca-certificates unzip git && \
      dnf clean all; \
    elif command -v pacman >/dev/null 2>&1; then \
      pacman -Syu --noconfirm curl ca-certificates unzip git; \
    fi

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --no-modify-path

COPY package.json ./
COPY dist/ ./dist/
COPY tests/ ./tests/

ENTRYPOINT ["sh", "-c", "deno run --allow-all tests/smoke-platform.mjs && deno run --allow-all tests/smoke-core.mjs"]
