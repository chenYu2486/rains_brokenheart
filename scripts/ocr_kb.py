"""
OCR-based PDF text extraction using RapidOCR (ONNX-based, accurate Chinese OCR).

Usage:
    python scripts/ocr_kb.py

Processes scanned PDFs one by one, saves KB after each PDF.
"""
import json, re, sys, time
from pathlib import Path

PDF_DIR = Path(__file__).resolve().parent.parent / 'book_for_rag'
KB_PATH = Path(__file__).resolve().parent.parent / 'data' / 'kb' / 'combined_knowledge.json'

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150
MIN_CHUNK_CHARS = 40
TEXT_MIN_LENGTH = 80
OCR_DPI = 200

# PDFs we already have text-extracted 2025 versions for — skip these old scans
ALREADY_COVERED = [
    '中国抑郁症障碍防治指南.pdf',
    '中国精神分裂症防治指南.pdf',
]


def clean_text(raw):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '',
           re.sub(r'\r\n|\f', '\n',
           re.sub(r'[ \t]+', ' ', raw))).strip()


def chunk_text(text, page_num, source_path, doc_id, idx_ref):
    if not text or not text.strip():
        return []
    plain = text.strip()
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


def save_kb(kb):
    with open(KB_PATH, 'w', encoding='utf-8') as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)
    return KB_PATH.stat().st_size / 1024 / 1024


def main():
    import pymupdf
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    pdf_files = sorted(PDF_DIR.glob('*.pdf'))

    # Load existing KB
    if KB_PATH.exists():
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

    engine = RapidOCR()
    engine_loaded = True

    for pdf_path in pdf_files:
        name = pdf_path.name

        # Check if it needs OCR
        doc_check = pymupdf.open(str(pdf_path))
        text_sample = sum(len(doc_check[i].get_text().strip()) for i in range(min(5, len(doc_check))))
        doc_check.close()
        has_text = text_sample >= TEXT_MIN_LENGTH

        if has_text:
            continue  # Already handled by build_kb.py

        if name in ALREADY_COVERED:
            print(f'Skip (covered by 2025 text version): {name}')
            continue

        # Check if already in KB
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
            pix = doc[i].get_pixmap(dpi=OCR_DPI)
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

        # Save after each PDF
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
