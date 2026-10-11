# Workbench — Technical Reading & AI Synthesis Workspace

A multi-pane desktop application built with **Electron 34**, **React 19**, and **TypeScript 5.7** designed for technical reading, generative AI collaboration, document engineering, and knowledge synthesis.

📘 **Detailed Feature List:** [`docs/FEATURE_LIST.md`](file:///d:/Products/Workbench/docs/FEATURE_LIST.md)  
📐 **Reference Design Document:** [`docs/REFERENCE_DESIGN_DOCUMENT.md`](file:///d:/Products/Workbench/docs/REFERENCE_DESIGN_DOCUMENT.md)

---

## 🌟 Key Features

- **Tri-Pane Technical Workspace**:
  - **Left Pane (BookView)**: Web technical reading platforms (O'Reilly, Kindle Cloud Reader) and an offline universal document reader suite (EPUB, MOBI/Kindle, PDF, Word DOCX, Excel XLSX/CSV, code/markdown).
  - **Top-Right Pane (ChatView)**: Multi-provider AI assistant interface (ChatGPT, Claude, Google Gemini, Perplexity, DeepSeek) with agentic action execution.
  - **Bottom-Right Pane (NoteView)**: Knowledge repository supporting OneNote Web, local filesystem explorer, and automatic companion reading notes (`.notes.md`).
- **Universal Local Document & E-Book Reader Suite**:
  - Multi-line flex-wrapping document tabs (`.badge-epub`, `.badge-mobi`, `.badge-doc`, etc.).
  - **EPUB Reader**: OPF package parsing, NCX/EPUB3 TOC navigation, offline base64 image inlining, Dark/Sepia/Light themes, and dynamic font scaling.
  - **MOBI / Kindle Reader**: PalmDOC LZ77 decompression, KF8/Combo detection, internal `filepos` link normalization, anchor marker injection, and chapter offset tracking.
  - **Word DOCX**: Mammoth semantic rendering and in-app editing.
  - **Spreadsheets**: Multi-sheet `.xlsx` / `.csv` interactive grid viewer and editor.
  - **PDF Reader**: In-app viewer and page-bounded text extraction.
  - **Companion Reading Notes**: Auto-paired `<book>.notes.md` with reading templates, auto-save (`Ctrl+S`), and split-view modes.
- **Workbench Action Model & Autonomous Agent Loop**:
  - Autonomous feedback loop automatically executes AI tool calls (`render_docx`, `create_docx`, `extract_rfp`, `search_text`, `batch`, `run_script`, `read_pages`), returning structured results back to the chat model.
  - Granular tool group selection and dynamic AI priming engine.
- **Model Context Protocol (MCP)**:
  - Built-in MCP client connecting desktop assistants to external stdio tool servers.
- **Cross-Pane Intelligence Transfer ("Ask AI" & "Clip Selection")**:
  - In-page floating action bubble on highlighted text (Explain, Summarize, Code, Quiz).
  - 1-click citation-enriched clippings to Notes (`Ctrl+Shift+N`) with source title, chapter, URL, and timestamp.
  - AI response, code block, and full session transcript exports.
- **Native OS Drag & Drop and Windows Clipboard (`CF_HDROP`)**:
  - Seamless file dropping from local explorer directly into chat or external applications.

---

## 🚀 Running the Application

### Development Mode (with Hot-Module Reloading)
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 🛠️ Built-in Workbench Actions & RFP Pipeline

Workbench executes local actions requested by AI models (Claude, ChatGPT, Gemini, Perplexity, etc.) seamlessly using structured `workbench:action` blocks without base64 transfer bloat.

### 📄 Document & Word Generation (`render_docx`)
Builds complex Word documents locally from clean JSON specifications. Supports headers, footers, repeating table headers, column widths, shaded cells, inline bold/italics, and `[[source reference]]` styling:

```json
```workbench:action
{
  "action": "render_docx",
  "outPath": "Executive_Summary.docx",
  "overwrite": true,
  "spec": {
    "title": "RFSA Evaluation Report",
    "theme": "modern_teal",
    "blocks": [
      { "type": "heading", "level": 1, "text": "1. Operational Architecture" },
      { "type": "paragraph", "text": "All data processing runs **locally** without transmission [[Section 4.1]]." },
      {
        "type": "table",
        "columnWidths": [1.5, 3.5, 1.5],
        "headerRows": 1,
        "rows": [
          ["ID", "Requirement", "Status"],
          ["REQ-01", "ISO 27001 Compliance", "Verified"],
          ["REQ-02", "Deterministic Outputs", "Verified"]
        ]
      }
    ]
  }
}
```
```

### 📦 RFP Package Unpacking & Extraction (`extract_rfp`)
Unpacks zip files and extracts full text from all `.pdf`, `.docx`, and text files in an RFP folder into `<folder>/_extracted/` with clean page markers (`-- page N --`), manifest indexing, and scanned PDF detection:

```json
```workbench:action
{
  "action": "extract_rfp",
  "folder": "RFP_Package_2026",
  "overwrite": false
}
```
```

### 🔍 Targeted RFP Search (`search_text`)
Performs fast regex or literal text searches across extracted document text files, returning match lines, page numbers, and surrounding context:

```json
```workbench:action
{
  "action": "search_text",
  "folder": "RFP_Package_2026",
  "query": "Mandatory Security Clearance",
  "contextLines": 2
}
```
```

### 📖 Targeted Page Reading (`read_pages`)
Reads precise page ranges from extracted text files without arbitrary line caps:

```json
```workbench:action
{
  "action": "read_pages",
  "file": "RFP_Package_2026/_extracted/Statement_of_Work.txt",
  "fromPage": 1,
  "toPage": 5
}
```
```

### ⚡ Batch Execution (`batch`)
Executes a sequence of actions sequentially, returning per-step execution status and logs:

```json
```workbench:action
{
  "action": "batch",
  "stopOnFailure": true,
  "actions": [
    { "action": "create_folder", "path": "Output_Folder" },
    { "action": "render_docx", "outPath": "Output_Folder/Summary.docx", "spec": { "title": "Summary", "blocks": [{ "type": "paragraph", "text": "Report content" }] } }
  ]
}
```
```

---

## 🧪 Running Tests

Run the comprehensive unit test suite:
```bash
npm test
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Shift+A` | Ask AI: Extract highlighted Bookview text and transfer to ChatGPT |
| `Double Click Splitter` | Reset split ratio to default (60% Book / 40% AI) |

