/**
 * Main Application Logic for Sage: Interactive Live AI Teacher.
 */

let appState = {
  isLiveActive: false,
  isLiveHandsFree: true,
  currentView: "live", // 'live' | 'desk'
  session: null,
  activeExchange: null
};

document.addEventListener("DOMContentLoaded", () => {
  setupVoiceCallbacks();
  loadInitialSession();
});

function setupVoiceCallbacks() {
  const orb = document.getElementById("live-visualizer");
  const stateBadge = document.getElementById("live-state-badge");
  const interruptBtn = document.getElementById("btn-interrupt");
  const deskMicBtn = document.getElementById("desk-mic-btn");

  // State changes (idle, speaking, listening)
  window.voiceCtrl.onSpeechStateChange = (state) => {
    orb.className = `live-visualizer-orb ${state}`;
    if (state === "speaking") {
      stateBadge.className = "badge-status status-speaking";
      stateBadge.innerText = "Sage is Speaking...";
      interruptBtn.style.display = "inline-flex";
    } else if (state === "listening") {
      stateBadge.className = "badge-status status-listening";
      stateBadge.innerText = "Listening... Speak your thought";
      interruptBtn.style.display = "none";
      if (deskMicBtn) deskMicBtn.classList.add("recording");
    } else {
      stateBadge.className = "badge-status status-ready";
      stateBadge.innerText = appState.isLiveActive ? "Awaiting Next Checkpoint" : "Ready to Study";
      interruptBtn.style.display = "none";
      if (deskMicBtn) deskMicBtn.classList.remove("recording");
    }
  };

  // When student finishes speaking in voice
  window.voiceCtrl.onUserSpeechResult = (transcript) => {
    console.log("Captured speech:", transcript);
    document.getElementById("live-caption-preview").innerText = `You: "${transcript}"`;
    document.getElementById("chat-input").value = transcript;
    
    // Automatically submit if live mode is running
    if (appState.isLiveActive) {
      submitUserTurn(transcript);
    }
  };
}

async function loadInitialSession() {
  try {
    const data = await API.getSession();
    if (data && data.session) {
      renderSessionState(data.session);
      if (data.history && data.history.length > 0) {
        renderHistory(data.history);
      }
    }
  } catch (e) {
    console.log("No previous active session:", e);
  }
}

function switchView(viewName) {
  appState.currentView = viewName;
  const liveStage = document.getElementById("view-live-stage");
  const studyDesk = document.getElementById("view-study-desk");
  const tabLive = document.getElementById("tab-live-stage");
  const tabDesk = document.getElementById("tab-study-desk");

  if (viewName === "live") {
    liveStage.style.display = "flex";
    studyDesk.style.display = "none";
    tabLive.classList.add("active");
    tabDesk.classList.remove("active");
  } else {
    liveStage.style.display = "none";
    studyDesk.style.display = "flex";
    tabLive.classList.remove("active");
    tabDesk.classList.add("active");
  }
}

// Live Session Toggle (NotebookLM Style Live Audio Discussion)
function toggleLiveSession() {
  const btn = document.getElementById("btn-toggle-live");
  const btnText = document.getElementById("live-btn-text");

  if (!appState.isLiveActive) {
    if (!appState.session || !appState.session.document_title) {
      alert("Please upload a document or click a test sample first to anchor the lesson.");
      return;
    }
    appState.isLiveActive = true;
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-warning");
    btnText.innerText = "End Live Talk Session";
    
    // Kick off dialogue
    const lastTeacherMsg = findLastTeacherMessage();
    if (lastTeacherMsg) {
      speakTeacherResponse(lastTeacherMsg);
    } else {
      window.voiceCtrl.startListening();
    }
  } else {
    appState.isLiveActive = false;
    btn.classList.add("btn-primary");
    btn.classList.remove("btn-warning");
    btnText.innerText = "Start Live Interactive Mode";
    window.voiceCtrl.stopSpeaking();
    window.voiceCtrl.stopListening();
  }
}

function interruptTeacher() {
  window.voiceCtrl.stopSpeaking();
  const caption = document.getElementById("live-caption-preview");
  if (caption) caption.innerText = "Teacher paused. Speak or type your thought...";
  window.voiceCtrl.startListening();
}

function toggleMic() {
  if (window.voiceCtrl.isRecognizing) {
    window.voiceCtrl.stopListening();
  } else {
    window.voiceCtrl.startListening();
  }
}

