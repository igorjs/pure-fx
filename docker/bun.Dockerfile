# Bun: install + build + test (fully independent)
ARG BASE=ubuntu:24.04
FROM ${BASE}

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl ca-certificates unzip git bash libstdc++ gcompat; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates unzip git xz-utils && \
      rm -rf /var/lib/apt/lists/*; \
    elif command -v dnf >/dev/null 2>&1; then \
      dnf install -y curl ca-certificates unzip git xz tar findutils && \
      dnf clean all; \
    elif command -v pacman >/dev/null 2>&1; then \
      pacman -Syu --noconfirm curl ca-certificates unzip git; \
    fi

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash || \
    echo "WARN: Bun install failed (expected on musl), skipping"

COPY package.json ./
RUN if command -v bun >/dev/null 2>&1; then bun install; fi

COPY . .
RUN if command -v bun >/dev/null 2>&1; then bun scripts/build.mjs; fi

ENTRYPOINT ["sh", "-c", "bun tests/smoke-platform.mjs && bun tests/smoke-core.mjs"]
