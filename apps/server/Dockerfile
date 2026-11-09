# The server image. Build from the repo root (docker compose does this), since
# the server uses the workspace's shared package and lockfile.

FROM oven/bun:1.4.3-slim AS install
WORKDIR /app
# Every workspace's package.json, so the lockfile matches; only the server's
# production dependencies are installed. Scripts are skipped (Electron's
# postinstall isn't needed here).
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --ignore-scripts --filter @open-sales/server

FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules node_modules
COPY package.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
USER bun
WORKDIR /app/apps/server
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT ?? 8787) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "src/index.ts"]
