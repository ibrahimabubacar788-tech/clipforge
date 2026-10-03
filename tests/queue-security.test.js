import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClipQueue } from "../server/queue.js";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "clipforge-queue-security-"));
  const uploads = join(dir, "storage", "uploads");
  const exportsDir = join(dir, "storage", "exports");
  await mkdir(uploads, { recursive: true });
  await mkdir(exportsDir, { recursive: true });
  return { dir, uploads, exportsDir };
}

test("queue render rejects uploaded source symlinks escaping storage", async () => {
  const { dir, uploads } = await fixture();
  const outside = join(dir, "outside.mp4");
  const link = join(uploads, "escape.mp4");
  await writeFile(outside, "not-a-real-video");
  await symlink(outside, link);

  const queue = new ClipQueue({}, join(dir, "storage"), { ffmpegPath: process.execPath });
  await assert.rejects(
    queue.render({ id: "clip-escape", sourceUrl: "/storage/uploads/escape.mp4", start: 0, end: 1, format: "9:16" }),
    /Invalid source video path/
  );
});

test("queue export cleanup refuses symlinks escaping the export directory", async () => {
  const { dir, exportsDir } = await fixture();
  const outside = join(dir, "protected.txt");
  const link = join(exportsDir, "clip-safe.mp4");
  await writeFile(outside, "keep me");
  await symlink(outside, link);

  const queue = new ClipQueue({}, join(dir, "storage"));
  await queue.removeExport("/storage/exports/clip-safe.mp4");

  assert.equal(await import("node:fs/promises").then(({ access }) => access(outside).then(() => true).catch(() => false)), true);
});
