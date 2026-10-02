# Creating New Workbench Actions — Implementation & Design Guide

**Target Audience:** Core Developers & Plugin Contributors  
**Scope:** Creating, registering, and extending modular actions in Workbench Desktop  
**Stack:** TypeScript 5.7, Node.js (`fs`/`path`), Electron 34 IPC, Action Registry System  

---

## 1. Architectural Overview & Philosophy

The Workbench Action Model is built upon a **decoupled, plug-and-play modular architecture**. 

Traditionally, adding a capability to an AI assistant requires modifying hardcoded prompt strings, updating multiple switch statements, and wiring custom IPC channels across front-end and back-end layers. In Workbench:

* **Zero Hardcoding**: Every action is a self-contained module implementing `ActionDefinition`.
* **Single Source of Truth**: The action module defines its own schema, documentation, aliases, examples, and execution logic.
* **Automatic LLM Priming**: The central `ActionRegistry` dynamically compiles all registered actions into system prompts (`generatePromptGuide`) delivered to ChatGPT, Claude, and Gemini when priming a chat.
* **Sandbox & Path Safety**: All file and system operations execute through a sanitized `ActionContext` that prevents directory traversal attacks and manages UI synchronization.

```mermaid
graph TD
    subgraph "1. Definition Layer (electron/actions/)"
        A1["createFolderAction.ts"]
        A2["writeFileAction.ts"]
        A3["yourNewAction.ts"]
        REG["registry.ts (ActionRegistry Singleton)"]
        IDX["index.ts (registerBuiltinActions)"]
    end

    subgraph "2. Coordination Layer"
        DISP["actionDispatcher.ts"]
        AI["aiViewHandler.ts & viewPreload.ts"]
    end

    subgraph "3. Execution & Context (Node.js)"
        CTX["ActionContext (resolveSafePath, notify, refreshExplorer)"]
        FS["Node.js Filesystem / Native APIs"]
    end

    subgraph "4. AI Guest Page (ChatGPT / Claude)"
        LLM["AI Chat Thread (Primed with Dynamic Prompt Guide)"]
        OUT["Emits ```workbench:action JSON"]
    end

    A1 -->|register| REG
    A2 -->|register| REG
    A3 -->|register| REG
    IDX --> REG
    REG -->|generatePromptGuide| DISP
    DISP -->|Inject System Instructions| AI
    AI -->|Primes| LLM
    LLM -->|Outputs Action JSON| OUT
    OUT -->|Intercepted by viewPreload| DISP
    DISP -->|Find by ID/Alias & Execute| A3
    A3 --> CTX
    CTX --> FS
    A3 -->|ActionResult| DISP
    DISP -->|Feedback: [Workbench Action Result: ✅ ...]| AI
    AI -->|Post Result into Chat| LLM
```

---

## 2. The Action Contract (`ActionDefinition`)

Every action must implement the `ActionDefinition` interface declared in [`electron/actions/types.ts`](file:///d:/Products/Workbench/electron/actions/types.ts):

```typescript
export interface ActionDefinition {
  /** Canonical action identifier (lowercase, snake_case), e.g. 'archive_folder' */
  id: string

  /** Alternative names/synonyms LLMs might naturally emit, e.g. ['zip_folder', 'compress_dir'] */
  aliases?: string[]

  /** Human and LLM readable description of what this action does */
  description: string

  /** Detailed parameter metadata for schema documentation */
  parameters: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      required?: boolean
      description: string
      default?: any
    }
  >

  /** Concrete JSON example demonstrating required and optional fields */
  example: Record<string, any>

  /** The asynchronous business logic executed locally */
  execute(ctx: ActionContext, payload: any, targetPane?: 'book' | 'note'): Promise<ActionResult>
}
```

### The `ActionResult` Return Contract

When `execute()` finishes, it returns an `ActionResult`:

```typescript
export interface ActionResult {
  /** True if the operation succeeded, false on error */
  success: boolean

  /** The canonical action ID that executed */
  action?: string

