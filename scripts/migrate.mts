// scripts/migrate.mts
//
// WHAT THIS IS
// Our migration runner. It runs every SQL file in db/migrations that
// hasn't been run yet, in number order (001, 002, ...), and remembers
// which ones have run in a table called "schema_migrations".
// Safe to run as many times as you like: finished files get skipped.
//
// HOW TO RUN
//   npm run db:migrate
//
// WHY .mts?
// ".mts" = a TypeScript file written in modern "import" style.
// Node.js 24 can run it directly, no extra tools needed.

import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Where the numbered SQL files live
const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

async function main() {
  // DATABASE_URL comes from .env.local (the npm script loads it for us)
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Check .env.local.");
  }

  // One single connection is enough for a script (no pool needed)
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // 1. Create the "memory" table, only if it doesn't exist yet
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        ran_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Ask the database which files have already run
    const done = await client.query("SELECT filename FROM schema_migrations");
    const alreadyRan = new Set(done.rows.map((row) => row.filename));

    // 3. List every .sql file in the folder, sorted 001, 002, 003...
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let ranCount = 0;

    for (const file of files) {
      if (alreadyRan.has(file)) {
        console.log(`skip    ${file} (already ran)`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");

      // 4. Run the file AND record it as one "transaction":
      //    either BOTH happen, or NEITHER does. If the SQL has an error,
      //    ROLLBACK undoes everything, so the database never ends up half-changed.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        // $1 is a placeholder: pg slots the filename in safely.
        // ALWAYS use placeholders for values, never glue text into SQL.
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`ran     ${file}`);
        ranCount++;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`FAILED  ${file}`);
        throw error; // stop here, don't run later files
      }
    }

    console.log(ranCount === 0 ? "Database is up to date." : `Done: ${ranCount} migration(s) ran.`);
  } finally {
    // Always close the connection, even if something failed
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration error:", error.message ?? error);
  process.exit(1); // tells the terminal the command failed
});