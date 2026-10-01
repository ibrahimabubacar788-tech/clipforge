import { join } from "node:path";
import { createApp } from "./app.js";
const port = Number(process.env.PORT || 4173);
const dataDir = process.env.CLIPFORGE_DATA_DIR || join(process.cwd(), "data");
const storageDir = process.env.CLIPFORGE_STORAGE_DIR || join(dataDir, "storage");
const dbFile = process.env.CLIPFORGE_DB_FILE || join(dataDir, "clipforge.json");
const app = createApp({ dbFile, storageDir });
app.listen(port, async () => {
  await app.clipQueue.recover();
  console.log(`ClipForge API and web app listening on port ${port}`);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}; shutting down ClipForge.`);
  await new Promise((resolve) => app.close(resolve));
  await app.database.close();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
