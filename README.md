# 🎓 Sage: Interactive Live AI Teacher

> A NotebookLM-inspired live interactive AI teacher that explains uploaded documents, engages in conversational spoken dialogue, adapts in real-time to **Urgency** and **Importance**, and enforces the **Anti-Drift Guardian** so it never loses track of the core syllabus.

---

## 📱 Use Anywhere on Any Device

Sage is built to work seamlessly across your **PC, laptop, smartphone, iPad, and tablet**:

### 1. On Your Local Home / Office Wi-Fi
Sage binds to `0.0.0.0:8000`. You can open it on your phone or tablet connected to the same Wi-Fi:
- **Local Computer**: `http://localhost:8000`
- **Phone / Tablet**: `http://<your-computer-ip>:8000` *(Click the "📱 Connect Device" button in the app header to see your exact Wi-Fi URL)*

### 2. Worldwide Remote Access via Instant HTTPS Tunnel
Want to use Sage while on cellular data or away from home? Run:
```bash
python run.py --share
```
This instantly generates a secure, free public HTTPS link (e.g. `https://sage-xyz.trycloudflare.com`).
> **Note on Mobile Browsers**: Mobile Safari (iOS) and Mobile Chrome (Android) require HTTPS to enable microphone access. Running with `--share` provides a full HTTPS connection so voice interaction works anywhere!

### 3. Free 24/7 Cloud Deployment (Render / Railway / Hugging Face)
- **Render.com (1-Click)**: Connect your GitHub repository `FORAFKBOT/ai-interactive-teacher`. Render will detect `render.yaml` and deploy automatically for free.
- **Docker**: Run anywhere with container support:
  ```bash
  docker build -t sage-teacher .
  docker run -p 8000:8000 sage-teacher
  ```

---

## 🌟 Core Features

1. **Multi-File Upload & Universal Format Support**
   - Upload **multiple files simultaneously** (e.g., lecture slides + textbook chapter + notes).
   - Supports **PDFs (.pdf), Word (.docx, .doc), PowerPoint slides (.pptx), Markdown (.md), Plain Text (.txt), Rich Text (.rtf), Web pages (.html), Structured data (.csv, .json), and Source Code (.py, .js, .java, etc.)**.
   - Combines multiple files into a unified knowledge base with interactive file chips.

2. **NotebookLM-Style Live Interaction Mode**
   - Immersive live audio stage with a pulsating voice orb and real-time audio waveform.
   - Hands-free conversational loop: the teacher explains a concept, asks a formative question, and listens for your spoken answer.
   - One-click **Interrupt** button to stop the teacher and interject anytime.

3. **Multi-Lingual Teaching in Your Preferred Language**
   - Full support for **Malayalam (മലയാളം), English, Hindi (हिंदी), Hinglish, Tamil (தமிழ்), Telugu (తెలుగు), Bengali (বাংলা), Spanish (Español), French, German, Mandarin, Japanese, Arabic, Russian**, and more.
   - Speaks natively in Malayalam and poses Socratic questions directly in Malayalam script.

5. **Multiple Independent Notebooks (NotebookLM Style)**
   - Create and organize **multiple separate notebooks** (e.g., *Physics 101*, *Biochemistry*, *Machine Learning*).
   - Each notebook maintains its own uploaded documents, extracted curriculum, live conversation history, mastery tracking, and audio preferences.
   - Instantly switch between notebooks via the top bar dropdown.

6. **Google Drive Memory & On-Demand Sync**
   - Connect your **Google Account** with one click via Google Identity Services.
   - Automatically provisions a dedicated, isolated folder in your Google Drive: `"Sage AI Teacher - Notebooks"`.
   - **On-Demand Access**: Only updates and syncs when actively in use, avoiding constant background battery or quota drain.
   - Also supports 1-click JSON export & import for zero-credential backups.

7. **Dynamic Pedagogy: Urgency & Importance Dials**
   - **Urgency (1 to 5)**:
     - `Level 1 (Deep Dive)`: Patient, exploratory, philosophical, rich analogies, zero rush.
     - `Level 3 (Balanced)`: Methodical, structured classroom pace.
     - `Level 5 (Emergency 1-Hour Cram)`: High-yield summaries, mnemonics, rapid drill questions, zero fluff.
   - **Importance & Stakes (1 to 5)**:
     - `Level 1 (Casual Curiosity)`: Playful, lenient, focused on intuition.
     - `Level 3 (Academic)`: Constructive feedback and standard precision.
     - `Level 5 (Mission-Critical / Defense)`: Ruthless rigor, zero hand-waving, verifies edge cases and proof steps.

8. **The Anti-Drift Guardian (Core Anchor)**
   - Strict grounding prevents hallucinations and off-topic wanderings.
   - If a student tries to derail the conversation with random tangents, the teacher politely acknowledges and immediately redirects back to the active learning checkpoint.
   - Live visual mastery bar and checklist tracking each concept from `⚪ Pending` ➔ `🟡 Active` ➔ `🟢 Mastered`.

6. **Flexible LLM Engine**
   - Works **100% out of the box** using the built-in intelligent pedagogical heuristic engine.
   - Optional: Enter your **Google Gemini API Key** (e.g. Gemini 2.5 Flash) or OpenAI-compatible key for advanced cloud reasoning.

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/FORAFKBOT/ai-interactive-teacher.git
cd ai-interactive-teacher

# Install dependencies
pip install -r requirements.txt

# Run locally
python run.py

# Or run with global mobile access
python run.py --share
```
