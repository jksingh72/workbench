# Workbench UI Buttons Analysis — All Three Views (v1)

This document catalogs every button and interactive control across the **Global Header**, **Bookview**, **Chatview**, and **Noteview** panes (including their toolbars, local modes, in-page overlays, and modals) to serve as the baseline reference for revamping the Workbench button architecture.

---

## 0. Global Top Header Bar (`src/components/Header.tsx`)

| Section | Button | Icon / Label | Function |
| :--- | :--- | :--- | :--- |
| **Center — Panes** | **Book Toggle** (`.pane-chip`) | `BookOpen` + `"Book"` (+ `Check`) | Shows or hides the Bookview pane (`onTogglePane('book')`). Locked if only 2 panes are active. |
| **Center — Panes** | **Chat Toggle** (`.pane-chip`) | `Bot` + `"Chat"` (+ `Check`) | Shows or hides the Chatview pane (`onTogglePane('ai')`). Locked if only 2 panes are active. |
| **Center — Panes** | **Note Toggle** (`.pane-chip`) | `FileText` + `"Note"` (+ `Check`) | Shows or hides the Noteview pane (`onTogglePane('note')`). Locked if only 2 panes are active. |
| **Center — Split** | **60 : 40 Preset** (`.preset-btn`) | `Columns2` + `"60 : 40"` | Sets horizontal column split ratio to 60% Left / 40% Right. |
| **Center — Split** | **50 : 50 Preset** (`.preset-btn`) | `"50 : 50"` | Sets horizontal column split ratio to 50% Left / 50% Right. |
| **Center — Split** | **70 : 30 Preset** (`.preset-btn`) | `"70 : 30"` | Sets horizontal column split ratio to 70% Left / 30% Right. |
| **Center — Split** | **40 : 60 Preset** (`.preset-btn`) | `"40 : 60"` | Sets horizontal column split ratio to 40% Left / 60% Right. |
| **Right** | **Swap** (`.action-icon-btn`) | `ArrowLeftRight` + `"Swap"` | Swaps the Left and Right workspace columns (`onSwapPanes`). |

---

## 1. Bookview Pane (`src/components/panes/BookPane.tsx` & `src/components/PaneToolbar.tsx`)

### 1.1 Left Toolbar Section — Source & Navigation

