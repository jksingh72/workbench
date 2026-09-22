import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export class NoteViewHandler {
  private notesPath: string

  constructor() {
    this.notesPath = path.join(app.getPath('userData'), 'workbench-notes.json')
  }

  public getNotesPath(): string {
    return this.notesPath
  }

  public loadNotes(storeEnabled: boolean): any[] {
    try {
      if (!storeEnabled) {
        if (fs.existsSync(this.notesPath)) {
          try { fs.unlinkSync(this.notesPath) } catch (_) {}
        }
        return []
      }
      if (fs.existsSync(this.notesPath)) {
        return JSON.parse(fs.readFileSync(this.notesPath, 'utf-8'))
      }
    } catch (err) {
      console.error('[NoteView] Error loading notes:', err)
    }
    return []
  }

  public saveNotes(notes: any[], storeEnabled: boolean): { success: boolean; error?: string } {
    try {
      if (!storeEnabled) {
        return { success: true }
      }
      fs.writeFileSync(this.notesPath, JSON.stringify(notes, null, 2), 'utf-8')
      return { success: true }
    } catch (err: any) {
      console.error('[NoteView] Error saving notes:', err)
      return { success: false, error: err.message }
    }
  }

  public async clipSelection(extractSelection: () => Promise<string>): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const text = await extractSelection()
      if (!text) {
        return { success: false, error: 'No text highlighted in Bookview' }
      }
      return { success: true, text }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to extract text' }
    }
  }

  public async clearSession(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[NoteView] Isolated delete login: Deleting saved OneNote notes and local session data...')
      if (fs.existsSync(this.notesPath)) {
        try {
          fs.unlinkSync(this.notesPath)
        } catch (_) {}
      }
      return { success: true }
    } catch (err: any) {
      console.error('[NoteView] Clear session error:', err)
      return { success: false, error: err.message || 'Failed to clear OneNote notes' }
    }
  }
}
