import { clipDuration, formatTimestamp, normalizeClipRange } from "./clip-utils.js";

const startInput = document.querySelector("#start-input");
const endInput = document.querySelector("#end-input");
const durationLabel = document.querySelector("#duration-label");
const toast = document.querySelector("#toast");
const range = document.querySelector("#range");
const captionToggle = document.querySelector("#caption-toggle");
const captionOverlay = document.querySelector("#caption-overlay");
const videoStage = document.querySelector(".video-stage");
const timelineTrack = document.querySelector(".timeline-track");
const playbackButton = document.querySelector("#play-button");
const playhead = document.querySelector("#playhead");
const clipCount = document.querySelector("#clip-count");
const clipLibrary = document.querySelector("#clip-library");
const clipPreviewDialog = document.querySelector("#clip-preview-dialog");
const clipPreviewVideo = document.querySelector("#clip-preview-video");
const clipPreviewTitle = document.querySelector("#clip-preview-title");
const clipDetailsDialog = document.querySelector("#clip-details-dialog");
const clipDetailsTitle = document.querySelector("#clip-details-title");
const clipDetailsList = document.querySelector("#clip-details-list");
const detailsDownloadClipButton = document.querySelector("#details-download-clip");
const generateContentPackButton = document.querySelector("#generate-content-pack");
const savePerformanceButton = document.querySelector("#save-performance");
const performanceLogSection = document.querySelector("#clip-performance-log");
const clipContentPack = document.querySelector("#clip-content-pack");
const clipContentPackList = document.querySelector("#clip-content-pack-list");
const clipsEmpty = document.querySelector("#clips-empty");
const styleDialog = document.querySelector("#style-dialog");
const sourceUpload = document.querySelector("#source-upload");
const videoDropzone = document.querySelector("#video-dropzone");
const uploadProgress = document.querySelector("#upload-progress");
const uploadProgressLabel = document.querySelector("#upload-progress-label");
const uploadProgressPercent = document.querySelector("#upload-progress-percent");
const uploadProgressBar = document.querySelector("#upload-progress-bar");
const cancelUploadButton = document.querySelector("#cancel-upload");
let activeUploadRequest = null;
let uploadInFlight = false;
const clipSearch = document.querySelector("#clip-search");
const clearClipSearchButton = document.querySelector("#clear-clip-search");
const clipFilter = document.querySelector("#clip-filter");
const clipSort = document.querySelector("#clip-sort");
const clearClipFiltersButton = document.querySelector("#clear-clip-filters");
const librarySummary = document.querySelector("#clip-status-summary" );
const libraryProjectOverview = document.querySelector("#library-project-overview");
const libraryProjectProgress = document.querySelector("#library-project-progress");
const libraryProjectProgressBar = document.querySelector("#library-project-progress-bar");
const libraryProjectProgressLabel = document.querySelector("#library-project-progress-label");
const libraryProducerPlanButton = document.querySelector("#library-producer-plan");
const libraryProducerCreateButton = document.querySelector("#library-producer-create");
const libraryProducerPlan = document.querySelector("#library-producer-plan-result");

const selectAllClipsButton = document.querySelector("#select-all-clips");
const downloadSelectedClipsButton = document.querySelector("#download-selected-clips");
const deleteSelectedClipsButton = document.querySelector("#delete-selected-clips");
const librarySelectionSummary = document.querySelector("#library-selection-summary");
const refreshClipsButton = document.querySelector("#refresh-clips");
const copyClipLinksButton = document.querySelector("#copy-clip-links");
const exportClipListButton = document.querySelector("#export-clip-list");
const copyClipTitlesButton = document.querySelector("#copy-clip-titles");
const copyClipDurationButton = document.querySelector("#copy-clip-duration");
const copyClipJsonButton = document.querySelector("#copy-clip-json");
const copyClipSummaryButton = document.querySelector("#copy-clip-summary");
const batchRenameClipsButton = document.querySelector("#batch-rename-clips");
const deselectAllClipsButton = document.querySelector("#deselect-all-clips");
const selectFailedClipsButton = document.querySelector("#select-failed-clips");
const retryFailedClipsButton = document.querySelector("#retry-failed-clips");
const selectRenderingClipsButton = document.querySelector("#select-rendering-clips");
const selectAllStatusClipsButton = document.querySelector("#select-all-status-clips");
const invertClipSelectionButton = document.querySelector("#invert-clip-selection");
const selectVisibleClipsButton = document.querySelector("#select-visible-clips");
const selectReadyClipsButton = document.querySelector("#select-ready-clips");
const selectUntaggedClipsButton = document.querySelector("#select-untagged-clips");
const selectCaptionedClipsButton = document.querySelector("#select-captioned-clips");
const selectLongClipsButton = document.querySelector("#select-long-clips");
const selectShortClipsButton = document.querySelector("#select-short-clips");
const exportStatus = document.querySelector("#export-status");
const projectSelect = document.querySelector("#project-select");
const deleteProjectButton = document.querySelector("#delete-project");
const newProjectButton = document.querySelector("#new-project");
const fullscreenButton = document.querySelector("#fullscreen-button");
const accountButton = document.querySelector("#account-button");
const dashboardSettingsButton = document.querySelector("#dashboard-settings");
const dashboardLogoutButton = document.querySelector("#dashboard-logout");
const dashboardNewProjectButton = document.querySelector("#dashboard-new-project");
const dashboardOpenEditorButton = document.querySelector("#dashboard-open-editor");
const dashboardOpenLibraryButton = document.querySelector("#dashboard-open-library");
const dashboardOpenSettingsButton = document.querySelector("#dashboard-open-settings");
const workspaceHomeButton = document.querySelector("#workspace-home-button");
const workspaceReturnEditorButton = document.querySelector("#workspace-return-editor");
const settingsSignoutButton = document.querySelector("#settings-signout");
const appShell = document.querySelector(".app-shell");
const authLanding = document.querySelector("#auth-landing");
const authLandingLoginButton = document.querySelector("#auth-landing-login");
const authLandingSignupButton = document.querySelector("#auth-landing-signup");
const accountDialog = document.querySelector("#account-dialog");
const accountDialogSave = document.querySelector("#account-dialog-save");
const accountLoginButton = document.querySelector("#account-login-button");
const accountSignupButton = document.querySelector("#account-signup-button");
const loginEmailInput = document.querySelector("#login-email");
const loginPasswordInput = document.querySelector("#login-password");
const signupFirstNameInput = document.querySelector("#signup-first-name");
const signupLastNameInput = document.querySelector("#signup-last-name");
const signupEmailInput = document.querySelector("#signup-email");
const signupPasswordInput = document.querySelector("#signup-password");
const signupPasswordConfirmInput = document.querySelector("#signup-password-confirm");
const accountEmailInput = document.querySelector("#account-email");
const accountPasswordInput = document.querySelector("#account-password");
const accountDialogEmail = document.querySelector("#account-dialog-email");
const settingsMenuItems = document.querySelectorAll("[data-settings-tab]");
const authModeButtons = document.querySelectorAll(".auth-mode-button");
const verificationEmail = document.querySelector("#verification-email");
const verificationCodeInput = document.querySelector("#verification-code");
const verifyEmailButton = document.querySelector("#verify-email-button");
const resendVerificationButton = document.querySelector("#resend-verification-button");
let pendingVerificationEmail = "";
const settingsPanels = document.querySelectorAll("[data-settings-panel]");

const volumeInput = document.querySelector("#volume-input");
let libraryQuery = "";
let libraryFilter = "all";
let librarySort = "newest";
let timelineMaximum = Number(endInput.max);
const storageKey = "clipforge-exports";
const sessionKey = "clipforge-session";
const identityKey = "clipforge-identity";
const styleKey = "clipforge-caption-style";
const favoriteKey = "clipforge-favorite-clips";
const transcriptionLanguageKey = "clipforge-transcription-language";
const transcriptionLanguage = document.querySelector("#transcription-language");
const captionLanguageSelect = document.querySelector("#caption-language");
const captionLanguageKey = "clipforge-caption-language";
const safeStorageParse = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
};
let clips = [];
const selectedClipIds = new Set();
const savedFavoriteClipIds = safeStorageParse(favoriteKey, []);
const favoriteClipIds = new Set(Array.isArray(savedFavoriteClipIds) ? savedFavoriteClipIds : []);
const automaticClipFailures = new Set();
const automaticClipPolls = new Set();
let apiSession = safeStorageParse(sessionKey, null);
let sourceVideo;
let sourcePreviewUrl;
let previewElement;
let currentProject;
let workspaceLoadVersion = 0;
let statusPollInFlight = false;
let captionStyle = safeStorageParse(styleKey, { color: "lime", weight: "bold" });
if (!captionStyle || typeof captionStyle !== "object" || Array.isArray(captionStyle)) captionStyle = { color: "lime", weight: "bold" };

const api = async (path, options = {}) => {
  const request = (withToken = true) => fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(withToken && apiSession?.token ? { authorization: `Bearer ${apiSession.token}` } : {}),
      ...options.headers
    }
  });
  let response = await request(true);
  if (response.status === 401 && apiSession?.token) response = await request(false);
  if (response.status === 204) return null;
  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw || `Request failed (HTTP ${response.status}).` }; }
  if (!response.ok) { const error = new Error(result.error || `Request failed (HTTP ${response.status}).`); error.status = response.status; throw error; }
  return result;
};

