const intakeStyle = document.createElement("style");
intakeStyle.textContent = `
  .cf-intake{margin:0 0 28px;padding:28px;border:1px solid #2e3450;border-radius:18px;background:radial-gradient(circle at 85% 10%,rgba(166,140,255,.16),transparent 35%),linear-gradient(135deg,#111629,#0d111f);box-shadow:0 18px 60px rgba(0,0,0,.18)}
  .cf-intake-kicker{margin:0 0 8px;color:#a99aff;font:10px "DM Mono";letter-spacing:1.5px}
  .cf-intake h3{margin:0;font-size:27px;letter-spacing:-1.4px}
  .cf-intake-copy{max-width:690px;margin:9px 0 20px;color:#aeb4c9;font-size:13px;line-height:1.7}
  .cf-intake-row{display:grid;grid-template-columns:1fr 245px auto;gap:9px}
  .cf-intake-input{min-width:0;border:1px solid #343a58;border-radius:10px;background:#090d18;color:#f3f4ff;padding:13px 14px;font:600 13px Manrope;outline:none}
  .cf-intake-input:focus{border-color:#a68cff;box-shadow:0 0 0 3px rgba(166,140,255,.12)}
  .cf-intake-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .cf-intake-action{border:1px solid #3b4160;border-radius:9px;background:#171c2d;color:#e7e9f5;padding:10px 13px;font:700 12px Manrope;cursor:pointer}
  .cf-intake-action:hover{border-color:#8174bd;background:#1c2235}
  .cf-intake-action.primary{border:0;background:linear-gradient(110deg,#8f78f4,#c879d3);color:#fff}
  .cf-intake-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:17px}
  .cf-intake-meta span{padding:6px 9px;border:1px solid #292f47;border-radius:999px;color:#8f96ae;font:9px "DM Mono"}
  .cf-intake-status{display:none;margin-top:14px;padding:10px 12px;border-radius:9px;background:#0a0f1c;border:1px solid #292f47;color:#cbd0e2;font-size:12px;line-height:1.5}
  .cf-intake-status.show{display:block}
  .cf-intake-status strong{color:#fff}
  .cf-intake-divider{display:flex;align-items:center;gap:10px;margin:18px 0;color:#646b84;font:9px "DM Mono";letter-spacing:1px}
  .cf-intake-divider:before,.cf-intake-divider:after{content:"";height:1px;background:#252b42;flex:1}
  @media(max-width:900px){.cf-intake{padding:20px}.cf-intake h3{font-size:23px}.cf-intake-row{grid-template-columns:1fr}.cf-intake-row .cf-intake-action{width:100%}}
`;
document.head.appendChild(intakeStyle);

function createCreatorIntake() {
  const editor = document.querySelector("#editor");
  if (!editor || document.querySelector("#creator-intake")) return;

  const card = document.createElement("section");
  card.id = "creator-intake";
  card.className = "cf-intake";
  card.innerHTML = `
    <p class="cf-intake-kicker">CLIPFORGE CREATOR ENGINE</p>
    <h3>One source in. A content engine out.</h3>
    <p class="cf-intake-copy">Give ClipForge a long-form video and let the engine find the moments worth publishing — hooks, stories, insights, reactions and payoffs — then turn them into captioned short-form clips.</p>
    <div class="cf-intake-row">
      <input id="cf-source-url" class="cf-intake-input" type="url" inputmode="url" autocomplete="off" placeholder="Paste a YouTube or supported creator source link…" aria-label="Source video URL" />
      <select id="cf-content-profile" class="cf-intake-input" aria-label="Content strategy"><option value="creator">Creator — broad viral moments</option><option value="podcast">Podcast — opinions & stories</option><option value="streamer">Streamer — reactions & highlights</option><option value="marketer">Marketer — hooks & persuasion</option><option value="ecommerce">E-commerce — product moments</option><option value="real_estate">Real estate — property & leads</option><option value="agency">Agency — expertise & results</option><option value="church">Church — teaching & encouragement</option><option value="media">Media — stories & reactions</option><option value="advertiser">Advertiser — high-impact creatives</option></select>
      <button id="cf-source-submit" class="cf-intake-action primary" type="button">Analyze source →</button>
    </div>
    <div class="cf-intake-divider">OR USE A VIDEO YOU CONTROL</div>
    <div class="cf-intake-actions">
      <button id="cf-upload-source" class="cf-intake-action" type="button">Upload long-form video</button>
      <button id="cf-open-library" class="cf-intake-action" type="button">Open clip library</button>
    </div>
    <div class="cf-intake-meta">
      <span>AI moment discovery</span><span>Auto captions</span><span>Smart reframing</span><span>Clip scoring</span><span>Creator API ready</span>
    </div>
    <div id="cf-source-status" class="cf-intake-status" role="status" aria-live="polite"></div>
  `;

  const heading = editor.querySelector(".editor-heading");
  heading?.after(card);

  const upload = document.querySelector("#source-upload");
  document.querySelector("#cf-upload-source")?.addEventListener("click", () => upload?.click());
  document.querySelector("#cf-open-library")?.addEventListener("click", () => document.querySelector('[data-view="clips"]')?.click());

  const input = document.querySelector("#cf-source-url");
  const profile = document.querySelector("#cf-content-profile");
  const submit = document.querySelector("#cf-source-submit");
  const status = document.querySelector("#cf-source-status");

  function setStatus(html) {
    if (!status) return;
    status.innerHTML = html;
    status.classList.add("show");
  }

  function extractYouTubeId(value) {
    try {
      const url = new URL(value);
      if (!["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com"].includes(url.hostname.toLowerCase())) return null;
      if (url.hostname.includes("youtu.be")) return url.pathname.replace(/^\//,"").split("/")[0] || null;
      return url.searchParams.get("v") || null;
    } catch {
      return null;
    }
  }

  submit?.addEventListener("click", () => {
    const value = String(input?.value || "").trim();
    if (!value) {
      setStatus("<strong>Add a source.</strong> Paste a creator video link or upload the original file.");
      input?.focus();
      return;
    }

    const selectedProfile = profile?.value || "creator";
    window.localStorage.setItem("clipforge-content-profile", selectedProfile);
    const youtubeId = extractYouTubeId(value);
    if (youtubeId) {
      setStatus("<strong>Source recognized.</strong> ClipForge identified a YouTube video. Processing will use an authorized creator/source connection or a video you control — ClipForge will not silently bypass YouTube access restrictions. Your source is ready for the next ingestion step.");
      return;
    }

    try {
      const url = new URL(value);
      if (!["http:","https:"].includes(url.protocol)) throw new Error();
      setStatus("<strong>Source link recognized.</strong> This URL is structurally valid. ClipForge's ingestion layer will route it through the appropriate authorized source connector when that connector is available.");
    } catch {
      setStatus("<strong>That doesn't look like a valid source URL.</strong> Check the link and try again, or upload the original video.");
    }
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit?.click();
    }
  });
}

createCreatorIntake();
