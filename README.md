# Workbench (O'Reilly & ChatGPT)

A dual-pane desktop application built with **Electron**, **React**, and **TypeScript** designed for technical reading and AI-assisted learning.

---

## 🌟 Key Features

- **Dual-Pane Interface**:
  - **Left Pane (Bookview)**: Opens O'Reilly Learning platform (`https://learning.oreilly.com/home/`).
  - **Right Pane (AIView)**: Opens ChatGPT (`https://chatgpt.com/`).
  - **Default Ratio**: 60% Bookview / 40% AIView.
- **Ask AI (Highlight-to-AI Transfer)**:
  - Highlight any text or code snippet in Bookview and click **"Ask AI ▾"** (or press `Ctrl+Shift+A`).
  - Choose from presets:
    - 💡 **Explain Concept**: Generates simple explanation with examples.
    - 📝 **Summarize**: Extracts key takeaways.
    - 💻 **Code Example**: Generates working code demo.
    - ❓ **Quiz Me**: Generates 3 review questions with answers.
    - 📋 **Paste Raw**: Transfers raw text into ChatGPT.
    - ✏️ **Custom Prompt**: Allows entering your own prompt prefix.
  - Automatically types into ChatGPT's prompt input, focuses the view, and copies to your clipboard as a backup.
- **Dynamic Layout & Presets**:
  - **Draggable Splitter**: Drag divider between panes (double-click to reset to 60:40).
  - **Ratio Presets**: `60:40`, `50:50`, `70:30`, `40:60`, `Full Book`, `Full AI`.
  - **Swap Button**: Switch left and right pane positions with one click.
- **Independent Zoom & Navigation**:
  - Zoom in/out independently on the book without magnifying ChatGPT.
  - Independent Back, Forward, Reload, and Home buttons.
- **Isolated Sessions & Persistence**:
  - Partitions `persist:workbench-oreilly` and `persist:workbench-chatgpt` maintain cookies, theme settings, and logins across app restarts.
  - Configured with modern Chrome desktop User-Agent to prevent SSO/OAuth blocking.

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

