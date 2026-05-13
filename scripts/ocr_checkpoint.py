"""
OCR scanned PDFs with intra-PDF checkpoints every 50 pages.
Usage: python scripts/ocr_checkpoint.py
"""
import json, time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
KB_PATH = SCRIPT_DIR.parent / 'data' / 'kb' / 'combined_knowledge.json'
PDF_DIR = SCRIPT_DIR.parent / 'book_for_rag'

MIN_CHUNK_CHARS = 40
TEXT_MIN_LENGTH = 80
CHECKPOINT_EVERY = 50  # save KB every N pages within a PDF

ALREADY_COVERED = [
    '中国抑郁症障碍防治指南.pdf',
    '中国精神分裂症防治指南.pdf',
]

PROCESS_ORDER = [
    "儿童注意缺陷多动症防治指南.pdf",           # 173p, was partially done
    "中国失眠障碍综合防治指南 (陆林) (z-library.sk, 1lib.sk, z-lib.sk).pdf",  # 203p
    "中国焦虑障碍防治指南实用简本 (吴文源主编, 主编单位 中华医学会精神病学分会 , 主编 吴文源 etc.) (z-library.sk, 1lib.sk, z-lib.sk).pdf",  # 121p
]

# Import shared utilities from ocr_kb
from ocr_kb import clean_text, chunk_text, save_kb, KB_PATH as _KBP, CHUNK_SIZE


def get_pdf_stem(pdf_path):
    """Get the stem of a PDF path, matching how chunk_text generates titles."""
    return pdf_path.stem


def main():
    import pymupdf
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()

    # Load existing KB
    if KB_PATH.exists():
        with open(KB_PATH, 'r', encoding='utf-8') as f:
            kb = json.load(f)
        existing_ids = {c['chunk_id'] for c in kb.get('chunks', [])}
        print(f'Existing KB: {len(kb["chunks"])} chunks, '
              f'{kb["document"].get("page_count", 0)} pages')
    else:
        kb = {'document': {}, 'chunks': []}
        existing_ids = set()

    doc_id = kb.get('document', {}).get('document_id', 'mental-health-zh-v1')
    idx_ref = [max((c['chunk_index'] for c in kb.get('chunks', [])), default=0)]
    total_pages = kb.get('document', {}).get('page_count', 0)

    for name in PROCESS_ORDER:
        pdf_path = PDF_DIR / name
        if not pdf_path.exists():
            print(f'Not found: {name}')
            continue

        # Check if it has embedded text (shouldn't since we're only processing scanned)
        doc_check = pymupdf.open(str(pdf_path))
        text_sample = sum(len(doc_check[i].get_text().strip()) for i in range(min(5, len(doc_check))))
        doc_check.close()
        if text_sample >= TEXT_MIN_LENGTH:
            print(f'Has embedded text (use build_kb.py): {name}')
            continue

        if name in ALREADY_COVERED:
            print(f'Skip (covered by 2025 version): {name}')
            continue

        title_stem = get_pdf_stem(pdf_path)
        already_has = any(c.get('title') == title_stem for c in kb['chunks'])
        if already_has:
            print(f'Already in KB ({sum(1 for c in kb["chunks"] if c.get("title")==title_stem)} chunks): {name}')
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

            # Progress report
            page_num = i + 1
            if page_num % CHECKPOINT_EVERY == 0 or page_num == total:
                print(f'  {page_num}/{total} — {len(page_text)} chars', flush=True)

            # Checkpoint: save every CHECKPOINT_EVERY pages
            if page_num % CHECKPOINT_EVERY == 0 and page_num < total:
                # Temporarily add current progress to KB and save
                temp_kb = kb.copy()
                temp_kb['chunks'] = list(kb['chunks']) + list(file_chunks)
                temp_kb['document'] = dict(kb.get('document', {}))
                temp_kb['document'].update({
                    'document_id': doc_id,
                    'title': '心理健康中文综合知识库（指南 + 课本）',
                    'source_path': str(PDF_DIR),
                    'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    'page_count': total_pages + page_num,
                    'chunk_count': len(kb['chunks']) + len(file_chunks),
                    'tags': ['mental-health', 'Chinese-guidelines', 'psychiatry', 'psychology']
                })
                with open(KB_PATH, 'w', encoding='utf-8') as f:
                    json.dump(temp_kb, f, ensure_ascii=False, indent=2)
                mb = KB_PATH.stat().st_size / 1024 / 1024
                elapsed = time.time() - start
                print(f'  [checkpoint p{page_num}] {len(file_chunks)} chunks so far, '
                      f'{elapsed:.0f}s elapsed, KB: {mb:.1f}MB', flush=True)

        doc.close()

        # PDF complete — final save
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
        print(f'  -> FINISHED: {len(file_chunks)} chunks in {elapsed:.0f}s (KB: {mb:.1f}MB)', flush=True)

    print(f'\nDone! Total: {len(kb["chunks"])} chunks, {total_pages} pages')


if __name__ == '__main__':
    main()
