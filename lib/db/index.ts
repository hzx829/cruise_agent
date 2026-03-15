import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH =
  process.env.DB_PATH ||
  path.resolve(process.cwd(), '../cruise_crawler/data/cruise_deals.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}
