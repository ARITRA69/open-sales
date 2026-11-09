# Open Sales

An open-source, self-hosted sales pipeline for small sales teams. MIT licence.
"Open Sales" is a working name; rename it everywhere in one pass when it's
chosen (the package names `@open-sales/*`, `productName` in
`apps/desktop/package.json`, index.html, bundle ids in `apps/desktop/src/main/index.ts`
and `apps/desktop/scripts/dev.mjs`, the preload bridge `window.openSales`, the
sidebar label).

## Decisions so far

- **Self-host only.** No hosted version. Anyone can clone it and run their own.
- **Two parts.** A desktop app (built) and a server (not built yet).
  - Server: Sales API + Postgres, started with one Docker Compose command. The
    first person to open it creates the admin account.
  - Desktop app: asks for the company's server address on first launch. It must
    stay a desktop app, because AI help runs through each person's own Claude
    Code or Codex installed on their machine. The app never pays for or proxies AI.
- **Roles**, enforced in the server, not only hidden in the UI:
  - Admin: runs the instance, users, settings.
  - Manager: sees and edits everything, reassigns companies.
  - Member: a sales executive. Can read every company; can change only the
    companies they own. Every company has exactly one owner.
- **Generic, not company-specific.** Pipeline stages, custom fields, app name and
  logo are settings.
- **Sign-in:** built-in email and password, plus optional SSO (OIDC).
- **Server stack** (decided, not built yet):
  - Hono on Bun for the API, mounted under `/api/v1`.
  - Zod schemas in `packages/shared` describe every request and response; the
    API publishes them as OpenAPI (`@hono/zod-openapi`).
  - Drizzle for Postgres. Migrations are committed SQL files that run on server
    start, and only ever add: self-hosters upgrade by pulling a new image.
  - Better Auth for email and password, OIDC SSO and sessions. The app keeps its
    session token in the OS keychain (Electron `safeStorage`).
  - pg-boss for background jobs (imports, email and CRM sync), so Postgres is
    the only service the server needs.
  - Live updates: the server sends Postgres NOTIFY on each change and each
    server copy LISTENs, then pushes to apps over WebSockets (Hono's
    `upgradeWebSocket` on Bun). Events carry a type and an id, never the record
    (NOTIFY payloads max out near 8 KB); the app fetches the record through the
    normal, role-checked API. Events aren't stored, so on reconnect the app
    reloads what's on screen. The socket signs in with a short-lived ticket from
    the API, since a WebSocket can't send the usual auth header. Event shapes
    live in `packages/shared`. pg-boss does the work that must happen; events
    only say something changed.
- **Integrations** (all planned): CSV import, CRMs (HubSpot and others), email
  and calendar. Ship plain SMTP before Gmail/Outlook sign-in: those need each
  self-hoster to register their own Google or Microsoft app.
- **Releases:** auto-update from GitHub Releases. Unsigned builds show security
  warnings; signing needs an Apple developer account (about $99/year) and a
  Windows certificate. No packager (electron-builder or similar) is set up yet.

## Repo layout

A Bun workspace monorepo. Plain workspaces, no Turborepo or Nx.

- `apps/desktop`: the Electron app. Its own notes are in `apps/desktop/CLAUDE.md`.
- `apps/server`: the Sales API (not started yet).
- `packages/shared` (`@open-sales/shared`): types and rules both sides use, such
  as roles and `canEditCompany`. It ships TypeScript source, no build step;
  Vite and Bun read it directly. The desktop config bundles it into the main
  and preload code rather than loading it at runtime.
- Root: `tsconfig.base.json` (strict options every package extends), Prettier
  config, `bunfig.toml` (hoisted `node_modules`, which Electron packagers expect).

Anything the app and server must agree on (API shapes, validation, permission
rules) goes in `packages/shared`, never copied into both.

## Commands

```bash
bun install
bun run dev        # the desktop app
bun run typecheck  # also: lint, test, build; each runs in every package
bun run format
```

Run one package's scripts with `bun run --cwd apps/desktop <script>` or
`bun run --filter @open-sales/shared <script>`. Add a dependency from inside the
package that uses it (`cd apps/desktop && bun add x`).

## Next steps

1. Design the main screens (Today, Pipeline, Leads, Accounts, People, Reports,
   Playbooks, Settings) before building them.
2. Build the server: schema, roles, auth, first-run setup, Docker Compose.
3. Connect the app to the server; first-launch server address screen.
4. Integrations, starting with CSV import and SMTP.
5. Packaging, signing and auto-update.
