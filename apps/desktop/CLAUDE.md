# Desktop app

Notes for `apps/desktop`. Project-wide decisions are in the root `CLAUDE.md`.
Paths below are relative to this folder.

## Stack and commands

Electron 45, electron-vite 6, Vite 8, React 19, Tailwind 4, Bun, Vitest.

```bash
bun run dev        # also: typecheck, lint, test, build
bunx electron scripts/make-app-icon.mjs   # redraws build/icon.*
```

- `bun run dev` runs `scripts/dev.mjs`. A Mac takes the menu bar name from the app
  bundle, so this runs a renamed copy of Electron from `node_modules/.dev-app`
  (in this folder). Never edit the installed Electron bundle, which sits in the
  root `node_modules/electron`.
  `bun run start` still says "Electron" in the menu bar.
- Page screenshots don't show the Mac traffic lights. To check the real window,
  use `screencapture -l <window id>`.

## Code layout

- `src/main`: window setup. Mac: hidden title bar, traffic lights at x 16, y 15.
  Windows: icon from `build/icon.ico` and an app user model id.
- `src/main`: also the server connection. `server-api.ts` calls the Sales API,
  `connection-store.ts` keeps the server address and the encrypted session
  token in userData, `connection.ts` works out which step to show, and
  `ipc.ts` answers the renderer (checking its input with the shared schemas).
- `src/main/ai-tools.ts`: finds the person's Claude Code (`claude`) and Codex
  (`codex`) and whether they look signed in (keychain item, credentials file
  or API key), without a paid request. It also searches Homebrew,
  `~/.local/bin` and similar, since a Dock-launched app gets a short PATH.
  The renderer reads it through `window.openSales.aiTools` (`useAiTools`),
  for Settings › AI tool, and looks again on focus. The sidebar has no AI
  status line (removed on purpose). Settings shows each tool's logo
  (`components/sales/ai-tool-logo.tsx`, images in `assets/ai-tools/`) and
  how to fix it (`lib/ai-tool-help.ts`). The logos are images, the one
  exception to "colours only from tokens.css".
- `src/preload`: exposes `window.openSales`: `platform`, `aiTools` and `connection`
  (getState, chooseServer, forgetServer, createAdmin, signIn, signOut). Types
  and channel names are in `bridge-types.ts`.
- `screens/connect`: server address, create admin, sign in and can't-reach
  screens on `ConnectLayout` (the form on the left, a brand panel saying what
  the product does on the right, a server chip with Change), and
  `ConnectionGate`, which picks one from the main process's state.
- `screens/app`: the signed-in app. `SignedInApp` is the shell and a hash
  router (`hooks/use-hash-route.ts`; the sidebar links to `#/today`,
  `#/pipeline`…). Today and Settings are real; the other pages show an empty
  state (`empty-page.tsx`) until the server holds sales data. `#/components`
  opens the components sheet.
- Browser preview: there's no Electron bridge, so `app.tsx` opens the
  components sheet. In development, `?preview=<step>` (choose-server,
  create-admin, sign-in, server-unreachable, signed-in) runs the real screens
  against a pretend server (`lib/preview-bridge.ts`); add `&ai=both`,
  `&ai=sign-in` or `&ai=none` for other AI tool states. For example
  `http://localhost:5173/?preview=sign-in`. Production builds never use it.
  Changes to `src/main` or `src/preload` need `bun run dev` restarted.
- `brand.config.json`: the product name and app id. User-facing text gets the
  name from `useBrand()` (`hooks/use-brand.ts`), never a literal "Open Sales".
  The window title follows it too.
- `src/renderer/src/components/ui`: the UI kit. `components/sales`: app-specific
  parts (AppShell, sidebar, window controls, Ask AI panel).
- The kit is built on shadcn/ui patterns and Radix (`radix-ui`), with cva for
  variants. Menus, selects and popovers share `components/ui/popup.ts`; text
  that changes uses `AnimatedLabel`. Tests run with motion animations skipped
  (`src/renderer/src/test-setup.ts`).
- `screens/components-sheet`: every component on one page, at `#/components`
  once signed in, and the browser preview's default page.
- Styles: `tokens.css` is the only place a colour value is written. Motion and
  things Tailwind can't express go in `components.css` or `sales.css`.
- Lint enforces the shadcn rules (`no-arbitrary-values`, `no-restyle`,
  `no-raw-colors`). Tests that touch `localStorage` need
  `// @vitest-environment jsdom`.

### Window frame

Like the Claude desktop app: the sidebar runs to the top edge with the traffic
lights in it. A 44px top bar with a hairline holds the page title. The sidebar
toggle and back/forward buttons sit beside the lights (they end about 76px in,
so the controls start at 80px). ⌘B / Ctrl+B toggles the sidebar, which slides
rather than snapping, and remembers its state.

## Design rules

- Desktop first: wide screens, keyboard and hover. Check at about 1040px wide as
  well as 1440px.
- Compact and dense, but readable, like Attio or Linear: a work tool people
  live in all day, with room beside the work for the Ask AI panel. 13px for
  most text (lists, fields, buttons), 12px for meta; controls 28 to 32px tall;
  table rows 32px, or 44px with a second line. Spend space on data, not
  padding.
- Users aren't all technical: familiar controls, words beside icons, everyday
  language, one obvious primary button.
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
