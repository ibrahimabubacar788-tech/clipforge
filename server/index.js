import { join } from "node:path";
import { createApp } from "./app.js";
const port = Number(process.env.PORT || 4173);
const dataDir = process.env.CLIPFORGE_DATA_DIR || join(process.cwd(), "data");
const storageDir = process.env.CLIPFORGE_STORAGE_DIR || join(dataDir, "storage");
const dbFile = process.env.CLIPFORGE_DB_FILE || join(dataDir, "clipforge.json");
const app = createApp({ dbFile, storageDir });\napp.listen(port, async () => {\n  await app.clipQueue.recover();\n  console.log(`ClipForge API and web app listening on port ${port}`);\n});
