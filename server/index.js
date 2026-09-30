import { createApp } from "./app.js";
const port = Number(process.env.PORT || 4173);
createApp().listen(port, () => console.log(`ClipForge API and web app listening on http://localhost:${port}`));
