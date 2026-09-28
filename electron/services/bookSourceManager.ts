import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

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

export const DEFAULT_BOOK_SOURCES: BookSource[] = [
  {
    id: 'oreilly',
    name: "O'Reilly Learning",
    url: 'https://learning.oreilly.com/home/',
    isPreset: true,
  },
  {
    id: 'kindle',
    name: 'Amazon Kindle',
    url: 'https://read.amazon.com/',
    isPreset: true,
  },
  {
    id: 'local-books',
    name: 'Local Books',
    url: '',
    isPreset: true,
    isLocal: true,
  },
]

export class BookSourceManager {
  private configPath: string
  private data: BookSourceSettings

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'workbench-book-sources.json')
    this.data = this.loadConfig()
  }

  private loadConfig(): BookSourceSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          // Ensure presets exist
          const existingIds = new Set(parsed.sources.map((s: BookSource) => s.id))
          const mergedSources = [...parsed.sources]
          let needsSave = false

          for (const preset of DEFAULT_BOOK_SOURCES) {
            if (!existingIds.has(preset.id)) {
              mergedSources.push({
                ...preset,
                url: preset.id === 'local-books' ? app.getPath('documents') : preset.url,
              })
              needsSave = true
            }
          }

          // Auto-migrate legacy O'Reilly URLs and ensure local-books is preset & named 'Local Books'
          for (const s of mergedSources) {
            if (s.id === 'oreilly' && (s.url.includes('oreilly.com/member/login') || s.url.startsWith('http://'))) {
              s.url = 'https://learning.oreilly.com/home/'
              needsSave = true
            }
            if (s.id === 'local-books') {
              if (s.name !== 'Local Books') {
                s.name = 'Local Books'
                needsSave = true
              }
              if (!s.isPreset) {
                s.isPreset = true
                needsSave = true
              }
              if (!s.isLocal) {
                s.isLocal = true
                needsSave = true
              }
              if (!s.url || !fs.existsSync(s.url)) {
                s.url = app.getPath('documents')
                needsSave = true
              }
            }
          }

          const activeSourceId =
            mergedSources.find((s) => s.id === parsed.activeSourceId)?.id || mergedSources[0].id

          const result: BookSourceSettings = {
            sources: mergedSources,
            activeSourceId,
          }

          this.data = result
          if (needsSave) {
            this.saveConfig()
          }

          return result
        }
      }
    } catch (err) {
      console.error('[BookSourceManager] Failed to read config, falling back to defaults:', err)
    }

    const defaultSettings: BookSourceSettings = {
      sources: DEFAULT_BOOK_SOURCES.map((p) =>
        p.id === 'local-books' ? { ...p, url: app.getPath('documents') } : { ...p }
      ),
      activeSourceId: DEFAULT_BOOK_SOURCES[0].id,
    }
    this.data = defaultSettings
    this.saveConfig()
    return defaultSettings
  }

  private saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[BookSourceManager] Failed to save config:', err)
    }
  }

  public getData(): BookSourceSettings {
    return {
      sources: [...this.data.sources],
      activeSourceId: this.data.activeSourceId,
    }
  }

  public getActiveSource(): BookSource {
    const active = this.data.sources.find((s) => s.id === this.data.activeSourceId)
    return active || this.data.sources[0] || DEFAULT_BOOK_SOURCES[0]
  }

  public setActiveSource(id: string): BookSource | null {
    const target = this.data.sources.find((s) => s.id === id)
    if (!target) return null

    this.data.activeSourceId = id
    this.saveConfig()
    return target
  }

  public saveSources(sources: BookSource[], activeSourceId?: string): BookSourceSettings {
    // Preserve presets
    const presetMap = new Map(DEFAULT_BOOK_SOURCES.map((p) => [p.id, p]))

    const validated: BookSource[] = []
    const seenIds = new Set<string>()

    for (const s of sources) {
      if (!s.id || seenIds.has(s.id)) continue
      seenIds.add(s.id)

      if (presetMap.has(s.id)) {
        const preset = presetMap.get(s.id)!
        validated.push({
          ...preset,
          name: preset.id === 'local-books' ? 'Local Books' : (s.name?.trim() || preset.name),
          url: s.url?.trim() || preset.url || (preset.id === 'local-books' ? app.getPath('documents') : ''),
          isLocal: preset.isLocal || s.isLocal,
          isPreset: true,
        })
      } else {
        const cleanName = s.name?.trim() || 'Custom Book Site'
        let cleanUrl = s.url?.trim() || ''
        const isLocal = !!s.isLocal || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))
        if (!isLocal && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl
        }
        validated.push({
          id: s.id,
          name: cleanName,
          url: cleanUrl,
          isPreset: false,
          isLocal,
        })
      }
    }

    // Ensure all presets are present
    for (const preset of DEFAULT_BOOK_SOURCES) {
      if (!seenIds.has(preset.id)) {
        validated.push({
          ...preset,
          url: preset.id === 'local-books' ? app.getPath('documents') : preset.url,
        })
      }
    }

    const newActiveId =
      (activeSourceId && validated.some((s) => s.id === activeSourceId)
        ? activeSourceId
        : validated.some((s) => s.id === this.data.activeSourceId)
          ? this.data.activeSourceId
          : validated[0].id)

    this.data = {
      sources: validated,
      activeSourceId: newActiveId,
    }

    this.saveConfig()
    return this.getData()
  }
}
