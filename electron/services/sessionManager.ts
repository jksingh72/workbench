import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { BookViewHandler } from '../views/bookViewHandler'
import { AIViewHandler } from '../views/aiViewHandler'
import { NoteViewHandler } from '../views/noteViewHandler'

export interface SessionSettings {
  storeBookCredentials: boolean
  storeAICredentials: boolean
  storeNoteCredentials: boolean
}

export class SessionManager {
  private settingsPath: string
  private settings: SessionSettings
  private bookHandler: BookViewHandler
  private aiHandler: AIViewHandler
  private noteHandler: NoteViewHandler

  constructor(
    bookHandler: BookViewHandler,
    aiHandler: AIViewHandler,
    noteHandler: NoteViewHandler
  ) {
    this.bookHandler = bookHandler
    this.aiHandler = aiHandler
    this.noteHandler = noteHandler
    this.settingsPath = path.join(app.getPath('userData'), 'workbench-settings.json')
    this.settings = this.loadSettings()
  }

  private loadSettings(): SessionSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))
        return {
          storeBookCredentials: typeof data.storeBookCredentials === 'boolean' ? data.storeBookCredentials : true,
          storeAICredentials: typeof data.storeAICredentials === 'boolean' ? data.storeAICredentials : true,
          storeNoteCredentials: typeof data.storeNoteCredentials === 'boolean' ? data.storeNoteCredentials : true,
        }
      }
    } catch (err) {
      console.error('[SessionManager] Failed to load session settings:', err)
    }
    return { storeBookCredentials: true, storeAICredentials: true, storeNoteCredentials: true }
  }

  private saveSettings() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SessionManager] Failed to save session settings:', err)
    }
  }

  public getSettings(): SessionSettings {
    return { ...this.settings }
  }

  public updateSettings(updates: Partial<SessionSettings>): SessionSettings {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
    console.log('[SessionManager] Updated session settings:', this.settings)
    return { ...this.settings }
  }

  public async clearSession(
    target: 'book' | 'ai' | 'note',
    scope: string = 'current'
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`[SessionManager] Routing isolated clearSession to: ${target}, scope: ${scope}`)
    switch (target) {
      case 'book':
        return await this.bookHandler.clearSession(scope)
      case 'ai':
        return await this.aiHandler.clearSession(scope)
      case 'note':
        return await this.noteHandler.clearSession(scope)
      default:
        return { success: false, error: `Unknown session target: ${target}` }
    }
  }
}
