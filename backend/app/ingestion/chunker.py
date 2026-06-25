import logging
import tiktoken
from typing import List, Dict, Any

logger = logging.getLogger("app")

class TokenChunker:
    def __init__(self, chunk_size: int = 900, chunk_overlap: int = 150, model_name: str = "text-embedding-3-large"):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        try:
            self.encoding = tiktoken.encoding_for_model(model_name)
        except KeyError:
            logger.warning(f"Model {model_name} not found in tiktoken. Falling back to cl100k_base.")
            self.encoding = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    def _split_text_recursive(self, text: str, separators: List[str]) -> List[str]:
        """Recursively splits text using a list of separators until parts are smaller than chunk_size."""
        token_count = self.count_tokens(text)
        if token_count <= self.chunk_size:
            return [text]

        if not separators:
            # If no separators left, split by character or middle token count
            # Let's split by approximate characters based on token count
            mid = len(text) // 2
            left = text[:mid]
            right = text[mid:]
            return (
                self._split_text_recursive(left, separators) +
                self._split_text_recursive(right, separators)
            )

        separator = separators[0]
        # Split by separator
        splits = text.split(separator)
        
        # Reconstruct with the separator to preserve it
        parts = []
        for i, split in enumerate(splits):
            if i < len(splits) - 1:
                parts.append(split + separator)
            else:
                parts.append(split)

        final_parts = []
        for part in parts:
            if not part:
                continue
            if self.count_tokens(part) <= self.chunk_size:
                final_parts.append(part)
            else:
                # Recursively split the part with the remaining separators
                final_parts.extend(self._split_text_recursive(part, separators[1:]))

        return final_parts

    def _merge_parts(self, parts: List[str]) -> List[str]:
        """Merges parts into chunks of size <= chunk_size, with chunk_overlap."""
        if not parts:
            return []

        chunks = []
        current_chunk_parts = []
        current_chunk_tokens = 0

        for part in parts:
            part_tokens = self.count_tokens(part)
            
            # If a single part is larger than chunk_size, we must handle it (shouldn't happen due to recursion, but safety check)
            if part_tokens > self.chunk_size:
                # If we have something in current chunk, save it first
                if current_chunk_parts:
                    chunks.append("".join(current_chunk_parts))
                    current_chunk_parts = []
                    current_chunk_tokens = 0
                chunks.append(part)
                continue

            if current_chunk_tokens + part_tokens <= self.chunk_size:
                current_chunk_parts.append(part)
                current_chunk_tokens += part_tokens
            else:
                # Current chunk is full, save it
                chunks.append("".join(current_chunk_parts))
                
                # Form overlap: walk backward from the end of current_chunk_parts to build overlap
                overlap_parts = []
                overlap_tokens = 0
                for op in reversed(current_chunk_parts):
                    op_tokens = self.count_tokens(op)
                    if overlap_tokens + op_tokens <= self.chunk_overlap:
                        overlap_parts.insert(0, op)
                        overlap_tokens += op_tokens
                    else:
                        break
                
                current_chunk_parts = overlap_parts + [part]
                current_chunk_tokens = overlap_tokens + part_tokens

        if current_chunk_parts:
            chunks.append("".join(current_chunk_parts))

        return chunks

    def chunk_document(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Chunks a document represented by a list of pages.
        
        Returns a list of chunk dicts:
        {
            "text": str,
            "page_number": int,
            "token_count": int
        }
        """
        all_chunks = []
        separators = ["\n\n", "\n", ". ", "? ", "! ", " ", ""]

        for page in pages:
            text = page.get("text", "")
            page_number = page.get("page_number", 1)
            
            if not text.strip():
                continue

            # 1. Recursively split the page text into smaller fragments
            fragments = self._split_text_recursive(text, separators)
            
            # 2. Merge fragments into overlapping chunks
            page_chunks = self._merge_parts(fragments)
            
            for chunk_text in page_chunks:
                if chunk_text.strip():
                    all_chunks.append({
                        "text": chunk_text,
                        "page_number": page_number,
                        "token_count": self.count_tokens(chunk_text)
                    })

        return all_chunks
