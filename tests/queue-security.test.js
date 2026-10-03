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

test("queue export cleanup refuses directories and symlinks inside the export directory", async () => {
  const { exportsDir } = await fixture();
  const target = join(exportsDir, "clip-target.mp4");
  const link = join(exportsDir, "clip-link.mp4");
  await mkdir(target, { recursive: true });
  await writeFile(join(exportsDir, "protected.mp4"), "keep me");
  await symlink(join(exportsDir, "protected.mp4"), link);

  const queue = new ClipQueue({}, join(exportsDir, ".."));
  await queue.removeExport("/storage/exports/clip-target.mp4");
  await queue.removeExport("/storage/exports/clip-link.mp4");

  const { access } = await import("node:fs/promises");
  assert.equal(await access(target).then(() => true).catch(() => false), true);
  assert.equal(await access(join(exportsDir, "protected.mp4")).then(() => true).catch(() => false), true);
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


test("queue render rejects a symlinked export target", async () => {
  const { dir, uploads, exportsDir } = await fixture();
  const source = join(uploads, "source.mp4");
  const outside = join(dir, "protected-output.mp4");
  const output = join(exportsDir, "clip-output.mp4");
  await writeFile(source, "not-a-real-video");
  await writeFile(outside, "keep me");
  await symlink(outside, output);

  const queue = new ClipQueue({}, join(dir, "storage"), { ffmpegPath: process.execPath });
  await assert.rejects(
    queue.render({ id: "clip-output", sourceUrl: "/storage/uploads/source.mp4", start: 0, end: 1, format: "9:16" }),
    /Invalid export output path/
  );
  assert.equal(await import("node:fs/promises").then(({ readFile }) => readFile(outside, "utf8")), "keep me");
});


test("queue render rejects an export directory symlink", async () => {
  const { dir, uploads, exportsDir } = await fixture();
  const source = join(uploads, "source.mp4");
  const outside = join(dir, "outside-exports");
  const storage = join(dir, "storage");
  await writeFile(source, "not-a-real-video");
  await mkdir(outside, { recursive: true });
  const { rm } = await import("node:fs/promises");
  await rm(exportsDir, { recursive: true, force: true });
  await symlink(outside, exportsDir);

  const queue = new ClipQueue({}, storage, { ffmpegPath: process.execPath });
  await assert.rejects(
    queue.render({ id: "clip-export-dir", sourceUrl: "/storage/uploads/source.mp4", start: 0, end: 1, format: "9:16" }),
    /Invalid export output path/
  );
  assert.equal(await import("node:fs/promises").then(({ readdir }) => readdir(outside).then((items) => items.length)), 0);
});

test("queue export cleanup refuses a symlinked export directory", async () => {
  const { dir, uploads, exportsDir } = await fixture();
  const outside = join(dir, "outside-cleanup");
  const protectedFile = join(outside, "clip-safe.mp4");
  const storage = join(dir, "storage");
  await writeFile(join(uploads, "source.mp4"), "not-a-real-video");
  await mkdir(outside, { recursive: true });
  await writeFile(protectedFile, "keep me");
  const { rm } = await import("node:fs/promises");
  await rm(exportsDir, { recursive: true, force: true });
  await symlink(outside, exportsDir);

  const queue = new ClipQueue({}, storage);
  await queue.removeExport("/storage/exports/clip-safe.mp4");

  assert.equal(await import("node:fs/promises").then(({ readFile }) => readFile(protectedFile, "utf8")), "keep me");
});
