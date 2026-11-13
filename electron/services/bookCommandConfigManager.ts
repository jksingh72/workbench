import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  BookCommandPromptConfigItem,
  BookCommandPromptOverrides,
  DEFAULT_PAGE_DESIGN_SETTINGS,
  getDefaultBookCommandCatalog,
  getEffectiveExplainPresets,
  getEffectiveSummaryPresets,
} from '../utils/bookCommandParser'

export class BookCommandConfigManager {
  private configPath: string
  private config: BookCommandPromptOverrides

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'workbench-book-commands.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): BookCommandPromptOverrides {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          return {
            overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
            customCommands: Array.isArray(parsed.customCommands) ? parsed.customCommands : [],
            pageDesign: {
              ...DEFAULT_PAGE_DESIGN_SETTINGS,
              ...(parsed.pageDesign && typeof parsed.pageDesign === 'object' ? parsed.pageDesign : {}),
            },
          }
        }
      }
    } catch (err) {
      console.error('[BookCommandConfigManager] Failed to load config, using defaults:', err)
    }
    return { overrides: {}, customCommands: [], pageDesign: { ...DEFAULT_PAGE_DESIGN_SETTINGS } }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      console.error('[BookCommandConfigManager] Failed to save config:', err)
    }
  }

  public getConfig(): BookCommandPromptOverrides {
    return this.config
  }

  public getFullState() {
    const defaults = getDefaultBookCommandCatalog()
    const items: BookCommandPromptConfigItem[] = defaults.map((d) => {
      const patch = this.config.overrides?.[d.key]
      if (!patch) return d
      return {
        ...d,
        label: patch.label ?? d.label,
        icon: patch.icon ?? d.icon,
        description: patch.description ?? d.description,
        promptDirective: patch.promptDirective ?? d.promptDirective,
        aliases: Array.isArray(patch.aliases) && patch.aliases.length > 0 ? patch.aliases : d.aliases,
      }
    })

    for (const c of this.config.customCommands || []) {
      const cmdPrefix =
        c.category === 'summarize'
          ? `/chapter summarize:${c.key}`
          : c.category === 'explain'
            ? `/chapter explain:${c.key}`
            : `/chapter ${c.key}`
      items.push({
        key: c.key,
        command: cmdPrefix,
        category: c.category || 'general',
        label: c.label,
        icon: c.icon || '✨',
        aliases: [c.key, `#${c.key}`],
        description: c.description || '',
        promptDirective: c.promptDirective,
        isBuiltIn: false,
      })
    }

    return {
      config: this.config,
      defaults,
      items,
      effectiveSummaryPresets: getEffectiveSummaryPresets(this.config),
      effectiveExplainPresets: getEffectiveExplainPresets(this.config),
    }
  }

  public saveConfig(nextConfig: BookCommandPromptOverrides) {
    this.config = {
      overrides: nextConfig?.overrides && typeof nextConfig.overrides === 'object' ? nextConfig.overrides : {},
      customCommands: Array.isArray(nextConfig?.customCommands) ? nextConfig.customCommands : [],
      pageDesign: {
        ...DEFAULT_PAGE_DESIGN_SETTINGS,
        ...(nextConfig?.pageDesign && typeof nextConfig.pageDesign === 'object' ? nextConfig.pageDesign : this.config.pageDesign || {}),
      },
    }
    this.persist()
    return this.getFullState()
  }

  public resetAll() {
    this.config = { overrides: {}, customCommands: [], pageDesign: { ...DEFAULT_PAGE_DESIGN_SETTINGS } }
    this.persist()
    return this.getFullState()
  }
}

