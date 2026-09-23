import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  updateBounds: (bounds: any) => ipcRenderer.send('workbench:update-bounds', bounds),
  setSplit: (params: { ratio: number; isSwapped: boolean }) => ipcRenderer.send('workbench:set-split', params),
  showAskAIMenu: () => ipcRenderer.send('workbench:show-ask-ai-menu'),
  navAction: (action: any) => ipcRenderer.send('workbench:nav-action', action),
  askAI: (options: any) => ipcRenderer.invoke('workbench:ask-ai', options),
  onNavStateChange: (callback: (target: 'book' | 'ai' | 'note', state: any) => void) => {
    const listener = (_: any, target: 'book' | 'ai' | 'note', state: any) => {
      callback(target, state)
    }
    ipcRenderer.on('workbench:nav-state', listener)
    return () => {
      ipcRenderer.removeListener('workbench:nav-state', listener)
    }
  },
  onAskAIResult: (callback: (result: any) => void) => {
    const listener = (_: any, result: any) => {
      callback(result)
    }
    ipcRenderer.on('workbench:ask-ai-result', listener)
    return () => {
      ipcRenderer.removeListener('workbench:ask-ai-result', listener)
    }
  },
  openExternal: (url: string) => ipcRenderer.send('workbench:open-external', url),
  clearSession: (target: 'book' | 'ai' | 'note', scope?: string) =>
    ipcRenderer.invoke('workbench:clear-session', target, scope),
  getSessionSettings: () => ipcRenderer.invoke('workbench:get-session-settings'),
  updateSessionSettings: (settings: any) => ipcRenderer.invoke('workbench:update-session-settings', settings),
  setViewsVisible: (params: boolean | { target?: 'book' | 'ai' | 'note' | 'all'; visible: boolean }) =>
    ipcRenderer.send('workbench:set-views-visible', params),
  setVerticalSplit: (params: { ratio: number }) => ipcRenderer.send('workbench:set-vertical-split', params),
  loadNotes: () => ipcRenderer.invoke('workbench:load-notes'),
  saveNotes: (notebooks: any) => ipcRenderer.invoke('workbench:save-notes', notebooks),
  clipSelection: () => ipcRenderer.invoke('workbench:clip-selection'),
  getBookSources: () => ipcRenderer.invoke('workbench:get-book-sources'),
  setActiveBookSource: (sourceId: string) => ipcRenderer.invoke('workbench:set-active-book-source', sourceId),
  saveBookSources: (params: { sources: any[]; activeSourceId?: string }) =>
    ipcRenderer.invoke('workbench:save-book-sources', params),
  showBookSourceMenu: () => ipcRenderer.send('workbench:show-book-source-menu'),
  onBookSourceChanged: (callback: (data: { activeSourceId: string; activeSource: any }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('workbench:book-source-changed', listener)
    return () => {
      ipcRenderer.removeListener('workbench:book-source-changed', listener)
    }
  },
  onOpenBookSourceModal: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:open-book-source-modal', listener)
    return () => {
      ipcRenderer.removeListener('workbench:open-book-source-modal', listener)
    }
  },
  getAISources: () => ipcRenderer.invoke('workbench:get-ai-sources'),
  setActiveAISource: (sourceId: string) => ipcRenderer.invoke('workbench:set-active-ai-source', sourceId),
  saveAISources: (params: { sources: any[]; activeSourceId?: string }) =>
    ipcRenderer.invoke('workbench:save-ai-sources', params),
  showAISourceMenu: () => ipcRenderer.send('workbench:show-ai-source-menu'),
  onAISourceChanged: (callback: (data: { activeSourceId: string; activeSource: any }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('workbench:ai-source-changed', listener)
    return () => {
      ipcRenderer.removeListener('workbench:ai-source-changed', listener)
    }
  },
  onOpenAISourceModal: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:open-ai-source-modal', listener)
    return () => {
      ipcRenderer.removeListener('workbench:open-ai-source-modal', listener)
    }
  },
  getNoteSources: () => ipcRenderer.invoke('workbench:get-note-sources'),
  setActiveNoteSource: (sourceId: string) => ipcRenderer.invoke('workbench:set-active-note-source', sourceId),
  saveNoteSources: (params: { sources: any[]; activeSourceId?: string }) =>
    ipcRenderer.invoke('workbench:save-note-sources', params),
  showNoteSourceMenu: () => ipcRenderer.send('workbench:show-note-source-menu'),
  onNoteSourceChanged: (callback: (data: { activeSourceId: string; activeSource: any }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('workbench:note-source-changed', listener)
    return () => {
      ipcRenderer.removeListener('workbench:note-source-changed', listener)
    }
  },
  onOpenNoteSourceModal: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:open-note-source-modal', listener)
    return () => {
      ipcRenderer.removeListener('workbench:open-note-source-modal', listener)
    }
  },
})
