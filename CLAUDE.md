# Open Sales

An open-source, self-hosted sales pipeline for small sales teams. MIT licence.
"Open Sales" is a working name; rename it everywhere in one pass when it's
chosen (package.json, index.html, bundle ids in `src/main/index.ts` and
`scripts/dev.mjs`, the preload bridge `window.openSales`, the sidebar label).

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
- **Integrations** (all planned): CSV import, CRMs (HubSpot and others), email
  and calendar. Ship plain SMTP before Gmail/Outlook sign-in: those need each
  self-hoster to register their own Google or Microsoft app.
- **Releases:** auto-update from GitHub Releases. Unsigned builds show security
  warnings; signing needs an Apple developer account (about $99/year) and a
  Windows certificate. No packager (electron-builder or similar) is set up yet.

## Stack and commands

Electron 45, electron-vite 6, Vite 8, React 19, Tailwind 4, Bun, Vitest.

```bash
bun install
bun run dev        # also: typecheck, lint, test, build
bunx electron scripts/make-app-icon.mjs   # redraws build/icon.*
```

- `bun run dev` runs `scripts/dev.mjs`. A Mac takes the menu bar name from the app
  bundle, so this runs a renamed copy of Electron from `node_modules/.dev-app`.
  Never edit the installed Electron bundle in `node_modules/electron`.
  `bun run start` still says "Electron" in the menu bar.
- Page screenshots don't show the Mac traffic lights. To check the real window,
  use `screencapture -l <window id>`.

## Code layout

- `src/main`: window setup. Mac: hidden title bar, traffic lights at x 16, y 19.
  Windows: icon from `build/icon.ico` and an app user model id.
- `src/preload`: exposes `window.openSales` (platform only, so far).
- `src/renderer/src/components/ui`: the UI kit. `components/sales`: app-specific
  parts (AppShell, sidebar, window controls, Ask AI panel).
- The kit is built on shadcn/ui patterns and Radix (`radix-ui`), with cva for
  variants. Menus, selects and popovers share `components/ui/popup.ts`; text
  that changes uses `AnimatedLabel`. Tests run with motion animations skipped
  (`src/renderer/src/test-setup.ts`).
- `screens/components-sheet`: every component on one page. The app opens on it;
  real screens aren't built yet.
- Styles: `tokens.css` is the only place a colour value is written. Motion and
  things Tailwind can't express go in `components.css` or `sales.css`.
- Lint enforces the shadcn rules (`no-arbitrary-values`, `no-restyle`,
  `no-raw-colors`). Tests that touch `localStorage` need
  `// @vitest-environment jsdom`.

### Window frame

Like the Claude desktop app: the sidebar runs to the top edge with the traffic
lights in it. A 52px top bar with a hairline holds the page title. The sidebar
toggle and back/forward buttons sit beside the lights (they end about 76px in,
so the controls start at 80px). ⌘B / Ctrl+B toggles the sidebar, which slides
rather than snapping, and remembers its state.

## Design rules

- Desktop first: wide screens, keyboard and hover. Check at about 1040px wide as
  well as 1440px.
- Users may be older and non-technical: familiar controls, large type, words
  instead of icons, everyday language, one obvious primary button.
- Colours come only from `tokens.css`. Light theme only. Add a token rather than
  a colour value.
- The accent is graphite, nearly as dark as primary. Anything that relies on it
  to stand out (unread, needs you, progress) also gets a dot, a count or a pale
  `accent-soft` fill.
- No hard borders or black rings for selected states: use a white card on a soft
  shadow, or a light grey tile. Buttons never wrap; pill-shaped; one black
  primary plus a grey or text secondary.
- Reuse components (Table, Menu, FloatBar, Field…) before building new markup;
  extend a component rather than copy it. Selection = hover checkboxes +
  FloatBar, never a separate "Select" mode.
- Nothing snaps: changing text, widths and colours animate; elements enter and
  leave with `motion/react`. Buttons never scale on press. Focus rings show for
  keyboard only. Menus fit their content.
- When adopting a designed component, keep every control it shows unless told
  to remove one.

## Next steps

1. Design the main screens (Today, Pipeline, Leads, Accounts, People, Reports,
   Playbooks, Settings) before building them.
2. Build the server: schema, roles, auth, first-run setup, Docker Compose.
3. Connect the app to the server; first-launch server address screen.
4. Integrations, starting with CSV import and SMTP.
5. Packaging, signing and auto-update.
