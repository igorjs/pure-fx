# Deno: run smoke tests against pre-built dist/
ARG VARIANT=debian
FROM denoland/deno:${VARIANT}

WORKDIR /app

COPY package.json ./
COPY dist/ ./dist/
COPY tests/ ./tests/

ENTRYPOINT ["deno", "run", "--allow-all", "tests/smoke-platform.mjs"]
