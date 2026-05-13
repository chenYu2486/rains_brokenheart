const fs = require('fs');
const path = require('path');
const PDF_DIR = path.resolve(__dirname, '..', 'book_for_rag');
const OUTPUT = path.resolve(__dirname, '..', 'data', 'kb', 'combined_knowledge.json');

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK_CHARS = 60;

// Simple hash for chunk IDs
const simpleHash = (text) => {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h) + text.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
};

// Clean text
function cleanText(raw) {
    return raw
        .replace(/\r\n/g, '\n')
        .replace(/\f/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
        .trim();
}

// Split text into chunks with character-based overlap
function chunkText(text, pageNum, sourcePath, docId, chunkIndexRef) {
    const chunks = [];
    const plain = text.trim();
    if (!plain) return chunks;

    // Approach: split by sentences/paragraphs for coherence, then merge
    const separators = ['\n\n', '。', '！', '？', '\n'];
    let segments = [plain];

    for (const sep of separators) {
        const next = [];
        for (const seg of segments) {
            if (seg.length <= CHUNK_SIZE * 1.5) {
                next.push(seg);
            } else {
                next.push(...seg.split(sep).filter(s => s.trim()));
            }
        }
        segments = next;
        if (segments.every(s => s.length <= CHUNK_SIZE * 1.2)) break;
    }

    // Merge segments into chunks of ~CHUNK_SIZE
    let current = '';
    for (const seg of segments) {
        const trimmed = seg.trim();
        if (!trimmed) continue;
        const candidate = current ? current + '。' + trimmed : trimmed;

        if (candidate.length <= CHUNK_SIZE) {
            current = candidate;
        } else {
            // Emit current, keep overlap from tail
            if (current.length >= MIN_CHUNK_CHARS) {
                chunkIndexRef.val++;
                chunks.push({
                    chunk_id: `${docId}-p${String(pageNum).padStart(4, '0')}-c${String(chunkIndexRef.val).padStart(4, '0')}`,
                    document_id: docId,
                    title: path.basename(sourcePath).replace('.pdf', ''),
                    source_path: sourcePath,
                    page_start: pageNum,
                    page_end: pageNum,
                    chunk_index: chunkIndexRef.val,
                    char_count: current.length,
                    text: current,
                    text_preview: current.slice(0, 200)
                });
                // Keep trailing CHUNK_OVERLAP chars as overlap
                current = current.length > CHUNK_OVERLAP
                    ? current.slice(-CHUNK_OVERLAP) + '。' + trimmed
                    : current + '。' + trimmed;
            } else {
                current = candidate;
            }
        }
    }

    if (current && current.trim().length >= MIN_CHUNK_CHARS) {
        chunkIndexRef.val++;
        const trimmed = current.trim();
        chunks.push({
            chunk_id: `${docId}-p${String(pageNum).padStart(4, '0')}-c${String(chunkIndexRef.val).padStart(4, '0')}`,
            document_id: docId,
            title: path.basename(sourcePath).replace('.pdf', ''),
            source_path: sourcePath,
            page_start: pageNum,
            page_end: pageNum,
            chunk_index: chunkIndexRef.val,
            char_count: trimmed.length,
            text: trimmed,
            text_preview: trimmed.slice(0, 200)
        });
    }

    return chunks;
}

async function processPDF(filePath) {
    const buf = fs.readFileSync(filePath);
    const { PDFParse } = await import('pdf-parse');
    const pdf = new PDFParse(new Uint8Array(buf));
    await pdf.load();
    const result = await pdf.getText();

    // result = { pages: [{text: "..."}], text: "all text", total: numPages }
    return {
        numPages: result.total || result.pages?.length || 1,
        pages: result.pages ? result.pages.map(p => p.text || '') : [],
        text: result.text || ''
    };
}

async function main() {
    console.log('Scanning PDFs in book_for_rag/...\n');

    const files = fs.readdirSync(PDF_DIR)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort()
        .map(f => path.join(PDF_DIR, f));

    if (!files.length) {
        console.error('No PDF files found in book_for_rag/');
        process.exit(1);
    }

    console.log(`Found ${files.length} PDFs:\n${files.map(f => '  - ' + path.basename(f)).join('\n')}\n`);

    const allChunks = [];
    let totalPages = 0;
    const docId = 'mental-health-zh-v1';
    const chunkIndexRef = { val: 0 };

    for (const filePath of files) {
        const fileName = path.basename(filePath);
        process.stdout.write(`  Processing: ${fileName} ... `);

        try {
            const result = await processPDF(filePath);
            const fileChunks = [];

            if (result.pages.length > 1) {
                for (let i = 0; i < result.pages.length; i++) {
                    const cleaned = cleanText(result.pages[i]);
                    if (!cleaned) continue;
                    const pageChunks = chunkText(cleaned, i + 1, filePath, docId, chunkIndexRef);
                    fileChunks.push(...pageChunks);
                }
            } else if (result.text && result.text.trim()) {
                const cleaned = cleanText(result.text);
                if (cleaned) {
                    const pageChunks = chunkText(cleaned, 1, filePath, docId, chunkIndexRef);
                    fileChunks.push(...pageChunks);
                }
            }

            allChunks.push(...fileChunks);
            totalPages += result.numPages;
            console.log(`done - ${fileChunks.length} chunks from ${result.numPages} pages`);
        } catch (err) {
            console.log(`ERROR: ${err.message}`);
        }
    }

    // Build final JSON
    const knowledgeBase = {
        document: {
            document_id: docId,
            title: '心理健康中文综合知识库（指南 + 课本）',
            source_path: PDF_DIR,
            generated_at: new Date().toISOString(),
            parser_backend: 'pdf-parse v2 (pdf.js)',
            page_count: totalPages,
            chunk_count: allChunks.length,
            chunk_size: CHUNK_SIZE,
            chunk_overlap: CHUNK_OVERLAP,
            min_chunk_size: MIN_CHUNK_CHARS,
            tags: ['mental-health', 'Chinese-guidelines', 'psychiatry', 'psychology']
        },
        chunks: allChunks
    };

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(knowledgeBase, null, 2), 'utf-8');

    console.log(`\nDone!`);
    console.log(`   Total PDFs: ${files.length}`);
    console.log(`   Total pages: ${totalPages}`);
    console.log(`   Total chunks: ${allChunks.length}`);
    console.log(`   Output: ${OUTPUT}`);
    console.log(`   File size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
