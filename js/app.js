// js/app.js — wires the UI together and runs the end-to-end pipeline.

import { loadSource, cutClip } from "./ffmpegProcessor.js";
import { findHighlights } from "./claudeHighlights.js";
import { extractYoutubeId, buildEmbedUrl, buildShareUrl } from "./youtubeLinks.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  mode: "upload", // "upload" | "youtube"
  videoSource: null, // File or URL string
  youtubeId: null,
  apiKey: localStorage.getItem("keyframe_api_key") || "",
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const clipCountInput = document.getElementById("clipCountInput");
const clipLengthInput = document.getElementById("clipLengthInput");

const tabUpload = document.getElementById("tabUpload");
const tabYoutube = document.getElementById("tabYoutube");
const panelUpload = document.getElementById("panelUpload");
const panelYoutube = document.getElementById("panelYoutube");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const videoUrlInput = document.getElementById("videoUrlInput");
const sourcePreview = document.getElementById("sourcePreview");

const youtubeUrlInput = document.getElementById("youtubeUrlInput");
const youtubeEmbedWrap = document.getElementById("youtubeEmbedWrap");
const youtubeEmbed = document.getElementById("youtubeEmbed");

const transcriptInput = document.getElementById("transcriptInput");
const findHighlightsBtn = document.getElementById("findHighlightsBtn");
const statusMessage = document.getElementById("statusMessage");
const scanIndicator = document.getElementById("scanIndicator");

const resultsSection = document.getElementById("resultsSection");
const filmstrip = document.getElementById("filmstrip");

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

apiKeyInput.value = state.apiKey;

settingsToggle.addEventListener("click", () => {
  const willShow = settingsPanel.hidden;
  settingsPanel.hidden = !willShow;
  settingsToggle.setAttribute("aria-expanded", String(willShow));
});

apiKeyInput.addEventListener("input", () => {
  state.apiKey = apiKeyInput.value.trim();
  localStorage.setItem("keyframe_api_key", state.apiKey);
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function switchTab(mode) {
  state.mode = mode;
  const isUpload = mode === "upload";
  tabUpload.classList.toggle("active", isUpload);
  tabUpload.setAttribute("aria-selected", String(isUpload));
  tabYoutube.classList.toggle("active", !isUpload);
  tabYoutube.setAttribute("aria-selected", String(!isUpload));
  panelUpload.hidden = !isUpload;
  panelYoutube.hidden = isUpload;
}

tabUpload.addEventListener("click", () => switchTab("upload"));
tabYoutube.addEventListener("click", () => switchTab("youtube"));

// ---------------------------------------------------------------------------
// Upload / video URL source
// ---------------------------------------------------------------------------

function handleFileSelected(file) {
  state.videoSource = file;
  videoUrlInput.value = "";
  sourcePreview.hidden = false;
  sourcePreview.src = URL.createObjectURL(file);
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
["dragover", "dragenter"].forEach((evt) => {
  dropzone.addEventListener(evt, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, () => dropzone.classList.remove("drag-over"));
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) handleFileSelected(file);
});

videoUrlInput.addEventListener("change", () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  state.videoSource = url;
  sourcePreview.hidden = false;
  sourcePreview.src = url;
});

// ---------------------------------------------------------------------------
// YouTube source
// ---------------------------------------------------------------------------

youtubeUrlInput.addEventListener("input", () => {
  const id = extractYoutubeId(youtubeUrlInput.value.trim());
  state.youtubeId = id;
  youtubeEmbed.innerHTML = "";
  if (!id) {
    youtubeEmbedWrap.hidden = true;
    return;
  }
  youtubeEmbedWrap.hidden = false;
  const iframe = document.createElement("iframe");
  iframe.src = buildEmbedUrl(id, 0);
  iframe.title = "YouTube video preview";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  youtubeEmbed.appendChild(iframe);
});

// ---------------------------------------------------------------------------
// Status + results helpers
// ---------------------------------------------------------------------------

function setStatus(message, isError) {
  statusMessage.textContent = message || "";
  statusMessage.classList.toggle("is-error", Boolean(isError));
}

function clearResults() {
  filmstrip.innerHTML = "";
  resultsSection.hidden = true;
}

function renderClipCard(highlight) {
  const card = document.createElement("div");
  card.className = "clip-card";

  const timecode = document.createElement("div");
  timecode.className = "clip-timecode";
  timecode.textContent = `${highlight.start} \u2013 ${highlight.end}`;
  card.appendChild(timecode);

  const title = document.createElement("div");
  title.className = "clip-title";
  title.textContent = highlight.title;
  card.appendChild(title);

  if (highlight.reason) {
    const reason = document.createElement("p");
    reason.className = "clip-reason";
    reason.textContent = highlight.reason;
    card.appendChild(reason);
  }

  const actions = document.createElement("div");
  actions.className = "clip-actions";
  card.appendChild(actions);

  filmstrip.appendChild(card);
  return actions;
}

function setCardError(actions, message) {
  actions.innerHTML = "";
  const msg = document.createElement("p");
  msg.className = "clip-card-error";
  msg.textContent = message;
  actions.appendChild(msg);
}

// ---------------------------------------------------------------------------
// YouTube results — links only, never a download
// ---------------------------------------------------------------------------

function renderYoutubeResults(highlights) {
  highlights.forEach((highlight) => {
    const actions = renderClipCard(highlight);
    const shareUrl = buildShareUrl(state.youtubeId, highlight.startSeconds);

    const openLink = document.createElement("a");
    openLink.href = shareUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.className = "btn-secondary";
    openLink.textContent = "Open on YouTube";
    actions.appendChild(openLink);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-secondary";
    copyBtn.textContent = "Copy link";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(shareUrl).then(() => {
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = "Copy link"; }, 1500);
      });
    });
    actions.appendChild(copyBtn);
  });
}

