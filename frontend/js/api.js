/**
 * API Bridge for Sage Interactive AI Teacher.
 */

const API_BASE = "";

const API = {
  sessionId: localStorage.getItem("sage_session_id") || "session_" + Math.random().toString(36).substring(2, 9),

  async uploadFile(file, options = {}) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", this.sessionId);
    formData.append("language", options.language || "English");
    formData.append("urgency", options.urgency || 3);
    formData.append("importance", options.importance || 3);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    return await res.json();
  },

  async pasteText(title, content) {
    const res = await fetch(`${API_BASE}/api/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.sessionId,
        title: title || "Pasted Notes",
        content: content
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to process text");
    }
    return await res.json();
  },

  async loadSample(sampleType = "quantum") {
    const res = await fetch(`${API_BASE}/api/sample?session_id=${encodeURIComponent(this.sessionId)}&sample_type=${encodeURIComponent(sampleType)}`, {
      method: "POST"
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to load sample");
    }
    return await res.json();
  },

  async sendChat(message) {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.sessionId,
        message: message
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Chat request failed");
    }
    return await res.json();
  },

  async updateSettings(settings) {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.sessionId,
        ...settings
      })
    });
    return await res.json();
  },

  async getSession() {
    const res = await fetch(`${API_BASE}/api/session?session_id=${encodeURIComponent(this.sessionId)}`);
    return await res.json();
  },

  async resetSession() {
    const res = await fetch(`${API_BASE}/api/reset?session_id=${encodeURIComponent(this.sessionId)}`, {
      method: "POST"
    });
    return await res.json();
  }
};
