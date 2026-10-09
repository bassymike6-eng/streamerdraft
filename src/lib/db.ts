// src/lib/db.ts
//
// WHAT THIS IS
// The ONE file in the app that connects to PostgreSQL.
// Every other back-end file imports `db` from here instead of
// connecting on its own. If the database ever breaks, start here.
//
// HOW IT WORKS
// A "pool" keeps a few connections open and reuses them,
// because opening a brand-new connection for every request is slow.

import "server-only"; // safety lock: errors if browser code ever imports this file
import { Pool } from "pg";

// Read the connection string from .env.local
const connectionString = process.env.DATABASE_URL;

// If it's missing, fail straight away with a clear message,
// instead of a confusing error somewhere else later.
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Add it to .env.local (see .env.example).");
}

// In development, Next.js reloads files every time you save.
// Without this, each reload would open a NEW pool and you'd slowly
// run out of connections. So we park the pool on `globalThis`
// (an object that survives reloads) and reuse it.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
    max: 10, // at most 10 open connections, plenty for a waitlist
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = db;
}