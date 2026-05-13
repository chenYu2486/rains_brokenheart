"""
Build RAG knowledge base from PDFs using PyMuPDF for text extraction.
Handles PDFs with embedded text (including those pdf-parse fails on).

Usage:
    python scripts/build_kb.py
"""

import json, re, sys, time
from pathlib import Path

PDF_DIR = Path(__file__).resolve().parent.parent / 'book_for_rag'
OUTPUT = Path(__file__).resolve().parent.parent / 'data' / 'kb' / 'combined_knowledge.json'

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150
MIN_CHUNK_CHARS = 60

def clean_text(raw: str) -> str:
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '',
           re.sub(r'\r\n|\f', '\n',
           re.sub(r'[ \t]+', ' ', raw))).strip()

def chunk_text(text: str, page_num: int, source_path: str, doc_id: str, idx_ref: list) -> list:
    """Split text into chunks using sentence/paragraph boundaries."""
    if not text or not text.strip():
        return []
    plain = text.strip()

    # Split into segments by paragraph breaks, then sentence endings
    separators = ['\n\n', '。', '！', '？', '\n']
    segments = [plain]
    for sep in separators:
        next_seg = []
        for seg in segments:
            if len(seg) <= CHUNK_SIZE * 1.5:
                next_seg.append(seg)
            else:
                parts = [p for p in seg.split(sep) if p.strip()]
                next_seg.extend(parts)
        segments = next_seg
        if all(len(s) <= CHUNK_SIZE * 1.2 for s in segments):
            break

    # Merge segments into chunks
    chunks = []
    current = ''
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        candidate = current + '。' + seg if current else seg
        if len(candidate) <= CHUNK_SIZE:
            current = candidate
        else:
            if current and len(current) >= MIN_CHUNK_CHARS:
                idx_ref[0] += 1
                chunks.append({
                    'chunk_id': f'{doc_id}-p{page_num:04d}-c{idx_ref[0]:04d}',
                    'document_id': doc_id,
                    'title': Path(source_path).stem,
                    'source_path': str(source_path),
                    'page_start': page_num,
                    'page_end': page_num,
                    'chunk_index': idx_ref[0],
                    'char_count': len(current),
                    'text': current,
                    'text_preview': current[:200]
                })
            # Keep overlap from tail
            overlap = current[-CHUNK_OVERLAP:] if len(current) > CHUNK_OVERLAP else current
            current = overlap + '。' + seg
            if len(current) > CHUNK_SIZE * 2:
                current = current[-CHUNK_SIZE:]

    if current and len(current.strip()) >= MIN_CHUNK_CHARS:
        idx_ref[0] += 1
        current = current.strip()
        chunks.append({
            'chunk_id': f'{doc_id}-p{page_num:04d}-c{idx_ref[0]:04d}',
            'document_id': doc_id,
            'title': Path(source_path).stem,
            'source_path': str(source_path),
            'page_start': page_num,
            'page_end': page_num,
            'chunk_index': idx_ref[0],
            'char_count': len(current),
            'text': current,
            'text_preview': current[:200]
        })
    return chunks

def process_pdf(file_path: Path):
    """Extract text from a PDF using PyMuPDF."""
    import pymupdf
    doc = pymupdf.open(str(file_path))
    pages_text = []
    for i in range(len(doc)):
        text = doc[i].get_text().strip()
        pages_text.append(text)
    total = len(doc)
    doc.close()
    return {
        'numPages': total,
        'pages': pages_text,
        'text': '\n\n'.join(pages_text)
    }

def main():
    print('Building knowledge base from PDFs...\n')

    pdf_files = sorted(PDF_DIR.glob('*.pdf'))
    if not pdf_files:
        print('No PDFs found!')
        sys.exit(1)

    print(f'Found {len(pdf_files)} PDFs:\n' +
          '\n'.join(f'  - {p.name}' for p in pdf_files) + '\n')

    all_chunks = []
    total_pages = 0
    doc_id = 'mental-health-zh-v1'
    idx_ref = [0]
    processed = 0
    skipped = []

    for pdf_path in pdf_files:
        name = pdf_path.name
        print(f'  [{processed+1}/{len(pdf_files)}] {name} ... ', end='', flush=True)

        try:
            result = process_pdf(pdf_path)
            file_chunks = []

            for i, page_text in enumerate(result['pages']):
                cleaned = clean_text(page_text)
                if not cleaned:
                    continue
                page_chunks = chunk_text(cleaned, i + 1, str(pdf_path), doc_id, idx_ref)
                file_chunks.extend(page_chunks)

            all_chunks.extend(file_chunks)
            total_pages += result['numPages']

            if file_chunks:
                print(f'{len(file_chunks)} chunks / {result["numPages"]} pages')
                processed += 1
            else:
                print(f'0 chunks (scanned/no text)')
                skipped.append(name)

        except Exception as e:
            print(f'ERROR: {e}')
            skipped.append(name)

    # Build final JSON
    kb = {
        'document': {
            'document_id': doc_id,
            'title': '心理健康中文综合知识库（指南 + 课本）',
            'source_path': str(PDF_DIR),
            'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'parser_backend': 'PyMuPDF',
            'page_count': total_pages,
            'chunk_count': len(all_chunks),
            'chunk_size': CHUNK_SIZE,
            'chunk_overlap': CHUNK_OVERLAP,
            'min_chunk_size': MIN_CHUNK_CHARS,
            'tags': ['mental-health', 'Chinese-guidelines', 'psychiatry', 'psychology']
        },
        'chunks': all_chunks
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f'\nDone!')
    print(f'   Processed: {processed} PDFs')
    print(f'   Skipped (scanned): {len(skipped)}')
    if skipped:
        print(f'   - ' + '\n   - '.join(skipped))
    print(f'   Total pages: {total_pages}')
    print(f'   Total chunks: {len(all_chunks)}')
    print(f'   Output: ~{size_mb:.1f} MB')

if __name__ == '__main__':
    main()