// Upload Handling
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const uploadBtn = event.target.parentElement.querySelector("button");
  const originalText = uploadBtn.innerHTML;
  uploadBtn.innerHTML = "<span>Parsing document & building curriculum...</span>";
  uploadBtn.disabled = true;

  try {
    const urgency = parseInt(document.getElementById("urgency-range").value);
    const importance = parseInt(document.getElementById("importance-range").value);
    const language = document.getElementById("language-select").value;

    const res = await API.uploadFile(file, { urgency, importance, language });
    renderSessionState(res.session);
    
    // Add first teacher greeting to chat & live preview
    addChatMessage("ai", res.first_message);
    updateLiveExchangePreview(res.first_message);
    
    // Speak greeting
    speakTeacherResponse(res.first_message);
  } catch (err) {
    alert("Error uploading file: " + err.message);
  } finally {
    uploadBtn.innerHTML = originalText;
    uploadBtn.disabled = false;
    event.target.value = "";
  }
}

async function loadSample(sampleType) {
  try {
    const res = await API.loadSample(sampleType);
    renderSessionState(res.session);
    addChatMessage("ai", res.first_message);
    updateLiveExchangePreview(res.first_message);
    speakTeacherResponse(res.first_message);
  } catch (err) {
    alert("Error loading sample: " + err.message);
  }
}

// Chat & Voice Turn Submission
async function submitUserTurn(text) {
  if (!text || !text.trim()) return;

  addChatMessage("user", text);
  const caption = document.getElementById("live-caption-preview");
  if (caption) caption.innerText = `Sage is formulating the next lesson step...`;

  try {
    const res = await API.sendChat(text);
    renderSessionState(res.session);
    addChatMessage("ai", res.reply);
    updateLiveExchangePreview(res.reply);

    // Read response aloud
    speakTeacherResponse(res.reply);
  } catch (err) {
    alert("Chat turn failed: " + err.message);
  }
}

function handleSendSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  submitUserTurn(text);
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSendSubmit(event);
  }
}

function speakTeacherResponse(text) {
  const caption = document.getElementById("live-caption-preview");
  if (caption) caption.innerText = text.slice(0, 220) + (text.length > 220 ? "..." : "");

  window.voiceCtrl.speak(text, () => {
    // Finished speaking: if Live Mode is active, automatically listen for student's spoken reply
    if (appState.isLiveActive) {
      setTimeout(() => {
        if (appState.isLiveActive && !window.voiceCtrl.isSpeaking) {
          window.voiceCtrl.startListening();
        }
      }, 400);
    }
  });
}

function updateLiveExchangePreview(teacherText) {
  const container = document.getElementById("live-active-exchange");
  if (!container) return;
  container.innerHTML = `
    <div style="margin-bottom: 8px; color: #a5b4fc; font-weight: 700;">Sage:</div>
    <div>${renderMarkdownText(teacherText)}</div>
  `;
}

// State Rendering & Anti-Drift Guardian Roadmap
function renderSessionState(session) {
  appState.session = session;

  // Header Title & Badge
  const docBadge = document.getElementById("doc-title-badge");
  if (docBadge) {
    docBadge.innerText = session.document_title || "No file loaded";
    docBadge.title = session.document_title || "";
  }

  // Mastery Bar & Text
  const masteryVal = session.overall_mastery_percentage || 0;
  const bar = document.getElementById("header-mastery-bar");
  const txt = document.getElementById("header-mastery-text");
  if (bar) bar.style.width = `${masteryVal}%`;
  if (txt) txt.innerText = `${masteryVal}%`;

  // Active Concept Indicator
  const currPill = document.getElementById("current-concept-pill");
  if (currPill && session.concepts && session.concepts.length > 0) {
    const activeC = session.concepts[session.active_concept_idx];
    currPill.innerText = activeC ? `Topic: ${activeC.title}` : "Curriculum Active";
  }

  // Anti-Drift Concepts Checklist
  const list = document.getElementById("concepts-checklist");
  if (list && session.concepts) {
    if (session.concepts.length === 0) {
      list.innerHTML = `<div class="empty-syllabus">Upload notes to generate the grounded curriculum roadmap.</div>`;
      return;
    }

    list.innerHTML = session.concepts.map((c, idx) => {
      const isActive = idx === session.active_concept_idx;
      const isMastered = c.status === "mastered";
      
      let badgeClass = "badge-pending";
      let badgeText = "Pending";
      if (isMastered) {
        badgeClass = "badge-mastered";
        badgeText = "✓ Mastered";
      } else if (isActive) {
        badgeClass = "badge-current";
        badgeText = "● Active Focus";
      }

      return `
        <div class="concept-item ${isActive ? 'active' : ''} ${isMastered ? 'mastered' : ''}">
          <div class="concept-header-row">
            <span class="concept-title">${idx + 1}. ${escapeHtml(c.title)}</span>
            <span class="concept-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="concept-summary-text">${escapeHtml(c.summary)}</div>
        </div>
      `;
    }).join("");
  }
}

function renderHistory(history) {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;
  container.innerHTML = "";
  history.forEach(item => {
    addChatMessage(item.role === "assistant" ? "ai" : "user", item.content);
  });
}

