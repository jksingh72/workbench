export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface NavState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  url: string
  title: string
  zoomFactor: number
}

export interface AskAIResult {
  success: boolean
  text?: string
  prompt?: string
  injected?: boolean
  error?: string
}

export interface ElectronAPI {
  updateBounds: (bounds: { book?: Bounds; ai?: Bounds; note?: Bounds }) => void
  setSplit: (params: { ratio: number; isSwapped: boolean }) => void
  showAskAIMenu: () => void
  navAction: (action: {
    target: 'book' | 'ai' | 'note'
    command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset'
    url?: string
  }) => void
  askAI: (options: {
    templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom'
    customPrompt?: string
  }) => Promise<AskAIResult>
  onNavStateChange: (
    callback: (target: 'book' | 'ai' | 'note', state: Partial<NavState>) => void
  ) => () => void
  onAskAIResult: (callback: (result: AskAIResult) => void) => () => void
  openExternal: (url: string) => void
  clearSession: (target: 'book' | 'ai' | 'note', scope?: 'current' | 'all' | string) => Promise<{ success: boolean; error?: string }>
  getSessionSettings: () => Promise<SessionSettings>
  updateSessionSettings: (settings: Partial<SessionSettings>) => Promise<{ success: boolean; settings: SessionSettings }>
  setViewsVisible: (params: boolean | { target?: 'book' | 'ai' | 'note' | 'all'; visible: boolean }) => void
  setViewsDragging?: (isDragging: boolean) => void
  setVerticalSplit: (params: { ratio: number }) => void
  loadNotes: () => Promise<NoteBook[]>
  saveNotes: (notebooks: NoteBook[]) => Promise<{ success: boolean; error?: string }>
  clipSelection: () => Promise<{ success: boolean; text?: string; error?: string }>
  getBookSources: () => Promise<BookSourceSettings>
  setActiveBookSource: (sourceId: string) => Promise<{ success: boolean; activeSource?: BookSource; error?: string }>
  saveBookSources: (params: { sources: BookSource[]; activeSourceId?: string }) => Promise<{ success: boolean; data?: BookSourceSettings; error?: string }>
  showBookSourceMenu: () => void
  onBookSourceChanged: (callback: (data: { activeSourceId: string; activeSource: BookSource }) => void) => () => void
  onOpenBookSourceModal: (callback: () => void) => () => void
  getAISources: () => Promise<AISourceSettings>
  setActiveAISource: (sourceId: string) => Promise<{ success: boolean; activeSource?: AISource; error?: string }>
  saveAISources: (params: { sources: AISource[]; activeSourceId?: string }) => Promise<{ success: boolean; data?: AISourceSettings; error?: string }>
  showAISourceMenu: () => void
  onAISourceChanged: (callback: (data: { activeSourceId: string; activeSource: AISource }) => void) => () => void
  onOpenAISourceModal: (callback: () => void) => () => void
  getNoteSources: () => Promise<NoteSourceSettings>
  setActiveNoteSource: (sourceId: string) => Promise<{ success: boolean; activeSource?: NoteSource; error?: string }>
  saveNoteSources: (params: { sources: NoteSource[]; activeSourceId?: string }) => Promise<{ success: boolean; data?: NoteSourceSettings; error?: string }>
  showNoteSourceMenu: () => void
  showAIExportMenu?: () => void
  onNoteSourceChanged: (callback: (data: { activeSourceId: string; activeSource: NoteSource }) => void) => () => void
  onOpenNoteSourceModal: (callback: () => void) => () => void

  // Local File Explorer API
  selectFolder: (defaultPath?: string) => Promise<string | null>
  readDirectory: (dirPath: string) => Promise<{ success: boolean; items?: FileItem[]; currentPath?: string; error?: string }>
  openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  showItemInFolder: (filePath: string) => void
  createFile: (parentPath: string, fileName: string, content?: string) => Promise<{ success: boolean; error?: string }>
  createFolder: (parentPath: string, folderName: string) => Promise<{ success: boolean; error?: string }>
  renameItem: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  deleteItem: (itemPath: string) => Promise<{ success: boolean; error?: string }>
  copyItem: (srcPath: string, destDir: string) => Promise<{ success: boolean; targetPath?: string; error?: string }>
  moveItem: (srcPath: string, destDir: string) => Promise<{ success: boolean; targetPath?: string; error?: string }>
  getSystemRoots: () => Promise<{ success: boolean; roots: SystemRootItem[]; error?: string }>

