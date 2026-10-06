const intakeStyle = document.createElement("style");
intakeStyle.textContent = `
  .cf-intake{position:relative;margin:0 0 32px;padding:34px 34px 28px;border:1px solid rgba(166,140,255,.20);border-radius:24px;overflow:hidden;background:linear-gradient(145deg,rgba(22,25,43,.98),rgba(13,17,31,.98));box-shadow:0 24px 70px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.05)}
  .cf-intake:before{content:"";position:absolute;width:460px;height:460px;right:-170px;top:-250px;border-radius:50%;background:radial-gradient(circle,rgba(166,140,255,.20),transparent 68%);pointer-events:none}
  .cf-intake:after{content:"";position:absolute;left:-120px;bottom:-250px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(255,110,170,.09),transparent 68%);pointer-events:none}
  .cf-intake>*{position:relative;z-index:1}
  .cf-intake-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
  .cf-intake-kicker{display:inline-flex;align-items:center;gap:8px;margin:0 0 12px;color:#b9adff;font:700 10px "DM Mono";letter-spacing:1.5px}
  .cf-intake-kicker:before{content:"✦";display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#9a82ff,#d079d5);color:#fff;font:700 10px Manrope;box-shadow:0 5px 18px rgba(166,140,255,.22)}
  .cf-intake h3{max-width:720px;margin:0;font-size:clamp(27px,3vw,39px);line-height:1.04;letter-spacing:-1.8px}
  .cf-intake-copy{max-width:690px;margin:12px 0 25px;color:#969db5;font-size:13px;line-height:1.7}
  .cf-intake-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.035);color:#8e95ad;font:9px "DM Mono";white-space:nowrap}
  .cf-intake-badge:before{content:"";width:6px;height:6px;border-radius:50%;background:#a9e58d;box-shadow:0 0 10px #a9e58d}
  .cf-intake-row{display:grid;grid-template-columns:minmax(0,1fr) 225px auto;gap:9px;padding:7px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(5,8,17,.52);box-shadow:inset 0 1px rgba(255,255,255,.025)}
  .cf-intake-input{min-width:0;height:47px;border:1px solid transparent;border-radius:10px;background:#111625;color:#f3f4ff;padding:0 14px;font:600 12px Manrope;outline:none}
  .cf-intake-input::placeholder{color:#646c83}
  .cf-intake-input:focus{border-color:#a68cff;box-shadow:0 0 0 3px rgba(166,140,255,.10);background:#14192a}
  .cf-intake-row select{appearance:auto;color:#cfd3e3}
  .cf-intake-action{min-height:41px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#171c2d;color:#e7e9f5;padding:10px 14px;font:700 11px Manrope;cursor:pointer;transition:.18s ease}
  .cf-intake-action:hover{border-color:rgba(166,140,255,.45);background:#1c2235;transform:translateY(-1px)}
  .cf-intake-action:focus-visible{outline:2px solid var(--violet);outline-offset:2px}
  .cf-intake-action.primary{min-width:137px;border-color:transparent;background:linear-gradient(110deg,#8f78f4,#c879d3);color:#fff;box-shadow:0 10px 28px rgba(166,140,255,.20)}
  .cf-intake-action.primary:hover{box-shadow:0 14px 32px rgba(166,140,255,.28)}
  .cf-intake-divider{display:flex;align-items:center;gap:12px;margin:22px 0 12px;color:#5f6780;font:700 8px "DM Mono";letter-spacing:1.5px}
  .cf-intake-divider:before,.cf-intake-divider:after{content:"";height:1px;background:linear-gradient(90deg,transparent,#292f47);flex:1}
  .cf-intake-divider:after{background:linear-gradient(90deg,#292f47,transparent)}
  .cf-intake-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .cf-intake-secondary{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 16px;text-align:left}
  .cf-intake-secondary-copy{display:grid;gap:4px}
  .cf-intake-secondary-copy strong{font-size:12px}
  .cf-intake-secondary-copy small{color:#727a92;font:9px "DM Mono"}
  .cf-intake-secondary-arrow{color:#b9adff;font-size:17px}
  .cf-intake-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px}
  .cf-intake-meta span{padding:6px 9px;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:rgba(255,255,255,.025);color:#737b94;font:8px "DM Mono";letter-spacing:.2px}
  .cf-intake-status{display:none;margin-top:14px;padding:11px 13px;border-radius:10px;background:#0a0f1c;border:1px solid #292f47;color:#cbd0e2;font-size:11px;line-height:1.5}
  .cf-intake-status.show{display:block}
  .cf-intake-status strong{color:#fff}
  @media(max-width:900px){.cf-intake{padding:25px 22px}.cf-intake-top{display:block}.cf-intake-badge{margin-top:4px}.cf-intake-row{grid-template-columns:1fr}.cf-intake-row .cf-intake-action.primary{width:100%}}
  @media(max-width:570px){.cf-intake{padding:21px 17px;border-radius:19px}.cf-intake h3{font-size:27px}.cf-intake-copy{font-size:12px;margin-bottom:20px}.cf-intake-actions{grid-template-columns:1fr}.cf-intake-secondary{min-height:58px}}
`;
document.head.appendChild(intakeStyle);

function createCreatorIntake() {
  const editor = document.querySelector("#editor");
  if (!editor || document.querySelector("#creator-intake")) return;

  const card = document.createElement("section");
  card.id = "creator-intake";
  card.className = "cf-intake";
  card.innerHTML = `\n    <p class="cf-intake-kicker">CLIPFORGE CREATOR ENGINE</p>
    <div class="cf-intake-top">
      <div>
        <h3>One source in. A content engine out.</h3>
        <p class="cf-intake-copy">Give ClipForge a long-form video and let the engine find the moments worth publishing — hooks, stories, insights, reactions and payoffs — then turn them into captioned short-form clips.</p>
      </div>
      <span class="cf-intake-badge">ENGINE READY</span>
    </div>
    <div class="cf-intake-row">
      <input id="cf-source-url" class="cf-intake-input" type="url" inputmode="url" autocomplete="off" placeholder="Paste a YouTube or supported creator source link…" aria-label="Source video URL" />
      <select id="cf-content-profile" class="cf-intake-input" aria-label="Content strategy"><option value="creator">Creator — broad viral moments</option><option value="podcast">Podcast — opinions & stories</option><option value="streamer">Streamer — reactions & highlights</option><option value="marketer">Marketer — hooks & persuasion</option><option value="ecommerce">E-commerce — product moments</option><option value="real_estate">Real estate — property & leads</option><option value="agency">Agency — expertise & results</option><option value="church">Church — teaching & encouragement</option><option value="media">Media — stories & reactions</option><option value="advertiser">Advertiser — high-impact creatives</option></select>
      <button id="cf-source-submit" class="cf-intake-action primary" type="button">Analyze source <span>→</span></button>
    </div>
    <div class="cf-intake-divider">OR USE A VIDEO YOU CONTROL</div>
    <div class="cf-intake-actions">
      <button id="cf-upload-source" class="cf-intake-action cf-intake-secondary" type="button"><span class="cf-intake-secondary-copy"><strong>Upload long-form video</strong><small>MP4, MOV and supported video files</small></span><span class="cf-intake-secondary-arrow">↑</span></button>
      <button id="cf-open-library" class="cf-intake-action cf-intake-secondary" type="button"><span class="cf-intake-secondary-copy"><strong>Open clip library</strong><small>Review your generated moments and exports</small></span><span class="cf-intake-secondary-arrow">→</span></button>
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