function addChatMessage(sender, content) {
  const container = document.getElementById("chat-messages-container");
  if (!container) return;

  const row = document.createElement("div");
  row.className = `chat-row ${sender}`;
  row.innerHTML = `
    <div class="avatar ${sender}">${sender === 'ai' ? '🎓' : '👤'}</div>
    <div class="bubble">${renderMarkdownText(content)}</div>
  `;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function findLastTeacherMessage() {
  const container = document.getElementById("chat-messages-container");
  if (!container) return null;
  const aiBubbles = container.querySelectorAll(".chat-row.ai .bubble");
  if (aiBubbles.length > 0) {
    return aiBubbles[aiBubbles.length - 1].innerText;
  }
  return null;
}

// Dial Events
function onUrgencyChange(val) {
  const labels = {
    1: "1 - Deep Dive & Wonder",
    2: "2 - Leisurely Explorer",
    3: "3 - Balanced Classroom",
    4: "4 - High Yield Focus",
    5: "5 - Emergency Cram (1h)"
  };
  document.getElementById("urgency-val-label").innerText = labels[val] || val;
  updatePersonaBadge();
  syncSettings();
}

function onImportanceChange(val) {
  const labels = {
    1: "1 - Casual Curiosity",
    2: "2 - General Interest",
    3: "3 - Standard Academic",
    4: "4 - Graded Exam",
    5: "5 - Mission Critical / Defense"
  };
  document.getElementById("importance-val-label").innerText = labels[val] || val;
  updatePersonaBadge();
  syncSettings();
}

function onLanguageChange(lang) {
  window.voiceCtrl.setLanguage(lang);
  syncSettings();
}

function applyPreset(urgency, importance, label) {
  document.getElementById("urgency-range").value = urgency;
  document.getElementById("importance-range").value = importance;
  onUrgencyChange(urgency);
  onImportanceChange(importance);
  syncSettings();
}

function updatePersonaBadge() {
  const u = document.getElementById("urgency-range").value;
  const i = document.getElementById("importance-range").value;
  const badge = document.getElementById("persona-summary-badge");
  if (badge) {
    if (u >= 4 && i >= 4) badge.innerText = "⚡ Rapid Cram & Drill";
    else if (u <= 2 && i <= 2) badge.innerText = "🌱 Deep Dive Explorer";
    else if (i >= 4) badge.innerText = "🎯 Rigorous Defense";
    else badge.innerText = "📘 Balanced Educator";
  }
}

async function syncSettings() {
  const urgency = parseInt(document.getElementById("urgency-range").value);
  const importance = parseInt(document.getElementById("importance-range").value);
  const language = document.getElementById("language-select").value;

  try {
    await API.updateSettings({ urgency, importance, language });
  } catch (e) {
    console.error("Failed to sync settings:", e);
  }
}

// Modals
function openPasteModal() { document.getElementById("paste-modal").style.display = "flex"; }
function closePasteModal() { document.getElementById("paste-modal").style.display = "none"; }

async function openDeviceModal() {
  document.getElementById("device-modal").style.display = "flex";
  try {
    const res = await fetch("/api/network-info").then(r => r.json());
    if (res.network_url) {
      document.getElementById("network-ip-display").value = res.network_url;
    } else {
      document.getElementById("network-ip-display").value = res.local_url;
    }
  } catch (e) {
    document.getElementById("network-ip-display").value = window.location.origin;
  }
}

function closeDeviceModal() {
  document.getElementById("device-modal").style.display = "none";
}

function copyNetworkIp() {
  const el = document.getElementById("network-ip-display");
  el.select();
  navigator.clipboard.writeText(el.value).then(() => {
    alert("Copied to clipboard! Open this URL on your phone or tablet browser.");
  });
}

async function submitPastedContent() {
  const title = document.getElementById("paste-title").value.trim() || "Pasted Notes";
  const content = document.getElementById("paste-content").value.trim();
  if (!content) {
    alert("Please enter notes or content.");
    return;
  }
  closePasteModal();
  try {
    const res = await API.pasteText(title, content);
    renderSessionState(res.session);
    addChatMessage("ai", res.first_message);
    updateLiveExchangePreview(res.first_message);
    speakTeacherResponse(res.first_message);
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function openSettingsModal() { document.getElementById("settings-modal").style.display = "flex"; }
function closeSettingsModal() { document.getElementById("settings-modal").style.display = "none"; }

async function saveSettings() {
  const geminiKey = document.getElementById("gemini-key-input").value.trim();
  const openaiKey = document.getElementById("openai-key-input").value.trim();
  const rate = parseFloat(document.getElementById("speech-rate-slider").value);
  window.voiceCtrl.speechRate = rate;

  await API.updateSettings({
    gemini_key: geminiKey || null,
    openai_key: openaiKey || null
  });
  closeSettingsModal();
  alert("Settings updated!");
}

// Helpers
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdownText(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Line breaks
  html = html.replace(/\n\n/g, "<br><br>");
  html = html.replace(/\n/g, "<br>");
  return html;
}
