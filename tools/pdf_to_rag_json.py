#!/usr/bin/env python3
"""
Convert a PDF into page-aware JSON/JSONL chunks for local RAG ingestion.

The script keeps enough metadata for traceable retrieval:
- source PDF path
- source file SHA-256
- page_start / page_end
- stable chunk_id values
- text hash per chunk

It tries several common PDF parsers and uses the first one available:
- pypdf
- PyPDF2
- PyMuPDF (fitz)
- pdfplumber
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Sequence


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_text(text: str) -> str:
    return _sha256_bytes(text.encode("utf-8"))


def _looks_cjk(char: str) -> bool:
    if not char:
        return False
    code = ord(char)
    return (
        0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
    )


def _join_wrapped_lines(parts: Sequence[str]) -> str:
    if not parts:
        return ""
    merged = parts[0].strip()
    for raw in parts[1:]:
        current = raw.strip()
        if not current:
            continue
        if not merged:
            merged = current
            continue

        prev = merged[-1]
        nxt = current[0]

        if merged.endswith("-") and nxt.isascii() and nxt.isalpha():
            merged = merged[:-1] + current
        elif _looks_cjk(prev) and _looks_cjk(nxt):
            merged += current
        elif prev in "（([《“‘" or nxt in "），。；：！？、)]》”’":
            merged += current
        else:
            merged += " " + current
    return merged


def normalize_page_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)

    paragraphs: List[str] = []
    buffer: List[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            if buffer:
                joined = _join_wrapped_lines(buffer).strip()
                if joined:
                    paragraphs.append(joined)
                buffer = []
            continue
        buffer.append(stripped)

    if buffer:
        joined = _join_wrapped_lines(buffer).strip()
        if joined:
            paragraphs.append(joined)

    normalized = "\n\n".join(paragraphs)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()
    return normalized


def estimate_tokens(text: str) -> int:
    # Lightweight estimate that behaves reasonably for mixed Chinese/English text.
    cjk_chars = sum(1 for ch in text if _looks_cjk(ch))
    other_chars = max(0, len(text) - cjk_chars)
    return cjk_chars + max(1, other_chars // 4)


@dataclass(frozen=True)
class PageText:
    page_number: int
    text: str


@dataclass(frozen=True)
class Paragraph:
    page_number: int
    text: str


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    document_id: str
    title: str
    source_path: str
    source_sha256: str
    page_start: int
    page_end: int
    chunk_index: int
    char_count: int
    token_estimate: int
    text_sha256: str
    text_preview: str
    text: str
    citations: list
    metadata: dict


def extract_pages_with_pypdf(pdf_path: Path) -> List[PageText]:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        from PyPDF2 import PdfReader  # type: ignore

    reader = PdfReader(str(pdf_path))
    pages: List[PageText] = []
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        pages.append(PageText(page_number=idx, text=normalize_page_text(text)))
    return pages


def extract_pages_with_fitz(pdf_path: Path) -> List[PageText]:
    import fitz  # type: ignore

    pages: List[PageText] = []
    with fitz.open(pdf_path) as doc:
        for idx, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            pages.append(PageText(page_number=idx, text=normalize_page_text(text)))
    return pages


def extract_pages_with_pdfplumber(pdf_path: Path) -> List[PageText]:
    import pdfplumber  # type: ignore

    pages: List[PageText] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            pages.append(PageText(page_number=idx, text=normalize_page_text(text)))
    return pages


def extract_pages_with_rapidocr(
    pdf_path: Path,
    ocr_scale: float = 2.0,
    ocr_min_score: float = 0.5,
) -> List[PageText]:
    import fitz  # type: ignore
    import numpy as np  # type: ignore
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    ocr_engine = RapidOCR()
    pages: List[PageText] = []

    def sort_key(item: list) -> tuple[float, float]:
        box = item[0]
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        return (sum(ys) / len(ys), min(xs))

    with fitz.open(pdf_path) as doc:
        for idx, page in enumerate(doc, start=1):
            pix = page.get_pixmap(matrix=fitz.Matrix(ocr_scale, ocr_scale), alpha=False)
            image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                image = image[:, :, :3]
            if pix.n == 1:
                image = image[:, :, 0]

            result, _ = ocr_engine(image)
            if not result:
                pages.append(PageText(page_number=idx, text=""))
                continue

            lines: List[str] = []
            for item in sorted(result, key=sort_key):
                if len(item) < 3:
                    continue
                _, text, score = item
                if not text or float(score) < ocr_min_score:
                    continue
                lines.append(str(text).strip())

            pages.append(PageText(page_number=idx, text=normalize_page_text("\n".join(lines))))

    return pages


def extract_pages(
    pdf_path: Path,
    ocr_scale: float = 2.0,
    ocr_min_score: float = 0.5,
) -> tuple[List[PageText], str]:
    extractors = (
        ("pypdf/PyPDF2", extract_pages_with_pypdf),
        ("PyMuPDF", extract_pages_with_fitz),
        ("pdfplumber", extract_pages_with_pdfplumber),
        (
            "PyMuPDF + RapidOCR",
            lambda path: extract_pages_with_rapidocr(path, ocr_scale=ocr_scale, ocr_min_score=ocr_min_score),
        ),
    )
    errors: List[str] = []

    for name, fn in extractors:
        try:
            pages = fn(pdf_path)
            if not pages:
                errors.append(f"{name}: no pages extracted")
                continue
            extracted_chars = sum(len(page.text.strip()) for page in pages)
            if extracted_chars == 0:
                errors.append(f"{name}: extracted 0 text characters")
                continue
            return pages, name
        except Exception as exc:  # pragma: no cover - backend availability is environment specific
            errors.append(f"{name}: {exc}")

    message = "No supported PDF extraction backend is available.\n"
    message += "Tried:\n- " + "\n- ".join(errors)
    message += "\nInstall one of: pypdf, PyPDF2, pymupdf, pdfplumber"
    raise RuntimeError(message)


def paragraphs_from_pages(pages: Sequence[PageText]) -> List[Paragraph]:
    items: List[Paragraph] = []
    for page in pages:
        if not page.text:
            continue
        for para in page.text.split("\n\n"):
            cleaned = para.strip()
            if cleaned:
                items.append(Paragraph(page_number=page.page_number, text=cleaned))
    return items


def _split_long_paragraph(text: str, max_chars: int) -> List[str]:
    if len(text) <= max_chars:
        return [text]

    sentence_parts = re.split(r"(?<=[。！？；.!?;])", text)
    pieces: List[str] = []
    current = ""

    for part in sentence_parts:
        candidate = current + part
        if current and len(candidate) > max_chars:
            pieces.append(current.strip())
            current = part
        else:
            current = candidate

    if current.strip():
        pieces.append(current.strip())

    final_parts: List[str] = []
    for piece in pieces:
        if len(piece) <= max_chars:
            final_parts.append(piece)
            continue
        start = 0
        while start < len(piece):
            final_parts.append(piece[start : start + max_chars].strip())
            start += max_chars
    return [part for part in final_parts if part]


def _preview(text: str, limit: int = 80) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _paragraph_text_for_overlap(paragraphs: Sequence[Paragraph], overlap_chars: int) -> List[Paragraph]:
    if overlap_chars <= 0 or not paragraphs:
        return []
    collected: List[Paragraph] = []
    total = 0
    for para in reversed(paragraphs):
        collected.insert(0, para)
        total += len(para.text)
        if total >= overlap_chars:
            break
    return collected


def chunk_paragraphs(
    paragraphs: Sequence[Paragraph],
    document_id: str,
    title: str,
    source_path: str,
    source_sha256: str,
    chunk_size: int,
    chunk_overlap: int,
    min_chunk_size: int,
    tags: Sequence[str],
) -> List[Chunk]:
    exploded: List[Paragraph] = []
    for para in paragraphs:
        for piece in _split_long_paragraph(para.text, chunk_size):
            exploded.append(Paragraph(page_number=para.page_number, text=piece))

    chunks: List[Chunk] = []
    buffer: List[Paragraph] = []
    chunk_index = 1

    def flush_buffer(items: Sequence[Paragraph]) -> None:
        nonlocal chunk_index
        if not items:
            return
        text = "\n\n".join(item.text for item in items).strip()
        if not text:
            return
        page_numbers = [item.page_number for item in items]
        chunk_id = f"{document_id}-p{min(page_numbers):04d}-c{chunk_index:04d}"
        citations = [{"type": "page", "page": page} for page in sorted(set(page_numbers))]
        metadata = {
            "tags": list(tags),
            "language": "zh",
            "retrieval_hint": "Return source_path and page_start/page_end with answer citations.",
        }
        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                document_id=document_id,
                title=title,
                source_path=source_path,
                source_sha256=source_sha256,
                page_start=min(page_numbers),
                page_end=max(page_numbers),
                chunk_index=chunk_index,
                char_count=len(text),
                token_estimate=estimate_tokens(text),
                text_sha256=_sha256_text(text),
                text_preview=_preview(text),
                text=text,
                citations=citations,
                metadata=metadata,
            )
        )
        chunk_index += 1

    for para in exploded:
        if not buffer:
            buffer = [para]
            continue

        candidate_text = "\n\n".join(item.text for item in (*buffer, para))
        if len(candidate_text) <= chunk_size:
            buffer.append(para)
            continue

        flush_buffer(buffer)
        buffer = _paragraph_text_for_overlap(buffer, chunk_overlap)
        if buffer:
            overlap_candidate = "\n\n".join(item.text for item in (*buffer, para))
            if len(overlap_candidate) <= chunk_size:
                buffer.append(para)
            else:
                buffer = [para]
        else:
            buffer = [para]

    flush_buffer(buffer)

    if len(chunks) >= 2 and chunks[-1].char_count < min_chunk_size:
        merged_text = chunks[-2].text + "\n\n" + chunks[-1].text
        merged_pages = sorted(
            set([c["page"] for c in chunks[-2].citations] + [c["page"] for c in chunks[-1].citations])
        )
        merged = Chunk(
            chunk_id=chunks[-2].chunk_id,
            document_id=document_id,
            title=title,
            source_path=source_path,
            source_sha256=source_sha256,
            page_start=min(merged_pages),
            page_end=max(merged_pages),
            chunk_index=chunks[-2].chunk_index,
            char_count=len(merged_text),
            token_estimate=estimate_tokens(merged_text),
            text_sha256=_sha256_text(merged_text),
            text_preview=_preview(merged_text),
            text=merged_text,
            citations=[{"type": "page", "page": page} for page in merged_pages],
            metadata=chunks[-2].metadata,
        )
        chunks = chunks[:-2] + [merged]

    return chunks


def build_document_id(pdf_path: Path, explicit_id: str | None) -> str:
    if explicit_id:
        return explicit_id
    stem = pdf_path.stem.strip().lower()
    stem = re.sub(r"\s+", "-", stem)
    stem = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff\-_]+", "-", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip("-")
    return stem or "document"


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def serialize_chunk(chunk: Chunk) -> dict:
    return asdict(chunk)


def write_json(output_path: Path, payload: dict) -> None:
    ensure_parent_dir(output_path)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(output_path: Path, rows: Iterable[dict]) -> None:
    ensure_parent_dir(output_path)
    with output_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_js_bundle(output_path: Path, payload: dict) -> None:
    ensure_parent_dir(output_path)
    document_id = payload["document"]["document_id"]
    serialized_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    serialized_document_id = json.dumps(document_id, ensure_ascii=False)
    output_path.write_text(
        "\n".join(
            [
                "window.AppKnowledgeBases = window.AppKnowledgeBases || {};",
                f"window.AppKnowledgeBases[{serialized_document_id}] = {serialized_payload};",
                f'if (!window.AppKnowledgeBases.default) window.AppKnowledgeBases.default = window.AppKnowledgeBases[{serialized_document_id}];',
                "",
            ]
        ),
        encoding="utf-8",
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert a PDF into RAG-friendly JSON chunks.")
    parser.add_argument("--pdf", required=True, help="Absolute or relative path to the PDF file.")
    parser.add_argument("--output", required=True, help="Path to a JSON output file.")
    parser.add_argument("--jsonl-output", help="Optional path to JSONL output for vector-db ingestion.")
    parser.add_argument("--js-output", help="Optional browser bundle path that assigns the knowledge base to window.AppKnowledgeBases.")
    parser.add_argument("--doc-id", help="Stable document id. Defaults to a normalized PDF file name.")
    parser.add_argument("--title", help="Human-readable title. Defaults to the PDF file stem.")
    parser.add_argument("--chunk-size", type=int, default=900, help="Max characters per chunk.")
    parser.add_argument("--chunk-overlap", type=int, default=120, help="Overlap in characters.")
    parser.add_argument("--min-chunk-size", type=int, default=200, help="Merge tiny trailing chunks.")
    parser.add_argument("--ocr-scale", type=float, default=2.0, help="Render scale used by OCR fallback.")
    parser.add_argument("--ocr-min-score", type=float, default=0.5, help="Minimum OCR confidence kept.")
    parser.add_argument("--tag", action="append", default=[], help="Optional metadata tag. Repeatable.")
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pdf_bytes = pdf_path.read_bytes()
    source_sha256 = _sha256_bytes(pdf_bytes)
    document_id = build_document_id(pdf_path, args.doc_id)
    title = args.title or pdf_path.stem

    pages, backend = extract_pages(
        pdf_path,
        ocr_scale=args.ocr_scale,
        ocr_min_score=args.ocr_min_score,
    )
    paragraphs = paragraphs_from_pages(pages)
    chunks = chunk_paragraphs(
        paragraphs=paragraphs,
        document_id=document_id,
        title=title,
        source_path=str(pdf_path),
        source_sha256=source_sha256,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        min_chunk_size=args.min_chunk_size,
        tags=args.tag,
    )

    payload = {
        "document": {
            "document_id": document_id,
            "title": title,
            "source_path": str(pdf_path),
            "source_sha256": source_sha256,
            "generated_at": _utc_now_iso(),
            "parser_backend": backend,
            "page_count": len(pages),
            "paragraph_count": len(paragraphs),
            "chunk_count": len(chunks),
            "chunk_size": args.chunk_size,
            "chunk_overlap": args.chunk_overlap,
            "min_chunk_size": args.min_chunk_size,
            "ocr_scale": args.ocr_scale,
            "ocr_min_score": args.ocr_min_score,
            "tags": args.tag,
        },
        "chunks": [serialize_chunk(chunk) for chunk in chunks],
    }

    output_path = Path(args.output).expanduser().resolve()
    write_json(output_path, payload)

    if args.jsonl_output:
        jsonl_rows = []
        for chunk in chunks:
            row = serialize_chunk(chunk)
            row["document"] = payload["document"]
            jsonl_rows.append(row)
        write_jsonl(Path(args.jsonl_output).expanduser().resolve(), jsonl_rows)

    js_output_path = None
    if args.js_output:
        js_output_path = Path(args.js_output).expanduser().resolve()
        write_js_bundle(js_output_path, payload)

    print(
        json.dumps(
            {
                "status": "ok",
                "document_id": document_id,
                "source_path": str(pdf_path),
                "output": str(output_path),
                "jsonl_output": str(Path(args.jsonl_output).expanduser().resolve()) if args.jsonl_output else None,
                "js_output": str(js_output_path) if js_output_path else None,
                "page_count": len(pages),
                "chunk_count": len(chunks),
                "parser_backend": backend,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise
