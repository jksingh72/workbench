export interface ActionResult {
  success: boolean
  action?: string
  message: string
  createdPath?: string
  error?: string
  details?: any
}

export interface ActionContext {
  resolveSafePath(inputPath: string, targetPane?: 'book' | 'note' | 'custom'): string
  getActiveDirectory(targetPane?: 'book' | 'note' | 'custom'): string
  notify(message: string): void
  refreshExplorer(targetPane?: 'book' | 'note'): void
  openInTab(filePath: string): void
  dispatch(action: any, targetPane?: 'book' | 'note' | 'custom'): Promise<ActionResult>
  confirm(options: { title: string; message: string; detail?: string }): Promise<boolean>
  getWorkspaceFolders(): {
    activeTarget: 'book' | 'note' | 'custom'
    activeDirectory: string
    bookDirectory: string
    noteDirectory: string
  }
  setActiveTarget(target: 'book' | 'note' | 'custom', customPath?: string): void
  attachToChat?(filePath: string, customInstruction?: string): Promise<{ success: boolean; uploaded?: boolean; error?: string }>
  bookBridge?: {
    extractVisiblePage(options?: {
      scope?: 'viewport' | 'full' | 'both'
      includeLinks?: boolean
      includeInputs?: boolean
      showBadges?: boolean
    }): Promise<any>
    extractAndIndexLinks(options?: {
      viewportOnly?: boolean
      showBadges?: boolean
      filter?: string
    }): Promise<any>
    clickLinkOrElement(target: {
      id?: number
      text?: string
      selector?: string
    }): Promise<any>
    scrollOrNavigate(params: {
      command:
        | 'scroll-down'
        | 'scroll-up'
        | 'scroll-top'
        | 'scroll-bottom'
        | 'next'
        | 'prev'
        | 'back'
        | 'forward'
        | 'reload'
        | 'home'
        | 'url'
        | 'clear-badges'
        | 'show-badges'
      url?: string
    }): Promise<any>
  }
}

export interface ActionParameter {
  type: string
  required?: boolean
  description: string
  default?: any
}

export interface ActionDefinition {
  /** Primary action name, e.g. 'create_folder' */
  id: string
  /** Alternative names/synonyms LLMs might use, e.g. ['mkdir', 'new_folder'] */
  aliases?: string[]
  /** Human & LLM readable description of what this action does */
  description: string
  /** Expected parameters for LLM documentation */
  parameters: Record<string, ActionParameter>
  /** Example JSON for this action */
  example: Record<string, any>
  /** Execution logic for this action */
  execute(ctx: ActionContext, payload: any, targetPane?: 'book' | 'note'): Promise<ActionResult>
}