function renderDashboard(projects = []) {
  const grid = document.querySelector("#project-grid");
  if (!grid) return;
  const count = document.querySelector("#dashboard-project-count");
  if (count) count.textContent = String(projects.length);
  grid.replaceChildren(...projects.map((project, index) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${project.name}`);
    card.innerHTML = '<div><div class="project-card-mark"></div><div class="project-card-copy"><h3></h3><p>AI clipping workspace</p></div></div><span class="project-card-arrow" aria-hidden="true">→</span>';
    card.querySelector(".project-card-mark").textContent = String(index + 1).padStart(2, "0");
    card.querySelector("h3").textContent = project.name;
    card.addEventListener("click", () => openProject(project.id));
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProject(project.id); } });
    return card;
  }));
}

async function openProject(projectId) {
  await loadProject(projectId);
  switchView("editor");
  history.replaceState(null, "", "#editor");
}
function renderProjectSelector(projects = []) {
  if (!projectSelect) return;
  projectSelect.replaceChildren(...projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    option.selected = project.id === currentProject?.id;
    return option;
  }));
}

async function loadProject(projectId) {
  const loadVersion = ++workspaceLoadVersion;
  const { projects } = await api("/api/projects");
  if (loadVersion !== workspaceLoadVersion) return;
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  currentProject = project;
  document.querySelector("#workspace-title").textContent = currentProject.name;
  if (projectSelect) projectSelect.value = project.id;
  const videos = (await api(`/api/videos?projectId=${encodeURIComponent(project.id)}`)).videos;
  if (loadVersion !== workspaceLoadVersion) return;
  sourceVideo = videos[0];
  const deleteSourceButton = document.querySelector("#delete-source-video");
  if (sourceVideo) { restoreSourcePreview(sourceVideo); if (deleteSourceButton) deleteSourceButton.hidden = false; } else { clearSourcePreview(); if (deleteSourceButton) deleteSourceButton.hidden = true; }
  const result = await api("/api/clips");
  if (loadVersion !== workspaceLoadVersion) return;
  clips = result.clips.filter((clip) => clip.projectId === project.id);
  selectedClipIds.clear();
  renderClipLibrary();
  if (sourceVideo?.autoClipStatus?.status === "processing") void pollAutoClipStatus(sourceVideo.id);
}

async function ensureWorkspace() {
  const loadVersion = ++workspaceLoadVersion;
  const workspaceAuthenticationGeneration = authenticationGeneration;
  try {
    if (!apiSession) {
      const savedIdentity = safeStorageParse(identityKey, null);
      if (savedIdentity?.email) {
        throw Object.assign(new Error("Please log in to continue."), { status: 401 });
      }
      throw Object.assign(new Error("Create a ClipForge account or log in to continue."), { status: 401 });
    }
    const { projects } = await api("/api/projects");
    if (loadVersion !== workspaceLoadVersion) return false;
    if (projects.length) currentProject = projects[0];
    else {
      const createdProject = (await api("/api/projects", { method: "POST", body: JSON.stringify({ name: "Midnight Sessions" }) })).project;
      if (loadVersion !== workspaceLoadVersion) return false;
      if (!createdProject?.id) throw new Error("Project creation returned an invalid project.");
      currentProject = createdProject;
      projects.push(currentProject);
    }
    document.querySelector("#workspace-title").textContent = currentProject.name;
    renderProjectSelector(projects);
    renderDashboard(projects);
    const account = document.querySelector("#dashboard-account-email");
    if (account) account.textContent = apiSession?.user?.email || "ClipForge account";
    const videos = (await api(`/api/videos?projectId=${encodeURIComponent(currentProject.id)}`)).videos;
    if (loadVersion !== workspaceLoadVersion) return false;
    sourceVideo = videos[0];
    const deleteSourceButton = document.querySelector("#delete-source-video");
    if (sourceVideo) {
      restoreSourcePreview(sourceVideo);
      if (deleteSourceButton) deleteSourceButton.hidden = false;
    } else {
      clearSourcePreview();
      if (deleteSourceButton) deleteSourceButton.hidden = true;
    }
    const clipResult = await api("/api/clips");
    if (loadVersion !== workspaceLoadVersion) return false;
    clips = clipResult.clips.filter((clip) => clip.projectId === currentProject?.id);
    renderClipLibrary();
    if (sourceVideo?.autoClipStatus?.status === "processing") void pollAutoClipStatus(sourceVideo.id);
    return true;
  } catch (error) {
    if (error.status === 401) {
      if (workspaceAuthenticationGeneration !== authenticationGeneration || apiSession?.user) return false;
      apiSession = null;
      window.localStorage.removeItem(sessionKey);
      setAppAccess(false);
      if (loadVersion === workspaceLoadVersion) {
        showToast("Your ClipForge session expired. Please log in again.");
      }
      return false;
    }

    if (loadVersion === workspaceLoadVersion) {
      showToast(`Workspace is still loading: ${error.message}`);
    }
    clips = readSavedClips();
    renderClipLibrary();
    return false;
  }
}


// Authentication boundary: the public welcome and the private workspace are separate app states.
function setAppAccess(isAuthenticated) {
  const authenticated = Boolean(isAuthenticated);
  if (appShell) {
    appShell.hidden = !authenticated;
    appShell.setAttribute("aria-hidden", String(!authenticated));
  }
  if (authLanding) {
    authLanding.hidden = authenticated;
    authLanding.setAttribute("aria-hidden", String(authenticated));
  }
  document.body.classList.toggle("clipforge-authenticated", authenticated);
}

function setSettingsPanel(panelName) {
  settingsMenuItems.forEach((item) => {
    const active = item.dataset.settingsTab === panelName;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== panelName;
  });
}

function showAccountDialog(mode = "login") {
  if (!accountDialog) return;
  setSettingsPanel(mode);
  if (accountDialogEmail) accountDialogEmail.textContent = apiSession?.user?.email || "Manage your ClipForge account and workspace.";
  if (!accountDialog.open) accountDialog.showModal();
  if (mode === "login") loginEmailInput?.focus();
  if (mode === "signup") signupFirstNameInput?.focus();
  void setupGoogleAuth();
}

function showAuthError(error) {
  showToast(error?.message || "ClipForge could not complete that request.");
}

async function completeAuthentication(session) {
  if (!session?.user) throw new Error("Authentication succeeded without a user session.");
  authenticationGeneration += 1;
  apiSession = { token: session.token || null, user: session.user };
  window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
  window.localStorage.setItem(identityKey, JSON.stringify({ email: session.user.email || "" }));
  pendingVerificationEmail = "";
  if (verificationCodeInput) verificationCodeInput.value = "";
  accountDialog?.close();
  setAppAccess(true);
  const ready = await ensureWorkspace();
  if (!ready) throw new Error("Your account is signed in, but the workspace could not finish loading.");
  // The editor is the authenticated product home. My Workspace is a secondary private area.
  switchView("editor");
  history.replaceState(null, "", "#editor");
}

async function performLogin() {
  authenticationGeneration += 1;
  const email = String(loginEmailInput?.value || "").trim();
  const password = String(loginPasswordInput?.value || "");
  if (!email || !password) throw new Error("Enter your email and password.");
  const session = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  await completeAuthentication(session);
  if (loginPasswordInput) loginPasswordInput.value = "";
  showToast("Welcome back to ClipForge.");
}

async function performSignup() {
  authenticationGeneration += 1;
  const firstName = String(signupFirstNameInput?.value || "").trim();
  const lastName = String(signupLastNameInput?.value || "").trim();
  const email = String(signupEmailInput?.value || "").trim();
  const password = String(signupPasswordInput?.value || "");
  const confirmation = String(signupPasswordConfirmInput?.value || "");
  if (!firstName || !lastName || !email || !password || !confirmation) throw new Error("Complete your first name, last name, email, and password.");
  if (password !== confirmation) throw new Error("Your passwords do not match.");
  const result = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName, lastName, email, password }) });
  if (result.verificationRequired) {
    pendingVerificationEmail = result.email || email;
    if (verificationEmail) verificationEmail.textContent = pendingVerificationEmail;
    setSettingsPanel("verify-email");
    showToast("Check your email for the 6-digit ClipForge verification code.");
    return;
  }
  await completeAuthentication(result);
  if (signupPasswordInput) signupPasswordInput.value = "";
  if (signupPasswordConfirmInput) signupPasswordConfirmInput.value = "";
  showToast("Your ClipForge account is ready.");
}

async function verifyPendingEmail() {
  authenticationGeneration += 1;
  const email = pendingVerificationEmail || String(signupEmailInput?.value || "").trim();
  const code = String(verificationCodeInput?.value || "").trim();
  if (!email || !/^\\d{6}$/.test(code)) throw new Error("Enter the 6-digit verification code.");
  const session = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) });
  await completeAuthentication(session);
  showToast("Email verified. Welcome to ClipForge.");
}

async function resendPendingVerification() {
  const email = pendingVerificationEmail || String(signupEmailInput?.value || "").trim();
  if (!email) throw new Error("No verification email is pending.");
  await api("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
  showToast("A new verification code was sent.");
}

async function performGoogleLogin() {
  authenticationGeneration += 1;
  if (!window.google?.accounts?.id) {
    await waitForGoogleIdentity();
  }
  if (!window.google?.accounts?.id) throw new Error("Google sign-in is still loading. Try again in a moment.");
  const slot = document.querySelector("#google-login-slot");
  if (slot && !slot.dataset.googleRendered) {
    await setupGoogleAuth();
  }
  window.google.accounts.id.prompt();
}

let googleAuthPromise;
async function waitForGoogleIdentity(timeout = 8000) {
  if (window.google?.accounts?.id) return true;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (window.google?.accounts?.id) return true;
  }
  return false;
}

async function setupGoogleAuth() {
  if (googleAuthPromise) return googleAuthPromise;
  googleAuthPromise = (async () => {
    const ready = await waitForGoogleIdentity();
    if (!ready) return false;
    let config;
    try { config = await api("/api/auth/google/config"); } catch { return false; }
    if (!config?.configured || !config.clientId) return false;
    const callback = async (response) => {
      try {
        const session = await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: response.credential }) });
        await completeAuthentication(session);
        showToast("Welcome to ClipForge.");
      } catch (error) { showAuthError(error); }
    };
    window.google.accounts.id.initialize({ client_id: config.clientId, callback });
    for (const slotId of ["google-login-slot", "google-signup-slot"]) {
      const slot = document.querySelector("#" + slotId);
      if (!slot || slot.dataset.googleRendered) continue;
      const fallback = slot.querySelector("button");
      if (fallback) fallback.hidden = true;
      window.google.accounts.id.renderButton(slot, { theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", width: 360 });
      slot.dataset.googleRendered = "true";
    }
    return true;
  })();
  try { return await googleAuthPromise; } finally { googleAuthPromise = null; }
}

async function hydrateAuthenticatedSession() {
  const hydrationGeneration = authenticationGeneration;
  if (apiSession?.user) {
    setAppAccess(true);
    const ready = await ensureWorkspace();
    if (ready) {
      const requestedView = window.location.hash.replace(/^#/, "");
      switchView(["dashboard", "editor", "clips", "brand"].includes(requestedView) ? requestedView : "editor");
      return;
    }
  }
  try {
    const result = await api("/api/me");
    apiSession = { token: apiSession?.token || null, user: result.user };
    window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
    window.localStorage.setItem(identityKey, JSON.stringify({ email: result.user?.email || "" }));
    setAppAccess(true);
    const ready = await ensureWorkspace();
    if (ready) {
      const requestedView = window.location.hash.replace(/^#/, "");
      switchView(["dashboard", "editor", "clips", "brand"].includes(requestedView) ? requestedView : "editor");
      return;
    }
  } catch {
    if (hydrationGeneration !== authenticationGeneration || apiSession?.user) return;
    apiSession = null;
    window.localStorage.removeItem(sessionKey);
  }
  if (hydrationGeneration !== authenticationGeneration || apiSession?.user) return;
  setAppAccess(false);
  if (!window.location.hash || window.location.hash === "#dashboard") history.replaceState(null, "", window.location.pathname);
}

let authenticationHydrationInFlight = false;
let authenticationGeneration = 0;

function wireAuthenticationBoundary() {
  setAppAccess(false);
  authLandingLoginButton?.addEventListener("click", () => showAccountDialog("login"));
  authLandingSignupButton?.addEventListener("click", () => showAccountDialog("signup"));
  accountButton?.addEventListener("click", () => showAccountDialog("account"));
  dashboardSettingsButton?.addEventListener("click", () => showAccountDialog("account"));
  dashboardOpenSettingsButton?.addEventListener("click", () => showAccountDialog("workspace"));
  workspaceHomeButton?.addEventListener("click", () => { switchView("dashboard"); history.replaceState(null, "", "#dashboard"); });
  workspaceReturnEditorButton?.addEventListener("click", () => { switchView("editor"); history.replaceState(null, "", "#editor"); });
  dashboardOpenEditorButton?.addEventListener("click", () => { switchView("editor"); history.replaceState(null, "", "#editor"); });
  settingsMenuItems.forEach((item) => item.addEventListener("click", () => setSettingsPanel(item.dataset.settingsTab)));
  authModeButtons.forEach((button) => button.addEventListener("click", () => setSettingsPanel(button.dataset.settingsTab)));
  accountLoginButton?.addEventListener("click", async () => { try { await performLogin(); } catch (error) { showAuthError(error); } });
  accountSignupButton?.addEventListener("click", async () => { try { await performSignup(); } catch (error) { showAuthError(error); } });
  verifyEmailButton?.addEventListener("click", async () => { try { await verifyPendingEmail(); } catch (error) { showAuthError(error); } });
  resendVerificationButton?.addEventListener("click", async () => { try { await resendPendingVerification(); } catch (error) { showAuthError(error); } });
  document.querySelector("#google-login-button")?.addEventListener("click", () => { void performGoogleLogin(); });
  document.querySelector("#google-signup-button")?.addEventListener("click", () => { void performGoogleLogin(); });
  accountDialogSave?.addEventListener("click", async () => {
    try {
      const result = await api("/api/auth/update", { method: "PATCH", body: JSON.stringify({ email: accountEmailInput?.value, password: accountPasswordInput?.value }) });
      apiSession = { ...apiSession, user: result.user };
      window.localStorage.setItem(sessionKey, JSON.stringify(apiSession));
      if (accountPasswordInput) accountPasswordInput.value = "";
      showToast("Account settings saved.");
    } catch (error) { showAuthError(error); }
  });
  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    apiSession = null;
    currentProject = null;
    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(identityKey);
    setAppAccess(false);
    accountDialog?.close();
    history.replaceState(null, "", window.location.pathname);
    showToast("You have been signed out.");
  };
  dashboardLogoutButton?.addEventListener("click", () => { void logout(); });
  settingsSignoutButton?.addEventListener("click", () => { void logout(); });
  accountDialog?.addEventListener("close", () => {
    if (!apiSession) setAppAccess(false);
  });
  window.addEventListener("hashchange", () => {
    if (!apiSession) {
      history.replaceState(null, "", window.location.pathname);
      setAppAccess(false);
      return;
    }
    const view = window.location.hash.replace(/^#/, "");
    if (["dashboard", "editor", "clips", "brand"].includes(view)) switchView(view);
  });
  authenticationHydrationInFlight = true;
  void hydrateAuthenticatedSession().finally(() => {
    authenticationHydrationInFlight = false;
  });
}


let playbackTimer;
let toastTimer;
let draggedHandle;

function readSavedClips() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function saveClips() { window.localStorage.setItem(storageKey, JSON.stringify(clips)); }

function updateCaptionOverlay() {
  if (!captionOverlay) return;
  captionOverlay.hidden = !captionToggle?.checked;
  captionOverlay.setAttribute("aria-hidden", String(!captionToggle?.checked));
  captionOverlay.dataset.color = captionStyle.color;
  captionOverlay.dataset.weight = captionStyle.weight;
}

function applyCaptionStyle(style = captionStyle) {
  captionStyle = { color: style.color || "lime", weight: style.weight || "bold" };
  document.documentElement.dataset.captionColor = captionStyle.color;
  document.documentElement.dataset.captionWeight = captionStyle.weight;
  const colorField = document.querySelector("#highlight-color");
  const weightField = document.querySelector("#caption-weight");
  if (colorField) colorField.value = captionStyle.color;
  if (weightField) weightField.value = captionStyle.weight;
  document.querySelector("#brand-style-description").textContent = `${captionStyle.weight === "bold" ? "Bold" : "Soft"} ${captionStyle.color} highlight`;
  window.localStorage.setItem(styleKey, JSON.stringify(captionStyle));
  updateCaptionOverlay();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function getRange() { return normalizeClipRange(startInput.value, endInput.value, timelineMaximum); }

function clearSourcePreview() {
  stopPlayback();
  sourceVideo = null;
  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = null;
  previewElement?.remove();
  previewElement = null;
  videoStage.innerHTML = '<div class="video-placeholder"><span>Upload a video to start</span></div>';
  timelineMaximum = 1;
  startInput.max = 1;
  endInput.max = 1;
  startInput.value = 0;
  endInput.value = 1;
  updateRange();
}

function restoreSourcePreview(video) {
  if (!video?.id) return;
  stopPlayback();
  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = `/api/videos/${encodeURIComponent(video.id)}/stream`;
  previewElement?.remove();
  previewElement = document.createElement("video");
  previewElement.className = "source-video";
  previewElement.src = sourcePreviewUrl;
  previewElement.muted = false;
  previewElement.volume = Number(volumeInput?.value ?? 1);
  previewElement.playsInline = true;
  previewElement.preload = "metadata";
  videoStage.querySelector(".video-placeholder")?.replaceWith(previewElement);
  timelineMaximum = Math.max(1, Math.floor(video.duration));
  startInput.max = timelineMaximum;
  endInput.max = timelineMaximum;
  startInput.value = 0;
  endInput.value = Math.min(24, timelineMaximum);
  updateRange();
}

function updateRange() {
  const maximum = Number.isFinite(timelineMaximum) && timelineMaximum > 0 ? timelineMaximum : 1;
  if (timelineMaximum !== maximum) timelineMaximum = maximum;
  const clipRange = normalizeClipRange(startInput.value, endInput.value, maximum);
  startInput.value = clipRange.start;
  endInput.value = clipRange.end;
  const duration = clipDuration(clipRange.start, clipRange.end);
  durationLabel.textContent = `${formatTimestamp(duration)} clip`;
  range.style.left = `${(clipRange.start / maximum) * 100}%`;
  range.style.width = `${(duration / maximum) * 100}%`;
  playhead.style.left = `${(clipRange.start / maximum) * 100}%`;
  if (previewElement) previewElement.currentTime = Math.min(clipRange.start, Math.max(0, (previewElement.duration || maximum) - 0.05));
}

async function uploadSource(file) {
  if (!file) return;
  const maxUploadBytes = 250 * 1024 * 1024;
  if (file.size > maxUploadBytes) throw new Error("This video is too large. ClipForge currently accepts videos up to 250 MB.");
  if (!apiSession || !currentProject) {
    await ensureWorkspace().then(() => switchView("dashboard"));
    if (!apiSession || !currentProject) throw new Error("ClipForge could not connect your workspace. Refresh and try again.");
  }
  const uploadProjectId = currentProject.id;
  const previousSourceVideo = sourceVideo;
  if (uploadInFlight) throw new Error("Another video upload is already in progress.");
  uploadInFlight = true;
  let uploadCommitted = false;
  try {
  // Do not require the browser to decode the entire source before uploading.
  // Long files and some codecs can make browser metadata probing fail even when
  // FFmpeg on the server can read the video correctly. The server now probes
  // duration after the upload is safely stored.
  let duration = 0;

  if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = URL.createObjectURL(file);
  previewElement = document.createElement("video");
  previewElement.className = "source-video";
  previewElement.src = sourcePreviewUrl;
  previewElement.muted = false;
  previewElement.volume = Number(volumeInput?.value ?? 1);
  previewElement.playsInline = true;
  previewElement.preload = "metadata";
  videoStage.querySelector(".video-placeholder")?.replaceWith(previewElement);

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const fallbackMime = extension === "mp4" ? "video/mp4" : extension === "mov" ? "video/quicktime" : extension === "webm" ? "video/webm" : extension === "m4v" ? "video/x-m4v" : "";
  const contentType = file.type?.startsWith("video/") ? file.type : fallbackMime;
  if (!contentType) {
    if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
    sourcePreviewUrl = null;
    previewElement?.remove();
    previewElement = null;
    throw new Error("Please choose a video file (MP4, MOV, WebM, or M4V).");
  }
  showToast("Uploading video…");
  uploadProgress?.removeAttribute("hidden");
  if (uploadProgressBar) uploadProgressBar.value = 0;
  if (uploadProgressPercent) uploadProgressPercent.textContent = "0%";
  const upload = await new Promise(async (resolve, reject) => {
    const uploadId = crypto.randomUUID();
    const chunkSize = 2 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let completedBytes = 0;
    try {
      for (let index = 0; index < totalChunks; index += 1) {
        const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
        let attempts = 0;
        let uploaded = false;
        while (!uploaded && attempts < 5) {
          attempts += 1;
          const result = await new Promise((chunkResolve, chunkReject) => {
            const request = new XMLHttpRequest();
            activeUploadRequest = request;
            request.open("POST", "/api/uploads/chunk");
            request.timeout = 15 * 60 * 1000;
            request.setRequestHeader("content-type", contentType);
            request.setRequestHeader("x-filename", file.name);
            request.setRequestHeader("x-upload-id", uploadId);
            request.setRequestHeader("x-upload-index", String(index));
            request.setRequestHeader("x-upload-total", String(totalChunks));
            request.setRequestHeader("x-upload-size", String(file.size));
            if (apiSession?.token) request.setRequestHeader("authorization", "Bearer " + apiSession.token);
            request.upload.onprogress = (event) => {
              if (!event.lengthComputable) return;
              const percent = Math.min(100, Math.round(((completedBytes + event.loaded) / file.size) * 100));
              if (uploadProgressBar) uploadProgressBar.value = percent;
              if (uploadProgressPercent) uploadProgressPercent.textContent = percent + "%";
              if (uploadProgressLabel) uploadProgressLabel.textContent = "Uploading video…";
            };
            request.onload = () => {
              let data = {};
              try { data = JSON.parse(request.responseText || "{}"); } catch {}
              if (request.status >= 200 && request.status < 300) chunkResolve(data);
              else chunkReject(new Error(data.error || "Upload chunk failed (HTTP " + request.status + ")."));
            };
            request.onerror = () => chunkReject(new Error("Upload chunk failed: network connection was interrupted."));
            request.ontimeout = () => chunkReject(new Error("Upload chunk timed out."));
            request.onabort = () => chunkReject(new Error("Upload was cancelled."));
            request.send(chunk);
          }).catch(async (error) => {
            if (attempts >= 5) throw error;
            showToast("Connection interrupted. Retrying this upload section…");
            await new Promise((retryResolve) => setTimeout(retryResolve, Math.min(1000 * attempts, 4000)));
            return null;
          });
          if (result !== null) uploaded = true;
        }
        completedBytes += chunk.size;
        const percent = Math.min(100, Math.round((completedBytes / file.size) * 100));
        if (uploadProgressBar) uploadProgressBar.value = percent;
        if (uploadProgressPercent) uploadProgressPercent.textContent = percent + "%";
        if (uploadProgressLabel) uploadProgressLabel.textContent = "Uploading video…";
      }
      const completed = await api("/api/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ uploadId, filename: file.name, totalChunks, totalSize: file.size })
      });
      resolve(completed);
    } catch (error) {
      reject(error);
    }
  });
  activeUploadRequest = null;
  const uploadedVideo = (await api("/api/videos", { method: "POST", body: JSON.stringify({ projectId: uploadProjectId, name: file.name, sourceUrl: upload.url }) })).video;
  duration = Number(uploadedVideo?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ClipForge could not read the uploaded video's duration on the server.");
  if (currentProject?.id !== uploadProjectId) {
    showToast("Video uploaded to the original project. The current project was changed during upload.");
    return;
  }
  sourceVideo = uploadedVideo;
  uploadCommitted = true;
  const deleteSourceButton = document.querySelector("#delete-source-video");
  if (deleteSourceButton) deleteSourceButton.hidden = false;
  timelineMaximum = Math.max(1, Math.floor(duration));
  startInput.max = timelineMaximum;
  endInput.max = timelineMaximum;
  startInput.value = 0;
  endInput.value = Math.min(24, timelineMaximum);
  updateRange();
  if (uploadProgressBar) uploadProgressBar.value = 100;
  if (uploadProgressPercent) uploadProgressPercent.textContent = "100%";
  if (uploadProgressLabel) uploadProgressLabel.textContent = "Upload complete";
  showToast("Video uploaded. ClipForge AI is starting automatic clipping…");
  const autoClipProjectId = currentProject?.id;
  const autoClipVideoId = uploadedVideo.id;
  try {
    const autoClipResult = await api(`/api/videos/${encodeURIComponent(autoClipVideoId)}/auto-clip`, {
      method: "POST",
      body: JSON.stringify({
        limit: Number(document.querySelector("#ai-clip-count")?.value) || 10,
        format: document.querySelector("#ai-output-format")?.value || "9:16",
        captions: document.querySelector("#ai-caption-enabled")?.value !== "false",
        style: captionStyle,
        profile: document.querySelector("#ai-content-profile")?.value || window.localStorage.getItem("clipforge-content-profile") || "creator",
        language: transcriptionLanguage?.value || safeStorageParse(transcriptionLanguageKey, "auto"),
        captionLanguage: captionLanguageSelect?.value || safeStorageParse(captionLanguageKey, "original"),
      }),
    });
    if (currentProject?.id !== autoClipProjectId || sourceVideo?.id !== autoClipVideoId) return;
    showToast(autoClipResult?.status === "processing" ? "Upload verified. ClipForge is now processing your strongest moments." : "Upload complete. ClipForge started processing.");
    void pollAutoClipStatus(autoClipVideoId);
  } catch (error) {
    if (currentProject?.id === autoClipProjectId && sourceVideo?.id === autoClipVideoId) {
      showToast(`Upload finished, but automatic clipping could not start: ${error.message}`);
      document.querySelector("#transcript-dialog")?.showModal();
    }
  }
  } finally {
    if (!uploadCommitted) {
      if (currentProject?.id === uploadProjectId && previousSourceVideo?.id) restoreSourcePreview(previousSourceVideo);
      else if (currentProject?.id === uploadProjectId) clearSourcePreview();
      uploadProgress?.setAttribute("hidden", "");
    }
    uploadInFlight = false;
    activeUploadRequest = null;
  }
}

async function refreshClipStatuses({ showReadyToast = false } = {}) {
  if (!apiSession || !clips.length) return;
  const pollingProjectId = currentProject?.id;
  try {
    const previous = new Map(clips.map((clip) => [clip.id, clip.status]));
    const result = await api("/api/clips");
    if (currentProject?.id !== pollingProjectId) return;
    clips = result.clips.filter((clip) => clip.projectId === pollingProjectId);
    renderClipLibrary();
    if (showReadyToast) {
      const becameReady = clips.filter((clip) => previous.get(clip.id) && previous.get(clip.id) !== "ready" && clip.status === "ready");
      if (becameReady.length) showToast(`${becameReady.length} clip${becameReady.length === 1 ? "" : "s"} ready to download.`);
    }
  } catch {
    // A temporary polling failure should not interrupt editing.
  }
}

let statusPollTimer;

function startClipStatusPolling() {
  window.clearInterval(statusPollTimer);
  statusPollTimer = undefined;
  if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) return;
  const pollingProjectId = currentProject?.id;
  statusPollTimer = window.setInterval(async () => {
    if (currentProject?.id !== pollingProjectId) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = undefined;
      return;
    }
    if (statusPollInFlight) return;
    statusPollInFlight = true;
    try {
      await refreshClipStatuses({ showReadyToast: true });
    } finally {
      statusPollInFlight = false;
    }
    if (currentProject?.id !== pollingProjectId || !clips.some((clip) => !["ready", "failed"].includes(clip.status))) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = undefined;
    }
  }, 2500);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}


async function loadProducerPlan() {
  if (!currentProject?.id || !libraryProducerPlanButton || !libraryProducerPlan) return;
  libraryProducerPlanButton.disabled = true;
  libraryProducerPlanButton.textContent = "Planning…";
  try {
    const result = await api("/api/projects/" + encodeURIComponent(currentProject.id) + "/producer-plan");
    const plan = result.plan || {};
    const priorities = (plan.priorities || []).map((item) => "<li><b>" + escapeHtml(item.label) + "</b><span>" + escapeHtml(item.recommendation) + "</span></li>").join("");
    const performance = plan.performance || {};
    const proven = (plan.provenTypes || []).join(", ");
    const learning = performance.trackedClips ? "Performance: " + performance.trackedClips + " tracked · " + performance.totals.views.toLocaleString() + " views · " + (performance.engagementRate ?? 0) + "% engagement" + (proven ? " · Proven: " + escapeHtml(proven) : "") : "No performance data yet — log published clip results to teach the Producer what your audience responds to.";
    const mix = (plan.mix || []).slice(0, 5).map((item) => escapeHtml(item.label) + ": " + item.count).join(" · ");
    const nextPublish = plan.nextPublish?.label ? "<div class=\"producer-next-publish\"><b>Next publish:</b> " + escapeHtml(plan.nextPublish.label) + " <small>(" + escapeHtml(plan.nextPublish.confidence || "medium") + " confidence)</small><span>" + escapeHtml(plan.nextPublish.reason || "") + "</span></div>" : "";
    const platformSummary = (performance.byPlatform || []).slice(0, 3).map((item) => escapeHtml(item.platform) + ": " + item.views.toLocaleString() + " views").join(" · ");
    const platformRecommendation = plan.platformRecommendation?.reason ? "<p><b>Platform focus:</b> " + escapeHtml(plan.platformRecommendation.reason) + "</p>" : "";
    const platformEngagement = plan.platformRecommendation?.engagementReason ? "<p><b>Engagement signal:</b> " + escapeHtml(plan.platformRecommendation.engagementReason) + "</p>" : "";
    const nextPublishPlan = plan.nextPublishPlan?.typeLabel
      ? "<div class=\"producer-next-publish producer-next-publish-plan\"><b>Next publish recipe:</b> " + escapeHtml(plan.nextPublishPlan.typeLabel) + (plan.nextPublishPlan.platform ? " on " + escapeHtml(plan.nextPublishPlan.platform) : "") + " <small>(" + escapeHtml(plan.nextPublishPlan.confidence || "medium") + " confidence)</small><span>" + escapeHtml(plan.nextPublishPlan.reason || "") + "</span></div>"
      : "";

    const targetTypes = (plan.priorities || []).map((item) => item.type).filter(Boolean).slice(0, 3);
    if (libraryProducerCreateButton) {
      libraryProducerCreateButton.disabled = !sourceVideo?.id || !targetTypes.length;
      libraryProducerCreateButton.dataset.targetTypes = targetTypes.join(",");
      libraryProducerCreateButton.textContent = targetTypes.length ? "Create priority clips" : "Priority mix complete";
    }
    libraryProducerPlan.innerHTML = "<div class=\"producer-plan-head\"><strong>AI Producer Plan</strong><span>" + escapeHtml(plan.strategy?.label || "Creator") + "</span></div>" +
      "<p>" + (plan.averageScore === null ? "No scored clips yet." : "Average AI score: <b>" + plan.averageScore + "/100</b>") + (mix ? " · " + mix : "") + "</p>" +
      "<p>" + learning + "</p>" + (platformSummary ? "<p>Platforms: " + platformSummary + "</p>" : "") + platformRecommendation + platformEngagement + nextPublishPlan + nextPublish + (priorities ? "<ul>" + priorities + "</ul>" : "<p>Your current clip mix covers the main intelligence types. Keep rotating formats to avoid repetition.</p>");
    libraryProducerPlan.hidden = false;
  } catch (error) {
    showToast("Producer plan unavailable: " + error.message);
  } finally {
    libraryProducerPlanButton.disabled = false;
    libraryProducerPlanButton.textContent = "AI Producer Plan";
  }
}

async function createProducerPriorityClips() {
  const videoId = sourceVideo?.id;
  const projectId = currentProject?.id;
  const targetTypes = String(libraryProducerCreateButton?.dataset.targetTypes || "").split(",").map((type) => type.trim()).filter(Boolean).slice(0, 3);
  if (!videoId || !projectId || !targetTypes.length) {
    showToast("Upload a source video first, then load the AI Producer Plan.");
    return;
  }
  libraryProducerCreateButton.disabled = true;
  libraryProducerCreateButton.textContent = "Creating…";
  try {
    const format = document.querySelector(".format-option.selected")?.dataset.format || "9:16";
    const profile = window.localStorage.getItem("clipforge-content-profile") || "creator";
    const result = await api("/api/videos/" + encodeURIComponent(videoId) + "/auto-clip", {
      method: "POST",
      body: JSON.stringify({
        limit: 12,
        format,
        style: captionStyle,
        language: transcriptionLanguage?.value || "en",
        profile,
        targetTypes,
      }),
    });
    renderClipLibrary();
    void pollAutoClipStatus(videoId);
    showToast("Producer is creating a priority mix: " + targetTypes.join(", ") + ".");
  } catch (error) {
    showToast("Priority clip creation failed: " + error.message);
  } finally {
    libraryProducerCreateButton.disabled = false;
    libraryProducerCreateButton.textContent = "Create priority clips";
  }
}

function renderClipLibrary() {
  for (const id of [...selectedClipIds]) if (!clips.some((clip) => clip.id === id)) selectedClipIds.delete(id);
  clipCount.textContent = clips.length;
  const query = libraryQuery.trim().toLowerCase();
  const filtered = clips.filter((clip) => {
    const title = String(clip.title || "");
    const matchesQuery = !query || title.toLowerCase().includes(query);
    const matchesFilter = libraryFilter === "all" || (libraryFilter === "favorites" ? favoriteClipIds.has(clip.id) : (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter));
    return matchesQuery && matchesFilter;
  });
  filtered.sort((a, b) => {
    if (librarySort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (librarySort === "longest") return clipDuration(b.start, b.end) - clipDuration(a.start, a.end);
    if (librarySort === "shortest") return clipDuration(a.start, a.end) - clipDuration(b.start, b.end);
    const titleA = String(a.title || "").toLowerCase(), titleB = String(b.title || "").toLowerCase();
    if (librarySort === "az") return titleA.localeCompare(titleB);
    if (librarySort === "za") return titleB.localeCompare(titleA);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  clipsEmpty.hidden = clips.length > 0;
  const readyCount = clips.filter((clip) => clip.status === "ready").length;
  const renderingCount = clips.filter((clip) => !["ready", "failed"].includes(clip.status)).length;
  const failedCount = clips.filter((clip) => clip.status === "failed").length;
  const favoriteCount = clips.filter((clip) => favoriteClipIds.has(clip.id)).length;
  if (libraryProjectOverview) {
    const projectName = currentProject?.name || "Current project";
    const sourceCount = sourceVideo ? 1 : 0;
    const readyDuration = clips.filter((clip) => clip.status === "ready").reduce((sum, clip) => sum + Math.max(0, Number(clip.end) - Number(clip.start)), 0);
    const sourceDuration = sourceVideo?.duration ? Number(sourceVideo.duration) : 0;
    const progressPercent = clips.length ? Math.round((readyCount / clips.length) * 100) : 0;
    if (libraryProjectProgressBar) libraryProjectProgressBar.value = progressPercent;
    if (libraryProjectProgressLabel) libraryProjectProgressLabel.textContent = `${progressPercent}%`;
    if (libraryProjectProgress) libraryProjectProgress.hidden = clips.length === 0;
    const intelligenceCounts = clips.reduce((counts, clip) => { const type = String(clip.highlightType || "").trim(); if (type) counts[type] = (counts[type] || 0) + 1; return counts; }, {});
    const intelligenceSummary = Object.entries(intelligenceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => `${type}: ${count}`).join(" · ");
    const strongestClip = [...clips].sort((a, b) => Number(b.aiScore || 0) - Number(a.aiScore || 0))[0];
    const strategyLabel = String(clips.find((clip) => clip.contentProfileLabel)?.contentProfileLabel || "").trim();
    const scoredClips = clips.filter((clip) => Number.isFinite(Number(clip.aiScore)));
    const averageScore = scoredClips.length ? Math.round(scoredClips.reduce((sum, clip) => sum + Number(clip.aiScore), 0) / scoredClips.length) : 0;
    const contentDna = strongestClip && Number(strongestClip.aiScore) > 0
      ? "Content DNA: " + (strategyLabel ? escapeHtml(strategyLabel) + " · " : "") + escapeHtml(String(strongestClip.highlightType || "insight")) + " lead · " + averageScore + "/100 avg AI score"
      : strategyLabel
        ? "Content DNA: " + escapeHtml(strategyLabel) + (intelligenceSummary ? " · " + escapeHtml(intelligenceSummary) : "")
        : "";
    const trackedPerformance = clips.filter((clip) => clip?.performance && Number.isFinite(Number(clip.performance.views)));
    const performanceViews = trackedPerformance.reduce((sum, clip) => sum + Math.max(0, Number(clip.performance.views) || 0), 0);
    const performanceEngagements = trackedPerformance.reduce((sum, clip) => sum + Math.max(0, Number(clip.performance.likes) || 0) + Math.max(0, Number(clip.performance.comments) || 0) + Math.max(0, Number(clip.performance.shares) || 0), 0);
    const performanceRate = performanceViews ? ((performanceEngagements / performanceViews) * 100).toFixed(2) : null;
    const performanceTypes = {};
    trackedPerformance.forEach((clip) => {
      const type = String(clip.highlightType || "insight").trim() || "insight";
      const entry = performanceTypes[type] || { views: 0, engagements: 0 };
      entry.views += Math.max(0, Number(clip.performance.views) || 0);
      entry.engagements += Math.max(0, Number(clip.performance.likes) || 0) + Math.max(0, Number(clip.performance.comments) || 0) + Math.max(0, Number(clip.performance.shares) || 0);
      performanceTypes[type] = entry;
    });
    const bestPerformance = Object.entries(performanceTypes).sort((a, b) => (b[1].engagements / Math.max(1, b[1].views)) - (a[1].engagements / Math.max(1, a[1].views)))[0];
    const performanceDna = trackedPerformance.length
      ? "Performance DNA: " + trackedPerformance.length + " tracked · " + performanceViews.toLocaleString() + " views" + (performanceRate !== null ? " · " + performanceRate + "% engagement" : "") + (bestPerformance ? " · " + escapeHtml(bestPerformance[0]) + " leads engagement" : "")
      : "";
    libraryProjectOverview.innerHTML = "<strong>" + projectName.replace(/[&<>]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[char])) + "</strong><span>" + sourceCount + " source video" + (sourceCount === 1 ? "" : "s") + "</span><span>" + (sourceDuration ? formatTimestamp(sourceDuration) + " source length" : "Source not loaded") + "</span><span>" + clips.length + " clips</span><span>" + readyCount + " ready</span><span>" + favoriteCount + " favorite" + (favoriteCount === 1 ? "" : "s") + "</span><span>" + formatTimestamp(readyDuration) + " rendered</span>" + (intelligenceSummary ? "<span>Intelligence: " + escapeHtml(intelligenceSummary) + "</span>" : "") + (contentDna ? "<span>" + contentDna + "</span>" : "") + (performanceDna ? "<span>" + performanceDna + "</span>" : "");
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clipDuration(clip.start, clip.end), 0);
  if (librarySummary) librarySummary.textContent = `${clips.length} total · ${readyCount} ready · ${renderingCount} rendering · ${failedCount} failed · ${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"} · ${formatTimestamp(totalDuration)} of content`;
  clipLibrary.innerHTML = filtered.map((clip) => {
    const title = escapeHtml(clip.title || "Untitled clip");
    const format = escapeHtml(clip.format || "9:16");
    const formatClass = format.replace(/:/g, "-");
    const clipId = escapeHtml(clip.id);
    const progress = Math.max(0, Math.min(100, Number(clip.renderProgress) || 0));
    const status = clip.status === "ready"
      ? `<div class="clip-status-actions"><button class="preview-clip" type="button" data-preview-clip="${clipId}">Preview</button><button class="download-clip" type="button" data-download-clip="${clipId}">Download</button></div>`
      : clip.status === "failed"
        ? `<div class="clip-status-actions"><small>Render failed</small><button class="retry-clip" type="button" data-retry-clip="${clipId}">Retry</button></div>`
        : clip.renderJobStatus === "queued"
          ? `<div class="clip-rendering"><small class="rendering-status">Queued for rendering…</small><progress class="clip-render-progress" max="100" value="0" aria-label="Render progress"></progress></div>`
          : `<div class="clip-rendering"><small class="rendering-status">Rendering… ${progress}%</small><progress class="clip-render-progress" max="100" value="${progress}" aria-label="Render progress"></progress></div>`;
    const aiReason = String(clip.aiReason || "").trim();
    const strategyLabel = String(clip.contentProfileLabel || "").trim();
    const highlightType = String(clip.highlightType || "").trim();
    const hookLine = String(clip.hookLine || "").trim();
    const socialCaption = String(clip.socialCaption || "").trim();
    const libraryRelationship = clip.libraryRelationship && typeof clip.libraryRelationship === "object" ? String(clip.libraryRelationship.type || "").trim() : "";
    const intelligence = (aiReason || strategyLabel || highlightType || hookLine || socialCaption) ? `<div class="clip-intelligence"><span>${highlightType ? escapeHtml(highlightType) : "AI pick"}${strategyLabel ? " · " + escapeHtml(strategyLabel) : ""}</span>${hookLine ? `<p><strong>Hook:</strong> ${escapeHtml(hookLine)}</p>` : ""}${socialCaption ? `<p><strong>Caption:</strong> ${escapeHtml(socialCaption)}</p>` : ""}${libraryRelationship && libraryRelationship !== "new" ? `<p><strong>Library:</strong> ${escapeHtml(libraryRelationship)}</p>` : ""}${aiReason ? `<p>${escapeHtml(aiReason)}</p>` : ""}</div>` : "";
const packageButton = (hookLine || socialCaption || title !== "Untitled clip")
  ? `<button class="text-button copy-package-clip" type="button" data-copy-package-clip="${clipId}">Copy content package</button>`
  : "";
    return `<article class="clip-card${favoriteClipIds.has(clip.id) ? " is-favorite" : ""}"><label class="clip-select"><input type="checkbox" data-select-clip="${clipId}" ${selectedClipIds.has(clip.id) ? "checked" : ""} aria-label="Select ${title}" /></label><div class="clip-card-art ${formatClass}"><span>${format}</span><p>${clip.captions ? "CC" : "No captions"}</p></div><div><h3>${title}</h3>${intelligence}<button class="text-button favorite-clip" type="button" data-favorite-clip="${clipId}" aria-pressed="${favoriteClipIds.has(clip.id)}">${favoriteClipIds.has(clip.id) ? "★ Favorited" : "☆ Favorite"}</button><button class="text-button rename-clip" type="button" data-rename-clip="${clipId}">Rename</button><button class="text-button details-clip" type="button" data-details-clip="${clipId}">Details</button>${packageButton}<p>${formatTimestamp(clip.start)}–${formatTimestamp(clip.end)} · ${formatTimestamp(clipDuration(clip.start, clip.end))}</p><button class="text-button clip-source-link" type="button" data-open-source="${clip.videoId}">Source: ${escapeHtml(sourceVideo?.id === clip.videoId ? sourceVideo.name : "Source video")}</button><small>Exported ${new Date(clip.createdAt).toLocaleDateString()}</small><div>${status}</div></div><button class="delete-clip" type="button" data-delete-clip="${clipId}" aria-label="Delete ${title}">×</button></article>`;
  }).join("");
  // Bulk-selection controls are updated directly below; do not call a missing helper here.
  if (librarySelectionSummary) librarySelectionSummary.textContent = `${selectedClipIds.size} selected`;
  if (selectAllClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectAllClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }
  if (selectReadyClipsButton) { const readyTotal = clips.filter((clip) => clip.status === "ready").length; const readySelected = clips.filter((clip) => clip.status === "ready" && selectedClipIds.has(clip.id)).length; selectReadyClipsButton.textContent = readyTotal > 0 && readySelected === readyTotal ? "Clear ready" : "Select ready"; }

  if (selectFailedClipsButton) { const failedTotal = clips.filter((clip) => clip.status === "failed").length; const failedSelected = clips.filter((clip) => clip.status === "failed" && selectedClipIds.has(clip.id)).length; selectFailedClipsButton.textContent = failedTotal > 0 && failedSelected === failedTotal ? "Clear failed" : "Select failed"; }
  if (selectRenderingClipsButton) { const renderingTotal = clips.filter((clip) => !["ready", "failed"].includes(clip.status)).length; const renderingSelected = clips.filter((clip) => !["ready", "failed"].includes(clip.status) && selectedClipIds.has(clip.id)).length; selectRenderingClipsButton.textContent = renderingTotal > 0 && renderingSelected === renderingTotal ? "Clear rendering" : "Select rendering"; }

  if (selectAllStatusClipsButton) { selectAllStatusClipsButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Select all statuses"; }
  if (invertClipSelectionButton) { invertClipSelectionButton.textContent = selectedClipIds.size === clips.length && clips.length > 0 ? "Clear all" : "Invert selection"; }

  if (selectVisibleClipsButton) { const query = libraryQuery.trim().toLowerCase(); const visible = clips.filter((clip) => { const title = String(clip.title || ""); const matchesQuery = !query || title.toLowerCase().includes(query); const matchesFilter = libraryFilter === "all" || (libraryFilter === "favorites" ? favoriteClipIds.has(clip.id) : (libraryFilter === "rendering" ? !["ready", "failed"].includes(clip.status) : clip.status === libraryFilter)); return matchesQuery && matchesFilter; }); const visibleSelected = visible.filter((clip) => selectedClipIds.has(clip.id)).length; selectVisibleClipsButton.textContent = visible.length > 0 && visibleSelected === visible.length ? "Clear visible" : "Select visible"; }
  if (selectUntaggedClipsButton) { const uncaptioned = clips.filter((clip) => !clip.captions); const selected = uncaptioned.filter((clip) => selectedClipIds.has(clip.id)); selectUntaggedClipsButton.textContent = uncaptioned.length > 0 && selected.length === uncaptioned.length ? "Clear no captions" : "Select no captions"; }
  if (selectCaptionedClipsButton) { const captioned = clips.filter((clip) => Boolean(clip.captions)); const selected = captioned.filter((clip) => selectedClipIds.has(clip.id)); selectCaptionedClipsButton.textContent = captioned.length > 0 && selected.length === captioned.length ? "Clear captions" : "Select captions"; }
  if (selectLongClipsButton) { const longClips = clips.filter((clip) => clipDuration(clip.start, clip.end) >= 60); const selected = longClips.filter((clip) => selectedClipIds.has(clip.id)); selectLongClipsButton.textContent = longClips.length > 0 && selected.length === longClips.length ? "Clear long clips" : "Select long clips"; }
  if (selectShortClipsButton) { const shortClips = clips.filter((clip) => clipDuration(clip.start, clip.end) < 60); const selected = shortClips.filter((clip) => selectedClipIds.has(clip.id)); selectShortClipsButton.textContent = shortClips.length > 0 && selected.length === shortClips.length ? "Clear short clips" : "Select short clips"; }
}

async function refreshClipLibraryWhileRendering() {
  const pollingProjectId = currentProject?.id;
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (currentProject?.id !== pollingProjectId) return;
    try {
      const result = await api("/api/clips");
      if (currentProject?.id !== pollingProjectId) return;
      clips = result.clips.filter((clip) => clip.projectId === pollingProjectId);
      renderClipLibrary();
      if (!clips.some((clip) => !["ready", "failed"].includes(clip.status))) break;
    } catch {
      // Keep polling through temporary API/network failures; the next attempt can recover.
    }
  }
}

async function pollAutoClipStatus(videoId, pollOptions = {}) {
  if (!videoId || automaticClipPolls.has(videoId)) return;
  automaticClipPolls.add(videoId);
  const pollingProjectId = currentProject?.id;
  try {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (currentProject?.id !== pollingProjectId || sourceVideo?.id !== videoId) return;
      const language = pollOptions.language || transcriptionLanguage?.value || "auto";
      const captionLanguage = pollOptions.captionLanguage || captionLanguageSelect?.value || safeStorageParse(captionLanguageKey, "original");
      try {
        const result = await api(`/api/videos/${encodeURIComponent(videoId)}/auto-clip-status?language=${encodeURIComponent(language)}&captionLanguage=${encodeURIComponent(captionLanguage)}`);
        if (currentProject?.id !== pollingProjectId || sourceVideo?.id !== videoId) return;
        if (Array.isArray(result.clips)) {
          clips = [...result.clips, ...clips.filter((clip) => !result.clips.some((item) => item.id === clip.id))];
          renderClipLibrary();
        }
        const status = result.analysisStatus?.status;
        if (status === "completed") {
          showToast(result.analysisStatus?.reused
            ? "ClipForge restored your existing AI clips."
            : `AI analysis finished: ${result.total || result.analysisStatus?.generated || 0} clips found. Rendering is continuing in My clips.`);
          startClipStatusPolling();
          return;
        }
        if (status === "failed") {
          showToast(`AI clipping failed: ${result.analysisStatus?.error || "Automatic clipping could not complete."}`);
          return;
        }
      } catch (error) {
        if (error?.status === 404) return;
        // Keep polling through temporary network failures.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (currentProject?.id === pollingProjectId && sourceVideo?.id === videoId) {
      showToast("AI clipping is taking longer than expected. Your run is still saved and can continue in the background.");
    }
  } finally {
    automaticClipPolls.delete(videoId);
  }
}
function stopPlayback() {
  window.clearInterval(playbackTimer);
  playbackTimer = undefined;
  previewElement?.pause();
  playbackButton.textContent = "▶";
  playbackButton.setAttribute("aria-label", "Play clip");
}

function startPlayback() {
  stopPlayback();
  if (previewElement) {
    previewElement.currentTime = Number(startInput.value);
    void previewElement.play().catch(() => {});
  }
  playbackButton.textContent = "❚❚";
  playbackButton.setAttribute("aria-label", "Pause clip");
  playbackTimer = window.setInterval(() => {
    const current = previewElement ? previewElement.currentTime : Number(startInput.value);
    playhead.style.left = `${(current / timelineMaximum) * 100}%`;
    if (current >= Number(endInput.value)) { stopPlayback(); return; }
    if (!previewElement) startInput.value = current + 1;
  }, 250);
}

function updateFromPointer(event) {
  const bounds = timelineTrack.getBoundingClientRect();
  if (!bounds.width || !Number.isFinite(timelineMaximum) || timelineMaximum <= 0) return;
  const second = Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * timelineMaximum);
  const current = getRange();
  if (draggedHandle === "start") startInput.value = Math.min(second, current.end - 1);
  if (draggedHandle === "end") endInput.value = Math.max(second, current.start + 1);
  updateRange();
}



async function openAIGenerationDialog() {
  if (!apiSession?.user) {
    showAccountDialog("login");
    return;
  }
  if (!currentProject?.id) {
    showToast("Create or open a project before generating clips.");
    return;
  }
  if (!sourceVideo?.id) {
    showToast("Upload a source video first. ClipForge needs a real video before it can find moments.");
    sourceUpload?.click();
    return;
  }
  const dialog = document.querySelector("#transcript-dialog");
  const transcriptInput = document.querySelector("#transcript-input");
  if (transcriptInput && Array.isArray(sourceVideo.transcript) && !transcriptInput.value.trim()) {
    transcriptInput.value = sourceVideo.transcript.map((segment) =>
      [segment.start, segment.end, segment.speaker || "", segment.text].join(" | ")
    ).join("\n");
  }
  if (dialog && !dialog.open) dialog.showModal();
}

function generationOptions() {
  return {
    limit: Math.max(5, Math.min(50, Number(document.querySelector("#ai-clip-count")?.value) || 10)),
    format: document.querySelector("#ai-output-format")?.value || document.querySelector(".format-option.selected")?.dataset.format || "9:16",
    captions: document.querySelector("#ai-caption-enabled")?.value !== "false",
    style: captionStyle,
    profile: document.querySelector("#ai-content-profile")?.value || "creator",
    language: transcriptionLanguage?.value || "auto",
    captionLanguage: captionLanguageSelect?.value || "original",
  };
}

async function transcribeCurrentVideo() {
  if (!sourceVideo?.id) throw new Error("Upload a source video before transcribing.");
  const button = document.querySelector("#auto-transcribe");
  const transcriptInput = document.querySelector("#transcript-input");
  if (button) { button.disabled = true; button.textContent = "Transcribing…"; }
  try {
    const result = await api("/api/videos/" + encodeURIComponent(sourceVideo.id) + "/transcribe", {
      method: "POST",
      body: JSON.stringify({ language: transcriptionLanguage?.value || "auto", captionLanguage: captionLanguageSelect?.value || "original" }),
    });
    if (!Array.isArray(result.transcript) || !result.transcript.length) throw new Error("No speech was detected in this video.");
    if (transcriptInput) transcriptInput.value = result.transcript.map((segment) =>
      [segment.start, segment.end, segment.speaker || "", segment.text].join(" | ")
    ).join("\n");
    sourceVideo = { ...sourceVideo, transcript: result.transcript, transcriptFormat: "auto-stt", transcriptLanguage: transcriptionLanguage?.value || "auto" };
    showToast("Transcript ready. Review it, then choose Generate clips.");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Transcribe video automatically"; }
  }
}

async function importTranscriptFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error("Transcript files must be smaller than 5 MB.");
  const text = await file.text();
  if (!text.trim()) throw new Error("That transcript file is empty.");
  const transcriptInput = document.querySelector("#transcript-input");
  if (transcriptInput) transcriptInput.value = text;
  showToast("Transcript imported. Choose Generate clips to continue.");
}

async function runAIGeneration(event) {
  event?.preventDefault();
  const button = document.querySelector("#run-ai-generation");
  const transcriptInput = document.querySelector("#transcript-input");
  const dialog = document.querySelector("#transcript-dialog");
  if (!sourceVideo?.id) {
    showToast("Upload a source video before generating clips.");
    return;
  }
  const options = generationOptions();
  const transcriptText = String(transcriptInput?.value || "").trim();
  if (button) { button.disabled = true; button.textContent = "Preparing clips…"; }
  try {
    let result;
    if (transcriptText) {
      const ext = document.querySelector("#transcript-file")?.dataset.format || "auto";
      await api("/api/videos/" + encodeURIComponent(sourceVideo.id) + "/transcript", {
        method: "POST",
        body: JSON.stringify({ text: transcriptText, format: ext, language: options.language }),
      });
      result = await api("/api/videos/" + encodeURIComponent(sourceVideo.id) + "/auto-clip", {
        method: "POST",
        body: JSON.stringify(options),
      });
      if (sourceVideo) sourceVideo = { ...sourceVideo, transcriptFormat: ext, transcriptLanguage: options.language };
      dialog?.close();
      switchView("clips");
      history.replaceState(null, "", "#clips");
      showToast(result?.status === "processing"
        ? "ClipForge is analyzing your transcript and finding the strongest moments."
        : "ClipForge started AI clipping.");
      void pollAutoClipStatus(sourceVideo.id, { language: options.language, captionLanguage: options.captions ? options.captionLanguage : "original" });
    } else {
      result = await api("/api/videos/" + encodeURIComponent(sourceVideo.id) + "/auto-clip", {
        method: "POST",
        body: JSON.stringify(options),
      });
      dialog?.close();
      showToast(result?.status === "processing" ? "ClipForge is analyzing your video and finding the strongest moments." : "ClipForge started AI clipping.");
      void pollAutoClipStatus(sourceVideo.id);
    }
  } catch (error) {
    showToast("AI clip generation failed: " + error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = "Generate clips"; }
  }
}

async function createWorkspaceProject() {
  if (!apiSession?.user) {
    showAccountDialog("login");
    return;
  }
  const name = window.prompt("Name your new project", "Untitled project");
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) {
    showToast("Enter a project name to continue.");
    return;
  }
  try {
    const result = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: trimmedName }),
    });
    const projects = (await api("/api/projects")).projects;
    currentProject = result.project;
    renderProjectSelector(projects);
    renderDashboard(projects);
    await loadProject(currentProject.id);
    switchView("editor");
    history.replaceState(null, "", "#editor");
    showToast("Project created. Your workspace is ready.");
  } catch (error) {
    showToast("Could not create project: " + error.message);
  }
}

