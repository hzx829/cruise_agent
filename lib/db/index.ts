import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';

const FALLBACK_DB_PATHS = [
  path.resolve(process.cwd(), '../curise_crawler/data/cruise_deals.db'),
  path.resolve(process.cwd(), '../cruise_crawler/data/cruise_deals.db'),
];

function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    const configuredPath = path.resolve(process.cwd(), process.env.DB_PATH);
    if (!existsSync(configuredPath)) {
      throw new Error(`DB_PATH points to a missing SQLite file: ${configuredPath}`);
    }
    return configuredPath;
  }

  const existingPath = FALLBACK_DB_PATHS.find((candidate) => existsSync(candidate));
  if (existingPath) {
    return existingPath;
  }

  throw new Error(
    `Unable to find cruise_deals.db. Checked: ${FALLBACK_DB_PATHS.join(', ')}`
  );
}

const DB_PATH = resolveDbPath();

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}
