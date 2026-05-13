"""
OCR scanned PDFs in order of size (smallest first).
"""
import sys, time
from pathlib import Path

# Add parent to path so we can import
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_kb import clean_text, chunk_text, save_kb, ALREADY_COVERED, PDF_DIR, KB_PATH, CHUNK_SIZE, MIN_CHUNK_CHARS, TEXT_MIN_LENGTH

import pymupdf
import numpy as np
from rapidocr_onnxruntime import RapidOCR

# Order: smallest first
TARGETS = [
    "中国焦虑障碍防治指南.pdf",               # 17 pages
    "儿童注意缺陷多动症防治指南.pdf",          # 173 pages
    "中国失眠障碍综合防治指南 (陆林) (z-library.sk, 1lib.sk, z-lib.sk).pdf",  # 203 pages
    "中国双相障碍防治指南.pdf",                 # 416 pages
]

def main():
    engine = RapidOCR()

    # Load existing KB
    if KB_PATH.exists():
        import json
        with open(KB_PATH, 'r', encoding='utf-8') as f:
            kb = json.load(f)
        existing_ids = {c['chunk_id'] for c in kb.get('chunks', [])}
        print(f'Existing KB: {len(kb["chunks"])} chunks')
    else:
        kb = {'document': {}, 'chunks': []}
        existing_ids = set()

    doc_id = kb.get('document', {}).get('document_id', 'mental-health-zh-v1')
    idx_ref = [max((c['chunk_index'] for c in kb.get('chunks', [])), default=0)]
    total_pages = kb.get('document', {}).get('page_count', 0)

    for name in TARGETS:
        pdf_path = PDF_DIR / name
        if not pdf_path.exists():
            print(f'Not found: {name}')
            continue

        # Check if scanned
        doc_check = pymupdf.open(str(pdf_path))
        text_sample = sum(len(doc_check[i].get_text().strip()) for i in range(min(5, len(doc_check))))
        doc_check.close()
        if text_sample >= TEXT_MIN_LENGTH:
            print(f'Has embedded text (use build_kb.py): {name}')
            continue

        if name in ALREADY_COVERED:
            print(f'Skip (covered by 2025 version): {name}')
            continue

        title_stem = pdf_path.stem
        already_has = any(c.get('title') == title_stem for c in kb['chunks'])
        if already_has:
            print(f'Already in KB: {name}')
            continue

        start = time.time()
        doc = pymupdf.open(str(pdf_path))
        total = len(doc)
        print(f'\nOCR: {name} ({total}p) ...', flush=True)

        file_chunks = []
        for i in range(total):
            pix = doc[i].get_pixmap(dpi=200)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            result, _ = engine(img)
            page_text = ''.join(item[1] for item in result) if result else ''
            cleaned = clean_text(page_text)
            if cleaned and len(cleaned) >= MIN_CHUNK_CHARS:
                page_chunks = chunk_text(cleaned, i + 1, str(pdf_path), doc_id, idx_ref)
                for c in page_chunks:
                    if c['chunk_id'] not in existing_ids:
                        file_chunks.append(c)
                        existing_ids.add(c['chunk_id'])

            if (i + 1) % 30 == 0 or i == total - 1:
                print(f'  {i+1}/{total} — {len(page_text)} chars', flush=True)

        doc.close()
        kb['chunks'].extend(file_chunks)
        total_pages += total

        kb['document'].update({
            'document_id': doc_id,
            'title': '心理健康中文综合知识库（指南 + 课本）',
            'source_path': str(PDF_DIR),
            'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'page_count': total_pages,
            'chunk_count': len(kb['chunks']),
            'tags': ['mental-health', 'Chinese-guidelines', 'psychiatry', 'psychology']
        })
        mb = save_kb(kb)
        elapsed = time.time() - start
        print(f'  -> {len(file_chunks)} chunks in {elapsed:.0f}s (KB: {mb:.1f}MB)', flush=True)

    print(f'\nDone! Total: {len(kb["chunks"])} chunks, {total_pages} pages')

if __name__ == '__main__':
    main()