async function renameWorkspaceProject() {
  if (!currentProject?.id) {
    showToast("Choose a project first.");
    return;
  }
  const name = window.prompt("Rename project", currentProject.name);
  if (name === null) return;
  const trimmedName = name.trim();
  if (!trimmedName) {
    showToast("Project name cannot be empty.");
    return;
  }
  try {
    const result = await api("/api/projects/" + encodeURIComponent(currentProject.id), {
      method: "PATCH",
      body: JSON.stringify({ name: trimmedName }),
    });
    currentProject = result.project;
    document.querySelector("#workspace-title").textContent = currentProject.name;
    const projects = (await api("/api/projects")).projects;
    renderProjectSelector(projects);
    renderDashboard(projects);
    showToast("Project renamed.");
  } catch (error) {
    showToast("Could not rename project: " + error.message);
  }
}

async function deleteWorkspaceProject() {
  if (!currentProject?.id) {
    showToast("Choose a project first.");
    return;
  }
  if (!window.confirm('Delete "' + currentProject.name + '" and its videos and clips? This cannot be undone.')) return;
  const deletedId = currentProject.id;
  try {
    await api("/api/projects/" + encodeURIComponent(deletedId), { method: "DELETE" });
    const projects = (await api("/api/projects")).projects;
    if (!projects.length) {
      currentProject = null;
      await ensureWorkspace();
    } else {
      currentProject = projects[0];
      renderProjectSelector(projects);
      renderDashboard(projects);
      await loadProject(currentProject.id);
    }
    switchView("editor");
    history.replaceState(null, "", "#editor");
    showToast("Project deleted.");
  } catch (error) {
    showToast("Could not delete project: " + error.message);
  }
}

