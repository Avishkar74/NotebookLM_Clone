import pytest
from app.ingestion.chunker import TokenChunker

def test_token_chunker_init():
    chunker = TokenChunker(chunk_size=100, chunk_overlap=20)
    assert chunker.chunk_size == 100
    assert chunker.chunk_overlap == 20
    assert chunker.encoding is not None

def test_count_tokens():
    chunker = TokenChunker()
    text = "Hello, world!"
    # tiktoken encoded length for "Hello, world!" is normally 3 or 4 tokens
    tokens_count = chunker.count_tokens(text)
    assert tokens_count > 0

def test_chunk_document_under_limit():
    chunker = TokenChunker(chunk_size=100, chunk_overlap=10)
    pages = [
        {"text": "Short page content.", "page_number": 1}
    ]
    chunks = chunker.chunk_document(pages)
    assert len(chunks) == 1
    assert chunks[0]["text"] == "Short page content."
    assert chunks[0]["page_number"] == 1
    assert chunks[0]["token_count"] == chunker.count_tokens("Short page content.")

def test_chunk_document_over_limit():
    # Set chunk size very small to force splitting
    chunker = TokenChunker(chunk_size=10, chunk_overlap=2)
    
    # Text with multiple sentences
    long_text = "This is the first sentence. And this is the second sentence. Finally, the third sentence."
    pages = [
        {"text": long_text, "page_number": 1}
    ]
    
    chunks = chunker.chunk_document(pages)
    
    # Assert we got multiple chunks
    assert len(chunks) > 1
    # Check each chunk is under chunk_size (10)
    for c in chunks:
        assert c["token_count"] <= 10
        assert c["page_number"] == 1
        assert len(c["text"].strip()) > 0

def test_chunk_document_multiple_pages():
    chunker = TokenChunker(chunk_size=50, chunk_overlap=5)
    pages = [
        {"text": "Page one text.", "page_number": 1},
        {"text": "Page two text.", "page_number": 2}
    ]
    chunks = chunker.chunk_document(pages)
    assert len(chunks) == 2
    assert chunks[0]["page_number"] == 1
    assert chunks[1]["page_number"] == 2
