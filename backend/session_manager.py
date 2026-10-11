"""
Session Manager for the AI Interactive Teacher.
Maintains state across live turns, tracking learning progress,
urgency/importance settings, and grounding knowledge.
"""

from typing import Dict, Any, List, Optional
import time
import uuid


class LearningSession:
    def __init__(self, session_id: Optional[str] = None):
        self.session_id: str = session_id or str(uuid.uuid4())
        self.created_at: float = time.time()
        self.document_data: Optional[Dict[str, Any]] = None
        
        # Pedagogical Settings
        self.language: str = "English"  # e.g., English, Hindi, Spanish, French, etc.
        self.urgency: int = 3           # 1 (Leisurely Deep Dive) to 5 (Exam in 2 hours / Emergency Cram)
        self.importance: int = 3        # 1 (Casual Curiosity) to 5 (High Stakes / Strict Technical Defense)
        
        # Anti-Drift Guardian & Curriculum
        self.concepts: List[Dict[str, Any]] = []
        self.active_concept_idx: int = 0
        self.overall_mastery_percentage: int = 0
        
        # Dialogue History
        self.history: List[Dict[str, Any]] = []
        
        # Stats
        self.total_questions_asked: int = 0
        self.questions_answered_correctly: int = 0
        self.current_streak: int = 0

    def load_curriculum(self, curriculum_data: Dict[str, Any]):
        self.document_data = curriculum_data
        self.concepts = curriculum_data.get("concepts", [])
        self.active_concept_idx = 0
        self.overall_mastery_percentage = 0
        if self.concepts:
            self.concepts[0]["status"] = "in_progress"

    def set_pedagogical_params(self, language: Optional[str] = None, urgency: Optional[int] = None, importance: Optional[int] = None):
        if language is not None:
            self.language = language
        if urgency is not None:
            self.urgency = max(1, min(5, int(urgency)))
        if importance is not None:
            self.importance = max(1, min(5, int(importance)))

    def get_current_concept(self) -> Optional[Dict[str, Any]]:
        if 0 <= self.active_concept_idx < len(self.concepts):
            return self.concepts[self.active_concept_idx]
        return None

    def update_concept_progress(self, concept_id: str, new_status: str, delta_score: int = 25):
        for idx, c in enumerate(self.concepts):
            if c.get("id") == concept_id:
                c["status"] = new_status
                c["mastery_score"] = min(100, max(0, c.get("mastery_score", 0) + delta_score))
                if new_status == "mastered" and idx == self.active_concept_idx:
                    # Advance to next incomplete concept if available
                    for next_idx in range(idx + 1, len(self.concepts)):
                        if self.concepts[next_idx]["status"] != "mastered":
                            self.active_concept_idx = next_idx
                            self.concepts[next_idx]["status"] = "in_progress"
                            break
                break
        self._recalculate_mastery()

    def _recalculate_mastery(self):
        if not self.concepts:
            self.overall_mastery_percentage = 0
            return
        total_score = sum(c.get("mastery_score", 0) for c in self.concepts)
        self.overall_mastery_percentage = int(total_score / len(self.concepts))

    def add_message(self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        msg = {
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "metadata": metadata or {}
        }
        self.history.append(msg)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "document_title": self.document_data.get("title", "No Document") if self.document_data else None,
            "preview": self.document_data.get("preview", "") if self.document_data else None,
            "language": self.language,
            "urgency": self.urgency,
            "importance": self.importance,
            "concepts": self.concepts,
            "active_concept_idx": self.active_concept_idx,
            "overall_mastery_percentage": self.overall_mastery_percentage,
            "total_questions_asked": self.total_questions_asked,
            "questions_answered_correctly": self.questions_answered_correctly,
            "history_length": len(self.history)
        }


# Global in-memory storage for active sessions
sessions_db: Dict[str, LearningSession] = {}


def get_or_create_session(session_id: Optional[str] = None) -> LearningSession:
    if session_id and session_id in sessions_db:
        return sessions_db[session_id]
    new_sess = LearningSession(session_id)
    sessions_db[new_sess.session_id] = new_sess
    return new_sess
