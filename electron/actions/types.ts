export interface ActionResult {
  success: boolean
  action?: string
  message: string
  createdPath?: string
  error?: string
  details?: any
}

export interface ActionContext {
  resolveSafePath(inputPath: string, targetPane?: 'book' | 'note'): string
  getActiveDirectory(targetPane?: 'book' | 'note'): string
  notify(message: string): void
  refreshExplorer(targetPane?: 'book' | 'note'): void
  openInTab(filePath: string): void
  dispatch(action: any, targetPane?: 'book' | 'note'): Promise<ActionResult>
  confirm(options: { title: string; message: string; detail?: string }): Promise<boolean>
}

export interface ActionDefinition {
  /** Primary action name, e.g. 'create_folder' */
  id: string
  /** Alternative names/synonyms LLMs might use, e.g. ['mkdir', 'new_folder'] */
  aliases?: string[]
  /** Human & LLM readable description of what this action does */
  description: string
  /** Expected parameters for LLM documentation */
  parameters: Record<
    string,
    {
      type: string
      required?: boolean
      description: string
      default?: any
    }
  >
  /** Example JSON for this action */
  example: Record<string, any>
  /** Execution logic for this action */
  execute(ctx: ActionContext, payload: any, targetPane?: 'book' | 'note'): Promise<ActionResult>
}