  // Cross-Pane Movement & Transfer APIs
  sendFileToAI: (filePath: string, instruction?: string) => Promise<{ success: boolean; uploaded?: boolean; fileName?: string; error?: string }>
  sendFilesToAI?: (filePaths: string[], instruction?: string) => Promise<{ success: boolean; count?: number; uploaded?: boolean; fileNames?: string[]; error?: string }>
  sendTextToAI: (params: { text: string; templateKey?: string; customPrompt?: string }) => Promise<AskAIResult>
  extractSelection: (target?: 'book' | 'ai' | 'note') => Promise<{ success: boolean; text?: string; error?: string }>
  extractLastResponse?: () => Promise<{ success: boolean; data?: { selectedText: string; prompt: string; response: string; fullMarkdown: string }; error?: string }>
  extractAICodeBlocks?: () => Promise<{ success: boolean; blocks: Array<{ index: number; language: string; extension: string; code: string; suggestedFileName: string }>; error?: string }>
  extractAITranscript?: () => Promise<{ success: boolean; transcript?: string; error?: string }>
  saveAIContent?: (params: { type?: 'response' | 'code' | 'transcript'; targetDir?: string; activeFilePath?: string }) => Promise<{ success: boolean; filePath?: string; fileName?: string; hasSelection?: boolean; count?: number; files?: string[]; message?: string; error?: string }>
  readFileContent: (filePath: string) => Promise<{ success: boolean; content?: string; fileName?: string; isBinary?: boolean; error?: string }>
  readFileBuffer?: (filePath: string) => Promise<{ success: boolean; buffer?: Uint8Array; fileName?: string; error?: string }>
  writeFileContent?: (filePath: string, content: string) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }>
  appendToFile: (filePath: string, content: string) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }>
  readDocx?: (filePath: string) => Promise<{ success: boolean; html?: string; fileName?: string; error?: string }>
  saveDocx?: (params: { filePath: string; html?: string; text?: string }) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }>
  readSpreadsheet?: (filePath: string) => Promise<{ success: boolean; sheetNames?: string[]; sheets?: Record<string, { data: (string | number | null)[][]; rowCount: number; colCount: number }>; fileName?: string; error?: string }>
  saveSpreadsheet?: (params: { filePath: string; sheets: Record<string, (string | number | null)[][]> }) => Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }>
  readPdf?: (params: string | { filePath: string; maxPages?: number }) => Promise<{
    success: boolean
    error?: string
    filePath?: string
    fileName?: string
    fileUrl?: string
    text?: string
    pageCount?: number
    pages?: { num: number; text: string }[]
    title?: string
    author?: string
    truncated?: boolean
  }>
  copyFilesToClipboard?: (paths: string[], isCut?: boolean) => Promise<{ success: boolean; count?: number; error?: string }>
  getClipboardFiles?: () => Promise<{ success: boolean; paths: string[]; error?: string }>
  startDragFile?: (filePath: string | string[]) => void
  onDragEnded?: (callback: () => void) => () => void

  onClipSelectionText?: (callback: (data: { source: 'book' | 'ai'; text: string }) => void) => () => void
  onAskAIWithText?: (callback: (data: { templateKey: string; text: string }) => void) => () => void
  onExtractCodeTrigger?: (callback: () => void) => () => void
  onExportTranscriptTrigger?: (callback: () => void) => () => void
  onNotification?: (callback: (msg: string) => void) => () => void
  showNotification?: (params: { title?: string; body: string; type?: 'info' | 'success' | 'warning' | 'error' } | string) => void

  // Workbench Action Model APIs
  reportActiveDirectory?: (params: { target?: 'book' | 'note'; currentPath: string; rootPath?: string }) => void
  executeAction?: (payload: any) => Promise<{ success: boolean; action?: string; message: string; createdPath?: string; error?: string; details?: any }>
  setActionMode?: (params: { enabled: boolean; customInstructions?: string; primeAI?: boolean }) => Promise<{ success: boolean; enabled: boolean; error?: string; alreadyPrimed?: boolean }>
  getChatPrimeStatus?: () => Promise<{ isPrimed: boolean }>
  onChatPrimeStatusChanged?: (callback: (data: { isPrimed: boolean }) => void) => () => void
  onActionModeChanged?: (callback: (data: { enabled: boolean }) => void) => () => void
  setAutoFeedbackLoop?: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>
  getAutoFeedbackLoop?: () => Promise<boolean>
  getActionPrompt?: (params?: { targetPane?: 'book' | 'note'; customInstructions?: string } | 'book' | 'note') => Promise<string>
  getWorkspaceFolders?: () => Promise<{ activeTarget: 'book' | 'note' | 'custom'; activeDirectory: string; bookDirectory: string; noteDirectory: string; customDirectory?: string }>
  setActionTarget?: (params: { target: 'book' | 'note' | 'custom'; customPath?: string }) => Promise<{ activeTarget: 'book' | 'note' | 'custom'; activeDirectory: string; bookDirectory: string; noteDirectory: string; customDirectory?: string }>
  browseDirectory?: () => Promise<string | null>
  scanAiActions?: () => Promise<{ success: boolean; executedCount: number; message: string; results?: any[] }>
  onExplorerRefreshNeeded?: (callback: (data: { target?: 'book' | 'note'; path?: string }) => void) => () => void
  onActionOpenTab?: (callback: (data: { filePath: string }) => void) => () => void
  onActiveDirectoryChanged?: (callback: (data: { target: 'book' | 'note'; currentPath: string; rootPath?: string }) => void) => () => void
  onActionTargetChanged?: (callback: (data: { activeTarget: 'book' | 'note' | 'custom'; activeDirectory: string; bookDirectory: string; noteDirectory: string; customDirectory?: string }) => void) => () => void
  onNavigateToFolder?: (callback: (data: { target: 'book' | 'note'; path: string }) => void) => () => void
}

export interface SystemRootItem {
  name: string
  path: string
  icon: 'documents' | 'downloads' | 'desktop' | 'home' | 'drive' | 'cloud'
}

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: string
  extension: string
}

export interface BookSource {
  id: string
  name: string
  url: string
  isPreset?: boolean
  isLocal?: boolean
}

export interface BookSourceSettings {
  sources: BookSource[]
  activeSourceId: string
}

export interface AISource {
  id: string
  name: string
  url: string
  isPreset?: boolean
}

export interface AISourceSettings {
  sources: AISource[]
  activeSourceId: string
}

export interface NoteSource {
  id: string
  name: string
  url: string
  isPreset?: boolean
  isLocal?: boolean
}

export interface NoteSourceSettings {
  sources: NoteSource[]
  activeSourceId: string
}

export interface SessionSettings {
  storeBookCredentials: boolean
  storeAICredentials: boolean
  storeNoteCredentials: boolean
}

export interface NotePage {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface NoteSection {
  id: string
  name: string
  color: string
  pages: NotePage[]
}

export interface NoteBook {
  id: string
  name: string
  sections: NoteSection[]
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}
