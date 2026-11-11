# Workbench — Technical Reading & AI Synthesis Workspace

A multi-pane desktop application built with **Electron 34**, **React 19**, and **TypeScript 5.7** designed for technical reading, generative AI collaboration, document engineering, and knowledge synthesis.

📘 **Detailed Feature List:** [`docs/FEATURE_LIST.md`](file:///d:/Products/Workbench/docs/FEATURE_LIST.md)  
📐 **Reference Design Document:** [`docs/REFERENCE_DESIGN_DOCUMENT.md`](file:///d:/Products/Workbench/docs/REFERENCE_DESIGN_DOCUMENT.md)  
🔗 **ChatView ↔ BookView Bridge & Command Guide:** [`docs/CHATVIEW_BOOKVIEW_BRIDGE_GUIDE.md`](file:///d:/Products/Workbench/docs/CHATVIEW_BOOKVIEW_BRIDGE_GUIDE.md)

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
- **Cross-Pane Intelligence Transfer & ChatView ↔ BookView Bridge**:
  - **Slash / `!` Commands in ChatView** (`/page`, `/chapter`, `/inputs`, `/links`, `/click`, `/next`, `/prev`, `/status`, `/connect`, `/help`): Read visible pages/chapters, index and click links, and navigate BookView directly from the chat input box (no priming required).
  - **Configurable Summarization & Explanation Styles**: Control summary and explanation structure via `/chapter summarize:brief`, `:deep`, `:steps`, `:study`, `:table` and `/chapter explain:eli5`, `:why`, `:trace`, `:code`, `:compare`, `:pitfalls`, dedicated **📝 Summarize** & **💡 Explain** 1-click HUD subsections, or custom `#<template-id>` templates.
  - **Inline `@` Macros**: Embed live BookView context anywhere in a prompt using `@page`, `@chapter`, `@inputs`, `@links`, or `@selection`.
  - **In-Page Floating Bubble**: Highlight text in BookView to run Explain, Summarize, Code, Quiz, or custom Ask AI templates.
  - **1-Click Clippings & Exports**: Citation-enriched clippings to Notes (`Ctrl+Shift+N`) and AI response/code/transcript exports.
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

## 📖 ChatView ↔ BookView Commands & Summarization Styles

Type these directly in the ChatView prompt box (supports `/`, `!`, or `wb:` prefixes). See [`docs/CHATVIEW_BOOKVIEW_BRIDGE_GUIDE.md`](file:///d:/Products/Workbench/docs/CHATVIEW_BOOKVIEW_BRIDGE_GUIDE.md) for full details.

| Command / Macro | Description |
| :--- | :--- |
| `/page` or `/chapter` | Opens an interactive HUD preview card of the visible BookView page or full chapter/PDF with 1-click summary style pills. |
| `/page <question>` / `/chapter <question>` | Extracts live BookView viewport or full chapter/PDF text and submits it with your instruction. |
| `/chapter summarize` | Structured 4-part technical summary (or your custom `Summarize` template from **⚙️ Customize Ask AI Templates**). |
| `/chapter summarize:brief` | ⚡ **Executive TL;DR**: 1-sentence core thesis + 3–5 concise takeaway bullets (`:tldr`, `:short`). |
| `/chapter summarize:deep` | 🔬 **Deep Dive**: Comprehensive section-by-section breakdown with definitions, invariants, and complexity (`:detailed`). |
| `/chapter summarize:steps` | 🔢 **Step-by-Step Trace**: Inputs/outputs, state/index variables (`i`, `j`, `k`), and sequential execution trace (`:algo`, `:trace`). |
| `/chapter summarize:study` | 🎓 **Study Notes**: Mental model, key rules, pitfalls, and 3 self-test Q&As (`:notes`, `:cheatsheet`). |
| `/chapter summarize:eli5` | 💡 **Intuition / ELI5**: Real-world analogy first, then mapped to the technical mechanism (`:intuition`, `:simple`). |
| `/chapter summarize:table` | 📊 **Table / Matrix**: Organizes concepts, variables, or trade-offs into a Markdown table (`:matrix`, `:compare`). |
| `/chapter summarize:code` | 💻 **Code & Example**: Concise explanation + clean, commented runnable implementation (`:impl`, `:example`). |
| `/chapter #<template-id>` | Runs any custom user template from **⚙️ Customize Ask AI Templates** or `prompts/<id>.md`. |
| `@page`, `@chapter`, `@inputs`, `@links`, `@selection` | Inline macros that expand live BookView content anywhere inside your prompt. |
| `/links [filter]` | Overlays numbered `#1`, `#2...` badges on clickable BookView links and opens an interactive link list in ChatView. |
| `/click #3` or `/click Next` | Clicks badge `#3` or fuzzy-matches and clicks `"Next"` inside BookView. |
| `/next`, `/prev`, `/scroll-down`, `/scroll-up` | Navigates or scrolls BookView directly from ChatView. |
| `/status`, `/connect`, `/help` | Shows connection status, primes the chat for autonomous actions, or opens the in-chat command reference card. |

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

