"""
Document Parser for AI Interactive Teacher.
Extracts text from PDF, DOCX, TXT, and Markdown files,
and analyzes the text into structured Core Learning Concepts for the Anti-Drift Guardian.
"""

import os
import re
from typing import List, Dict, Any, Optional

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import docx
except ImportError:
    docx = None


class DocumentParser:
    """Parses various file types and structures them into curriculum units."""

    @staticmethod
    def extract_text_from_file(file_path: str) -> str:
        """Extract plain text from uploaded file based on its extension."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".pdf":
            return DocumentParser._parse_pdf(file_path)
        elif ext in [".docx", ".doc"]:
            return DocumentParser._parse_docx(file_path)
        elif ext in [".txt", ".md", ".markdown", ".csv", ".json", ".py", ".js", ".html"]:
            return DocumentParser._parse_plaintext(file_path)
        else:
            # Fallback attempt as text
            try:
                return DocumentParser._parse_plaintext(file_path)
            except Exception as e:
                raise ValueError(f"Unsupported file format '{ext}': {str(e)}")

    @staticmethod
    def _parse_pdf(file_path: str) -> str:
        if pypdf is None:
            raise ImportError("pypdf is not installed.")
        text_parts = []
        with open(file_path, "rb") as f:
            reader = pypdf.PdfReader(f)
            for page_idx, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text.strip())
        return "\n\n".join(text_parts)

    @staticmethod
    def _parse_docx(file_path: str) -> str:
        if docx is None:
            raise ImportError("python-docx is not installed.")
        doc = docx.Document(file_path)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)

    @staticmethod
    def _parse_plaintext(file_path: str) -> str:
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
        for enc in encodings:
            try:
                with open(file_path, "r", encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, UnicodeError):
                continue
        # Fallback with ignore errors
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    @staticmethod
    def analyze_curriculum(raw_text: str, title: str = "Uploaded Document") -> Dict[str, Any]:
        """
        Parses raw text into an initial structured curriculum:
        - summary
        - key learning concepts (each with title, summary, key facts, status)
        - core ground truth summary to anchor the teacher
        """
        cleaned = re.sub(r"\r\n", "\n", raw_text).strip()
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if len(p.strip()) > 20]
        
        # Detect headings / sections
        # Markdown headings (# or ##) or short lines ending with colon or capitalized
        lines = cleaned.split("\n")
        sections = []
        current_section = {"title": "Introduction & Overview", "content": []}

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            # Heading indicators
            is_md_header = line_str.startswith("#")
            is_caps_header = (
                len(line_str) < 80 
                and (line_str.isupper() or line_str.endswith(":") or (line_str[0].isdigit() and "." in line_str[:4]))
            )
            
            if (is_md_header or is_caps_header) and len(current_section["content"]) > 0:
                header_text = re.sub(r"^#+\s*", "", line_str).rstrip(":").strip()
                if len(header_text) > 2:
                    current_section["text"] = "\n".join(current_section["content"]).strip()
                    if current_section["text"]:
                        sections.append(current_section)
                    current_section = {"title": header_text, "content": []}
                    continue

            current_section["content"].append(line_str)

        # Append last section
        if current_section["content"]:
            current_section["text"] = "\n".join(current_section["content"]).strip()
            sections.append(current_section)

        # If sections are too few or empty, chunk by paragraphs
        if len(sections) <= 1 and len(paragraphs) > 2:
            sections = []
            chunk_size = max(1, len(paragraphs) // 4)
            for i in range(0, len(paragraphs), chunk_size):
                chunk = paragraphs[i:i + chunk_size]
                chunk_text = "\n\n".join(chunk)
                first_sentence = chunk[0].split(".")[0][:60].strip()
                sections.append({
                    "title": f"Part {len(sections) + 1}: {first_sentence}...",
                    "text": chunk_text
                })

        # Structure concepts
        concepts = []
        for idx, sec in enumerate(sections[:8]):  # Keep top 5-8 focus units
            sec_text = sec.get("text", "")
            # Extract key bullet or sentence
            sentences = [s.strip() for s in re.split(r"[.!?]\s+", sec_text) if len(s.strip()) > 15]
            summary_point = sentences[0] if sentences else sec_text[:120]
            
            concepts.append({
                "id": f"concept_{idx+1}",
                "title": sec["title"],
                "summary": summary_point,
                "status": "not_started",  # not_started | in_progress | mastered
                "mastery_score": 0,        # 0 to 100
                "key_facts": sentences[:4],
                "full_text_sample": sec_text[:800]
            })

        # First concept defaults to active/in_progress
        if concepts:
            concepts[0]["status"] = "in_progress"

        # Overall summary preview
        doc_preview = cleaned[:500].replace("\n", " ") + ("..." if len(cleaned) > 500 else "")

        return {
            "title": title,
            "char_count": len(cleaned),
            "word_count": len(cleaned.split()),
            "preview": doc_preview,
            "raw_text": cleaned,
            "concepts": concepts,
            "active_concept_index": 0
        }
