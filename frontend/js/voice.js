/**
 * Voice & Speech Module for Sage Interactive Live Teacher.
 * Manages SpeechSynthesis (Teacher speaking) and SpeechRecognition (Student speaking),
 * and powers the dynamic canvas audio waveform.
 */

class VoiceController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isRecognizing = false;
    this.isSpeaking = false;
    this.speechRate = 1.0;
    this.currentLanguage = "en-US";
    this.availableVoices = [];

    // Callbacks
    this.onUserSpeechResult = null;
    this.onTeacherSpeechStart = null;
    this.onTeacherSpeechEnd = null;
    this.onSpeechStateChange = null;

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
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = this.currentLanguage;

    this.recognition.onstart = () => {
      this.isRecognizing = true;
      if (this.onSpeechStateChange) this.onSpeechStateChange("listening");
    };

    this.recognition.onresult = (event) => {
      let interim = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim) {
        const caption = document.getElementById("live-caption-preview");
        if (caption) caption.innerText = `You: "${interim}..."`;
      }

      if (finalTranscript && this.onUserSpeechResult) {
        this.onUserSpeechResult(finalTranscript.trim());
      }
    };

    this.recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      this.isRecognizing = false;
      if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
    };

    this.recognition.onend = () => {
      this.isRecognizing = false;
      if (!this.isSpeaking && this.onSpeechStateChange) {
        this.onSpeechStateChange("idle");
      }
    };
  }

  setLanguage(langName) {
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

    const key = langName.toLowerCase().split(" ")[0];
    this.currentLanguage = map[key] || "en-US";
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }
  }

  speak(text, onComplete) {
    if (!this.synth) {
      if (onComplete) onComplete();
      return;
    }

    this.stopSpeaking();
    this.stopListening();

    // Clean markdown symbols for natural TTS speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#+\s*/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[⚡🌱📘🔑❓🤔•]/g, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = this.speechRate;
    utterance.lang = this.currentLanguage;

    // Pick best matching native voice
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
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
      if (this.onSpeechStateChange) this.onSpeechStateChange("idle");
    }
  }

  startListening() {
    if (!this.recognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge, or type in the Study Desk.");
      return;
    }
    if (this.isSpeaking) {
      this.stopSpeaking();
    }
    try {
      this.recognition.start();
    } catch (e) {
      console.warn("Recognition already active or error:", e);
    }
  }

  stopListening() {
    if (this.recognition && this.isRecognizing) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isRecognizing = false;
    }
  }

  startVisualizer() {
    if (!this.canvasCtx) return;
    
    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      const ctx = this.canvasCtx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      let amplitude = 2;
      let color = "rgba(99, 102, 241, 0.25)";

      if (this.isSpeaking) {
        amplitude = 22 + Math.sin(this.wavePhase * 2) * 8;
        color = "rgba(168, 85, 247, 0.85)";
      } else if (this.isRecognizing) {
        amplitude = 18 + Math.cos(this.wavePhase * 3) * 6;
        color = "rgba(16, 185, 129, 0.85)";
      }

      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;

      for (let x = 0; x < width; x += 4) {
        const y = centerY + Math.sin((x * 0.03) + this.wavePhase) * amplitude 
                         * Math.sin((x / width) * Math.PI); // tapering edges
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      this.wavePhase += 0.08;
    };

    draw();
  }
}

window.voiceCtrl = new VoiceController();