  /** Human-readable message displayed in toasts and returned to the AI chat */
  message: string

  /** Optional path to newly created file or directory */
  createdPath?: string

  /** Error message string if success === false */
  error?: string

  /** Optional structured metadata (e.g., file counts, sizes, listings) */
  details?: any
}
```

---

## 3. The Execution Environment (`ActionContext`)

The `ctx: ActionContext` object provides safe access to the filesystem, UI feedback, and workspace state:

| Method | Purpose |
| :--- | :--- |
| `ctx.resolveSafePath(inputPath, targetPane?)` | **Critical Security Method.** Canonicalizes paths using `path.resolve()`, guarantees relative paths resolve inside the user's active workspace target, and prevents path traversal outside authorized directories. |
| `ctx.getActiveDirectory(targetPane?)` | Retrieves the absolute path of the active target folder (Book View, Note View, or Custom). |
| `ctx.notify(message)` | Displays an ambient toast notification in the Workbench desktop UI (e.g., `📁 Created folder: MyFolder`). |
| `ctx.refreshExplorer(targetPane?)` | Triggers a live UI re-scan and visual update of the Local File Explorer tree in the specified pane. |
| `ctx.openInTab(filePath)` | Opens the newly created or modified file directly in an active editor/preview tab. |
| `ctx.dispatch(action, targetPane?)` | Programmatically triggers another action (useful for compound or chained operations). |
| `ctx.confirm({ title, message, detail })` | Prompts the user with an interactive OS dialog before proceeding with destructive operations (deletions, overwrites). |
| `ctx.getWorkspaceFolders()` | Returns the paths and labels for all active targets (`book`, `note`, `custom`). |
| `ctx.setActiveTarget(target, customPath?)` | Switches the active action target between Book View, Note View, and Custom directories. |

---

## 4. Step-by-Step: Creating a New Action

Let's walk through creating a realistic action: **`searchFilesAction`** (`search_files`), which allows the AI to search for files matching a pattern or extension in the active directory.

### Step 1: Create the Action File
Create a new file in [`electron/actions/`](file:///d:/Products/Workbench/electron/actions/):  
`electron/actions/searchFilesAction.ts`

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export const searchFilesAction: ActionDefinition = {
  id: 'search_files',
  aliases: ['find_files', 'find', 'search_directory'],
  description: 'Searches the active target directory recursively for files matching a keyword or file extension.',
  parameters: {
    query: {
      type: 'string',
      required: true,
      description: 'Filename keyword, substring, or file extension (e.g. ".py", "config", "test")',
    },
    path: {
      type: 'string',
      required: false,
      description: 'Subdirectory to search inside (relative to active directory). Defaults to active folder root.',
    },
    maxResults: {
      type: 'number',
      required: false,
      description: 'Maximum number of file matches to return (default: 50)',
      default: 50,
    },
  },
  example: {
    action: 'search_files',
    query: '.tsx',
    path: 'src',
    maxResults: 25,
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    // 1. Resilient Parameter Extraction (supports both payload.params and top-level fields)
    const params = payload.params || {}
    const query = (params.query ?? payload.query ?? params.keyword ?? payload.keyword ?? '').trim().toLowerCase()
    const subPath = params.path ?? payload.path ?? ''
    const maxResults = Number(params.maxResults ?? payload.maxResults ?? 50)

    if (!query) {
      throw new Error('Missing search query parameter for search_files action.')
    }

    // 2. Resolve Safe Target Directory
    const searchRoot = ctx.resolveSafePath(subPath || '.', targetPane)

    if (!fs.existsSync(searchRoot)) {
      throw new Error(`Directory does not exist: "${subPath || '.'}"`)
    }

    // 3. Perform Business Logic (Recursive Search)
    const matches: Array<{ name: string; relativePath: string; sizeBytes: number }> = []

    async function walk(currentDir: string) {
      if (matches.length >= maxResults) return
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (matches.length >= maxResults) break
        // Skip common noisy directories
        if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist')) {
          continue
        }

        const fullPath = path.join(currentDir, entry.name)
        const relPath = path.relative(searchRoot, fullPath)

        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile()) {
          if (entry.name.toLowerCase().includes(query) || relPath.toLowerCase().includes(query)) {
            const stats = await fs.promises.stat(fullPath)
            matches.push({
              name: entry.name,
              relativePath: relPath.replace(/\\/g, '/'),
              sizeBytes: stats.size,
            })
          }
        }
      }
    }

    await walk(searchRoot)

    // 4. User Feedback & UI Notification
    ctx.notify(`🔍 Found ${matches.length} file(s) matching "${query}"`)

    // 5. Return Structured Result (Forwarded to Chat Feedback Loop)
    return {
      success: true,
      action: 'search_files',
      message: `Found ${matches.length} matching file(s) for "${query}" in "${path.basename(searchRoot)}"`,
      details: {
        totalMatches: matches.length,
        query,
        baseDirectory: path.basename(searchRoot),
        files: matches,
      },
    }
  },
}
```

