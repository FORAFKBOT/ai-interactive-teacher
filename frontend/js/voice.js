/**
 * Voice & Speech Controller for Sage Interactive AI Teacher.
 * Powers:
 * 1. High-fidelity Gemini audio & Neural Speech synthesis via /api/tts (fluent in Malayalam, English, Hindi, etc.)
 * 2. True Push-to-Talk speech recognition with continuous streaming and instant turn submission on release.
 * 3. Dynamic multi-wave audio visualizer.
 */

class VoiceController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.currentAudio = null;
    
    // States
    this.isRecognizing = false;
    this.isSpeaking = false;
    this.isHoldingPushToTalk = false;
    this.speechRate = 1.0;
    this.currentLanguage = "en-US";
    this.currentLanguageName = "English";
    this.availableVoices = [];

    // Push-to-talk buffers
    this.finalTranscript = "";
    this.latestTranscript = "";
    this.pressStartTime = 0;

    // Callbacks
    this.onUserSpeechResult = null;
    this.onTeacherSpeechStart = null;
    this.onTeacherSpeechEnd = null;
    this.onSpeechStateChange = null; // 'idle' | 'listening' | 'speaking'

    // Canvas visualizer
    this.canvas = document.getElementById("audio-wave-canvas");
    this.canvasCtx = this.canvas ? this.canvas.getContext("2d") : null;
    this.animFrameId = null;
    this.wavePhase = 0;

    this.initVoices();
    this.initRecognition();
    this.startVisualizer();
  }

  initVoices() {
    if (!this.synth) return;
    const populate = () => {
      this.availableVoices = this.synth.getVoices();
    };
    populate();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = populate;
    }
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API is not supported in this browser.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.currentLanguage;

    this.recognition.onstart = () => {
      this.isRecognizing = true;
      if (this.onSpeechStateChange) this.onSpeechStateChange("listening");
      this.updateMicUi(true);
    };

    this.recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this.finalTranscript += " " + event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const combined = (this.finalTranscript + " " + interim).trim();
      if (combined) {
        this.latestTranscript = combined;
        const caption = document.getElementById("live-caption-preview");
        if (caption) {
          caption.innerText = `You: "${combined}..."`;
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.warn("Speech recognition notice:", event.error);
      if (event.error !== "no-speech") {
        this.isRecognizing = false;
        if (!this.isSpeaking && this.onSpeechStateChange) {
          this.onSpeechStateChange("idle");
        }
        this.updateMicUi(false);
      }
    };

    this.recognition.onend = () => {
      // If user is still actively holding push-to-talk button, keep listening
      if (this.isHoldingPushToTalk) {
        try {
          this.recognition.start();
          return;
        } catch (e) {}
      }

      this.isRecognizing = false;
      if (!this.isSpeaking && this.onSpeechStateChange) {
        this.onSpeechStateChange("idle");
      }
      this.updateMicUi(false);
    };
  }

  setLanguage(langName) {
    this.currentLanguageName = langName || "English";
    const map = {
      "english": "en-US",
      "malayalam": "ml-IN",
      "മലയാളം": "ml-IN",
      "hindi": "hi-IN",
      "hinglish": "hi-IN",
      "spanish": "es-ES",
      "french": "fr-FR",
      "german": "de-DE",
      "mandarin": "zh-CN",
      "japanese": "ja-JP",
      "arabic": "ar-SA",
      "portuguese": "pt-BR",
      "bengali": "bn-IN",
      "telugu": "te-IN",
      "tamil": "ta-IN",
      "russian": "ru-RU"
    };

    const key = (langName || "").toLowerCase().split(" ")[0];
    this.currentLanguage = map[key] || "en-US";
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }
  }

  /**
   * Speak response using Gemini audio generation or Google Neural Speech via /api/tts.
   * Produces authentic, human-sounding speech in Malayalam, English, Hindi, etc.
   */
  async speak(text, onComplete) {
    this.stopSpeaking();
    this.stopListening();

    // Strip markdown formatting symbols for natural spoken speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#+\s*/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[⚡🌱📘🔑❓🤔•]/g, "")
      .trim();

    if (!cleanText) {
      if (onComplete) onComplete();
      return;
    }

    this.isSpeaking = true;
    if (this.onTeacherSpeechStart) this.onTeacherSpeechStart();
    if (this.onSpeechStateChange) this.onSpeechStateChange("speaking");

    try {
      // 1. Request Gemini / Google Neural TTS audio from backend
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          language: this.currentLanguageName || this.currentLanguage
        })
      });

      if (!response.ok) {
        throw new Error(`TTS server responded with ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.isSpeaking = false;
        if (this.onTeacherSpeechEnd) this.onTeacherSpeechEnd();
        if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
        if (onComplete) onComplete();
      };

      audio.onerror = (e) => {
        console.warn("Audio playback issue, falling back to browser synthesis:", e);
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.fallbackBrowserSpeak(cleanText, onComplete);
      };

      await audio.play();
    } catch (err) {
      console.warn("Server neural speech unavailable, using fallback synth:", err);
      this.fallbackBrowserSpeak(cleanText, onComplete);
    }
  }

  fallbackBrowserSpeak(cleanText, onComplete) {
    if (!this.synth) {
      this.isSpeaking = false;
      if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
      if (onComplete) onComplete();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = this.speechRate;
    utterance.lang = this.currentLanguage;

    if (this.availableVoices.length > 0) {
      const match = this.availableVoices.find(v => v.lang.startsWith(this.currentLanguage.split("-")[0]))
                 || this.availableVoices.find(v => v.lang.includes("en"));
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (this.onTeacherSpeechStart) this.onTeacherSpeechStart();
      if (this.onSpeechStateChange) this.onSpeechStateChange("speaking");
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      if (this.onTeacherSpeechEnd) this.onTeacherSpeechEnd();
      if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
      if (onComplete) onComplete();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
      if (onComplete) onComplete();
    };

    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
  }

  // ==========================================
  // TRUE PUSH-TO-TALK CONTROLLER
  // ==========================================

  startPushToTalk() {
    if (this.isHoldingPushToTalk) return;
    this.pressStartTime = Date.now();
    this.isHoldingPushToTalk = true;
    this.latestTranscript = "";
    this.finalTranscript = "";

    // Stop teacher if speaking (interrupt)
    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    if (!this.recognition) {
      this.initRecognition();
    }

    if (!this.recognition) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.");
      this.isHoldingPushToTalk = false;
      return;
    }

    try {
      this.recognition.lang = this.currentLanguage;
      this.recognition.start();
    } catch (e) {
      console.warn("Recognition already active:", e);
    }

    this.updateMicUi(true);

    const caption = document.getElementById("live-caption-preview");
    if (caption) {
      caption.innerText = "🎙️ Listening... (Release button when done speaking)";
    }
  }

  stopPushToTalk() {
    if (!this.isHoldingPushToTalk) return;
    this.isHoldingPushToTalk = false;
    const holdDuration = Date.now() - this.pressStartTime;

    this.updateMicUi(false);

    try {
      if (this.recognition) {
        this.recognition.stop();
      }
    } catch (e) {}

    // Wait 150ms to ensure final buffer from Web Speech API is collected
    setTimeout(() => {
      const recognized = (this.latestTranscript || this.finalTranscript).trim();

      if (recognized.length > 0) {
        if (this.onUserSpeechResult) {
          this.onUserSpeechResult(recognized);
        }
      } else if (holdDuration < 350) {
        // Very quick accidental tap without speaking
        const caption = document.getElementById("live-caption-preview");
        if (caption) {
          caption.innerText = "💡 Tip: Press and hold the button while speaking, then release to send.";
        }
      }

      this.latestTranscript = "";
      this.finalTranscript = "";
    }, 150);
  }

  toggleListening() {
    // Allows tap-to-toggle fallback if user prefers click over hold
    if (this.isRecognizing || this.isHoldingPushToTalk) {
      this.stopPushToTalk();
    } else {
      this.startPushToTalk();
    }
  }

  stopListening() {
    this.isHoldingPushToTalk = false;
    if (this.recognition && this.isRecognizing) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isRecognizing = false;
    }
    this.updateMicUi(false);
  }

  updateMicUi(isRecording) {
    const micBtn = document.getElementById("btn-toggle-mic");
    const micText = document.getElementById("mic-btn-text");
    const deskMicBtn = document.getElementById("desk-mic-btn");
    const visualizerOrb = document.getElementById("live-visualizer");
    const liveBadge = document.getElementById("live-state-badge");

    if (isRecording) {
      if (micBtn) {
        micBtn.classList.add("holding-mic", "btn-danger");
        micBtn.classList.remove("btn-outline");
      }
      if (micText) micText.innerText = "🔴 Release to Send";
      if (deskMicBtn) deskMicBtn.classList.add("recording");
      if (visualizerOrb) {
        visualizerOrb.className = "live-visualizer-orb listening";
      }
      if (liveBadge) {
        liveBadge.className = "badge-status status-listening";
        liveBadge.innerText = "Listening to you...";
      }
    } else {
      if (micBtn) {
        micBtn.classList.remove("holding-mic", "btn-danger");
        micBtn.classList.add("btn-outline");
      }
      if (micText) micText.innerText = "Push to Talk";
      if (deskMicBtn) deskMicBtn.classList.remove("recording");
      if (!this.isSpeaking) {
        if (visualizerOrb) visualizerOrb.className = "live-visualizer-orb idle";
        if (liveBadge) {
          liveBadge.className = "badge-status status-ready";
          liveBadge.innerText = "Ready to Study";
        }
      }
    }
  }

  // ==========================================
  // MULTI-FREQUENCY AUDIO WAVE VISUALIZER
  // ==========================================

  startVisualizer() {
    if (!this.canvasCtx) return;

    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      const ctx = this.canvasCtx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      let amplitude = 2.5;
      let color = "rgba(99, 102, 241, 0.25)";

      if (this.isSpeaking) {
        amplitude = 22 + Math.sin(this.wavePhase * 2.5) * 8;
        color = "rgba(168, 85, 247, 0.9)";
      } else if (this.isRecognizing || this.isHoldingPushToTalk) {
        amplitude = 18 + Math.cos(this.wavePhase * 3.5) * 7;
        color = "rgba(16, 185, 129, 0.95)";
      }

      // Draw primary wave
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;

      for (let x = 0; x < width; x += 4) {
        const y = centerY + Math.sin((x * 0.035) + this.wavePhase) * amplitude 
                         * Math.sin((x / width) * Math.PI); // tapering edges
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw secondary subtle wave when active
      if (this.isSpeaking || this.isRecognizing || this.isHoldingPushToTalk) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color.replace("0.9", "0.45").replace("0.95", "0.45");
        for (let x = 0; x < width; x += 6) {
          const y2 = centerY + Math.cos((x * 0.045) - this.wavePhase) * (amplitude * 0.7) 
                           * Math.sin((x / width) * Math.PI);
          if (x === 0) ctx.moveTo(x, y2);
          else ctx.lineTo(x, y2);
        }
        ctx.stroke();
      }

      this.wavePhase += 0.08;
    };

    draw();
  }
}

window.voiceCtrl = new VoiceController();
