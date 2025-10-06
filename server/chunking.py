from typing import List, Tuple
import re

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Tuple[str, int]]:
    """
    Split text into overlapping chunks
    Returns list of (chunk_text, chunk_index) tuples
    """
    if not text.strip():
        return []
    
    # Clean text
    text = clean_text(text)
    
    # Split by sentences first for better chunk boundaries
    sentences = split_into_sentences(text)
    
    chunks = []
    current_chunk = ""
    current_size = 0
    chunk_index = 0
    
    for sentence in sentences:
        sentence_size = len(sentence)
        
        # If adding this sentence would exceed chunk size
        if current_size + sentence_size > chunk_size and current_chunk:
            # Save current chunk
            chunks.append((current_chunk.strip(), chunk_index))
            chunk_index += 1
            
            # Start new chunk with overlap
            overlap_text = get_overlap_text(current_chunk, overlap)
            current_chunk = overlap_text + " " + sentence
            current_size = len(current_chunk)
        else:
            # Add sentence to current chunk
            if current_chunk:
                current_chunk += " " + sentence
            else:
                current_chunk = sentence
            current_size = len(current_chunk)
    
    # Add final chunk if there's content
    if current_chunk.strip():
        chunks.append((current_chunk.strip(), chunk_index))
    
    return chunks

def clean_text(text: str) -> str:
    """Clean and normalize text"""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove non-printable characters
    text = re.sub(r'[^\x20-\x7E\n\r\t]', '', text)
    return text.strip()

def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using regex"""
    # Simple sentence splitting - could be enhanced with NLTK
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

def get_overlap_text(text: str, overlap_size: int) -> str:
    """Get the last N characters for overlap"""
    if len(text) <= overlap_size:
        return text
    
    # Try to break at word boundary
    overlap_text = text[-overlap_size:]
    space_index = overlap_text.find(' ')
    if space_index > 0:
        return overlap_text[space_index:].strip()
    
    return overlap_text
