"""
FastAPI Server for AI Interactive Teacher.
Exposes REST and static file endpoints for the live web application.
"""

import os
import shutil
import socket
import time
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.document_parser import DocumentParser
from backend.session_manager import get_or_create_session, LearningSession
from backend.notebook_manager import NotebookManager
from backend.teacher_engine import TeacherEngine

app = FastAPI(title="AI Interactive Teacher", version="1.0.0")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# Enable CORS for easy local browser development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

teacher_engine = TeacherEngine()
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class SettingsPayload(BaseModel):
    session_id: Optional[str] = None
    language: Optional[str] = None
    urgency: Optional[int] = None
    importance: Optional[int] = None
    gemini_key: Optional[str] = None
    openai_key: Optional[str] = None


class ChatPayload(BaseModel):
    session_id: Optional[str] = None
    message: str


class PastePayload(BaseModel):
    session_id: Optional[str] = None
    title: str = "Pasted Notes"
    content: str


@app.post("/api/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
    language: Optional[str] = Form("English"),
    urgency: Optional[int] = Form(3),
    importance: Optional[int] = Form(3)
):
    """Upload one or more files (PDF, DOCX, DOC, PPTX, TXT, MD, etc.) and combine into a curriculum."""
    session = get_or_create_session(session_id)
    session.set_pedagogical_params(language=language, urgency=urgency, importance=importance)
    
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided.")

    combined_texts = []
    processed_filenames = []

    for file in files:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            extracted_text = DocumentParser.extract_text_from_file(file_path)
            if extracted_text.strip():
                combined_texts.append(f"=== [Document: {file.filename}] ===\n{extracted_text}")
                processed_filenames.append(file.filename)
        except Exception as e:
            print(f"Warning: could not process {file.filename}: {e}")

    if not combined_texts:
        raise HTTPException(status_code=400, detail="None of the uploaded files contained readable text.")

    unified_content = "\n\n".join(combined_texts)
    doc_title = (
        processed_filenames[0] if len(processed_filenames) == 1
        else f"{len(processed_filenames)} Documents ({', '.join(processed_filenames[:2])}{'...' if len(processed_filenames) > 2 else ''})"
    )

    curriculum = DocumentParser.analyze_curriculum(unified_content, title=doc_title, source_files=processed_filenames)
    session.load_curriculum(curriculum)
    
    # Initial greeting from teacher
    doc_intro = f"'{processed_filenames[0]}'" if len(processed_filenames) == 1 else f"{len(processed_filenames)} uploaded documents ({', '.join(processed_filenames)})"
    init_response = await teacher_engine.generate_response(
        session,
        user_input=f"Hello Teacher! I have uploaded {doc_intro}. Please introduce the core syllabus and kick off our first lesson."
    )
    
    return {
        "status": "success",
        "session": session.to_dict(),
        "first_message": init_response["response_text"],
        "files_count": len(processed_filenames)
    }


@app.post("/api/paste")
async def paste_document(payload: PastePayload):
    """Analyze directly pasted text notes or study material."""
    session = get_or_create_session(payload.session_id)
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Pasted content cannot be empty.")
    
    curriculum = DocumentParser.analyze_curriculum(payload.content, title=payload.title)
    session.load_curriculum(curriculum)
    
    init_response = await teacher_engine.generate_response(
        session,
        user_input=f"Hello! I have provided material titled '{payload.title}'. Please outline our core objectives and begin."
    )
    
    return {
        "status": "success",
        "session": session.to_dict(),
        "first_message": init_response["response_text"]
    }


@app.post("/api/sample")
async def load_sample(session_id: Optional[str] = None, sample_type: str = "quantum"):
    """Load pre-configured rich learning materials for immediate testing."""
    session = get_or_create_session(session_id)
    
    samples_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples")
    sample_filename = "quantum_computing.md" if sample_type == "quantum" else "cellular_respiration.md"
    sample_path = os.path.join(samples_dir, sample_filename)
    
    if not os.path.exists(sample_path):
        sample_path = os.path.join(samples_dir, "sample_notes.md")

    raw_text = DocumentParser.extract_text_from_file(sample_path)
    curriculum = DocumentParser.analyze_curriculum(raw_text, title="Core Syllabus: " + sample_type.replace("_", " ").title())
    session.load_curriculum(curriculum)
    
    init_response = await teacher_engine.generate_response(
        session,
        user_input="Hello Teacher! Let's begin studying this syllabus."
    )
    
    return {
        "status": "success",
        "session": session.to_dict(),
        "first_message": init_response["response_text"]
    }


