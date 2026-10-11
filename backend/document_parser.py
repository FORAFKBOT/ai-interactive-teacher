"""
Document Parser for AI Interactive Teacher.
Supports multiple simultaneous file uploads and wide format compatibility:
- PDF (.pdf)
- Word Documents (.docx, .doc)
- PowerPoint Presentations (.pptx)
- Markdown & Text (.md, .txt, .rst)
- Web & Structured (.html, .htm, .json, .csv, .tsv, .rtf)
- Source Code (.py, .js, .ts, .java, .cpp, .c, etc.)
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET
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

        try:
            if ext == ".pdf":
                return DocumentParser._parse_pdf(file_path)
            elif ext == ".docx":
                return DocumentParser._parse_docx(file_path)
            elif ext == ".doc":
                return DocumentParser._parse_doc_legacy(file_path)
            elif ext == ".pptx":
                return DocumentParser._parse_pptx(file_path)
            elif ext in [".html", ".htm"]:
                return DocumentParser._parse_html(file_path)
            elif ext == ".rtf":
                return DocumentParser._parse_rtf(file_path)
            elif ext in [".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json",
                         ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c", ".h",
                         ".cs", ".go", ".rs", ".php", ".rb", ".sh", ".sql", ".yaml", ".yml"]:
                return DocumentParser._parse_plaintext(file_path)
            else:
                # General fallback attempt
                return DocumentParser._parse_plaintext(file_path)
        except Exception as e:
            # Fallback to binary string extraction if specialized parser fails
            try:
                return DocumentParser._extract_ascii_strings(file_path)
            except Exception:
                raise ValueError(f"Could not read file '{os.path.basename(file_path)}': {str(e)}")

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
        # Also extract table text
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    paragraphs.append(row_text)
        return "\n\n".join(paragraphs)

    @staticmethod
    def _parse_doc_legacy(file_path: str) -> str:
        """Fallback extractor for older binary Word (.doc) files."""
        return DocumentParser._extract_ascii_strings(file_path)

    @staticmethod
    def _parse_pptx(file_path: str) -> str:
        """Extract slide text from .pptx using native zip & XML inspection."""
        text_parts = []
        with zipfile.ZipFile(file_path, "r") as z:
            # Find slide files ppt/slides/slide1.xml, slide2.xml, etc.
            slide_files = sorted(
                [f for f in z.namelist() if re.match(r"^ppt/slides/slide\d+\.xml$", f)],
                key=lambda x: int(re.search(r"\d+", x.split("/")[-1]).group(0))
            )
            for idx, slide_name in enumerate(slide_files):
                slide_xml = z.read(slide_name)
                root = ET.fromstring(slide_xml)
                # Look for all text tags <a:t>
                slide_text = []
                for elem in root.iter():
                    tag_name = elem.tag.split("}")[-1].lower()
                    if tag_name in ["t", "text"] and elem.text and elem.text.strip():
                        slide_text.append(elem.text.strip())
                if slide_text:
                    text_parts.append(f"--- Slide {idx + 1} ---\n" + "\n".join(slide_text))
        return "\n\n".join(text_parts)

    @staticmethod
    def _parse_html(file_path: str) -> str:
        raw = DocumentParser._parse_plaintext(file_path)
        # Strip script/style and HTML tags
        clean = re.sub(r"<(script|style).*?</\1>", "", raw, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r"<[^>]+>", " ", clean)
        clean = re.sub(r"&[a-zA-Z]+;", " ", clean)
        return re.sub(r"\s+", " ", clean).strip()

    @staticmethod
    def _parse_rtf(file_path: str) -> str:
        raw = DocumentParser._parse_plaintext(file_path)
        clean = re.sub(r"\\[a-zA-Z0-9\-]+ ?", "", raw)
        clean = re.sub(r"[{}]", "", clean)
        return clean.strip()

    @staticmethod
    def _parse_plaintext(file_path: str) -> str:
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]
        for enc in encodings:
            try:
                with open(file_path, "r", encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, UnicodeError):
                continue
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    @staticmethod
    def _extract_ascii_strings(file_path: str) -> str:
        with open(file_path, "rb") as f:
            content = f.read()
        # Extract sequences of printable ASCII/UTF-8 characters
        matches = re.findall(b"[\x20-\x7E\r\n\t]{4,}", content)
        return "\n".join(m.decode("ascii", errors="ignore") for m in matches)

    @staticmethod
    def analyze_curriculum(raw_text: str, title: str = "Uploaded Document", source_files: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Parses raw text into an initial structured curriculum:
        - summary
        - key learning concepts (each with title, summary, key facts, status)
        - core ground truth summary to anchor the teacher
        """
        cleaned = re.sub(r"\r\n", "\n", raw_text).strip()
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if len(p.strip()) > 20]
        
        lines = cleaned.split("\n")
        sections = []
        current_section = {"title": "Introduction & Overview", "content": []}

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            is_md_header = line_str.startswith("#")
            is_doc_tag = line_str.startswith("=== [Document:") or line_str.startswith("--- Slide")
            is_caps_header = (
                len(line_str) < 80 
                and (line_str.isupper() or line_str.endswith(":") or (line_str[0].isdigit() and "." in line_str[:4]))
            )
            
            if (is_md_header or is_doc_tag or is_caps_header) and len(current_section["content"]) > 0:
                header_text = re.sub(r"^#+\s*", "", line_str).rstrip(":").strip()
                if len(header_text) > 2:
                    current_section["text"] = "\n".join(current_section["content"]).strip()
                    if current_section["text"]:
                        sections.append(current_section)
                    current_section = {"title": header_text, "content": []}
                    continue

            current_section["content"].append(line_str)

        if current_section["content"]:
            current_section["text"] = "\n".join(current_section["content"]).strip()
            sections.append(current_section)

        if len(sections) <= 1 and len(paragraphs) > 2:
            sections = []
            chunk_size = max(1, len(paragraphs) // 5)
            for i in range(0, len(paragraphs), chunk_size):
                chunk = paragraphs[i:i + chunk_size]
                chunk_text = "\n\n".join(chunk)
                first_sentence = chunk[0].split(".")[0][:60].strip()
                sections.append({
                    "title": f"Unit {len(sections) + 1}: {first_sentence}...",
                    "text": chunk_text
                })

        concepts = []
        for idx, sec in enumerate(sections[:10]):  # Focus on top 10 key modules
            sec_text = sec.get("text", "")
            sentences = [s.strip() for s in re.split(r"[.!?]\s+", sec_text) if len(s.strip()) > 15]
            summary_point = sentences[0] if sentences else sec_text[:120]
            
            concepts.append({
                "id": f"concept_{idx+1}",
                "title": sec["title"],
                "summary": summary_point,
                "status": "not_started",
                "mastery_score": 0,
                "key_facts": sentences[:5],
                "full_text_sample": sec_text[:800]
            })

        if concepts:
            concepts[0]["status"] = "in_progress"

        doc_preview = cleaned[:500].replace("\n", " ") + ("..." if len(cleaned) > 500 else "")

        return {
            "title": title,
            "source_files": source_files or [title],
            "char_count": len(cleaned),
            "word_count": len(cleaned.split()),
            "preview": doc_preview,
            "raw_text": cleaned,
            "concepts": concepts,
            "active_concept_index": 0
        }