// ---------------------------------------------------------------------------
// Upload / URL results — actually cut with ffmpeg.wasm
// ---------------------------------------------------------------------------

async function renderAndCutVideoResults(highlights) {
  const actionsList = highlights.map((highlight) => {
    const actions = renderClipCard(highlight);
    const placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "btn-secondary";
    placeholder.textContent = "Waiting…";
    placeholder.disabled = true;
    actions.appendChild(placeholder);
    return actions;
  });

  let inputName;
  try {
    inputName = await loadSource(state.videoSource, setStatus);
  } catch (err) {
    setStatus(err.message, true);
    actionsList.forEach((actions) => setCardError(actions, "Video engine failed to load — clip could not be cut."));
    return;
  }

  for (let i = 0; i < highlights.length; i += 1) {
    const highlight = highlights[i];
    const actions = actionsList[i];
    try {
      const { url, filename } = await cutClip(
        inputName,
        highlight.startSeconds,
        highlight.endSeconds,
        i,
        setStatus
      );
      actions.innerHTML = "";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.className = "btn-secondary";
      link.textContent = "Download clip";
      actions.appendChild(link);
    } catch (err) {
      setCardError(actions, "Could not cut this clip.");
    }
  }

  setStatus(`Done \u2014 cut ${highlights.length} clip${highlights.length === 1 ? "" : "s"}.`);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function runFindHighlights() {
  if (state.mode === "upload" && !state.videoSource) {
    setStatus("Add a video file or URL first.", true);
    return;
  }
  if (state.mode === "youtube" && !state.youtubeId) {
    setStatus("Paste a valid YouTube link first.", true);
    return;
  }

  clearResults();
  setStatus("");
  findHighlightsBtn.disabled = true;
  scanIndicator.hidden = false;

  try {
    setStatus("Asking Claude to find the best moments\u2026");
    const highlights = await findHighlights({
      apiKey: state.apiKey,
      transcript: transcriptInput.value,
      clipCount: Number(clipCountInput.value),
      targetLength: Number(clipLengthInput.value),
    });

    if (!highlights.length) {
      setStatus("No highlights came back \u2014 try a longer transcript.", true);
      return;
    }

    resultsSection.hidden = false;

    if (state.mode === "youtube") {
      renderYoutubeResults(highlights);
      setStatus(`Found ${highlights.length} highlights.`);
    } else {
      await renderAndCutVideoResults(highlights);
    }
  } catch (err) {
    setStatus(err.message || "Something went wrong.", true);
  } finally {
    findHighlightsBtn.disabled = false;
    scanIndicator.hidden = true;
  }
}

findHighlightsBtn.addEventListener("click", runFindHighlights);
