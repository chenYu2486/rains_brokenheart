# PDF 切块到本地 RAG JSON

这个项目里新增了一个独立脚本：

- `tools/pdf_to_rag_json.py`

它的目标不是“只把 PDF 转成文本”，而是直接生成适合本地知识库检索的结构化 JSON/JSONL，重点保留可追溯字段：

- `source_path`: 原始 PDF 路径
- `source_sha256`: 原始文件哈希
- `chunk_id`: 稳定块 ID
- `page_start` / `page_end`: 块对应页码
- `citations`: 可直接用于回答时回引页码
- `text_sha256`: 文本块哈希

## 推荐命令

```powershell
python .\tools\pdf_to_rag_json.py `
  --pdf "C:\Users\17872\Desktop\精神分裂症谱系及其他精神病性障碍（DSM-5-TR中文）.pdf" `
  --output ".\data\kb\dsm5_psychosis_zh.json" `
  --jsonl-output ".\data\kb\dsm5_psychosis_zh.jsonl" `
  --js-output ".\data\kb\dsm5_psychosis_zh.js" `
  --doc-id "dsm5tr-schizophrenia-spectrum-zh" `
  --title "精神分裂症谱系及其他精神病性障碍（DSM-5-TR中文）" `
  --chunk-size 900 `
  --chunk-overlap 120 `
  --ocr-scale 2.0 `
  --ocr-min-score 0.5 `
  --tag "DSM-5-TR" `
  --tag "psychosis" `
  --tag "zh-CN"
```

## 依赖说明

脚本会自动尝试这些 PDF 解析方式：

- `pypdf`
- `PyPDF2`
- `pymupdf`
- `pdfplumber`
- `pymupdf + rapidocr_onnxruntime`（前几种拿不到文本时自动走 OCR）

如果纯文本提取失败，但装了 `pymupdf + rapidocr_onnxruntime`，脚本会自动把页面渲染后做 OCR。
如果这些库都没有，脚本会报错并提示安装。

## 输出结构

顶层 JSON 结构：

```json
{
  "document": {
    "document_id": "dsm5tr-schizophrenia-spectrum-zh",
    "title": "精神分裂症谱系及其他精神病性障碍（DSM-5-TR中文）",
    "source_path": "C:\\Users\\17872\\Desktop\\精神分裂症谱系及其他精神病性障碍（DSM-5-TR中文）.pdf",
    "source_sha256": "...",
    "generated_at": "2026-03-25T00:00:00+00:00",
    "parser_backend": "pypdf/PyPDF2",
    "page_count": 0,
    "paragraph_count": 0,
    "chunk_count": 0,
    "chunk_size": 900,
    "chunk_overlap": 120,
    "min_chunk_size": 200,
    "tags": ["DSM-5-TR", "psychosis", "zh-CN"]
  },
  "chunks": [
    {
      "chunk_id": "dsm5tr-schizophrenia-spectrum-zh-p0001-c0001",
      "page_start": 1,
      "page_end": 2,
      "text": "...",
      "citations": [
        { "type": "page", "page": 1 },
        { "type": "page", "page": 2 }
      ]
    }
  ]
}
```

JSONL 每行是一个 chunk，适合直接写入向量库。

如果你是纯前端项目，也可以直接使用 `js-output` 生成的知识库脚本。它会把数据挂到 `window.AppKnowledgeBases`，浏览器端可以直接做本地检索，不需要先起一个后端文件服务。

## 接入 RAG 的最小方式

1. 用 `jsonl` 中的 `text` 字段做 embedding。
2. 把 `chunk_id` 当成主键。
3. 把 `page_start`、`page_end`、`source_path`、`source_sha256`、`citations` 一起存到 metadata。
4. 检索命中后，把 `text + metadata` 一起送给大模型。
5. 在回答模板里强制输出引用来源，例如：`来源：第 12-13 页`。

## 回答模板建议

建议系统提示词里明确要求：

```text
你只能基于检索到的知识块回答。
每个结论后附上来源页码。
如果检索结果不足，请明确说“当前知识库证据不足”。
```

## 中文 PDF 的现实问题

中文医学 PDF 经常有这些情况：

- 页眉页脚被抽出来
- 分栏文本顺序错乱
- 换行发生在句中
- 表格抽取不完整

这个脚本已经做了基础的换行合并与块追踪，但如果这本 DSM-5-TR 中文版版式复杂，建议你跑完后抽查：

- 前 10 个 chunk
- 任意 3 个跨页 chunk
- 诊断标准页、鉴别诊断页、病程页

如果你要，我下一步可以继续把“JSON 入库 + 本地检索 + API 调用时自动拼接引用”的整套 RAG 检索链也补上。
