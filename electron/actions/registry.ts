import { ActionDefinition } from './types'

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
   * Generates a dynamic markdown prompt guide listing all available modular actions.
   * This can be fed directly to ChatGPT, Claude, or Gemini.
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
    customInstructions?: string
  ): string {
    const actionsList = this.getAll()
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
      `   - Present a clean, concise bulleted list of the actions currently available in Workbench (e.g. \`create_folder\`, \`write_file\`, \`read_file\`, \`list_directory\`, \`attach_file\`, \`create_project\`, etc.).`,
      `3. **Invite for Instructions**:`,
      `   - Conclude with an invitation asking the user for their instructions to operate (e.g. "I'm ready for your instructions. What would you like to build, organize, or create?").`,
      ``,
    ]

    lines.push(`### 📎 CRITICAL: Reading, Summarizing, or Inspecting Documents & Files:`)
    lines.push(`Whenever the user asks you to read, summarize, analyze, inspect, or explain ANY document, book, PDF, office file (.docx, .xlsx, .pptx), or file:`)
    lines.push(`- **ALWAYS use \`attach_file\`** (\`{"action": "attach_file", "path": "<file_path>"}\`) as your DEFAULT action!`)
    lines.push(`- Attaching the file automatically uploads the full document directly into our chat session without text truncation, token limits, or timeouts.`)
    lines.push(`- DO NOT use \`read_file\` or \`summarize_file\` for documents, books, or PDFs. Only use \`read_file\` if the user explicitly asks to view a few lines of a specific small code or configuration file (e.g. .json, .ts).`)
    lines.push(``)

    if (customInstructions && customInstructions.trim()) {
      lines.push(`### Custom User Instructions & Rules:`)
      lines.push(customInstructions.trim())
      lines.push(``)
    }

    lines.push(`### Available Workbench Actions:`)

    for (const act of actionsList) {
      const aliasStr = act.aliases && act.aliases.length > 0 ? ` (Aliases: ${act.aliases.map((a) => `\`${a}\``).join(', ')})` : ''
      lines.push(`#### 🔹 \`${act.id}\`${aliasStr}`)
      lines.push(`${act.description}`)
      lines.push('```json')
      lines.push(JSON.stringify(act.example, null, 2))
      lines.push('```')
      lines.push('')
    }

    lines.push(`### Batch Execution:`)
    lines.push(`You can also output multiple actions as a JSON array in a single \`\`\`workbench:action block to run them sequentially.`)
    lines.push(``)
    lines.push(`### Adding New Actions to Workbench (Extensibility & Deduplication Rules):`)
    lines.push(`You have the capability to create and add new custom actions to Workbench Desktop.`)
    lines.push(`CRITICAL CHECK BEFORE CREATING AN ACTION:`)
    lines.push(`1. Always check the Available Workbench Actions list first.`)
    lines.push(`2. If an existing action already provides this functionality or has matching aliases (e.g., \`create_folder\` for mkdir/folders, \`write_file\` for writing/saving files, \`read_file\` for reading, \`delete_file\` for deletions, \`open_file\` for viewing files):`)
    lines.push(`   - DO NOT create a new action or call \`create_action\`!`)
    lines.push(`   - Redirect the discussion: inform the user that action \`<action_id>\` already exists and show them how to use it with a brief example.`)
    lines.push(`3. If and only if the requested functionality is genuinely new and does not exist in any action:`)
    lines.push(`   - Use the \`create_action\` action.`)
    lines.push(`   - The action will be created in its own separate file in \`electron/actions/<name>Action.ts\` in parallel with other actions, maintaining strict modularity.`)
    lines.push(`   - Provide complete, robust TypeScript code implementing \`ActionDefinition\` from \`./types\`:`)
    lines.push(`     - \`id\` (string): Canonical name in snake_case (e.g. \`download_file\`, \`archive_folder\`)`)
    lines.push(`     - \`aliases\` (string[]): Alternative synonyms (e.g. \`['curl', 'wget']\`)`)
    lines.push(`     - \`description\` (string): Clear summary of what the action does and when to use it`)
    lines.push(`     - \`parameters\` (object): Detailed schema metadata of arguments`)
    lines.push(`     - \`example\` (object): Sample JSON payload demonstrating the action`)
    lines.push(`     - \`async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult>\`:`)
    lines.push(`       - Sanitize paths using \`ctx.resolveSafePath(inputPath, targetPane)\``)
    lines.push(`       - Provide desktop toast notifications using \`ctx.notify('...')\``)
    lines.push(`       - Trigger explorer refreshes using \`ctx.refreshExplorer(targetPane)\``)
    lines.push(`       - Return \`{ success: true, action: id, message: '...' }\``)
    lines.push(`4. When \`create_action\` runs, Workbench automatically writes the separate file, registers it in \`electron/actions/index.ts\`, and opens it in an editor tab.`)
    lines.push(`5. For complete architecture guidelines, context helpers, and boilerplate examples, refer to \`docs/CREATING_NEW_ACTIONS_GUIDE.md\`.`)
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
