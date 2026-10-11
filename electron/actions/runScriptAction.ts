import { ActionDefinition, ActionContext, ActionResult } from './types'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const runScriptAction: ActionDefinition = {
  id: 'run_script',
  aliases: ['execute_script', 'script', 'eval_script', 'run_code'],
  description:
    'Executes a script (JavaScript/Node.js, PowerShell, or Python) locally in a single shot. Use this whenever a task requires multi-file inspection, searching & filtering data, batch operations, or sequential pipelines without needing multiple chat roundtrips.',
  parameters: {
    script: {
      type: 'string',
      required: true,
      description: 'The script code to execute. Can use Node.js standard libraries (fs, path, etc.) or PowerShell commands.',
    },
    language: {
      type: 'string',
      required: false,
      description: 'The scripting language: "javascript" (default), "powershell", or "python".',
      default: 'javascript',
    },
    cwd: {
      type: 'string',
      required: false,
      description: 'The working directory path. Defaults to the active workspace directory.',
    },
    timeoutMs: {
      type: 'number',
      required: false,
      description: 'Maximum execution time in milliseconds (default: 30000, max: 120000).',
      default: 30000,
    },
  },
  example: {
    action: 'run_script',
    language: 'javascript',
    script: `
const fs = require('fs');
const path = require('path');
const dir = '.';
const files = fs.readdirSync(dir);
const report = files.map(f => {
  const stat = fs.statSync(path.join(dir, f));
  return { name: f, isDir: stat.isDirectory(), sizeKB: Math.round(stat.size / 1024) };
});
console.log(JSON.stringify(report, null, 2));
    `.trim(),
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const rawScript = payload.script || payload.code || payload.params?.script || payload.params?.code
    if (!rawScript || typeof rawScript !== 'string' || !rawScript.trim()) {
      return {
        success: false,
        action: 'run_script',
        message: 'No script code provided to execute',
        error: 'Missing required "script" parameter',
      }
    }

    const script = rawScript.trim()
    const rawLang = (payload.language || payload.lang || 'javascript').toLowerCase().trim()
    let language = 'javascript'
    if (rawLang.includes('power') || rawLang === 'ps' || rawLang === 'ps1') {
      language = 'powershell'
    } else if (rawLang.includes('py')) {
      language = 'python'
    }

    const baseCwd = ctx.getActiveDirectory(targetPane as any) || process.cwd()
    const targetCwd = payload.cwd ? ctx.resolveSafePath(payload.cwd, targetPane as any) : baseCwd
    const requestedTimeout = typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0 ? payload.timeoutMs : 30000
    const timeoutMs = Math.min(requestedTimeout, 120000)

    console.log(`[run_script:START] Executing ${language} script (CWD: "${targetCwd}", timeout: ${timeoutMs}ms)`)
    const startTime = performance.now()

    // 1. JavaScript (Node.js CommonJS via node CLI)
    if (language === 'javascript') {
      const tempFileName = `.wb_script_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.cjs`
      const tempFilePath = path.join(os.tmpdir(), tempFileName)

      try {
        await fs.promises.writeFile(tempFilePath, script, 'utf-8')
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            `node "${tempFilePath}"`,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 20 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              if (err) {
                ;(err as any).stdout = stdout || ''
                ;(err as any).stderr = stderr || ''
                reject(err)
              } else {
                resolve({ stdout: stdout || '', stderr: stderr || '' })
              }
            }
          )
          setTimeout(() => {
            try {
              if (!child.killed) child.kill('SIGKILL')
            } catch (_) {}
          }, timeoutMs + 500)
        })

        const res = await execPromise
        const durationMs = Math.round(performance.now() - startTime)
        ctx.refreshExplorer(targetPane as any)

        const output = (res.stdout || '').trim() || (res.stderr || '').trim() || 'Script completed with no output'
        return {
          success: true,
          action: 'run_script',
          message: output,
          details: {
            stdout: res.stdout,
            stderr: res.stderr,
            language: 'javascript',
            executionTimeMs: durationMs,
          },
        }
      } catch (jsErr: any) {
        const durationMs = Math.round(performance.now() - startTime)
        let errMsg = jsErr.message || 'JavaScript execution failed'
        if (jsErr.killed || jsErr.signal === 'SIGKILL' || errMsg.includes('timed out')) {
          errMsg = `⏱️ JavaScript execution exceeded maximum timeout of ${timeoutMs}ms and was safely terminated.`
        }
        const combined = [errMsg, jsErr.stdout, jsErr.stderr].filter(Boolean).join('\n')
        return {
          success: false,
          action: 'run_script',
          message: combined,
          error: errMsg,
          details: {
            stdout: jsErr.stdout || '',
            stderr: jsErr.stderr || '',
            executionTimeMs: durationMs,
          },
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath)
        } catch (_) {}
      }
    }

    // 2. PowerShell (Windows) with safe execution in os.tmpdir()
    if (language === 'powershell') {
      const tempFileName = `.wb_script_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.ps1`
      const tempFilePath = path.join(os.tmpdir(), tempFileName)

      try {
        await fs.promises.writeFile(tempFilePath, script, 'utf-8')
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 20 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              if (err) {
                ;(err as any).stdout = stdout || ''
                ;(err as any).stderr = stderr || ''
                reject(err)
              } else {
                resolve({ stdout: stdout || '', stderr: stderr || '' })
              }
            }
          )
          setTimeout(() => {
            try {
              if (!child.killed) child.kill('SIGKILL')
            } catch (_) {}
          }, timeoutMs + 500)
        })

        const res = await execPromise
        const durationMs = Math.round(performance.now() - startTime)
        ctx.refreshExplorer(targetPane as any)

        const output = (res.stdout || '').trim() || (res.stderr || '').trim() || 'Script completed with no output'
        return {
          success: true,
          action: 'run_script',
          message: output,
          details: {
            stdout: res.stdout,
            stderr: res.stderr,
            language: 'powershell',
            executionTimeMs: durationMs,
          },
        }
      } catch (psErr: any) {
        const durationMs = Math.round(performance.now() - startTime)
        let errMsg = psErr.message || 'PowerShell execution failed'
        if (psErr.killed || psErr.signal === 'SIGKILL' || errMsg.includes('timed out')) {
          errMsg = `⏱️ PowerShell script execution exceeded maximum timeout of ${timeoutMs}ms and was safely terminated.`
        }
        const combined = [errMsg, psErr.stdout, psErr.stderr].filter(Boolean).join('\n')
        return {
          success: false,
          action: 'run_script',
          message: combined,
          error: errMsg,
          details: {
            stdout: psErr.stdout || '',
            stderr: psErr.stderr || '',
            executionTimeMs: durationMs,
          },
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath)
        } catch (_) {}
      }
    }

    // 3. Python with safe execution in os.tmpdir()
    if (language === 'python') {
      const tempFileName = `.wb_script_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.py`
      const tempFilePath = path.join(os.tmpdir(), tempFileName)

      try {
        await fs.promises.writeFile(tempFilePath, script, 'utf-8')
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            `python "${tempFilePath}"`,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 20 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              if (err) {
                ;(err as any).stdout = stdout || ''
                ;(err as any).stderr = stderr || ''
                reject(err)
              } else {
                resolve({ stdout: stdout || '', stderr: stderr || '' })
              }
            }
          )
          setTimeout(() => {
            try {
              if (!child.killed) child.kill('SIGKILL')
            } catch (_) {}
          }, timeoutMs + 500)
        })

        const res = await execPromise
        const durationMs = Math.round(performance.now() - startTime)
        ctx.refreshExplorer(targetPane as any)

        const output = (res.stdout || '').trim() || (res.stderr || '').trim() || 'Script completed with no output'
        return {
          success: true,
          action: 'run_script',
          message: output,
          details: {
            stdout: res.stdout,
            stderr: res.stderr,
            language: 'python',
            executionTimeMs: durationMs,
          },
        }
      } catch (pyErr: any) {
        const durationMs = Math.round(performance.now() - startTime)
        let errMsg = pyErr.message || 'Python execution failed'
        if (pyErr.killed || pyErr.signal === 'SIGKILL' || errMsg.includes('timed out')) {
          errMsg = `⏱️ Python script execution exceeded maximum timeout of ${timeoutMs}ms and was safely terminated.`
        }
        const combined = [errMsg, pyErr.stdout, pyErr.stderr].filter(Boolean).join('\n')
        return {
          success: false,
          action: 'run_script',
          message: combined,
          error: errMsg,
          details: {
            stdout: pyErr.stdout || '',
            stderr: pyErr.stderr || '',
            executionTimeMs: durationMs,
          },
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath)
        } catch (_) {}
      }
    }

    return {
      success: false,
      action: 'run_script',
      message: `Unsupported language "${language}"`,
      error: `Unsupported language "${language}"`,
    }
  },
}
