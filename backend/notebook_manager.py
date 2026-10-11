"""
Notebook Manager for AI Interactive Teacher.
Handles creation, listing, switching, auto-saving, and Google Drive sync
for multiple independent learning notebooks.
"""

import os
import json
import time
import uuid
from typing import Dict, Any, List, Optional

NOTEBOOKS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "notebooks")
os.makedirs(NOTEBOOKS_DIR, exist_ok=True)


class NotebookManager:
    """Manages persistent notebook collections and session bridges."""

    @staticmethod
    def _get_notebook_path(notebook_id: str) -> str:
        safe_id = "".join(c for c in notebook_id if c.isalnum() or c in ("-", "_"))
        return os.path.join(NOTEBOOKS_DIR, f"{safe_id}.json")

    @staticmethod
    def list_notebooks() -> List[Dict[str, Any]]:
        """Return list of all notebooks with summary statistics."""
        notebooks = []
        if not os.path.exists(NOTEBOOKS_DIR):
            return []

        for fname in os.listdir(NOTEBOOKS_DIR):
            if fname.endswith(".json"):
                fpath = os.path.join(NOTEBOOKS_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    concepts = data.get("concepts", [])
                    source_files = (data.get("document_data") or {}).get("source_files", [])
                    
                    notebooks.append({
                        "id": data.get("id"),
                        "title": data.get("title", "Untitled Notebook"),
                        "created_at": data.get("created_at", time.time()),
                        "updated_at": data.get("updated_at", time.time()),
                        "overall_mastery": data.get("overall_mastery_percentage", 0),
                        "concepts_count": len(concepts),
                        "mastered_count": sum(1 for c in concepts if c.get("status") == "mastered"),
                        "source_files": source_files,
                        "language": data.get("language", "English"),
                        "urgency": data.get("urgency", 3),
                        "importance": data.get("importance", 3),
                        "drive_file_id": data.get("drive_file_id"),
                        "drive_synced_at": data.get("drive_synced_at")
                    })
                except Exception as e:
                    print(f"Error loading notebook {fname}: {e}")

        # Sort by most recently updated
        notebooks.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        return notebooks

    @staticmethod
    def create_notebook(title: str = "New Notebook", initial_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a new notebook and save it to disk."""
        notebook_id = f"nb_{uuid.uuid4().hex[:10]}"
        now = time.time()

        notebook = {
            "id": notebook_id,
            "title": title.strip() or "Untitled Notebook",
            "created_at": now,
            "updated_at": now,
            "language": (initial_data or {}).get("language", "English"),
            "urgency": (initial_data or {}).get("urgency", 3),
            "importance": (initial_data or {}).get("importance", 3),
            "overall_mastery_percentage": 0,
            "document_data": (initial_data or {}).get("document_data"),
            "concepts": (initial_data or {}).get("concepts", []),
            "history": (initial_data or {}).get("history", []),
            "drive_file_id": None,
            "drive_synced_at": None
        }

        path = NotebookManager._get_notebook_path(notebook_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(notebook, f, indent=2, ensure_ascii=False)

        return notebook

    @staticmethod
    def get_notebook(notebook_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve full notebook data by ID."""
        path = NotebookManager._get_notebook_path(notebook_id)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def save_notebook(notebook_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Save/update notebook data."""
        path = NotebookManager._get_notebook_path(notebook_id)
        existing = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)

        existing.update(data)
        existing["id"] = notebook_id
        existing["updated_at"] = time.time()

        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        return existing

    @staticmethod
    def delete_notebook(notebook_id: str) -> bool:
        """Delete notebook by ID."""
        path = NotebookManager._get_notebook_path(notebook_id)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False

    @staticmethod
    def ensure_default_notebook() -> Dict[str, Any]:
        """Ensure at least one notebook exists on first launch."""
        notebooks = NotebookManager.list_notebooks()
        if notebooks:
            full = NotebookManager.get_notebook(notebooks[0]["id"])
            if full:
                return full
        
        # Create a default introductory notebook
        return NotebookManager.create_notebook("Welcome Study Guide")
