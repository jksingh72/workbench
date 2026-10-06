import { ActionDefinition, ActionContext, ActionResult } from './types'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'

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
      description: 'Maximum execution time in milliseconds (default: 30000).',
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
    // Hard cap timeout at 10 seconds, default 5 seconds to prevent UI hangs
    const requestedTimeout = typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0 ? payload.timeoutMs : 5000
    const timeoutMs = Math.min(requestedTimeout, 10000)

    console.log(`[run_script:START] Executing ${language} script (CWD: "${targetCwd}", timeout: ${timeoutMs}ms)`)
    const startTime = performance.now()

    // 1. JavaScript: Execute directly in-process via Node vm sandbox with hard Promise.race timeout
    if (language === 'javascript') {
      try {
        const logs: string[] = []
        const customConsole = {
          log: (...args: any[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
          info: (...args: any[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')),
        }

        const sandbox: Record<string, any> = {
          require: (mod: string) => {
            return require(mod)
          },
          fs,
          path,
          os,
          console: customConsole,
          process: {
            ...process,
            cwd: () => targetCwd,
          },
          Buffer,
          __dirname: targetCwd,
          __filename: path.join(targetCwd, 'script.js'),
        }

        vm.createContext(sandbox)
        const scriptWrapped = `(async () => {\n${script}\n})()`

        // Evaluate the async wrapper
        const evalPromise = Promise.resolve(vm.runInContext(scriptWrapped, sandbox, { timeout: timeoutMs }))

        // Hard timeout promise to guarantee async unresolving promises never hang Electron
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Script execution exceeded maximum timeout of ${timeoutMs}ms`)), timeoutMs)
        )

        const evalResult = await Promise.race([evalPromise, timeoutPromise])
        const durationMs = Math.round(performance.now() - startTime)
        ctx.refreshExplorer(targetPane as any)

        let finalOutput = logs.join('\n').trim()
        if (!finalOutput && evalResult !== undefined) {
          finalOutput = typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult)
        }
        if (!finalOutput) finalOutput = 'Script executed successfully with no output'

        return {
          success: true,
          action: 'run_script',
          message: finalOutput,
          details: {
            stdout: finalOutput,
            language: 'javascript (in-process)',
            executionTimeMs: durationMs,
          },
        }
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - startTime)
        console.error(`[run_script:ERROR] In-process execution failed after ${durationMs}ms:`, err.message)
        return {
          success: false,
          action: 'run_script',
          message: `Script execution failed: ${err.message}`,
          error: err.message,
          details: {
            stack: err.stack,
            executionTimeMs: durationMs,
          },
        }
      }
    }

    // 2. PowerShell (Windows) with strict timeout and clean failure
    if (language === 'powershell') {
      const tempFileName = `.wb_script_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.ps1`
      const tempFilePath = path.join(os.tmpdir(), tempFileName)

      try {
        fs.writeFileSync(tempFilePath, script, 'utf-8')
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 10 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              if (err) reject(err)
              else resolve({ stdout: stdout || '', stderr: stderr || '' })
            }
          )
          // Ensure child is killed if timeout fires
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
        return {
          success: false,
          action: 'run_script',
          message: `PowerShell script execution failed: ${psErr.message}`,
          error: psErr.message,
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
        } catch (_) {}
      }
    }

    // 3. Python with strict timeout and clean failure
    if (language === 'python') {
      const tempFileName = `.wb_script_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.py`
      const tempFilePath = path.join(os.tmpdir(), tempFileName)

      try {
        fs.writeFileSync(tempFilePath, script, 'utf-8')
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          const child = exec(
            `python "${tempFilePath}"`,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 10 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
              if (err) reject(err)
              else resolve({ stdout: stdout || '', stderr: stderr || '' })
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
        return {
          success: false,
          action: 'run_script',
          message: `Python script execution failed: ${pyErr.message}`,
          error: pyErr.message,
        }
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
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
