import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const now = () => new Date().toISOString();
export class JsonDatabase {
  constructor(file) { this.file = file; this.data = null; this.pending = Promise.resolve(); }
  async load() {
    if (this.data) return this.data;
    await mkdir(dirname(this.file), { recursive: true });
    try { this.data = JSON.parse(await readFile(this.file, "utf8")); }
    catch { this.data = { users: [], sessions: [], projects: [], videos: [], clips: [], jobs: [] }; await this.flush(); }
    return this.data;
  }
  async flush() { await writeFile(this.file, JSON.stringify(this.data, null, 2)); }
  async transaction(mutator) {
    await this.load();
    let result;
    this.pending = this.pending.then(async () => { result = await mutator(this.data); await this.flush(); });
    await this.pending;
    return result;
  }
  async read(reader) { await this.pending; await this.load(); return reader(this.data); }
}
export const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export { now };
