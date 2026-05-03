# Bun distroless: run smoke tests against pre-built dist/ (no shell)
FROM oven/bun:distroless

WORKDIR /app

COPY package.json ./
COPY dist/ ./dist/
COPY tests/ ./tests/

ENTRYPOINT ["/usr/local/bin/bun", "tests/smoke-all.mjs"]
