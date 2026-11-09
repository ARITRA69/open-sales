import { defineConfig } from 'drizzle-kit'

// `bun run db:generate <kebab-name>` writes a new SQL migration into drizzle/ from the
// schema. Migrations only ever add: see "Server stack" in CLAUDE.md.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // ownerId in code is owner_id in Postgres.
  casing: 'snake_case'
})
