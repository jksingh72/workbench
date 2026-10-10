import { app, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export class Logger {
  private static logFilePath: string = ''
  private static logsDir: string = ''
  private static maxLogSizeBytes = 5 * 1024 * 1024 // 5 MB rotation cap

  private static init(): void {
    if (this.logFilePath) return
    try {
      const userData = app.getPath('userData')
      this.logsDir = path.join(userData, 'logs')
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true })
      }
      this.logFilePath = path.join(this.logsDir, 'error.log')
    } catch (err) {
      console.error('[Logger] Failed to initialize log directory:', err)
    }
  }

  public static getLogPath(): string {
    this.init()
    return this.logFilePath
  }

  public static async openLogFile(): Promise<boolean> {
    this.init()
    try {
      if (!fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, `=== Workbench Error Log Initialized ===\nCreated: ${new Date().toISOString()}\n\n`, 'utf-8')
      }
      const err = await shell.openPath(this.logFilePath)
      if (err) {
        console.error('[Logger] Failed to open log file in external editor:', err)
        return false
      }
      return true
    } catch (e) {
      console.error('[Logger] Exception opening log file:', e)
      return false
    }
  }

  private static appendEntry(level: 'ERROR' | 'WARN' | 'INFO', moduleTag: string, message: string, details?: any): void {
    this.init()
    if (!this.logFilePath) return

    try {
      // Rotate if log file exceeds 5MB
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath)
        if (stats.size > this.maxLogSizeBytes) {
          const oldLog = path.join(this.logsDir, `error-${Date.now()}.old.log`)
          fs.renameSync(this.logFilePath, oldLog)
        }
      }

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
      let line = `[${timestamp}] [${level}] [${moduleTag}] ${message}`
      if (details) {
        if (details instanceof Error) {
          line += `\n  Stack: ${details.stack || details.message}`
        } else if (typeof details === 'object') {
          try {
            line += `\n  Details: ${JSON.stringify(details)}`
          } catch (_) {
            line += `\n  Details: ${String(details)}`
          }
        } else {
          line += `\n  Details: ${details}`
        }
      }
      line += '\n'

      fs.appendFileSync(this.logFilePath, line, 'utf-8')
    } catch (err) {
      console.error('[Logger] Failed to append to log file:', err)
    }
  }

  public static error(moduleTag: string, message: string, details?: any): void {
    console.error(`[${moduleTag}:ERROR]`, message, details || '')
    this.appendEntry('ERROR', moduleTag, message, details)
  }

  public static warn(moduleTag: string, message: string, details?: any): void {
    console.warn(`[${moduleTag}:WARN]`, message, details || '')
    this.appendEntry('WARN', moduleTag, message, details)
  }

  public static info(moduleTag: string, message: string, details?: any): void {
    console.log(`[${moduleTag}:INFO]`, message)
    this.appendEntry('INFO', moduleTag, message, details)
  }
}
