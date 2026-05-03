# Workers: miniflare (Cloudflare Workers runtime) smoke test
ARG BASE=ubuntu:24.04
ARG NODE_VERSION=24
FROM ${BASE}
ARG NODE_VERSION

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip git xz-utils && \
    rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local/bin --skip-shell && \
    eval "$(fnm env)" && \
    fnm install ${NODE_VERSION} && \
    fnm default ${NODE_VERSION} && \
    (command -v corepack >/dev/null 2>&1 || npm install -g corepack) && corepack enable

ENV FNM_DIR=/root/.local/share/fnm
ENV PATH="/root/.local/share/fnm/aliases/default/bin:${PATH}"

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm add -D miniflare

COPY . .
RUN pnpm run build

ENTRYPOINT ["node", "tests/workers/run.mjs"]
