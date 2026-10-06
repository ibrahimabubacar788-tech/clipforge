const intakeStyle = document.createElement("style");
intakeStyle.textContent = `
  .cf-intake{position:relative;margin:0 0 32px;padding:38px 38px 30px;border:1px solid rgba(143,120,244,.16);border-radius:28px;overflow:hidden;background:radial-gradient(circle at 85% 8%,rgba(143,120,244,.12),transparent 32%),radial-gradient(circle at 8% 92%,rgba(200,121,211,.07),transparent 28%),#0d111d;box-shadow:0 30px 90px rgba(0,0,0,.30),inset 0 1px rgba(143,120,244,.08)}
  .cf-intake:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.012),transparent 45%,rgba(143,120,244,.018));pointer-events:none}
  .cf-intake>*{position:relative;z-index:1}
  .cf-intake-kicker{display:inline-flex;align-items:center;gap:9px;margin:0 0 13px;color:#9a8ce9;font:700 9px "DM Mono";letter-spacing:1.9px;text-transform:uppercase}
  .cf-intake-kicker:before{content:"";width:7px;height:7px;border-radius:50%;background:#8f78f4;box-shadow:0 0 16px rgba(143,120,244,.75)}
  .cf-intake h3{max-width:760px;margin:0;color:#c8c2e4;font-size:clamp(28px,3vw,40px);font-weight:650;line-height:1.03;letter-spacing:-1.7px}
  .cf-intake-copy{max-width:700px;margin:12px 0 26px;color:#777f99;font-size:12px;line-height:1.75}
  .cf-intake-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(143,120,244,.16);border-radius:999px;background:rgba(143,120,244,.045);color:#8179aa;font:8px "DM Mono";letter-spacing:1px;white-space:nowrap}
  .cf-intake-badge:before{content:"";width:5px;height:5px;border-radius:50%;background:#8f78f4;box-shadow:0 0 10px rgba(143,120,244,.8)}
  .cf-intake-row{display:grid;grid-template-columns:minmax(0,1fr) 225px auto;gap:8px;padding:7px;border:1px solid rgba(143,120,244,.12);border-radius:16px;background:#090d17;box-shadow:inset 0 1px rgba(143,120,244,.035)}
  .cf-intake-input{min-width:0;height:47px;border:1px solid rgba(143,120,244,.07);border-radius:10px;background:#111625;color:#aaa5c4;padding:0 14px;font:600 12px Manrope;outline:none}
  .cf-intake-input::placeholder{color:#555d74}
  .cf-intake-input:focus{border-color:rgba(143,120,244,.35);box-shadow:0 0 0 3px rgba(143,120,244,.07);background:#131829}
  .cf-intake-row select{color:#89839f}
  .cf-intake-action{min-height:41px;border:1px solid rgba(143,120,244,.10);border-radius:10px;background:#121827;color:#9b96b2;padding:10px 14px;font:700 10px Manrope;cursor:pointer;transition:.18s ease}
  .cf-intake-action:hover{border-color:rgba(143,120,244,.30);background:#161c2d;color:#b5afd0;transform:translateY(-1px)}
  .cf-intake-action.primary{min-width:137px;border-color:rgba(143,120,244,.20);background:linear-gradient(110deg,#695cb2,#8a5f91);color:#d9d3ed;box-shadow:0 10px 28px rgba(91,74,145,.18)}
  .cf-intake-action.primary:hover{background:linear-gradient(110deg,#7466c2,#9568a0);color:#e3def0;box-shadow:0 14px 32px rgba(91,74,145,.25)}
  .cf-intake-divider{display:flex;align-items:center;gap:12px;margin:23px 0 12px;color:#4e566d;font:700 8px "DM Mono";letter-spacing:1.7px}
  .cf-intake-divider:before,.cf-intake-divider:after{content:"";height:1px;background:linear-gradient(90deg,transparent,#242b3d);flex:1}
  .cf-intake-divider:after{background:linear-gradient(90deg,#242b3d,transparent)}
  .cf-intake-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .cf-intake-secondary{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 16px;text-align:left}
  .cf-intake-secondary-copy{display:grid;gap:4px}
  .cf-intake-secondary-copy strong{font-size:11px;font-weight:650;color:#928da8}
  .cf-intake-secondary-copy small{color:#535b72;font:8px "DM Mono"}
  .cf-intake-secondary-arrow{color:#7569a2;font-size:16px}
  .cf-intake-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:17px}
  .cf-intake-meta span{padding:6px 9px;border:1px solid rgba(143,120,244,.09);border-radius:999px;background:rgba(143,120,244,.025);color:#555d73;font:8px "DM Mono";letter-spacing:.2px}
  .cf-intake-status{display:none;margin-top:14px;padding:11px 13px;border-radius:10px;background:#090d17;border:1px solid rgba(143,120,244,.14);color:#777f98;font-size:10px;line-height:1.5}
  .cf-intake-status.show{display:block}
  .cf-intake-status strong{color:#9c96b7}
  @media(max-width:900px){.cf-intake{padding:27px 23px}.cf-intake-top{display:block}.cf-intake-badge{margin-top:4px}.cf-intake-row{grid-template-columns:1fr}.cf-intake-row .cf-intake-action.primary{width:100%}}
  @media(max-width:570px){.cf-intake{padding:22px 17px;border-radius:21px}.cf-intake h3{font-size:28px}.cf-intake-copy{font-size:11px;margin-bottom:20px}.cf-intake-actions{grid-template-columns:1fr}.cf-intake-secondary{min-height:58px}}
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
