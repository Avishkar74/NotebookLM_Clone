import os
from typing import List, Dict, Any
from pypdf import PdfReader

class DocumentLoader:
    @staticmethod
    def load_txt(filepath: str) -> List[Dict[str, Any]]:
        """Loads a plain text file and returns it as a page-level list of dictionaries."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
        
        # Detect encoding or fallback to utf-8
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(filepath, "r", encoding="latin-1") as f:
                content = f.read()
                
        return [{
            "text": content,
            "page_number": 1
        }]

    @staticmethod
    def load_pdf(filepath: str) -> List[Dict[str, Any]]:
        """Loads a PDF file and returns a list of dictionaries with text and page numbers (1-indexed)."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
            
        reader = PdfReader(filepath)
        pages = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            pages.append({
                "text": page_text,
                "page_number": i + 1
            })
        return pages

    @classmethod
    def load_file(cls, filepath: str) -> List[Dict[str, Any]]:
        """Loads a file automatically based on its extension."""
        _, ext = os.path.splitext(filepath.lower())
        if ext == ".pdf":
            return cls.load_pdf(filepath)
        elif ext == ".txt":
            return cls.load_txt(filepath)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
