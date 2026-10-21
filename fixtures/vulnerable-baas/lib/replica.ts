import { createClient } from "@libsql/client";

// EDGE-01: embedded replica of a DB holding customers.email / full_name, no encryptionKey
export const db = createClient({
  url: "file:local-replica.db",
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
