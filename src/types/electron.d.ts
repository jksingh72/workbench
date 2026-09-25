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
