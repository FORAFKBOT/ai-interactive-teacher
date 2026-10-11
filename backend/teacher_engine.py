"""
Teacher Engine for AI Interactive Teacher.
Handles:
- Dynamic Persona formulation based on Urgency and Importance
- Strict Anti-Drift Guardian & Ground Truth Anchor
- Multi-lingual instruction
- Socratic understanding checks & Active Recall
- Multi-provider support (Gemini API, OpenAI-compatible endpoints, and Built-in Smart Teacher fallback)
"""

import os
import json
import re
from typing import Dict, Any, List, Optional
import httpx

from backend.session_manager import LearningSession


class TeacherEngine:
    def __init__(self):
        # Default API keys from environment if available
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        self.custom_endpoint = os.environ.get("CUSTOM_LLM_ENDPOINT", "")

    def set_api_keys(self, gemini_key: Optional[str] = None, openai_key: Optional[str] = None):
        if gemini_key is not None:
            self.gemini_api_key = gemini_key.strip()
        if openai_key is not None:
            self.openai_api_key = openai_key.strip()

    def build_system_prompt(self, session: LearningSession) -> str:
        """Construct the prompt embodying urgency, importance, language, and the Anti-Drift Guardian."""
        urgency = session.urgency
        importance = session.importance
        language = session.language
        current_concept = session.get_current_concept()
        
        # 1. Urgency description
        urgency_profiles = {
            1: "DEEP DIVE & CONTEMPLATIVE: You have infinite time. Unpack concepts from first principles. Use rich, evocative analogies, thought experiments, and historical context. Never rush.",
            2: "RELAXED & THOROUGH: Take a steady, conversational pace. Allow room for curiosity and detailed explanations.",
            3: "BALANCED PEDAGOGY: Structured, efficient, and methodical. Cover the concept clearly without unnecessary digressions.",
            4: "HIGH-YIELD ACCELERATED: The student has limited time. Focus strictly on top-priority concepts, testable rules, and key formulas. Use concise bullet points.",
            5: "EMERGENCY CRAM (EXAM IN 1 HOUR): Extreme urgency! ZERO FLUFF. Cut straight to the vital core. Use sharp mnemonics, lightning-fast summaries, and rapid-fire drill questions. Keep responses punchy and intense."
        }
        
        # 2. Importance description
        importance_profiles = {
            1: "CASUAL CURIOSITY: Low stakes. Be very playful, lighthearted, and lenient. Foster pure wonder and fun.",
            2: "GENERAL INTEREST: Supportive, friendly, and encouraging. Focus on intuition rather than strict academic jargon.",
            3: "STANDARD ACADEMIC: Professional educator. Expect good understanding, gently correct misunderstandings with constructive feedback.",
            4: "GRADED EXAM / CERTIFICATION: High rigor. Demand precise terminology, test boundary conditions, and challenge weak reasoning.",
            5: "MISSION CRITICAL (HIGH-STAKES DEFENSE / TECHNICAL INTERVIEW): Ruthless precision! Zero tolerance for hand-waving or vague answers. Drill the student on edge cases, demand step-by-step justification, and verify complete mastery before passing."
        }

        # 3. Ground Truth Anchor & Anti-Drift Guardian
        doc_data = session.document_data or {}
        doc_title = doc_data.get("title", "Uploaded Material")
        concepts_summary = []
        for idx, c in enumerate(session.concepts):
            status_icon = "🟢 [MASTERED]" if c.get("status") == "mastered" else ("🟡 [CURRENT]" if idx == session.active_concept_idx else "⚪ [PENDING]")
            concepts_summary.append(f"{idx+1}. {status_icon} {c.get('title')}: {c.get('summary')}")
        
        concepts_str = "\n".join(concepts_summary)
        active_title = current_concept.get("title") if current_concept else "Core Curriculum"
        active_facts = "\n- ".join(current_concept.get("key_facts", [])) if current_concept else "General material"

        prompt = f"""You are 'Sage', an elite interactive live AI Teacher inspired by NotebookLM's live discussion mode.

=== CRITICAL GROUND RULES ===
1. PREFERRED LANGUAGE:
You MUST teach, explain, and interact ENTIRELY in '{language}'.
Ensure natural, fluent phrasing in {language}. Retain key technical terminology where appropriate with clear native explanations.

2. URGENCY MODE (Level {urgency}/5):
{urgency_profiles.get(urgency, urgency_profiles[3])}

3. IMPORTANCE & RIGOR (Level {importance}/5):
{importance_profiles.get(importance, importance_profiles[3])}

4. THE ANTI-DRIFT GUARDIAN (NON-NEGOTIABLE):
Whatever may happen, you MUST NOT forget the core material you are teaching!
- Source Document: '{doc_title}'
- Current Active Learning Objective: '{active_title}'
- Current Ground Truth Facts to Anchor to:
- {active_facts}
- Full Curriculum Roadmap:
{concepts_str}

ANTI-DRIFT DIRECTIVE:
If the student asks an off-topic question or goes on a tangent (e.g. pop culture, random unrelated facts), acknowledge it in AT MOST ONE SHORT SENTENCE, and immediately pivot back to the current core learning objective ('{active_title}'). Always keep the lesson anchored to the uploaded core text.

5. PEDAGOGICAL INTERACTION LOOP:
- Explain ONE key concept or bite-sized idea at a time.
- IMMEDIATELY follow your explanation with an engaging Socratic question or understanding check to verify comprehension.
- If the student just answered a question:
  * Validate their answer (confirm what they got right).
  * If they made an error or missed an aspect, correct it constructively.
  * If they demonstrated clear understanding, award a checkpoint pass and progress to the next logical concept.
  * End every response with a clear question to keep the live dialogue moving!

6. LIVE INTERACTIVE SPEECH READY:
Format your response so it sounds wonderful when spoken aloud in live conversation. Avoid unpronounceable formatting or massive walls of text. Keep it engaging, interactive, and conversational.
"""
        return prompt

    async def generate_response(self, session: LearningSession, user_input: str) -> Dict[str, Any]:
        """Main dispatcher: selects Gemini API, OpenAI endpoint, or built-in Smart Teacher."""
        system_prompt = self.build_system_prompt(session)

        # Check for Gemini API Key
        if self.gemini_api_key:
            try:
                result = await self._call_gemini(session, system_prompt, user_input)
                if result:
                    return self._process_and_update(session, user_input, result)
            except Exception as e:
                print(f"Gemini API error: {e}. Falling back to Smart Teacher.")

        # Check for OpenAI API Key
        if self.openai_api_key:
            try:
                result = await self._call_openai(session, system_prompt, user_input)
                if result:
                    return self._process_and_update(session, user_input, result)
            except Exception as e:
                print(f"OpenAI API error: {e}. Falling back to Smart Teacher.")

        # Built-in Smart Teacher Engine (Zero-dependency offline intelligent fallback)
        result = self._smart_built_in_teacher(session, user_input)
        return self._process_and_update(session, user_input, result)

    async def _call_gemini(self, session: LearningSession, system_prompt: str, user_input: str) -> Dict[str, Any]:
        """Call Google Gemini 2.5/1.5 Flash via REST API."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.gemini_api_key}"
        
        # Build contents from history
        contents = []
        for msg in session.history[-6:]:  # Keep recent context
            role = "user" if msg["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })
        
        # Add current user input
        contents.append({
            "role": "user",
            "parts": [{"text": user_input}]
        })

        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": 0.6 if session.importance > 3 else 0.8,
                "maxOutputTokens": 800
            }
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return self._parse_teacher_text(session, text, user_input)
            else:
                # Try fallback model gemini-1.5-flash
                url_fallback = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"
                resp2 = await client.post(url_fallback, json=payload)
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    text2 = data2["candidates"][0]["content"]["parts"][0]["text"]
                    return self._parse_teacher_text(session, text2, user_input)
                raise Exception(f"Gemini API returned {resp.status_code}: {resp.text}")

    async def _call_openai(self, session: LearningSession, system_prompt: str, user_input: str) -> Dict[str, Any]:
        """Call OpenAI-compatible endpoint."""
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json"
        }
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in session.history[-6:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": user_input})

        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 800
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                text = data["choices"][0]["message"]["content"]
                return self._parse_teacher_text(session, text, user_input)
            raise Exception(f"OpenAI API returned {resp.status_code}: {resp.text}")

    def _parse_teacher_text(self, session: LearningSession, text: str, user_input: str) -> Dict[str, Any]:
        """Extract evaluation, question, and progress updates from teacher's generated response."""
        curr_concept = session.get_current_concept()
        
        # Analyze whether the student answered correctly or showed understanding
        is_positive = any(w in text.lower() for w in ["correct", "exactly", "spot on", "great job", "well done", "perfect", "good insight", "sahi hai", "bilkul", "tres bien", "genial"])
        is_confused = any(w in text.lower() for w in ["not quite", "misconception", "almost, but", "let's clarify", "actually", "galat", "careful"])

        concept_advanced = False
        if is_positive and curr_concept:
            # Advance concept score
            session.update_concept_progress(curr_concept["id"], "mastered" if curr_concept.get("mastery_score", 0) >= 60 else "in_progress", delta_score=35)
            session.questions_answered_correctly += 1
            session.current_streak += 1
            concept_advanced = True
        elif is_confused and curr_concept:
            session.current_streak = 0
            session.update_concept_progress(curr_concept["id"], "in_progress", delta_score=5)

        session.total_questions_asked += 1

        return {
            "response_text": text,
            "current_concept": session.get_current_concept(),
            "concept_advanced": concept_advanced,
            "overall_mastery": session.overall_mastery_percentage,
            "urgency": session.urgency,
            "importance": session.importance,
            "language": session.language
        }

    def _smart_built_in_teacher(self, session: LearningSession, user_input: str) -> Dict[str, Any]:
        """
        Intelligent offline pedagogical engine:
        Constructs dynamic, multi-lingual, urgency-adapted Socratic teaching
        directly grounded in the uploaded curriculum without external network calls!
        """
        curr = session.get_current_concept()
        lang = session.language.lower()
        urgency = session.urgency
        importance = session.importance
        
        # Title & summary of active concept
        title = curr.get("title", "Core Subject") if curr else "General Concepts"
        summary = curr.get("summary", "Essential principles of the material.") if curr else ""
        facts = curr.get("key_facts", []) if curr else []
        fact_highlight = facts[0] if facts else summary

        # 1. Anti-drift check: Did user ask something unrelated?
        # Check keyword overlap between user input and concept facts
        text_keywords = set(re.findall(r"\w{4,}", (title + " " + summary + " " + " ".join(facts)).lower()))
        user_words = set(re.findall(r"\w{4,}", user_input.lower()))
        overlap = text_keywords.intersection(user_words)
        
        is_greeting = any(g in user_input.lower() for g in ["hi", "hello", "hey", "start", "begin", "namaste", "hola", "bonjour", "ready"])
        is_answering = len(session.history) > 0 and not is_greeting

        # Evaluate answer if user was responding
        evaluation_header = ""
        score_delta = 0
        status_change = "in_progress"

        if is_answering:
            if len(overlap) >= 1 or len(user_input.split()) > 4:
                score_delta = 35
                session.questions_answered_correctly += 1
                session.current_streak += 1
                if curr and curr.get("mastery_score", 0) + score_delta >= 70:
                    status_change = "mastered"
                
                # Feedback in preferred language
                if "hindi" in lang or "hinglish" in lang:
                    evaluation_header = "Shaandar! Aapka concept ekdum sahi pakad mein aa raha hai. ✨\n\n"
                elif "spanish" in lang:
                    evaluation_header = "¡Excelente deducción! Vas por el camino correcto. 🎯\n\n"
                elif "french" in lang:
                    evaluation_header = "Très bien vu ! C'est exactement l'idée clé. 💡\n\n"
                elif "german" in lang:
                    evaluation_header = "Ausgezeichnet! Genau so funktioniert dieses Prinzip. 🎯\n\n"
                else:
                    if importance >= 4:
                        evaluation_header = "Spot on! Your reasoning holds up to rigorous scrutiny. 🎯\n\n"
                    else:
                        evaluation_header = "Great insight! You've grasped the core intuition. ✨\n\n"
            else:
                score_delta = 10
                session.current_streak = 0
                if "hindi" in lang or "hinglish" in lang:
                    evaluation_header = "Achha koshish, lekin hume iske core point pe dhyan dena hoga. Dekhiye:\n\n"
                elif "spanish" in lang:
                    evaluation_header = "Buen intento, pero afinemos el concepto clave:\n\n"
                elif "french" in lang:
                    evaluation_header = "Bonne tentative, mais précisons le point fondamental:\n\n"
                else:
                    evaluation_header = "Close, but let's sharpen that definition so you don't lose marks on edge cases:\n\n"

        if curr:
            session.update_concept_progress(curr["id"], status_change, delta_score=score_delta)

        # 2. Urgency & Importance tone formatting
        body = ""
        question = ""

        if urgency >= 4:
            # High-Yield Cram Mode
            if "hindi" in lang or "hinglish" in lang:
                body = (
                    f"⚡ **High-Yield Cram Mode ({title})**:\n"
                    f"- **Main Point**: {fact_highlight}\n"
                    f"- **Exam Trap**: Agar aap isko miss karenge toh marks cut sakte hain. Iska core logic: {summary[:160]}.\n"
                )
                question = f"❓ **Quick Test**: Is concept '{title}' ka sabse main role ya definition apne shabdon mein 1 sentence mein bataiye?"
            elif "spanish" in lang:
                body = (
                    f"⚡ **Modo Intensivo de Repaso ({title})**:\n"
                    f"- **Punto Crítico**: {fact_highlight}\n"
                    f"- **Resumen Clave**: {summary[:160]}.\n"
                )
                question = f"❓ **Pregunta Relámpago**: ¿Cómo explicarías la función principal de '{title}' en una sola frase?"
            else:
                body = (
                    f"⚡ **HIGH-YIELD CRAM FOCUS: [{title}]**\n"
                    f"• **Critical Rule**: {fact_highlight}\n"
                    f"• **Core Takeaway**: {summary[:160]}\n"
                )
                if importance >= 4:
                    question = f"❓ **High-Stakes Checkpoint**: Under what condition does '{title}' strictly apply, and what is its primary failure mode?"
                else:
                    question = f"❓ **Rapid Recall**: What is the single most essential function of '{title}'?"

        elif urgency == 1:
            # Deep Dive Mode
            if "hindi" in lang or "hinglish" in lang:
                body = (
                    f"🌱 **Gahan Chintan & Exploration: {title}**\n\n"
                    f"Is concept ki gehrai ko samajhte hain. Sochiye aisa kyun design kiya gaya:\n\n"
                    f"> \"{summary}\"\n\n"
                    f"Iska ek mahatvapurna pehlu yeh hai: {fact_highlight}. "
                    f"Jab hum isko real-world scenario mein dekhte hain, toh iska prabhav seedhe core functioning par padta hai."
                )
                question = f"🤔 **Socratic Soch**: Agar hum '{title}' ke is siddhant ko hata dein, toh poore system par kya asar padega?"
            elif "spanish" in lang:
                body = (
                    f"🌱 **Exploración Profunda: {title}**\n\n"
                    f"Profundicemos en los primeros principios. Imagina el porqué detrás de esta regla:\n\n"
                    f"> \"{summary}\"\n\n"
                    f"Un pilar fundamental es: {fact_highlight}."
                )
                question = f"🤔 **Reflexión Socrática**: Si cambiaras este aspecto en '{title}', ¿qué consecuencias inesperadas surgirían?"
            else:
                body = (
                    f"🌱 **First-Principles Deep Dive: [{title}]**\n\n"
                    f"Let's peel back the layers and understand why this concept exists fundamentally.\n\n"
                    f"Consider the core foundation:\n> *\"{summary}\"*\n\n"
                    f"Notice how this ties directly into our anchor observation: {fact_highlight}. "
                    f"In practice, this serves as an architectural bedrock."
                )
                question = f"🤔 **Thought Experiment**: What fundamental problem would arise in the broader system if '{title}' did not exist?"

        else:
            # Balanced Pedagogical Mode
            if "hindi" in lang or "hinglish" in lang:
                body = (
                    f"📘 **Topic: {title}**\n\n"
                    f"{summary}\n\n"
                    f"🔑 **Key Takeaway**: {fact_highlight}"
                )
                question = f"❓ **Aapki Samajh**: '{title}' ko aap kisi aise vyakti ko kaise samjhayenge jo ise pehli baar sun raha hai?"
            elif "spanish" in lang:
                body = (
                    f"📘 **Tema: {title}**\n\n"
                    f"{summary}\n\n"
                    f"🔑 **Punto Clave**: {fact_highlight}"
                )
                question = f"❓ **Comprobación**: ¿Cómo describirías la importancia de '{title}' en tus propias palabras?"
            else:
                body = (
                    f"📘 **Concept: {title}**\n\n"
                    f"{summary}\n\n"
                    f"🔑 **Anchor Fact**: {fact_highlight}"
                )
                question = f"❓ **Understanding Check**: How would you explain the core mechanism of '{title}' in your own words?"

        session.total_questions_asked += 1
        full_text = f"{evaluation_header}{body}\n\n{question}"

        return {
            "response_text": full_text,
            "current_concept": session.get_current_concept(),
            "concept_advanced": (status_change == "mastered"),
            "overall_mastery": session.overall_mastery_percentage,
            "urgency": session.urgency,
            "importance": session.importance,
            "language": session.language
        }

    def _process_and_update(self, session: LearningSession, user_input: str, result: Dict[str, Any]) -> Dict[str, Any]:
        """Record messages and state into session."""
        session.add_message("user", user_input)
        session.add_message("assistant", result["response_text"], metadata={
            "urgency": session.urgency,
            "importance": session.importance,
            "language": session.language,
            "mastery": session.overall_mastery_percentage
        })
        return result
