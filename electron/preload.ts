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
  setViewsDragging: (isDragging: boolean) =>
    ipcRenderer.send('workbench:set-views-dragging', isDragging),
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

  // Local File Explorer API
  selectFolder: (defaultPath?: string) =>
    ipcRenderer.invoke('workbench:select-folder', defaultPath),
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('workbench:read-directory', dirPath),
  openPath: (filePath: string) =>
    ipcRenderer.invoke('workbench:open-path', filePath),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.send('workbench:show-item-in-folder', filePath),
  createFile: (parentPath: string, fileName: string, content?: string) =>
    ipcRenderer.invoke('workbench:create-file', { parentPath, fileName, content }),
  createFolder: (parentPath: string, folderName: string) =>
    ipcRenderer.invoke('workbench:create-folder', { parentPath, folderName }),
  renameItem: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('workbench:rename-item', { oldPath, newPath }),
  deleteItem: (itemPath: string) =>
    ipcRenderer.invoke('workbench:delete-item', itemPath),
  copyItem: (srcPath: string, destDir: string) =>
    ipcRenderer.invoke('workbench:copy-item', { srcPath, destDir }),
  moveItem: (srcPath: string, destDir: string) =>
    ipcRenderer.invoke('workbench:move-item', { srcPath, destDir }),
  getSystemRoots: () =>
    ipcRenderer.invoke('workbench:get-system-roots'),

  // Cross-Pane Movement & Transfer APIs
  sendFileToAI: (filePath: string, instruction?: string) =>
    ipcRenderer.invoke('workbench:send-file-to-ai', { filePath, instruction }),
  sendTextToAI: (params: { text: string; templateKey?: string; customPrompt?: string }) =>
    ipcRenderer.invoke('workbench:send-text-to-ai', params),
  extractSelection: (target: 'book' | 'ai' | 'note' = 'book') =>
    ipcRenderer.invoke('workbench:extract-selection', target),
  extractLastResponse: () =>
    ipcRenderer.invoke('workbench:extract-last-response'),
  extractAICodeBlocks: () =>
    ipcRenderer.invoke('workbench:extract-ai-code-blocks'),
  extractAITranscript: () =>
    ipcRenderer.invoke('workbench:extract-ai-transcript'),
  saveAIContent: (params: { type?: 'response' | 'code' | 'transcript'; targetDir?: string; activeFilePath?: string }) =>
    ipcRenderer.invoke('workbench:save-ai-content', params),
  readFileContent: (filePath: string) =>
    ipcRenderer.invoke('workbench:read-file-content', filePath),
  writeFileContent: (filePath: string, content: string) =>
    ipcRenderer.invoke('workbench:write-file-content', { filePath, content }),
  appendToFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('workbench:append-to-file', { filePath, content }),
  readDocx: (filePath: string) =>
    ipcRenderer.invoke('workbench:read-docx', filePath),
  saveDocx: (params: { filePath: string; html?: string; text?: string }) =>
    ipcRenderer.invoke('workbench:save-docx', params),
  readSpreadsheet: (filePath: string) =>
    ipcRenderer.invoke('workbench:read-spreadsheet', filePath),
  saveSpreadsheet: (params: { filePath: string; sheets: Record<string, (string | number | null)[][]> }) =>
    ipcRenderer.invoke('workbench:save-spreadsheet', params),
  readPdf: (params: string | { filePath: string; maxPages?: number }) =>
    ipcRenderer.invoke('workbench:read-pdf', params),
  copyFilesToClipboard: (paths: string[], isCut?: boolean) =>
    ipcRenderer.invoke('workbench:copy-files-to-clipboard', { paths, isCut }),

  startDragFile: (filePath: string | string[]) =>
    ipcRenderer.send('workbench:start-drag-file', filePath),
  onDragEnded: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:drag-ended', listener)
    return () => {
      ipcRenderer.removeListener('workbench:drag-ended', listener)
    }
  },

  // Cross-Pane Event Listeners (from context-menu and keyboard shortcuts)
  onClipSelectionText: (callback: (data: { source: 'book' | 'ai'; text: string }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('workbench:clip-selection-text', listener)
    return () => {
      ipcRenderer.removeListener('workbench:clip-selection-text', listener)
    }
  },
  onAskAIWithText: (callback: (data: { templateKey: string; text: string }) => void) => {
    const listener = (_: any, data: any) => callback(data)
    ipcRenderer.on('workbench:ask-ai-with-text', listener)
    return () => {
      ipcRenderer.removeListener('workbench:ask-ai-with-text', listener)
    }
  },
  onExtractCodeTrigger: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:extract-code-trigger', listener)
    return () => {
      ipcRenderer.removeListener('workbench:extract-code-trigger', listener)
    }
  },
  onExportTranscriptTrigger: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('workbench:export-transcript-trigger', listener)
    return () => {
      ipcRenderer.removeListener('workbench:export-transcript-trigger', listener)
    }
  },
  onNotification: (callback: (msg: string) => void) => {
    const listener = (_: any, msg: string) => callback(msg)
    ipcRenderer.on('workbench:notify', listener)
    return () => {
      ipcRenderer.removeListener('workbench:notify', listener)
    }
  },
})
