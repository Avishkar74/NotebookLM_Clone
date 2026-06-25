import os
import pytest
from unittest.mock import MagicMock, patch
from app.ingestion.loader import DocumentLoader

def test_load_txt(tmp_path):
    txt_file = tmp_path / "test_doc.txt"
    txt_file.write_text("This is test text file content.", encoding="utf-8")
    
    pages = DocumentLoader.load_txt(str(txt_file))
    assert len(pages) == 1
    assert pages[0]["text"] == "This is test text file content."
    assert pages[0]["page_number"] == 1

def test_load_txt_latin1(tmp_path):
    txt_file = tmp_path / "test_latin1.txt"
    txt_file.write_bytes(b"This is test text with latin \xe9 character.") # é in latin-1
    
    pages = DocumentLoader.load_txt(str(txt_file))
    assert len(pages) == 1
    assert "latin" in pages[0]["text"]
    assert pages[0]["page_number"] == 1

def test_load_pdf():
    mock_reader = MagicMock()
    mock_page1 = MagicMock()
    mock_page1.extract_text.return_value = "First Page Content"
    mock_page2 = MagicMock()
    mock_page2.extract_text.return_value = "Second Page Content"
    mock_reader.pages = [mock_page1, mock_page2]
    
    with patch("app.ingestion.loader.PdfReader", return_value=mock_reader) as mock_pdf_reader:
        # Mock os.path.exists to return True for dummy path
        with patch("os.path.exists", return_value=True):
            pages = DocumentLoader.load_pdf("dummy.pdf")
            mock_pdf_reader.assert_called_once_with("dummy.pdf")
            assert len(pages) == 2
            assert pages[0]["text"] == "First Page Content"
            assert pages[0]["page_number"] == 1
            assert pages[1]["text"] == "Second Page Content"
            assert pages[1]["page_number"] == 2

def test_load_file_routing(tmp_path):
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("TXT file", encoding="utf-8")
    
    with patch("app.ingestion.loader.DocumentLoader.load_txt", return_value=[{"text": "TXT content", "page_number": 1}]) as mock_txt:
        pages = DocumentLoader.load_file(str(txt_file))
        mock_txt.assert_called_once_with(str(txt_file))
        assert pages[0]["text"] == "TXT content"

    pdf_file = tmp_path / "test.pdf"
    with patch("app.ingestion.loader.DocumentLoader.load_pdf", return_value=[{"text": "PDF content", "page_number": 1}]) as mock_pdf:
        pages = DocumentLoader.load_file(str(pdf_file))
        mock_pdf.assert_called_once_with(str(pdf_file))
        assert pages[0]["text"] == "PDF content"

    # Unsupported format
    with pytest.raises(ValueError, match="Unsupported file format"):
        DocumentLoader.load_file("unsupported.docx")
