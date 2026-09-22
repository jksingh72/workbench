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
  updateBounds: (bounds: { book: Bounds; ai: Bounds }) => void
  setSplit: (params: { ratio: number; isSwapped: boolean }) => void
  showAskAIMenu: () => void
  navAction: (action: {
    target: 'book' | 'ai'
    command: 'back' | 'forward' | 'reload' | 'home' | 'zoom-in' | 'zoom-out' | 'zoom-reset'
    url?: string
  }) => void
  askAI: (options: {
    templateKey: 'explain' | 'summarize' | 'code' | 'quiz' | 'raw' | 'custom'
    customPrompt?: string
  }) => Promise<AskAIResult>
  onNavStateChange: (
    callback: (target: 'book' | 'ai', state: Partial<NavState>) => void
  ) => () => void
  onAskAIResult: (callback: (result: AskAIResult) => void) => () => void
  openExternal: (url: string) => void
  clearSession: (target: 'book' | 'ai' | 'note') => Promise<{ success: boolean; error?: string }>
  getSessionSettings: () => Promise<SessionSettings>
  updateSessionSettings: (settings: Partial<SessionSettings>) => Promise<{ success: boolean; settings: SessionSettings }>
  setViewsVisible: (params: boolean | { target?: 'book' | 'ai' | 'all'; visible: boolean }) => void
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
    electron: ElectronAPI
  }
}
