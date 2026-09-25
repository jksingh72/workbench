import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export interface NoteSource {
  id: string
  name: string
  url: string
  isPreset?: boolean
}

export interface NoteSourceSettings {
  sources: NoteSource[]
  activeSourceId: string
}

export const DEFAULT_NOTE_SOURCES: NoteSource[] = [
  {
    id: 'onenote',
    name: 'Microsoft OneNote',
    url: 'https://www.onenote.com/notebooks',
    isPreset: true,
  },
  {
    id: 'evernote',
    name: 'Evernote',
    url: 'https://www.evernote.com/client/web',
    isPreset: true,
  },
  {
    id: 'apple-notes',
    name: 'Apple Notes',
    url: 'https://www.icloud.com/notes',
    isPreset: true,
  },
  {
    id: 'keep',
    name: 'Google Keep',
    url: 'https://keep.google.com/',
    isPreset: true,
  },
]

export class NoteSourceManager {
  private configPath: string
  private data: NoteSourceSettings

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'workbench-note-sources.json')
    this.data = this.loadConfig()
  }

  private loadConfig(): NoteSourceSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          // Clean storage: retain only active allowed presets and valid custom non-preset sources
          const allowedPresetIds = new Set(DEFAULT_NOTE_SOURCES.map((p) => p.id))
          const validSources = parsed.sources.filter(
            (s: NoteSource) => allowedPresetIds.has(s.id) || !s.isPreset
          )

          // Ensure all presets exist
          const existingIds = new Set(validSources.map((s: NoteSource) => s.id))
          const mergedSources = [...validSources]
          for (const preset of DEFAULT_NOTE_SOURCES) {
            if (!existingIds.has(preset.id)) {
              mergedSources.push(preset)
            }
          }

          const activeSourceId =
            mergedSources.find((s) => s.id === parsed.activeSourceId)?.id || DEFAULT_NOTE_SOURCES[0].id

          const result: NoteSourceSettings = {
            sources: mergedSources,
            activeSourceId,
          }
          this.saveToFile(result)
          return result
        }
      }
    } catch (err) {
      console.error('[NoteSourceManager] Failed to read config, falling back to defaults:', err)
    }

    const initialSettings: NoteSourceSettings = {
      sources: [...DEFAULT_NOTE_SOURCES],
      activeSourceId: DEFAULT_NOTE_SOURCES[0].id,
    }
    this.saveToFile(initialSettings)
    return initialSettings
  }

  private saveToFile(settings: NoteSourceSettings) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('[NoteSourceManager] Failed to save config to file:', err)
    }
  }

  private saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[NoteSourceManager] Failed to save config:', err)
    }
  }

  public getData(): NoteSourceSettings {
    return {
      sources: [...this.data.sources],
      activeSourceId: this.data.activeSourceId,
    }
  }

  public getActiveSource(): NoteSource {
    const active = this.data.sources.find((s) => s.id === this.data.activeSourceId)
    return active || this.data.sources[0] || DEFAULT_NOTE_SOURCES[0]
  }

  public setActiveSource(id: string): NoteSource | null {
    const target = this.data.sources.find((s) => s.id === id)
    if (!target) return null

    this.data.activeSourceId = id
    this.saveConfig()
    return target
  }

  public saveSources(sources: NoteSource[], activeSourceId?: string): NoteSourceSettings {
    // Preserve presets
    const presetMap = new Map(DEFAULT_NOTE_SOURCES.map((p) => [p.id, p]))

    const validated: NoteSource[] = []
    const seenIds = new Set<string>()

    for (const s of sources) {
      if (!s.id || seenIds.has(s.id)) continue
      seenIds.add(s.id)

      if (presetMap.has(s.id)) {
        const preset = presetMap.get(s.id)!
        validated.push({
          ...preset,
          name: s.name?.trim() || preset.name,
          url: s.url?.trim() || preset.url,
        })
      } else {
        const cleanName = s.name?.trim() || 'Custom Note Site'
        let cleanUrl = s.url?.trim() || ''
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl
        }
        validated.push({
          id: s.id,
          name: cleanName,
          url: cleanUrl,
          isPreset: false,
        })
      }
    }

    // Ensure all presets are present
    for (const preset of DEFAULT_NOTE_SOURCES) {
      if (!seenIds.has(preset.id)) {
        validated.push(preset)
      }
    }

    const newActiveId =
      activeSourceId && validated.some((s) => s.id === activeSourceId)
        ? activeSourceId
        : validated.some((s) => s.id === this.data.activeSourceId)
          ? this.data.activeSourceId
          : validated[0].id

    this.data = {
      sources: validated,
      activeSourceId: newActiveId,
    }

    this.saveConfig()
    return this.getData()
  }
}
