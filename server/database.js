import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import pg from "pg";

const { Pool } = pg;
const now = () => new Date().toISOString();
const emptyState = () => ({ users: [], sessions: [], projects: [], videos: [], clips: [], jobs: [] });

const postgresUrl = process.env.DATABASE_URL;
const hasPostgresUrl = typeof postgresUrl === "string" && /^(postgres|postgresql):\/\//i.test(postgresUrl);

export class JsonDatabase {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.pending = Promise.resolve();
    this.pool = hasPostgresUrl
      ? new Pool({
          connectionString: postgresUrl,
          ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
        })
      : null;
  }

  async load() {
    if (this.data) return this.data;
    if (this.pool) {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS clipforge_state (
        id integer PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      const result = await this.pool.query("SELECT data FROM clipforge_state WHERE id = 1");
      if (result.rows[0]) this.data = result.rows[0].data;
      else {
        this.data = emptyState();
        await this.flush();
      }
      return this.data;
    }
    await mkdir(dirname(this.file), { recursive: true });
    try { this.data = JSON.parse(await readFile(this.file, "utf8")); }
    catch { this.data = emptyState(); await this.flush(); }
    return this.data;
  }

  async flush() {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO clipforge_state (id, data, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [JSON.stringify(this.data)]
      );
      return;
    }
    await writeFile(this.file, JSON.stringify(this.data, null, 2));
  }

  async transaction(mutator) {
    await this.load();
    let result;
    this.pending = this.pending.then(async () => {
      result = await mutator(this.data);
      await this.flush();
    });
    await this.pending;
    return result;
  }

  async read(reader) {
    await this.pending;
    await this.load();
    return reader(this.data);
  }
}

export const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export { now };