async function deleteSourceVideo() {
  if (!sourceVideo?.id) {
    showToast("There is no source video to delete.");
    return;
  }
  if (!window.confirm("Delete this source video and its clips? This cannot be undone.")) return;
  const videoId = sourceVideo.id;
  const projectId = currentProject?.id;
  try {
    await api("/api/videos/" + encodeURIComponent(videoId), { method: "DELETE" });
    if (projectId && currentProject?.id === projectId) await loadProject(projectId);
    showToast("Source video and its clips deleted.");
  } catch (error) {
    showToast("Could not delete source video: " + error.message);
  }
}

async function exportCurrentClip() {
  if (!sourceVideo?.id || !currentProject?.id) {
    showToast("Upload a source video before exporting a clip.");
    return;
  }
  const clipRange = getRange();
  const selectedFormat = document.querySelector(".format-option.selected")?.dataset.format || "9:16";
  const captionsEnabled = Boolean(captionToggle?.checked);
  const button = document.querySelector("#export-button");
  if (button) button.disabled = true;
  try {
    const result = await api("/api/clips", {
      method: "POST",
      body: JSON.stringify({
        videoId: sourceVideo.id,
        start: clipRange.start,
        end: clipRange.end,
        title: (sourceVideo.name || "ClipForge video").replace(/\.[^.]+$/, "") + " clip " + formatTimestamp(clipRange.start),
        format: selectedFormat,
        captions: captionsEnabled,
        style: captionStyle,
      }),
    });
    const clip = result.clip;
    if (clip && !clips.some((item) => item.id === clip.id)) clips.unshift(clip);
    renderClipLibrary();
    startClipStatusPolling();
    switchView("clips");
    history.replaceState(null, "", "#clips");
    showToast("Clip queued for rendering. Track progress in My clips.");
  } catch (error) {
    showToast("Export could not start: " + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function switchView(view) {
  const isDashboard = view === "dashboard";
  const workspace = document.querySelector("#workspace");
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === view));
  const dashboard = document.querySelector("#dashboard");
  if (dashboard) dashboard.hidden = !isDashboard;
  if (workspace) workspace.hidden = isDashboard;
  document.querySelectorAll("#workspace .editor, #workspace .secondary-view").forEach((section) => { section.hidden = section.id !== view; });
  if (view === "clips") renderClipLibrary();
}

[startInput, endInput].forEach((input) => input.addEventListener("input", updateRange));

document.querySelectorAll(".format-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".format-option").forEach((option) => { option.classList.remove("selected"); option.setAttribute("aria-checked", "false"); });
    button.classList.add("selected");
    button.setAttribute("aria-checked", "true");
    document.querySelector(".format-badge").textContent = button.dataset.format;
    showToast(`Canvas changed to ${button.dataset.format}.`);
  });
});