@app.post("/api/settings")
async def update_settings(payload: SettingsPayload):
    """Update active language, urgency dial, importance dial, and API keys."""
    session = get_or_create_session(payload.session_id)
    session.set_pedagogical_params(
        language=payload.language,
        urgency=payload.urgency,
        importance=payload.importance
    )
    if payload.gemini_key is not None or payload.openai_key is not None:
        teacher_engine.set_api_keys(gemini_key=payload.gemini_key, openai_key=payload.openai_key)
        
    return {
        "status": "success",
        "session": session.to_dict()
    }


@app.post("/api/chat")
async def chat_turn(payload: ChatPayload):
    """Execute a single conversational turn in the live study session."""
    session = get_or_create_session(payload.session_id)
    if not session.document_data:
        raise HTTPException(status_code=400, detail="No document or curriculum loaded yet. Please upload material first.")
    
    result = await teacher_engine.generate_response(session, payload.message)
    return {
        "status": "success",
        "session": session.to_dict(),
        "reply": result["response_text"],
        "concept_advanced": result.get("concept_advanced", False),
        "current_concept": result.get("current_concept")
    }


@app.get("/api/session")
async def get_session_info(session_id: Optional[str] = None):
    """Retrieve current session state and anti-drift progress checklist."""
    session = get_or_create_session(session_id)
    return {
        "session": session.to_dict(),
        "history": session.history
    }


@app.post("/api/reset")
async def reset_session(session_id: Optional[str] = None):
    """Reset the current session to start fresh."""
    session = get_or_create_session(session_id)
    session.history = []
    session.concepts = []
    session.active_concept_idx = 0
    session.overall_mastery_percentage = 0
    session.document_data = None
    return {"status": "success", "session": session.to_dict()}


@app.get("/api/network-info")
async def get_network_info():
    """Returns local network address for connecting phones/tablets."""
    ip = get_local_ip()
    return {
        "local_ip": ip,
        "local_url": f"http://localhost:8000",
        "network_url": f"http://{ip}:8000" if ip != "127.0.0.1" else None
    }


class NotebookCreatePayload(BaseModel):
    title: str = "New Notebook"
    session_id: Optional[str] = None


class DriveSyncPayload(BaseModel):
    drive_file_id: Optional[str] = None
    drive_folder_id: Optional[str] = None


@app.get("/api/notebooks")
async def list_notebooks():
    """List all available notebooks with learning progress and Drive sync status."""
    return {"notebooks": NotebookManager.list_notebooks()}


@app.post("/api/notebooks")
async def create_notebook(payload: NotebookCreatePayload):
    """Create a new independent notebook and bind it to the current session."""
    nb = NotebookManager.create_notebook(payload.title)
    session = get_or_create_session(payload.session_id, notebook_id=nb["id"])
    session.load_from_notebook(nb)
    return {
        "status": "success",
        "notebook": nb,
        "session": session.to_dict()
    }


@app.get("/api/notebooks/{notebook_id}")
async def switch_notebook(notebook_id: str, session_id: Optional[str] = None):
    """Switch active learning session to a specific notebook."""
    nb = NotebookManager.get_notebook(notebook_id)
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    session = get_or_create_session(session_id, notebook_id=notebook_id)
    session.load_from_notebook(nb)
    return {
        "status": "success",
        "notebook": nb,
        "session": session.to_dict(),
        "history": session.history
    }


@app.delete("/api/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str):
    """Delete a notebook."""
    success = NotebookManager.delete_notebook(notebook_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"status": "success", "notebooks": NotebookManager.list_notebooks()}


@app.post("/api/notebooks/{notebook_id}/drive-sync")
async def record_drive_sync(notebook_id: str, payload: DriveSyncPayload):
    """Record Google Drive file and folder metadata after client syncs."""
    nb = NotebookManager.get_notebook(notebook_id)
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    
    nb["drive_file_id"] = payload.drive_file_id
    nb["drive_synced_at"] = time.time()
    NotebookManager.save_notebook(notebook_id, nb)
    return {"status": "success", "notebook": nb}


@app.get("/api/notebooks/{notebook_id}/export")
async def export_notebook(notebook_id: str):
    """Export complete notebook structure as JSON payload."""
    nb = NotebookManager.get_notebook(notebook_id)
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return nb


@app.post("/api/notebooks/import")
async def import_notebook(payload: Dict[str, Any]):
    """Import notebook from Google Drive JSON backup."""
    title = payload.get("title", "Imported Notebook")
    nb = NotebookManager.create_notebook(title=title, initial_data=payload)
    return {"status": "success", "notebook": nb}


# Mount frontend static directory
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
