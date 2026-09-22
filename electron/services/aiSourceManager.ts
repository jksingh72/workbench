import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

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

export const DEFAULT_AI_SOURCES: AISource[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    isPreset: true,
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    url: 'https://claude.ai/',
    isPreset: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    url: 'https://gemini.google.com/',
    isPreset: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai/',
    isPreset: true,
  },
]

export class AISourceManager {
  private configPath: string
  private data: AISourceSettings

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'workbench-ai-sources.json')
    this.data = this.loadConfig()
  }

  private loadConfig(): AISourceSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          // Ensure presets exist
          const existingIds = new Set(parsed.sources.map((s: AISource) => s.id))
          const mergedSources = [...parsed.sources]
          for (const preset of DEFAULT_AI_SOURCES) {
            if (!existingIds.has(preset.id)) {
              mergedSources.push(preset)
            }
          }

          const activeSourceId =
            mergedSources.find((s) => s.id === parsed.activeSourceId)?.id || mergedSources[0].id

          return {
            sources: mergedSources,
            activeSourceId,
          }
        }
      }
    } catch (err) {
      console.error('[AISourceManager] Failed to read config, falling back to defaults:', err)
    }

    return {
      sources: [...DEFAULT_AI_SOURCES],
      activeSourceId: DEFAULT_AI_SOURCES[0].id,
    }
  }

  private saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[AISourceManager] Failed to save config:', err)
    }
  }

  public getData(): AISourceSettings {
    return {
      sources: [...this.data.sources],
      activeSourceId: this.data.activeSourceId,
    }
  }

  public getActiveSource(): AISource {
    const active = this.data.sources.find((s) => s.id === this.data.activeSourceId)
    return active || this.data.sources[0] || DEFAULT_AI_SOURCES[0]
  }

  public setActiveSource(id: string): AISource | null {
    const target = this.data.sources.find((s) => s.id === id)
    if (!target) return null

    this.data.activeSourceId = id
    this.saveConfig()
    return target
  }

  public saveSources(sources: AISource[], activeSourceId?: string): AISourceSettings {
    const presetMap = new Map(DEFAULT_AI_SOURCES.map((p) => [p.id, p]))

    const validated: AISource[] = []
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
        const cleanName = s.name?.trim() || 'Custom AI Site'
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

    // Ensure all presets exist
    for (const preset of DEFAULT_AI_SOURCES) {
      if (!seenIds.has(preset.id)) {
        validated.push(preset)
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