---

### Step 2: Register the Action in the Barrel File
Open [`electron/actions/index.ts`](file:///d:/Products/Workbench/electron/actions/index.ts) and add the import, export, and registration line:

```diff
  import { readFileAction } from './readFileAction'
  import { getWorkspaceFoldersAction, setActiveDirectoryAction } from './workspaceActions'
+ import { searchFilesAction } from './searchFilesAction'

  export * from './readFileAction'
  export * from './workspaceActions'
+ export * from './searchFilesAction'

  export function registerBuiltinActions(): ActionRegistry {
    const registry = ActionRegistry.getInstance()

    registry.register(createFolderAction)
    registry.register(writeFileAction)
    ...
+   registry.register(searchFilesAction)

    return registry
  }
```

**That is all!** There are no switch statements, no front-end event definitions, and no prompt templates to manually rewrite.

### Alternative: Creating Actions Directly from ChatView (`create_action`)

Instead of creating and registering the TypeScript file manually, you can simply ask the AI inside ChatView:
> *"Add a new action called `download_file` that fetches a file from a URL"*

#### Pre-Creation Deduplication & Discussion Redirection
Before creating any action, both the AI and `create_action` perform a check:
1. **Existing Action Check**: Checks if an action with identical ID or aliases already exists in `ActionRegistry`.
2. **Semantic Similarity Check**: Checks if the requested action matches common equivalents (e.g. `mkdir`/`make_folder` -> `create_folder`; `write_file`/`save_file` -> `write_file`; `cat`/`fetch_file` -> `read_file`).
3. **Redirection**: If an existing action already performs the task, `create_action` will not create a duplicate; it returns an informative message redirecting the discussion to use the existing action.

#### Parallel Modular File Creation
If the action is genuinely new:
The AI will emit a `create_action` action:
```json
```workbench:action
{
  "action": "create_action",
  "name": "download_file",
  "aliases": ["fetch_file"],
  "description": "Downloads a remote file from a URL to the active directory.",
  "code": "// Complete TypeScript module implementing ActionDefinition"
}
```
```

Workbench will automatically:
1. Write the new action into its own dedicated separate file: `electron/actions/downloadFileAction.ts` in parallel with other modular actions.
2. Register the import, export, and `registry.register()` calls in `electron/actions/index.ts`.
3. Display a toast notification and open the newly created action file in an editor tab.

---

## 5. What Happens Behind the Scenes

Once registered, the Workbench engine automatically handles the following:

1. **Automatic Prompt Guide Generation**:
   [`ActionRegistry.generatePromptGuide()`](file:///d:/Products/Workbench/electron/actions/registry.ts#L54) inspects `searchFilesAction.id`, `aliases`, `description`, and `example`, automatically generating a clean markdown schema section:
   ```markdown
   #### 🔹 `search_files` (Aliases: `find_files`, `find`, `search_directory`)
   Searches the active target directory recursively for files matching a keyword or file extension.
   ```json
   {
     "action": "search_files",
     "query": ".tsx",
     "path": "src",
     "maxResults": 25
   }
   ```
   ```

2. **Chat Priming**:
   When the user clicks **⚡ Prime Chat** on the toolbar, this updated schema is sent to the chat model. The LLM now understands:
   - What the action does.
   - What JSON keys are accepted.
   - What aliases it can use.

3. **Interception & Execution**:
   When the user asks: *"Find all markdown files in my notes folder"*, the AI emits:
   ````markdown
   ```workbench:action
   {
     "action": "search_files",
     "query": ".md"
   }
   ```
   ````
   - [`viewPreload.ts`](file:///d:/Products/Workbench/electron/views/viewPreload.ts) detects the block and forwards it over IPC.
   - [`actionDispatcher.ts`](file:///d:/Products/Workbench/electron/services/actionDispatcher.ts) resolves `search_files` from `registry.get('search_files')`.
   - `searchFilesAction.execute(ctx, payload)` runs.

4. **Self-Correcting Feedback Loop**:
   When execution finishes, the dispatcher formats the `ActionResult` and sends it back to the active chat:
   ```text
   [Workbench Action Result: ✅ Found 8 matching file(s) for ".md" in "Notes"]
   Matches:
   - Chapter1.md (1,240 bytes)
   - Chapter2.md (3,410 bytes)
   ...
   ```
   The AI reads this confirmation and responds directly to the user with the findings.

---

## 6. Implementation Best Practices & Guidelines

### 1. Robust Payload Normalization
LLMs output slightly varying JSON structures depending on the model and system context. Your `execute()` method should gracefully support:
- `payload.params.<key>` AND top-level `payload.<key>`.
- Common parameter aliases (e.g. `path`, `folder`, `name`, `target`).
- Both forward slashes (`/`) and backslashes (`\`).

```typescript
const params = payload.params || {}
const targetPath = params.path ?? payload.path ?? params.name ?? payload.name
```

### 2. Always Sanitize with `ctx.resolveSafePath()`
Never use raw `path.join(ctx.getActiveDirectory(), userInput)` directly.
Always call:
```typescript
const safeTarget = ctx.resolveSafePath(userInput, targetPane)
```
`resolveSafePath` resolves relative paths against the active folder, enforces directory bounds, and prevents malicious traversal attempts (e.g. `../../../../Windows/System32`).

### 3. Provide Clear UI & Explorer Feedback
- If your action creates, moves, or deletes files, always call `ctx.refreshExplorer(targetPane)` so the user's Explorer tree immediately updates.
- If your action creates a primary file the user wants to see immediately, call `ctx.openInTab(filePath)`.
- Use concise, pleasant toast messages with emojis: `ctx.notify('📁 Created folder: ...')`.

### 4. Guard Against Documentation Template Placeholders
The Action Dispatcher automatically filters out template examples emitted during explanations containing tokens like `<folder_name>`, `<file_name>`, or `<source>`. Make sure your action throws descriptive errors when required inputs are empty:
```typescript
if (!fileName) {
  throw new Error('Missing file name for write_file action.')
}
```

### 5. Cross-Platform Path Handling
Always normalize paths before returning them in messages or metadata:
```typescript
const displayPath = relPath.replace(/\\/g, '/')
```

---

## 7. Summary Checklist for Creating an Action

- [ ] Create `electron/actions/<name>Action.ts`.
- [ ] Implement `ActionDefinition` with `id`, `aliases`, `description`, `parameters`, `example`, and `execute`.
- [ ] Use `ctx.resolveSafePath()` for all filesystem paths.
- [ ] Call `ctx.notify()` and `ctx.refreshExplorer()` where appropriate.
- [ ] Return `{ success: true, action: '...', message: '...', details?: ... }`.
- [ ] Export and register in `electron/actions/index.ts`.
- [ ] Run `npm run build` to verify type compliance.
- [ ] Prime chat (`⚡ Prime Chat`) to verify the AI adopts the new action seamlessly.