volumeInput?.addEventListener("input", () => { if (previewElement) previewElement.volume = Number(volumeInput.value); });
playbackButton.addEventListener("click", () => (playbackTimer ? stopPlayback() : startPlayback()));
cancelUploadButton?.addEventListener("click", () => {
  if (!activeUploadRequest) return;
  activeUploadRequest.abort();
  activeUploadRequest = null;
  uploadProgress?.setAttribute("hidden", "");
  showToast("Upload cancelled.");
});

// Restore the missing file-picker wiring: without this listener, choosing a gallery
// video never calls uploadSource(), so the preview and upload flow remain unchanged.
sourceUpload?.addEventListener("change", async () => {
  const file = sourceUpload.files?.[0];
  if (!file) return;
  try {
    await uploadSource(file);
  } catch (error) {
    showToast(`Video upload failed: ${error?.message || "Please try again."}`);
  } finally {
    // Let the user choose the same file again after a failed attempt.
    sourceUpload.value = "";
  }
});

videoDropzone?.addEventListener("click", (event) => {
  if (event.target.closest("button, input, a, video")) return;
  sourceUpload?.click();
});
videoDropzone?.addEventListener("keydown", (event) => {
  if (event.target !== videoDropzone || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  sourceUpload?.click();
});
videoDropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  videoDropzone.classList.add("is-dragging");
});
videoDropzone?.addEventListener("dragleave", (event) => {
  if (event.relatedTarget && videoDropzone.contains(event.relatedTarget)) return;
  videoDropzone.classList.remove("is-dragging");
});
videoDropzone?.addEventListener("drop", async (event) => {
  event.preventDefault();
  videoDropzone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await uploadSource(file);
  } catch (error) {
    showToast(`Video upload failed: ${error?.message || "Please try again."}`);
  }
});

