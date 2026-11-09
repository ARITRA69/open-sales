# Open Sales

An open-source, self-hosted sales pipeline for small sales teams.

- **Desktop app** (Electron) for Mac and Windows. Each person's AI help runs
  through their own Claude Code or Codex, installed on their machine.
- **Your server, your data.** A company runs the server itself. Nothing goes
  through a hosted service. (The server isn't built yet.)
- **Integrations** for email, calendars and CRMs are planned.

Status: early. The app opens on a components sheet; real screens come next.

## Run it

Needs [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

Other scripts: `bun run typecheck`, `bun run lint`, `bun run test`,
`bun run build`. Each runs in every package.

## Layout

- `apps/desktop`: the desktop app.
- `apps/server`: the server (coming).
- `packages/shared`: types and rules the app and server share.

To redraw the app icon: `cd apps/desktop && bunx electron scripts/make-app-icon.mjs`.

## Licence

MIT. The bundled Inter font is under the SIL Open Font License.