| Button | Icon / Label | Function |
| :--- | :--- | :--- |
| **Book Source Selector** (`.book-selector-btn`) | `BookOpen` (or `Folder` if local) + Source Name + `ChevronDown` | Opens a native popup menu (`workbench:show-book-source-menu` in `electron/main.ts`) to switch between reading platforms (O'Reilly, Kindle, Local Books, custom sites) or open the Configure modal. |
| **Configure** (`.configure-sources-quick-btn`) | `Settings2` + `"Configure"` | Opens `BookSourceModal` to add, edit, reset, or remove web book sites and local book folders. |
| **Back** (`.nav-btn`) | `ArrowLeft` | Navigates back in the web book view history (`onNavAction('back')`). Disabled in Local Books mode. |
| **Forward** (`.nav-btn`) | `ArrowRight` | Navigates forward in the web book view history (`onNavAction('forward')`). Disabled in Local Books mode. |
| **Reload** (`.nav-btn`) | `RotateCw` | Reloads the active web book page (`onNavAction('reload')`). Disabled in Local Books mode. |
| **Home** (`.nav-btn-home`) | `Home` | Navigates to the home URL of the active book platform (`onNavAction('home')`). Disabled in Local Books mode. |
| **Zoom Out** (`.zoom-btn`) | `ZoomOut` | Decreases zoom by 10% (`onNavAction('zoom-out')`, persisted per source; works in both Web and Local Explorer modes). |
| **Zoom Reset** (`.zoom-reset-btn`) | `{zoomPercent}%` | Resets zoom to `100%` (`onNavAction('zoom-reset')`). |
| **Zoom In** (`.zoom-btn`) | `ZoomIn` | Increases zoom by 10% (`onNavAction('zoom-in')`, persisted per source). |

### 1.2 Right Toolbar Section — Actions & Session

| Button | Icon / Label | Function |
| :--- | :--- | :--- |
| **Ask AI (Primary Split Action)** (`.ask-ai-primary-btn`) | `Sparkles` + `"Ask AI"` | **1-Click Default Ask AI** (`Ctrl+Shift+A`): Immediately extracts highlighted text from Bookview (works in both Web Books and Local Books: PDF, EPUB, Markdown, DOCX) and sends it to the active AI Chat using the user's selected **1-Click Default Template** (defaults to `Explain Concept`). |
| **Ask AI Menu Chevron** (`.ask-ai-chevron-btn`) | `ChevronDown` | Opens the native Ask AI popup menu (`workbench:show-ask-ai-menu`) with:<br>• **Explain Concept** (`explain`)<br>• **Summarize** (`summarize`)<br>• **Code Example** (`code`)<br>• **Quiz Me** (`quiz`)<br>• **Paste Raw Selection** (`raw`)<br>• Any user-saved custom templates<br>• **✨ Custom Prompt with Selection...** (opens `AskAITemplateModal` quick custom bar)<br>• **⚙️ Customize Ask AI Templates...** (opens `AskAITemplateModal` to edit preset prompts, change 1-click default, or add custom templates) |
| **Clip to Note** (`.clip-note-btn`) | `BookMarked` + `"Clip to Note"` | Extracts highlighted text from Bookview (with formatted book/chapter/URL citation) and clips it to Noteview (`handleClipToNote('book')`, `Ctrl+Shift+N`). Copies to clipboard if OneNote web is active. |
| **Delete Login** (`.session-manage-btn`) | `KeyRound` + `"Delete Login"` | Opens `BookDeleteLoginModal` to clear saved cookies/credentials for the selected reading platform or all reading platforms. |
| **Status Badge** (`.book-status-badge`) | Dot + `"Connected"` / `"Local Books"` | Read-only status badge indicating whether Bookview is in cloud web mode or Local Books mode. |

### 1.3 In-Page Floating Selection Bubble (`electron/views/viewPreload.ts`)
When highlighting text inside a book webpage, a floating pill toolbar appears above the selection:
* **Explain** (`.wb-btn-primary`): Sends excerpt to Chatview with the `explain` template.
* **Code** (`.wb-btn`): Sends excerpt to Chatview with the `code` template.
* **Clip to Note** (`.wb-btn-note`): Formats excerpt with citation and clips it to Noteview, flashing a purple highlight on the text.
* **Quiz** (`.wb-btn`): Sends excerpt to Chatview with the `quiz` template.

---

## 2. Chatview Pane (`src/components/panes/ChatPane.tsx` & `src/components/PaneToolbar.tsx`)

### 2.1 Left Toolbar Section — AI Platform & Navigation

| Button | Icon / Label | Function |
| :--- | :--- | :--- |
| **AI Platform Selector** (`.ai-selector-btn`) | `Bot` + Active AI Name + `ChevronDown` | Opens a native popup menu (`workbench:show-ai-source-menu` in `electron/main.ts`) to switch between ChatGPT, Gemini, Claude, Grok, or custom AI platforms. |
| **Configure** (`.configure-ai-btn`) | `Settings2` + `"Configure"` | Opens `AISourceModal` to add, edit, reset, or delete AI platforms. |
| **Back** (`.nav-btn`) | `ArrowLeft` | Navigates backward in the active AI webview history (`onNavAction('back')`). |
| **Forward** (`.nav-btn`) | `ArrowRight` | Navigates forward in the active AI webview history (`onNavAction('forward')`). |
| **Reload** (`.nav-btn`) | `RotateCw` | Reloads the current AI webpage (`onNavAction('reload')`). |
| **Home** (`.nav-btn-home`) | `Home` | Navigates to the home URL of the active AI platform (`onNavAction('home')`). |
| **Zoom Out** (`.zoom-btn`) | `ZoomOut` | Decreases zoom level by 10% (`onNavAction('zoom-out')`, saved per AI source). |
| **Zoom Reset** (`.zoom-reset-btn`) | `{zoomPercent}%` | Resets zoom level to `100%` (`onNavAction('zoom-reset')`). |
| **Zoom In** (`.zoom-btn`) | `ZoomIn` | Increases zoom level by 10% (`onNavAction('zoom-in')`, saved per AI source). |

### 2.2 Right Toolbar Section — Content & Export Actions

| Button | Icon / Label | Function |
| :--- | :--- | :--- |
| **Save to Note** (`.ai-save-note-btn`) | `BookMarked` + `"Save to Note"` | **1-Click Smart Save** (`handleSaveAIToNote`, `Ctrl+Shift+S`): Extracts either highlighted text in Chatview or the full latest AI response (as Markdown) and sends it to Noteview (or clipboard for OneNote). |
| **Export** (`.ai-export-dropdown-btn`) | `FileText` + `"Export"` + `ChevronDown` | Opens a native dropdown menu (`workbench:show-ai-export-menu` in `electron/main.ts`) with two options:<br>1. **Extract Code Blocks to Files** (`handleExtractAICode`)<br>2. **Export Chat Transcript (.md)** (`handleExportAITranscript`) |

### 2.3 Right Toolbar Section — Action Mode Pill

| Sub-Control | Icon / Label | Visibility | Function |
| :--- | :--- | :--- | :--- |
| **Status Indicator** (`.action-pill-status`) | Dot + `"Primed"` / `"Unprimed"` | Always | Read-only indicator showing whether the current chat is connected to local file actions. |
| **Prime Chat** (`.prime-action`) | `Zap` + `"Prime Chat"` | When Unprimed | **1-Click Instant Prime** (`handleInstantPrime`): Enables Action Mode and injects default/saved tool definitions into the active chat immediately. |
| **Prime Config Gear** (`.prime-config-btn`) | `Settings2` | When Unprimed | Opens `PrimeChatModal` to select LLM provider profile, toggle tool groups, preview token count, and prime. |
| **Customize / Re-Prime** (`.prime-action`) | `Zap` | When Primed | Opens `PrimeChatModal` to modify tool groups and re-prime the active chat. |
| **Disable** (`.disable-action`) | `Power` + `"Disable"` | When Primed | Calls `handleDisableChat` to disconnect the chat and disable local file actions. |
| **Target Folder Button** (`.action-pill-target`) | `BookOpen`/`FileText`/`Folder` + `"Book/Note/Custom: <Folder>"` + `Settings2` | Always | Opens `ActionModeModal` to switch target directory (Book View, Note View, or Custom folder), toggle auto-feedback loop, manage MCP servers, or edit custom rules. |

### 2.4 Right Toolbar Section — Session & Status

| Element | Icon / Label | Function |
| :--- | :--- | :--- |
| **Delete Login** (`.session-manage-btn`) | `KeyRound` + `"Delete Login"` | Opens `AIDeleteLoginModal` to delete saved login cookies/credentials for a single AI engine or all AI engines. |
| **Status Badge** (`.ai-status-badge`) | Dot + `"Ready for prompts"` | Read-only status badge. |

### 2.5 In-Chat Injected Controls (`electron/views/viewPreload.ts`)
* **Action Badge** (`.workbench-action-badge` / `.workbench-action-error-badge`): Collapses raw `workbench:action` JSON blocks in chat; clicking toggles raw JSON visibility.
* **Continue to Next Step** (`.wb-continue-step-btn`): Appears inside the Action Result Card to manually submit action feedback to the AI.
* **In-Chat `/status` & `/connect` Card Buttons** (`#wb-chat-status-card`): **Prime Chat** (`#wb-cmd-trigger-prime-btn`), **Disable** (`#wb-cmd-trigger-disable-btn`), and **Close (`✕`)** (`#wb-card-close-btn`).

---

## 3. Noteview Pane (`src/components/panes/NotePane.tsx` & `src/components/PaneToolbar.tsx`)

### 3.1 Top Pane Toolbar

| Section | Button | Icon / Label | Function |
| :--- | :--- | :--- | :--- |
| **Left** | **Note Platform Selector** (`.note-selector-btn`) | `BookMarked` (or `Folder` if local) + Source Name + `ChevronDown` | Opens a native popup menu (`workbench:show-note-source-menu` in `electron/main.ts`) to switch between OneNote, Evernote, Notion, Google Keep, Workbench Local Notes, or Local File Explorer. |
| **Left** | **Configure** (`.configure-note-btn`) | `Settings2` + `"Configure"` | Opens `NoteSourceModal` to add, edit, reset, or remove web note sites and local note folders. |
| **Left** | **Back / Forward / Reload / Home** (`.nav-btn`) | `ArrowLeft`, `ArrowRight`, `RotateCw`, `Home` | Controls browser navigation for web-based note platforms (OneNote, Evernote, Notion, Keep). Disabled when in Local File Explorer mode. |
| **Left** | **Zoom Out / Reset / In** (`.zoom-btn`, `.zoom-reset-btn`) | `ZoomOut`, `{zoomPercent}%`, `ZoomIn` | Adjusts zoom in 10% increments or resets to `100%` (works for both web note views and Local Explorer). |
| **Right** | **Send to AI** (`.note-send-ai-btn`) | `Bot` + `"Send to AI"` | Shown when a web/built-in note source is active (`!isLocalFolder`). Extracts highlighted text from Noteview and sends it to Chatview (`handleSendNoteToAI`). |
| **Right** | **Delete Login** (`.session-manage-btn`) | `KeyRound` + `"Delete Login"` | Opens `NoteDeleteModal` to clear login credentials for the selected note platform (or reset offline notebooks) or clear all note platforms. |
| **Right** | **Status Badge** (`.note-status-badge`) | Dot + `"Connected"` / `"Local Notes"` | Read-only status indicator. |

### 3.2 Sub-View A: Local File Explorer (`src/components/LocalExplorer.tsx`)
Used when **Noteview** is set to a local folder (`Local File Explorer`) or when **Bookview** is set to `Local Books`:

| Bar | Button | Icon / Label | Function |
| :--- | :--- | :--- | :--- |
| **Workspace Tabs** | **Explorer Tab** (`.wb-tab-btn`) | `Folder` + `"Explorer"` | Switches back from an open document editor tab to the file/folder directory view. |
| **Workspace Tabs** | **Document Tab Controls** (`.wb-tab-btn`) | File Icon + File Name + `ExternalLink` + `X` | Clicking the tab switches to that open file editor (Markdown, Word, Spreadsheet, Code, PDF, EPUB, Image); `ExternalLink` opens the file in the OS default app; `X` closes the tab. |
| **Clip Banner** | **Save to this Folder / Dismiss** | `"Save to this Folder"` / `X` | Appears when text was clipped from Bookview or Chatview; saves the clip as a `.md` file in the current directory or dismisses it. |
| **Explorer Toolbar (Left)** | **Sidebar Toggle** (`.nav-btn`) | `PanelLeft` | Toggles the left Quick Access / Drives tree navigation sidebar. |
| **Explorer Toolbar (Left)** | **Back / Forward / Up / Refresh** (`.nav-btn`) | `ArrowLeft`, `ArrowRight`, `ArrowUp`, `RotateCw` | Navigates directory history, moves up to parent folder, or refreshes the folder listing. |
| **Explorer Toolbar (Center)** | **Breadcrumb Segments** (`.breadcrumb-segment`) | Folder Name | Jumps directly to that ancestor folder path. |
| **Explorer Toolbar (Right)** | **Folder** (`.action-icon-btn`) | `FolderPlus` + `"Folder"` | Opens modal to create a new subfolder in the current directory. |
| **Explorer Toolbar (Right)** | **Note** (`.action-icon-btn`) | `Plus` + `"Note"` | Opens modal to create a new file (default `Note.md`) in the current directory. |
| **Explorer Toolbar (Right)** | **Send to AI** (`.btn-send-ai`) | `Bot` + `"Send to AI (N)"` | Appears dynamically when 1 or more files are selected; uploads/pastes the selected file(s) directly into Chatview. |
| **Explorer Toolbar (Right)** | **Copy** (`.action-icon-btn`) | `Copy` + `"Copy (N)"` | Appears dynamically when items are selected; copies selected files/folders to Workbench & OS clipboard (`CF_HDROP`). |
| **Explorer Toolbar (Right)** | **Paste** (`.action-icon-btn`) | `Clipboard` + `"Paste"` | Pastes files/folders from Workbench or Windows File Explorer clipboard into the current directory. |
| **Explorer Toolbar (Right)** | **Open Folder** (`.btn-open-folder`) | `FolderOpen` + `"Open Folder"` | Opens native OS folder picker dialog to switch the explorer root directory. |
| **Explorer Toolbar (Right)** | **View Mode Toggle** (`.view-toggle-btn`) | `List` / `LayoutGrid` | Toggles between Details table view (`list`) and Large Icons view (`grid`). |

### 3.3 Sub-View B: Built-in Workbench Local Notes (`src/components/OneNoteApp.tsx`)
Used when **Noteview** is set to `Workbench Local Notes` (`id: 'local'`):
* **Top Bar Actions**:
  * **+ Page** (`.onenote-btn`): Creates a new note page in the active section.
  * **+ Section** (`.onenote-btn`): Prompts for a name and creates a new color-coded section tab.
  * **Export (`FileDown`)** (`.onenote-icon-btn`): Downloads the current page as a `.md` file.
  * **Copy (`ClipboardCopy`)** (`.onenote-icon-btn`): Copies the current page title and Markdown content to the clipboard.
  * **Delete Login** (`.onenote-delete-login-btn`): Opens `NoteDeleteModal`.
* **Section Tabs & Page Sidebar**:
  * **Section Tabs** (`.section-tab`), **Delete Section (`×`)** (`.tab-delete-btn`), and **New Section (`+`)** (`.add-section-plus`).
  * **New Page (`+`)** & **Collapse/Expand Sidebar (`ChevronLeft`/`ChevronRight`)** (`.sidebar-icon-btn`), plus **Delete Page (`Trash2`)** on each page card.
* **Formatting Ribbon (`.onenote-ribbon`)**:
  * `Heading1`, `Heading2`, `Heading3` | `Bold`, `Italic`, `Strikethrough`, `Code` | `CheckSquare` (To-Do), `List` (Bullets), `ListOrdered` (Numbered), `Quote`, `{}` (Code Block), `Highlighter`.

---

## 4. Cross-Pane Toolbar Comparison Matrix (`src/components/PaneToolbar.tsx`)

All three panes share the same top toolbar component (`PaneToolbar.tsx`), which renders a consistent Left/Center/Right layout:

| Toolbar Zone | Bookview (`target="book"`) | Chatview (`target="ai"`) | Noteview (`target="note"`) |
| :--- | :--- | :--- | :--- |
| **Left: Source Switcher** | `[Book Icon] <Source Name> ▾` | `[Bot Icon] <AI Name> ▾` | `[Note/Folder Icon] <Source Name> ▾` |
| **Left: Source Config** | `[Gear] Configure` | `[Gear] Configure` | `[Gear] Configure` |
| **Left: Web Navigation** | `←` `→` `↻` `🏠` | `←` `→` `↻` `🏠` | `←` `→` `↻` `🏠` |
| **Left: Zoom Controls** | `🔍-` `100%` `🔍+` | `🔍-` `100%` `🔍+` | `🔍-` `100%` `🔍+` |
| **Center: Title / URL** | Page Title / Source Name | Page Title / `<AI> Assistant` | Page Title / Source Name |
| **Right: Cross-Pane & Export Actions** | • `✨ Ask AI ▾` (Dropdown)<br>• `📑 Clip to Note` | • `📑 Save to Note`<br>• `📄 Export ▾` (Code / Transcript) | • `🤖 Send to AI` *(hidden in Local Explorer mode, where Explorer toolbar has its own `Send to AI`)* |
| **Right: Local File / Tool Bridge** | *(None)* | **Action Mode Pill**:<br>`● Primed/Unprimed` \| `⚡ Prime Chat` / `⚙` / `⏻ Disable` \| `📁 Target Folder ⚙` | *(None)* |
| **Right: Session Cleanup** | `🔑 Delete Login` | `🔑 Delete Login` | `🔑 Delete Login` |
| **Right: Status Pill** | `● Connected` / `Local Books` | `● Ready for prompts` | `● Connected` / `Local Notes` |