// Password visibility controls must live in this same-origin module because the app's CSP blocks inline event handlers.
document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".password-visibility-toggle");
  if (!toggle) return;
  const field = toggle.parentElement?.querySelector("input");
  if (!field) return;
  const showPassword = field.type === "password";
  field.type = showPassword ? "text" : "password";
  toggle.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
  toggle.setAttribute("aria-pressed", String(showPassword));
  const label = toggle.querySelector(".toggle-label");
  if (label) label.textContent = showPassword ? "Hide" : "Show";
});



document.querySelector("#generate-ai-clips")?.addEventListener("click", () => { void openAIGenerationDialog(); });
document.querySelector("#library-ai-generate")?.addEventListener("click", () => { void openAIGenerationDialog(); });
document.querySelector("#auto-transcribe")?.addEventListener("click", async () => {
  try { await transcribeCurrentVideo(); }
  catch (error) { showToast("Transcription failed: " + error.message); }
});
document.querySelector("#transcript-file")?.addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  input.dataset.format = /\.srt$/i.test(file.name) ? "srt" : /\.vtt$/i.test(file.name) ? "vtt" : "auto";
  try { await importTranscriptFile(file); }
  catch (error) { showToast("Transcript import failed: " + error.message); }
  finally { input.value = ""; }
});
document.querySelector("#run-ai-generation")?.addEventListener("click", (event) => { void runAIGeneration(event); });
document.querySelector("#style-button")?.addEventListener("click", () => {
  if (styleDialog && !styleDialog.open) styleDialog.showModal();
});
document.querySelector("#save-style")?.addEventListener("click", (event) => {
  event.preventDefault();
  applyCaptionStyle({
    color: document.querySelector("#highlight-color")?.value || "lime",
    weight: document.querySelector("#caption-weight")?.value || "bold",
  });
  styleDialog?.close();
  showToast("Caption style saved.");
});

