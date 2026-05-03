# Node: install + build + test
ARG BASE=ubuntu:24.04
ARG NODE_VERSION=24
FROM ${BASE}
ARG NODE_VERSION

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

RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /usr/local/bin --skip-shell && \
    eval "$(fnm env)" && \
    fnm install ${NODE_VERSION} && \
    fnm default ${NODE_VERSION} && \
    corepack enable

ENV FNM_DIR=/root/.local/share/fnm
ENV PATH="/root/.local/share/fnm/aliases/default/bin:${PATH}"

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENTRYPOINT ["node", "scripts/test-matrix.mjs", "--verbose", "--runtime", "node"]
