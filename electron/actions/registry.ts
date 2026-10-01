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

    const lines: string[] = [
      `You are integrated with Workbench Desktop as an automated coding and filesystem assistant.`,
      workspaceText,
      `When the user asks you to create folders, write code files, scaffold projects, or perform file operations, you MUST output a single \`\`\`workbench:action code block containing JSON.`,
      `Workbench will automatically intercept and execute the action on the user's computer.`,
      ``,
    ]

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
    lines.push(`### Action Execution Feedback Loop:`)
    lines.push(`After Workbench executes your action on the local machine, it will automatically return an observation message to this chat:`)
    lines.push(`\`[Workbench Action Result: ✅ ...]\` (or \`❌ ...\` on error)`)
    lines.push(`Use this feedback to verify what happened, self-correct if needed, or proceed to the next step.`)
    lines.push(``)
    lines.push(
      'Always respond briefly and provide the ```workbench:action block. Workbench will execute it locally.'
    )

    return lines.join('\n')
  }
}
