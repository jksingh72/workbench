import { ActionDefinition } from './types'

export type LLMProvider = 'claude' | 'chatgpt' | 'perplexity' | 'gemini' | 'deepseek' | 'generic'

export interface ToolGroup {
  id: string
  name: string
  description: string
  isMcp: boolean
  defaultSelected: boolean
  actionIds: string[]
}

export interface PrimingOptions {
  provider?: LLMProvider
  selectedGroups?: string[]
  customInstructions?: string
}

export class ActionRegistry {
  private static instance: ActionRegistry | null = null
  private actions: Map<string, ActionDefinition> = new Map()
  private aliasMap: Map<string, string> = new Map()

  private constructor() {}

  public static getInstance(): ActionRegistry {
    if (!ActionRegistry.instance) {
      ActionRegistry.instance = new ActionRegistry()
    }
    return ActionRegistry.instance
  }

  /**
   * Register a modular action.
   */
  public register(action: ActionDefinition): void {
    const primaryId = action.id.toLowerCase().trim()
    this.actions.set(primaryId, action)
    this.aliasMap.set(primaryId, primaryId)

    if (action.aliases) {
      for (const alias of action.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), primaryId)
      }
    }
  }

  /**
   * Unregister an action by primary ID or alias.
   */
  public unregister(nameOrAlias: string): boolean {
    if (!nameOrAlias) return false
    const clean = nameOrAlias.toLowerCase().trim()
    const primaryId = this.aliasMap.get(clean)
    if (!primaryId) return false

    const action = this.actions.get(primaryId)
    this.actions.delete(primaryId)
    this.aliasMap.delete(primaryId)

    if (action?.aliases) {
      for (const alias of action.aliases) {
        const aClean = alias.toLowerCase().trim()
        if (this.aliasMap.get(aClean) === primaryId) {
          this.aliasMap.delete(aClean)
        }
      }
    }
    return true
  }

  /**
   * Find an action definition by primary name or alias.
   */
  public get(nameOrAlias: string): ActionDefinition | undefined {
    if (!nameOrAlias) return undefined
    const clean = nameOrAlias.toLowerCase().trim()
    const primaryId = this.aliasMap.get(clean)
    if (!primaryId) return undefined
    return this.actions.get(primaryId)
  }

  /**
   * Retrieve all registered actions.
   */
  public getAll(): ActionDefinition[] {
    return Array.from(this.actions.values())
  }

  /**
   * Groups all registered actions into logical selection groups for priming.
   */
  public getAvailableToolGroups(): ToolGroup[] {
    const allActions = this.getAll()
    const coreIds = new Set(['create_folder', 'write_file', 'read_file', 'move_file', 'copy_file', 'rename_file', 'delete_file', 'open_file'])
    const bookIds = new Set(['inspect_folder', 'attach_file', 'read_pdf', 'read_docx', 'create_docx', 'render_docx', 'extract_rfp', 'search_text', 'read_pages', 'summarize_file'])
    const scriptIds = new Set(['batch', 'run_script', 'create_project', 'download_file'])
    const systemIds = new Set(['list_directory', 'get_workspace_folders', 'set_active_directory', 'list_actions', 'add_mcp_server', 'remove_mcp_server', 'configure_mcp_server', 'create_action', 'update_action'])

    const mcpServersMap = new Map<string, string[]>()

    for (const act of allActions) {
      if (act.id.startsWith('mcp_')) {
        const parts = act.id.split('_')
        const serverName = parts[1] || 'custom'
        const existing = mcpServersMap.get(serverName) || []
        existing.push(act.id)
        mcpServersMap.set(serverName, existing)
      }
    }

    const groups: ToolGroup[] = [
      {
        id: 'core',
        name: '📁 Core File Operations',
        description: 'Create folders, write, read, move, copy, and delete files',
        isMcp: false,
        defaultSelected: true,
        actionIds: allActions.filter((a) => coreIds.has(a.id)).map((a) => a.id),
      },
      {
        id: 'books',
        name: '📚 Document, Word & RFP Tools',
        description: 'Word building (render_docx), RFP extraction (extract_rfp), targeted search & page reading, PDF inspection',
        isMcp: false,
        defaultSelected: true,
        actionIds: allActions.filter((a) => bookIds.has(a.id)).map((a) => a.id),
      },
      {
        id: 'scripts',
        name: '⚡ Batch & Script Execution',
        description: 'Batch multi-action execution and fast in-process scripts (JavaScript/PowerShell)',
        isMcp: false,
        defaultSelected: true,
        actionIds: allActions.filter((a) => scriptIds.has(a.id)).map((a) => a.id),
      },
      {
        id: 'system',
        name: '⚙️ Workspace & Navigation',
        description: 'Directory listing, active target switching, and action management',
        isMcp: false,
        defaultSelected: true,
        actionIds: allActions.filter((a) => systemIds.has(a.id)).map((a) => a.id),
      },
    ]

    for (const [serverName, actionIds] of mcpServersMap.entries()) {
      let displayName = `🔌 MCP: ${serverName}`
      let desc = `${actionIds.length} tool(s) provided by "${serverName}" server`
      if (serverName === 'fetch') {
        displayName = '🌐 MCP: Web Fetch'
        desc = 'Fetch live web URLs and documentation directly into chat'
      } else if (serverName === 'sqlite') {
        displayName = '🗄️ MCP: SQLite Database'
        desc = 'Execute queries, inspect tables, and analyze database records'
      } else if (serverName === 'playwright') {
        displayName = '🎭 MCP: Playwright Browser'
        desc = 'Full browser automation (navigate, click, snapshot, screenshot)'
      } else if (serverName === 'awsbrowser') {
        displayName = '☁️ MCP: AWS Browser'
        desc = 'Separate isolated Playwright browser for AWS Console'
      } else if (serverName === 'twitter-mcp') {
        displayName = '🐦 MCP: Twitter / X'
        desc = 'Twitter trends, timeline, search, profile, and topic analysis'
      } else if (serverName === 'filesystem') {
        displayName = '📂 MCP: External Filesystem'
        desc = 'Extended filesystem operations across allowed host directories'
      }

      groups.push({
        id: `mcp_${serverName}`,
        name: displayName,
        description: desc,
        isMcp: true,
        defaultSelected: serverName === 'fetch',
        actionIds,
      })
    }

    return groups
  }

  /**
   * Generates a tailored dynamic markdown prompt guide based on provider & selected tools.
   */
  public generatePromptGuide(
    workspaceInfo?:
      | string
      | {
          activeTarget: string
          activeDirectory: string
          bookDirectory?: string
          noteDirectory?: string
        },
    options?: string | PrimingOptions
  ): string {
    const opts: PrimingOptions =
      typeof options === 'string'
        ? { customInstructions: options }
        : options || {}

    const provider: LLMProvider = opts.provider || 'generic'
    const customInstructions = opts.customInstructions || ''

    // Determine allowed actions based on selected groups
    const allGroups = this.getAvailableToolGroups()
    const selectedGroupIds = new Set(
      opts.selectedGroups && opts.selectedGroups.length > 0
        ? opts.selectedGroups
        : allGroups.filter((g) => g.defaultSelected).map((g) => g.id)
    )

    const allowedActionIds = new Set<string>()
    for (const g of allGroups) {
      if (selectedGroupIds.has(g.id)) {
        for (const id of g.actionIds) {
          allowedActionIds.add(id)
        }
      }
    }

    const actionsList = this.getAll().filter((a) => allowedActionIds.has(a.id))

    let workspaceText = ''
    if (typeof workspaceInfo === 'string') {
      workspaceText = workspaceInfo ? `Active Directory: \`${workspaceInfo}\`\n` : ''
    } else if (workspaceInfo) {
      const targetLabel =
        workspaceInfo.activeTarget === 'note'
          ? 'Note View'
          : workspaceInfo.activeTarget === 'custom'
          ? 'Custom Directory'
          : 'Book View'

      workspaceText = `Active Workspace Folders:\n- Current Action Target: ${targetLabel} (\`${workspaceInfo.activeDirectory}\`)\n- Book View Folder: \`${workspaceInfo.bookDirectory || 'None'}\`\n- Note View Folder: \`${workspaceInfo.noteDirectory || 'None'}\`\n(All relative file actions execute inside Current Action Target. Use \`set_active_directory\` to switch)\n`
    }

    const hasActiveDir = Boolean(
      (typeof workspaceInfo === 'string' && workspaceInfo.trim()) ||
      (typeof workspaceInfo === 'object' && workspaceInfo?.activeDirectory?.trim())
    )
    const activeDirDisplay =
      typeof workspaceInfo === 'string'
        ? workspaceInfo
        : typeof workspaceInfo === 'object'
        ? workspaceInfo.activeDirectory
        : ''

    // =========================================================================
    // 1. PERPLEXITY CORE (Ultra-Compact: < 2,500 characters)
    // =========================================================================
    if (provider === 'perplexity') {
      const lines: string[] = [
        `You are integrated with Workbench Desktop (Active Target: \`${activeDirDisplay}\`).`,
        `Output actions inside \`\`\`workbench:action { "action": "<name>", ... } \`\`\` code blocks to execute locally.`,
        ``,
        `### CRITICAL RULES:`,
        `- Folders & Books: Use \`inspect_folder\` for metadata & topic excerpts in 1 shot.`,
        `- Word Documents: Use \`render_docx\` (with JSON blocks) to build Word docs with tables.`,
        `- RFP Packages: Use \`extract_rfp\` to unpack & extract text, \`search_text\` to query, and \`read_pages\` to read page ranges.`,
        `- Multi-step tasks: use \`batch\` (array of actions) or \`run_script\`.`,
        `- Respond briefly with the action JSON.`,
        ``,
        `### AVAILABLE ACTIONS:`,
      ]

      for (const act of actionsList) {
        const paramKeys = Object.keys(act.parameters || {}).join(', ')
        lines.push(`- \`${act.id}(${paramKeys})\`: ${act.description}`)
      }

      if (customInstructions && customInstructions.trim()) {
        lines.push(``, `### User Instructions:`, customInstructions.trim())
      }

      return lines.join('\n')
    }

    // =========================================================================
    // 2. GEMINI CORE (High-Signal Structured: ~3,500 characters)
    // =========================================================================
    if (provider === 'gemini') {
      const lines: string[] = [
        `You are integrated with Workbench Desktop as an automated coding and filesystem assistant.`,
        workspaceText,
        `Execute local operations by outputting a single \`\`\`workbench:action code block containing JSON.`,
        ``,
        `### CRITICAL: Initial Response Upon Priming:`,
        `When receiving this message, your IMMEDIATE first response must strictly include:`,
        `1. Connection Status: "⚡ **Connection Status:** Connected to Workbench (Active Target: \`${activeDirDisplay}\`)"`,
        `2. Available Capabilities: brief bulleted summary of key actions. Do not execute list_directory unprompted.`,
        `3. Invitation: "I'm ready for your instructions. What would you like to build, organize, or create?"`,
        ``,
        `### Operational Directives:`,
        `1. Word Reports with Tables: Use \`render_docx\` with JSON blocks to generate .docx files locally.`,
        `2. RFP & Document Processing: Use \`extract_rfp\` to unpack & index documents, \`search_text\` to find requirements, and \`read_pages\` to read targeted page ranges.`,
        `3. Collections & Books: ALWAYS use \`inspect_folder\` to scan catalogs in one turn. NEVER use attach_file in loops.`,
        `4. Multi-Action Execution: Use \`batch\` to execute multiple operations sequentially in one shot.`,
        ``,
        `### Available Actions:`,
      ]

      for (const act of actionsList) {
        const paramKeys = Object.keys(act.parameters || {}).join(', ')
        lines.push(`- \`${act.id}(${paramKeys})\` - ${act.description}`)
      }

      if (customInstructions && customInstructions.trim()) {
        lines.push(``, `### Custom User Instructions:`, customInstructions.trim())
      }

      lines.push(``, `Provide clean \`\`\`workbench:action blocks and direct answers without redundant preamble.`)
      return lines.join('\n')
    }

    // =========================================================================
    // 3. CHATGPT CORE (Safety-Grounded against 10-file upload ceiling: ~4,500 chars)
    // =========================================================================
    if (provider === 'chatgpt') {
      const lines: string[] = [
        `You are integrated with Workbench Desktop as an automated coding and filesystem assistant.`,
        workspaceText,
        `When asked to create folders, write files, inspect documents, or perform file tasks, output a single \`\`\`workbench:action code block containing JSON. Workbench intercepts and executes it locally.`,
        ``,
        `### CRITICAL: Initial Response Upon Priming:`,
        `When receiving this message, respond with:`,
        `1. Connection Status: "⚡ **Connection Status:** Connected to Workbench (Active Target: \`${activeDirDisplay}\`)"`,
        `2. Available Capabilities: brief bulleted summary of available actions.`,
        `3. Invitation: "I'm ready for your instructions. What would you like to build, organize, or create?"`,
        ``,
        `### 🚀 SINGLE-SHOT & UPLOAD CEILING RULES:`,
        `1. **Word Reports & Tables:** ALWAYS use \`render_docx\` with JSON \`spec\` containing blocks (headings, paragraphs, tables with columns & rows). Never send base64 or write Word files via PowerShell scripts.`,
        `2. **RFP & Document Analysis:** Use \`extract_rfp\` to unzip & extract text into \`_extracted/\`, \`search_text\` to query keywords across pages, and \`read_pages\` to read exact page ranges.`,
        `3. **Collections & Folder Inspection:** NEVER use \`attach_file\` in a loop or batch! ALWAYS use \`inspect_folder\` (\`{"action": "inspect_folder", "path": ".", "filter": "books", "includeExcerpts": true}\`).`,
        `4. **Single Document Deep Dive:** Use \`attach_file\` ONLY for ONE specific document when the user explicitly asks to read or analyze that file (e.g. "Read paper.pdf").`,
        `5. **Organizing Files:** Use \`batch\` with \`create_folder\` and \`move_file\` actions.`,
        ``,
        `### Available Workbench Actions:`,
      ]

      for (const act of actionsList) {
        const paramKeys = Object.keys(act.parameters || {}).join(', ')
        const aliasStr = act.aliases && act.aliases.length > 0 ? ` (Aliases: ${act.aliases.map((a) => `\`${a}\``).join(', ')})` : ''
        lines.push(`- \`${act.id}(${paramKeys})\`${aliasStr} - ${act.description}`)
      }

      lines.push(``, `### Action Execution Example:`)
      lines.push('```workbench:action')
      lines.push(JSON.stringify({ action: 'inspect_folder', path: '.', filter: 'books', includeExcerpts: true }, null, 2))
      lines.push('```')

      if (customInstructions && customInstructions.trim()) {
        lines.push(``, `### Custom User Instructions:`, customInstructions.trim(), ``)
      }

      lines.push(``, `Always respond concisely and output the required \`\`\`workbench:action block.`)
      return lines.join('\n')
    }

    // =========================================================================
    // 4. CLAUDE CORE (Concise, High-Signal, Non-Attachment: < 1,600 characters)
    // =========================================================================
    if (provider === 'claude') {
      const lines: string[] = [
        `You are integrated with Workbench Desktop as an automated coding and filesystem assistant.`,
        workspaceText,
        `When asked to create folders, write code files, or inspect files, output a single \`\`\`workbench:action code block containing JSON. Workbench executes it locally.`,
        ``,
        `### CRITICAL: Initial Response Upon Priming:`,
        `When receiving this message, your IMMEDIATE first response must strictly include:`,
        `1. Connection Status: "⚡ **Connection Status:** Connected to Workbench (Active Target: \`${activeDirDisplay}\`)"`,
        `2. Available Capabilities: brief bulleted summary of key actions. Do not execute list_directory unprompted.`,
        `3. Invitation: "I'm ready for your instructions. What would you like to build, organize, or create?"`,
        ``,
        `### Operational Directives:`,
        `- Word Documents: Use \`render_docx\` (JSON blocks) to build Word docs with tables locally.`,
        `- RFP Processing: Use \`extract_rfp\` to unpack & extract text, \`search_text\` to query, and \`read_pages\` for page ranges.`,
        `- Folders & Books: ALWAYS use \`inspect_folder\` to scan metadata & excerpts in 1 turn. NEVER use attach_file in loops.`,
        `- Multi-Action Tasks: Use \`batch\` with actions array.`,
        ``,
        `### Available Actions:`,
      ]

      for (const act of actionsList) {
        const paramKeys = Object.keys(act.parameters || {}).join(', ')
        lines.push(`- \`${act.id}(${paramKeys})\` - ${act.description}`)
      }

      if (customInstructions && customInstructions.trim()) {
        lines.push(``, `### Custom User Instructions:`, customInstructions.trim())
      }

      lines.push(``, `Provide clean \`\`\`workbench:action blocks without unnecessary preamble.`)
      return lines.join('\n')
    }

    // =========================================================================
    // 5. GENERIC CORE (Full Semantic Rich Specification)
    // =========================================================================
    const lines: string[] = [
      `You are integrated with Workbench Desktop as an automated coding and filesystem assistant.`,
      workspaceText,
      `When the user asks you to create folders, write code files, scaffold projects, or perform file operations, you MUST output a single \`\`\`workbench:action code block containing JSON.`,
      `Workbench will automatically intercept and execute the action on the user's computer.`,
      ``,
      `### CRITICAL: Initial Response Upon Priming:`,
      `When you receive this priming message, your IMMEDIATE first response to the user MUST strictly follow this 3-part format:`,
      `1. **Connection Status**:`,
      hasActiveDir
        ? `   - State: "⚡ **Connection Status:** Connected to Workbench (Active Target: \`${activeDirDisplay}\`)"`
        : `   - State: "⚪ **Connection Status:** Not Connected (No active directory linked)"`,
      `   - **DO NOT** automatically execute \`list_directory\` upon greeting. Only execute \`list_directory\` when the user explicitly asks to list, see, or explore directory contents.`,
      `2. **List of Available Actions**:`,
      `   - Present a clean, concise bulleted list of the actions currently available in Workbench.`,
      `3. **Invite for Instructions**:`,
      `   - Conclude with an invitation asking the user for their instructions to operate (e.g. "I'm ready for your instructions. What would you like to build, organize, or create?").`,
      ``,
      `### 🚀 SINGLE-SHOT MULTI-STEP EXECUTION RULES (FIRST PRIORITY):`,
      `1. **Word Reports & Tables:** ALWAYS use \`render_docx\` (\`{"action": "render_docx", "outPath": "...", "spec": { "blocks": [...] }}\`) to build high-quality Word documents with tables, repeating headers, and styled headings. Never send base64 or execute raw PowerShell scripts.`,
      `2. **RFP & Document Packages:**`,
      `   - **Unpack & Index:** Use \`extract_rfp\` (\`{"action": "extract_rfp", "folder": "."}\`) to unzip archives and extract page-marked text into \`_extracted/\`.`,
      `   - **Targeted Search:** Use \`search_text\` (\`{"action": "search_text", "folder": ".", "query": "..."}\`) to locate specific requirements across all extracted files with page & line numbers.`,
      `   - **Targeted Reading:** Use \`read_pages\` (\`{"action": "read_pages", "file": "doc.pdf", "fromPage": 10, "toPage": 15}\`) to read exact page ranges without line caps.`,
      `3. **Folder Inspection:** ALWAYS use \`inspect_folder\` as your FIRST CHOICE to inspect books or documents in a folder in one shot.`,
      `4. **Multi-Action Batches:** ALWAYS use \`batch\` (\`{"action": "batch", "actions": [...]}\`) to run multiple actions sequentially.`,
      `5. **Custom Scripts:** Use \`run_script\` (JavaScript, PowerShell, or Python) for in-process calculations or custom tasks.`,
      ``,
      `### 📎 CRITICAL: Reading Individual Documents vs. Cataloging/Grouping Folders:`,
      `1. **Single Document Deep Dive:**`,
      `   Whenever the user asks you to read, analyze, summarize, or explain a SPECIFIC individual document, paper, or book (e.g. "Read paper.pdf"):`,
      `   - **ALWAYS use \`attach_file\`** (\`{"action": "attach_file", "path": "<file_path>"}\`) to upload that single document directly into chat for full content processing.`,
      `2. **Collections, Folders, and Grouping Multiple Books:**`,
      `   Whenever the user asks to analyze, catalog, list, or group MULTIPLE files or a folder:`,
      `   - **NEVER use \`attach_file\` in a loop or batch!** Attaching dozens of books exhausts token limits and hits upload limits.`,
      `   - **ALWAYS use \`inspect_folder\`**. It provides all titles, authors, formats, sizes, and first-page topic excerpts in ONE shot without uploading files!`,
      `3. **Reorganizing Files into Subject Folders:**`,
      `   When the user approves organizing files into folders, ALWAYS use \`batch\` with \`create_folder\` and \`move_file\` actions.`,
      ``,
    ]

    if (customInstructions && customInstructions.trim()) {
      lines.push(`### Custom User Instructions & Rules:`)
      lines.push(customInstructions.trim())
      lines.push(``)
    }

    lines.push(`### Available Workbench Actions:`)

    for (const act of actionsList) {
      const paramKeys = Object.keys(act.parameters || {}).join(', ')
      const aliasStr = act.aliases && act.aliases.length > 0 ? ` (Aliases: ${act.aliases.map((a) => `\`${a}\``).join(', ')})` : ''
      lines.push(`- \`${act.id}(${paramKeys})\`${aliasStr} - ${act.description}`)
    }

    lines.push(``, `### Action Execution Example:`)
    lines.push('```workbench:action')
    lines.push(JSON.stringify({ action: 'inspect_folder', path: '.', filter: 'books', includeExcerpts: true }, null, 2))
    lines.push('```')
    lines.push(``)
    lines.push(`### Batch Execution:`)
    lines.push(`You can also output multiple actions as a JSON array or \`batch\` action in a single \`\`\`workbench:action block to run them sequentially.`)
    lines.push(``)
    lines.push(`### Action Execution Feedback Loop:`)
    lines.push(`After Workbench executes your action on the local machine, it will automatically return an observation message to this chat:`)
    lines.push(`\`[Workbench Action Result: ✅ ...]\` (or \`❌ ...\` on error)`)
    lines.push(`Use this feedback to verify what happened, self-correct if needed, or proceed to the next step.`)
    lines.push(`### Response Style & Crispness Guidelines:`)
    lines.push(`- Keep your explanations crisp, concise, and direct. Avoid conversational filler, redundant apologies, or repeating long filesystem paths.`)
    lines.push(`- When reporting folder contents, list the items directly without conversational preamble.`)
    lines.push(`- When emitting an action, output only the required code block and minimal explanation.`)
    lines.push(`- After receiving an action result, provide the direct answer to the user. Do not repeat identical action calls.`)
    lines.push(``)
    lines.push(
      'Always respond briefly and provide the ```workbench:action block. Workbench will execute it locally.'
    )

    return lines.join('\n')
  }
}