newProjectButton?.addEventListener("click", () => { void createWorkspaceProject(); });
dashboardNewProjectButton?.addEventListener("click", () => { void createWorkspaceProject(); });
document.querySelector("#rename-project")?.addEventListener("click", () => { void renameWorkspaceProject(); });
deleteProjectButton?.addEventListener("click", () => { void deleteWorkspaceProject(); });
document.querySelector("#delete-source-video")?.addEventListener("click", () => { void deleteSourceVideo(); });
document.querySelector("#export-button")?.addEventListener("click", () => { void exportCurrentClip(); });
projectSelect?.addEventListener("change", async () => {
  const projectId = projectSelect.value;
  if (!projectId || projectId === currentProject?.id) return;
  try {
    await loadProject(projectId);
    switchView("editor");
    history.replaceState(null, "", "#editor");
    showToast("Project opened.");
  } catch (error) {
    showToast("Could not open project: " + error.message);
  }
});
document.querySelector("#dashboard-open-library")?.addEventListener("click", () => {
  switchView("clips");
  history.replaceState(null, "", "#clips");
});
document.addEventListener("click", async (event) => {
  const downloadButton = event.target.closest("[data-download-clip]");
  if (downloadButton) {
    const clipId = downloadButton.dataset.downloadClip;
    const clip = clips.find((item) => item.id === clipId);
    if (!clip || clip.status !== "ready") {
      showToast("This clip is not ready to download yet.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = "/api/clips/" + encodeURIComponent(clip.id) + "/download";
    anchor.download = (String(clip.title || "clip").replace(/[\\\\/:*?"<>|]+/g, "-").trim() || "clip") + ".mp4";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  const previewButton = event.target.closest("[data-preview-clip]");
  if (!previewButton) return;
  const clipId = previewButton.dataset.previewClip;
  const clip = clips.find((item) => item.id === clipId);
  if (!clip || clip.status !== "ready") {
    showToast("This clip is not ready to preview yet.");
    return;
  }
  if (!clipPreviewDialog || !clipPreviewVideo) {
    showToast("The clip preview player is unavailable.");
    return;
  }
  clipPreviewTitle.textContent = clip.title || "Clip preview";
  clipPreviewVideo.pause();
  clipPreviewVideo.removeAttribute("src");
  clipPreviewVideo.src = "/api/clips/" + encodeURIComponent(clip.id) + "/stream";
  clipPreviewVideo.load();
  if (!clipPreviewDialog.open) clipPreviewDialog.showModal();
  try {
    await clipPreviewVideo.play();
  } catch {
    // Some mobile browsers require the user to tap the player's play control.
  }
});
document.querySelector("#close-clip-preview")?.addEventListener("click", () => {
  clipPreviewVideo?.pause();
  if (clipPreviewDialog?.open) clipPreviewDialog.close();
});
clipPreviewDialog?.addEventListener("close", () => {
  clipPreviewVideo?.pause();
  if (clipPreviewVideo) {
    clipPreviewVideo.removeAttribute("src");
    clipPreviewVideo.load();
  }
});
clipPreviewVideo?.addEventListener("error", () => {
  if (clipPreviewDialog?.open) showToast("Preview could not load. The rendered video may no longer be in storage.");
});

fullscreenButton?.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await appShell?.requestFullscreen();
    fullscreenButton.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  } catch {
    showToast("Full-screen mode is not available in this browser.");
  }
});

wireAuthenticationBoundary();
