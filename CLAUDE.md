# Open Sales

An open-source, self-hosted sales pipeline for small sales teams. MIT licence.
"Open Sales" is a working name. To rename what users see, change
`apps/desktop/brand.config.json` and `productName` in
`apps/desktop/package.json` (a test fails if they differ). Internal names
(`@open-sales/*` packages, the `window.openSales` bridge, storage keys) can be
renamed separately when the name is chosen; users never see them.

## Positioning

AI-first sales, not a CRM with AI added on. In one line: the AI-first sales
platform you own: your server, your AI subscription, and no AI change without
a person's approval.

- AI does the work (fills in records, drafts follow-ups, prepares meetings,
  flags stalled deals) and people approve. AI writes are proposals the server
  checks against roles; nothing changes until someone says yes.
- What sets it apart: no AI bill (each person's own Claude Code or Codex),
  self-hosted with an MIT licence, and approve-first AI with an audit trail.
- What it must overcome: getting started is harder (installing an AI tool and
  running a server), and AI is only as good as its data, so automatic email,
  calendar and call capture matters more than manual entry.

### Competitors (researched November 2026)

- AI-first, closed, cloud-only: Lightfield (AI fills in the CRM from calls and
  email, and writes without asking), Day AI (assistant + CRM + knowledge base),
  Attio (flexible data model, AI in a side panel), Monaco, Rox, Clarify.
- Established CRMs adding AI: HubSpot Breeze, Salesforce Agentforce, Pipedrive,
  Zoho Zia. Metered AI, older screens.
- Open source: Twenty (AGPL, CRM first, AI on metered credits), DenchClaw (MIT,
  local and single-person, no team or roles). Older: EspoCRM, SuiteCRM, Odoo.

## Decisions so far

- **Self-host only.** No hosted version. Anyone can clone it and run their own.
- **Two parts.** A desktop app (built) and a server (started: health check,
  first-run setup, sign-in, the join link, and the API for companies, people,
  deals and the pipeline, which the app's Accounts, People and Pipeline
  pages use).
  - Server: Sales API + Postgres, started with one Docker Compose command. The
    first person to connect from the desktop app creates the admin account
    there. Its only web page is `/join/<token>`: what the team's join link
    opens in a browser, with "Open the app" (`open-sales://join?link=…`; the
    scheme is `urlScheme` in the brand config and `APP_URL_SCHEME` on the
    server).
  - Desktop app: asks for the company's server address on first launch. It must
    stay a desktop app, because AI help runs through each person's own Claude
    Code or Codex installed on their machine. The app never pays for or proxies AI.
- **Roles**, enforced in the server, not only hidden in the UI:
  - Admin: runs the instance, users, settings.
  - Manager: sees and edits everything, reassigns companies.
  - Member: a sales executive. Can read every company; can change only the
    companies they own. Every company has exactly one owner.
- **Generic, not company-specific.** Pipeline stages and custom fields are
  settings.
- **White label.** A self-hoster can rebrand it as their own product. MIT
  allows this, and "Powered by Open Sales" can be turned off. Two levels:
  - In the app, from server settings, no rebuild: product name, logo, brand
    colour, the AI assistant's name, sign-in screen, and email sender and
    footer. The app fetches the brand when it connects. The brand colour
    overrides the primary and accent tokens at runtime, with a contrast check.
  - The desktop app itself, which needs a rebuild: name in the dock or menu
    bar, icon, installer, bundle id, update feed and code signing. One brand
    config file and a build script do this, so nobody edits code to rebrand.
  - So never hard-code "Open Sales" in what users see. The defaults live in
    `apps/desktop/brand.config.json` (product name, app id; icon, colours and
    update feed join it when packaging is set up). The renderer reads the
    brand with `useBrand()`; the main process and `scripts/dev.mjs` read the
    config file. The `TBrand` shape is in `packages/shared`, ready for the
    server's branding settings.
- **Sign-in:** built-in email and password, plus optional SSO (OIDC).
- **Joining a team:** one shared join link (Settings › Join link), not
  per-person invites. People at the trusted email domain join at once;
  everyone else is `pending` until an admin approves on Today or in Settings ›
  Team. Only `active` users get a session. The app takes the link from the
  browser page or pasted into its first box, and waits for approval by
  polling with a ticket. Email (SMTP) isn't needed. Per-person invites with
  higher roles come later.
- **Server stack** (decided; Hono, Drizzle and Docker Compose are in place):
  - Hono on Bun for the API, mounted under `/api/v1`.
  - Zod schemas in `packages/shared` describe every request and response; the
    API publishes them as OpenAPI (`@hono/zod-openapi`).
  - Drizzle for Postgres. Migrations are committed SQL files that run on server
    start, and only ever add: self-hosters upgrade by pulling a new image.
    The driver is `postgres` 3.4: version 4 crashes under Bun when the database
    drops a connection, so don't upgrade it without testing that.
  - Better Auth (1.7) for email and password, OIDC SSO (later) and sessions,
    mounted at `/api/v1/auth` with the bearer plugin. Open sign-up is blocked
    in Hono (`/auth/sign-up/*` returns 404): accounts come from first-run setup
    (`POST /api/v1/setup`) and the join link (`POST /api/v1/join`). A
    `user.create` hook makes the first user an active admin and everyone after
    a pending member; a `session.create` hook refuses anyone not `active`.
    Clients can't set `role` or `status`. `autoSignIn` is off: setup and
    joining sign in explicitly. Admin routes live under `/api/v1/team`. The
    signing secret is `AUTH_SECRET` if set, else generated once and kept in
    `instance_setting`.
  - The desktop app's main process is the API client: it calls the server,
    stores the server address in userData and the session token encrypted
    with `safeStorage`. The renderer never sees the token; it asks the main
    process through `window.openSales.connection` (see
    `apps/desktop/src/preload/bridge-types.ts`).
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
- `apps/server` (`@open-sales/server`): the Sales API. `src/app.ts` builds the
  Hono app (routes under `/api/v1`, dependencies passed in so tests need no
  database); `src/index.ts` reads settings, runs migrations, then serves.
  `src/db/schema.ts` is the Drizzle schema (workspace, Better Auth's tables,
  instance settings, the join link, and the sales records); `drizzle/` holds
  the generated SQL migrations. `src/db/ids.ts` makes the UUIDv7 ids (not
  `Bun.randomUUIDv7()`: tests run under Node). `src/auth.ts` sets up Better
  Auth, `src/setup.ts` is first-run setup, `src/team.ts` the join link and
  `src/secret.ts` the signing secret. `src/http.ts` has the request helpers
  every route uses. Its Dockerfile builds from the repo root.
  - `src/records/`: companies, people, deals and the pipeline. Each service
    checks roles with the rules in `packages/shared/src/roles.ts`, refuses
    changes made against an old `version` (409 `changed_since`), and writes
    every change to `change_log` in the same transaction. Archiving a company
    archives its people and open deals with one timestamp, and restoring it
    brings back exactly those. Giving a company a new owner moves the old
    owner's open deals with it. `routes.ts` mounts them under `/api/v1`
    (`/companies`, `/people`, `/deals`: list, get, create, `PATCH`,
    `/:id/archive`, `/:id/restore`; `/pipeline` and `/pipeline/board`).
- `packages/shared` (`@open-sales/shared`): types and rules both sides use, such
  as roles and `canEditCompany`. It ships TypeScript source, no build step;
  Vite and Bun read it directly. The desktop config bundles it into the main
  and preload code rather than loading it at runtime.
- `docs`: product docs. `features.md` (what it does, by priority),
  `user-flows.md` (step-by-step journeys) and `data-model.md` (tables, indexes
  and the queries they serve; read it before changing the schema). Update them
  when a decision changes.
- Root: `tsconfig.base.json` (strict options every package extends), Prettier
  config, `bunfig.toml` (hoisted `node_modules`, which Electron packagers expect).

Anything the app and server must agree on (API shapes, validation, permission
rules) goes in `packages/shared`, never copied into both.

## Conventions

- File and folder names are always kebab-case: `sales-sidebar.tsx`,
  `use-brand.ts`, `components-sheet/`. This includes screens and pages.
  Dots only for a file's role (`brand-config.test.ts`, `brand.config.json`).
  Standard names keep their usual form: `README.md`, `CLAUDE.md`, `LICENSE`.
- Names in code follow one style across the app, the server and
  `packages/shared`:

  | What                                     | Style                  | Example                     |
  | ---------------------------------------- | ---------------------- | --------------------------- |
  | Files and folders                        | kebab-case             | `deal-routes.ts`            |
  | Functions and variables (app and server) | camelCase              | `canEditCompany`, `ownerId` |
  | Types                                    | PascalCase, `T` prefix | `TBrand`, `TDeal`           |
  | React components                         | PascalCase             | `SalesSidebar`              |
  | Constants                                | SCREAMING_SNAKE        | `SIDEBAR_OPEN_KEY`          |
  | Database tables and columns              | snake_case             | `deals.owner_id`            |
  | API JSON fields                          | camelCase              | `{ "ownerId": "…" }`        |
  | Environment variables                    | SCREAMING_SNAKE        | `DATABASE_URL`              |

  Code stays camelCase because Hono, Drizzle, Zod and Better Auth are, and
  shared code serves both sides. Drizzle's `casing: 'snake_case'` maps
  `ownerId` in code to `owner_id` in Postgres, so nobody converts by hand.

- Migration files are Drizzle's number plus a kebab-case name
  (`0000_create-workspace.sql`): run `bun run db:generate <name>` in
  `apps/server`.

## Commands

```bash
bun install
bun run dev          # the desktop app
bun run dev:server   # the server with hot reload (starts Docker and Postgres)
docker compose up -d # the server and Postgres, as self-hosters run them
bun run typecheck    # also: lint, test, build; each runs in every package
bun run --cwd apps/server test:db  # server tests against Postgres
bun run format
```

`test:db` runs the tests that need a real database
(`src/records/records.db.test.ts`) against `open_sales_test` in the dev
Postgres, which it creates and empties; the normal `test` skips them, so the
pre-push hook stays quick. The server answers at
`http://localhost:8787/api/v1/health`. Postgres listens
on `localhost:5433` (not 5432, which another project may use). Settings come
from `.env` beside `docker-compose.yml`; see `.env.example`.

`bun run dev:server` (`apps/server/scripts/dev.ts`) does everything the server
needs in development: it opens Docker Desktop or OrbStack on a Mac if Docker
isn't running, stops the server container (it holds port 8787), starts the
database container, makes `apps/server/.env` from `.env.example` the first
time, then runs the server with `bun --watch`. Ctrl+C stops the server; the
database keeps running (`docker compose stop db`).

Both dev scripts print short, coloured steps (`styleText`, so no colours when
the output isn't a terminal) instead of the tools' build reports. They tidy
lines they recognise and show everything else, such as errors, as it is. The
server script recognises the two lines `src/index.ts` prints at start, so
change both together.

Git hooks (Husky, installed by `bun install`):

- pre-commit: lint-staged formats staged files with Prettier and lints them
  with ESLint. Each package has its own `.lintstagedrc.json`, so ESLint runs
  from inside the package, as `bun run lint` does (the desktop config uses
  paths relative to `apps/desktop`). Root files and `docs` only get Prettier.
- pre-push: `bun run typecheck && bun run test` (about 15 seconds).
- Fix the problem rather than skipping a hook; `--no-verify` is for
  emergencies.

Run one package's scripts with `bun run --cwd apps/desktop <script>` or
`bun run --filter @open-sales/shared <script>`. Add a dependency from inside the
package that uses it (`cd apps/desktop && bun add x`).

## Next steps

1. Design the main screens (Today, Pipeline, Leads, Accounts, People, Reports,
   Playbooks, Settings) before building them.
2. Accounts, people and deals: record pages (an account with its people,
   deals and timeline), then CSV import. (Done: sign-in, the join link, the
   schema and API for companies, people, deals and the pipeline with
   server-side role checks, and the Accounts, People and Pipeline pages.)
3. Proposals and the MCP bridge, so Claude Code or Codex read records and
   propose changes as the signed-in person; then Today. Invites and user
   management come with Settings.
4. Integrations, starting with CSV import and SMTP.
5. Packaging, signing and auto-update.
