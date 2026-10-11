"""
Session Manager for the AI Interactive Teacher.
Maintains state across live turns, tracking learning progress,
urgency/importance settings, grounding knowledge, and persistent Notebook binding.
"""

from typing import Dict, Any, List, Optional
import time
import uuid

from backend.notebook_manager import NotebookManager


class LearningSession:
    def __init__(self, session_id: Optional[str] = None, notebook_id: Optional[str] = None):
        self.session_id: str = session_id or str(uuid.uuid4())
        self.notebook_id: Optional[str] = notebook_id
        self.notebook_title: str = "Active Notebook"
        self.created_at: float = time.time()
        self.document_data: Optional[Dict[str, Any]] = None
        
        # Pedagogical Settings
        self.language: str = "English"  # e.g., English, Malayalam, Hindi, Spanish, etc.
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

    def load_from_notebook(self, nb: Dict[str, Any]):
        """Hydrate session from persistent notebook record."""
        self.notebook_id = nb.get("id")
        self.notebook_title = nb.get("title", "Untitled Notebook")
        self.document_data = nb.get("document_data")
        self.concepts = nb.get("concepts", [])
        self.history = nb.get("history", [])
        self.language = nb.get("language", "English")
        self.urgency = nb.get("urgency", 3)
        self.importance = nb.get("importance", 3)
        self.overall_mastery_percentage = nb.get("overall_mastery_percentage", 0)
        
        # Pick active concept
        self.active_concept_idx = 0
        for idx, c in enumerate(self.concepts):
            if c.get("status") == "in_progress":
                self.active_concept_idx = idx
                break

    def auto_save_to_notebook(self):
        """Persist session state into notebook storage."""
        if not self.notebook_id:
            # If no notebook bound yet, create or find one
            nb = NotebookManager.create_notebook(
                title=self.document_data.get("title", "Learning Session") if self.document_data else "Untitled Notebook"
            )
            self.notebook_id = nb["id"]
            self.notebook_title = nb["title"]

        NotebookManager.save_notebook(self.notebook_id, {
            "title": self.notebook_title,
            "document_data": self.document_data,
            "concepts": self.concepts,
            "history": self.history,
            "language": self.language,
            "urgency": self.urgency,
            "importance": self.importance,
            "overall_mastery_percentage": self.overall_mastery_percentage
        })

    def load_curriculum(self, curriculum_data: Dict[str, Any]):
        self.document_data = curriculum_data
        self.concepts = curriculum_data.get("concepts", [])
        self.active_concept_idx = 0
        self.overall_mastery_percentage = 0
        if self.concepts:
            self.concepts[0]["status"] = "in_progress"
        
        if self.notebook_title in ("Untitled Notebook", "Active Notebook", "New Notebook"):
            self.notebook_title = curriculum_data.get("title", "Untitled Notebook")
        
        self.auto_save_to_notebook()

    def set_pedagogical_params(self, language: Optional[str] = None, urgency: Optional[int] = None, importance: Optional[int] = None):
        if language is not None:
            self.language = language
        if urgency is not None:
            self.urgency = max(1, min(5, int(urgency)))
        if importance is not None:
            self.importance = max(1, min(5, int(importance)))
        self.auto_save_to_notebook()

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
                    for next_idx in range(idx + 1, len(self.concepts)):
                        if self.concepts[next_idx]["status"] != "mastered":
                            self.active_concept_idx = next_idx
                            self.concepts[next_idx]["status"] = "in_progress"
                            break
                break
        self._recalculate_mastery()
        self.auto_save_to_notebook()

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
        self.auto_save_to_notebook()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "notebook_id": self.notebook_id,
            "notebook_title": self.notebook_title,
            "document_title": self.document_data.get("title", "No Document") if self.document_data else None,
            "source_files": self.document_data.get("source_files", []) if self.document_data else [],
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


def get_or_create_session(session_id: Optional[str] = None, notebook_id: Optional[str] = None) -> LearningSession:
    if session_id and session_id in sessions_db:
        sess = sessions_db[session_id]
        if notebook_id and sess.notebook_id != notebook_id:
            nb = NotebookManager.get_notebook(notebook_id)
            if nb:
                sess.load_from_notebook(nb)
        return sess

    new_sess = LearningSession(session_id, notebook_id)
    if notebook_id:
        nb = NotebookManager.get_notebook(notebook_id)
        if nb:
            new_sess.load_from_notebook(nb)
    else:
        # Default notebook
        def_nb = NotebookManager.ensure_default_notebook()
        new_sess.load_from_notebook(def_nb)

    sessions_db[new_sess.session_id] = new_sess
    return new_sess
