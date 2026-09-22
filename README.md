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

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Shift+A` | Ask AI: Extract highlighted Bookview text and transfer to ChatGPT |
| `Double Click Splitter` | Reset split ratio to default (60% Book / 40% AI) |
