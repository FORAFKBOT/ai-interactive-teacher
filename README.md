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

1. **Document Upload & Curriculum Grounding**
   - Upload **PDFs, Word documents (.docx), Markdown, or plain text (.txt)**, or paste notes directly.
   - Automatically extracts core concepts, definitions, and learning checkpoints into an immutable knowledge anchor.

2. **NotebookLM-Style Live Interaction Mode**
   - Immersive live audio stage with a pulsating voice orb and real-time audio waveform.
   - Hands-free conversational loop: the teacher explains a concept, asks a formative question, and listens for your spoken answer.
   - One-click **Interrupt** button to stop the teacher and interject anytime.

3. **Multi-Lingual Teaching in Your Preferred Language**
   - Select from **English, Hindi (हिंदी), Hinglish, Spanish (Español), French, German, Mandarin, Japanese, Arabic, Bengali, Russian**, and more.
   - The teacher explains and poses Socratic questions natively in your chosen language while preserving key technical terms.

4. **Dynamic Pedagogy: Urgency & Importance Dials**
   - **Urgency (1 to 5)**:
     - `Level 1 (Deep Dive)`: Patient, exploratory, philosophical, rich analogies, zero rush.
     - `Level 3 (Balanced)`: Methodical, structured classroom pace.
     - `Level 5 (Emergency 1-Hour Cram)`: High-yield summaries, mnemonics, rapid drill questions, zero fluff.
   - **Importance & Stakes (1 to 5)**:
     - `Level 1 (Casual Curiosity)`: Playful, lenient, focused on intuition.
     - `Level 3 (Academic)`: Constructive feedback and standard precision.
     - `Level 5 (Mission-Critical / Defense)`: Ruthless rigor, zero hand-waving, verifies edge cases and proof steps.

5. **The Anti-Drift Guardian (Core Anchor)**
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
