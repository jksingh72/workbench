import { spawn, execFile, ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { UV_INTROSPECT_SCRIPT } from './uvIntrospectScript'

export interface UvEnvInfo {
  id: string
  name: string
  path: string
  pythonVersion: string
  createdDate: string
  installedPackages: string[]
}

export interface PackageAnalysisReport {
  package: string
  metadata: {
    name: string
    version: string
    summary: string
    author: string
    license: string
    homepage: string
    dependencies: string[]
  }
  modules: Array<{ name: string; isPackage: boolean }>
  classes: Array<{
    name: string
    module: string
    docstring: string
    bases: string[]
    methods: Array<{
      name: string
      signature: string
      docstring: string
      parameters: Array<{ name: string; kind: string; annotation: string; default: string }>
      returnType: string
    }>
  }>
  functions: Array<{
    name: string
    module: string
    signature: string
    docstring: string
    parameters: Array<{ name: string; kind: string; annotation: string; default: string }>
    returnType: string
  }>
  constants: Array<{ name: string; type: string; value: string }>
  error?: string
}

export interface UvStreamMessage {
  streamId: string
  streamType: 'stdout' | 'stderr' | 'exit' | 'status'
  chunk: string
  exitCode?: number
}

export type UvStreamListener = (msg: UvStreamMessage) => void

export class UvPythonService {
  private static instance: UvPythonService | null = null
  private uvPath: string | null = null
  private uvVersion: string | null = null
  private activeProcesses = new Map<string, ChildProcess>()
  private streamListeners: UvStreamListener[] = []

  private constructor() {}

  public static getInstance(): UvPythonService {
    if (!UvPythonService.instance) {
      UvPythonService.instance = new UvPythonService()
    }
    return UvPythonService.instance
  }

  public getDetectedVersion(): string | null {
    return this.uvVersion
  }


  public addStreamListener(listener: UvStreamListener): () => void {
    this.streamListeners.push(listener)
    return () => {
      this.streamListeners = this.streamListeners.filter((l) => l !== listener)
    }
  }

  private emitStream(streamId: string, streamType: 'stdout' | 'stderr' | 'exit' | 'status', chunk: string, exitCode?: number) {
    const msg: UvStreamMessage = { streamId, streamType, chunk, exitCode }
    for (const listener of this.streamListeners) {
      try {
        listener(msg)
      } catch (_) {}
    }
  }

  public getStorageDirectory(): string {
    let baseDir = ''
    try {
      const req = createRequire(import.meta.url)
      const electron = req('electron')
      if (electron?.app?.getPath) {
        baseDir = electron.app.getPath('userData')
      }
    } catch (_) {}

    if (!baseDir) {
      const home = os.homedir()
      if (process.platform === 'win32') {
        baseDir = process.env.APPDATA
          ? path.join(process.env.APPDATA, 'workbench')
          : path.join(home, 'AppData', 'Roaming', 'workbench')
      } else if (process.platform === 'darwin') {
        baseDir = path.join(home, 'Library', 'Application Support', 'workbench')
      } else {
        baseDir = path.join(home, '.config', 'workbench')
      }
    }

    const envsDir = path.join(baseDir, 'uv_envs')
    if (!fs.existsSync(envsDir)) {
      fs.mkdirSync(envsDir, { recursive: true })
    }
    return envsDir
  }


  private getMetadataFilePath(): string {
    return path.join(this.getStorageDirectory(), 'workbench-uv-envs.json')
  }

  public async detectUv(): Promise<{ available: boolean; version?: string; path?: string; managedPythons?: string[] }> {
    const isWindows = process.platform === 'win32'
    const candidatePaths: string[] = []

    // 1. PATH lookup
    candidatePaths.push(isWindows ? 'uv.exe' : 'uv')

    // 2. User home common install locations
    const home = os.homedir()
    if (isWindows) {
      candidatePaths.push(path.join(home, '.local', 'bin', 'uv.exe'))
      candidatePaths.push(path.join(home, 'AppData', 'Local', 'uv', 'bin', 'uv.exe'))
      candidatePaths.push(path.join(home, 'AppData', 'Roaming', 'uv', 'bin', 'uv.exe'))
      if (process.env.LOCALAPPDATA) {
        candidatePaths.push(path.join(process.env.LOCALAPPDATA, 'uv', 'bin', 'uv.exe'))
      }
    } else {
      candidatePaths.push(path.join(home, '.local', 'bin', 'uv'))
      candidatePaths.push(path.join(home, '.cargo', 'bin', 'uv'))
      candidatePaths.push('/usr/local/bin/uv')
      candidatePaths.push('/opt/homebrew/bin/uv')
    }

    for (const candidate of candidatePaths) {
      try {
        const ver = await new Promise<string>((resolve, reject) => {
          execFile(candidate, ['--version'], { timeout: 4000 }, (err, stdout) => {
            if (err) reject(err)
            else resolve(stdout ? stdout.trim() : '')
          })
        })

        if (ver.toLowerCase().includes('uv')) {
          this.uvPath = candidate
          this.uvVersion = ver
          const managedPythons = await this.listManagedPythons()
          return { available: true, version: ver, path: candidate, managedPythons }
        }
      } catch (_) {
        // Continue checking next candidate
      }
    }

    return { available: false }
  }

  public async listManagedPythons(): Promise<string[]> {
    if (!this.uvPath) return []
    try {
      const output = await new Promise<string>((resolve) => {
        execFile(this.uvPath!, ['python', 'list'], { timeout: 6000 }, (err, stdout) => {
          if (err) resolve('')
          else resolve(stdout || '')
        })
      })

      const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      return lines.slice(0, 15)
    } catch {
      return []
    }
  }

  public async listEnvs(): Promise<UvEnvInfo[]> {
    const metaFile = this.getMetadataFilePath()
    if (!fs.existsSync(metaFile)) {
      return []
    }
    try {
      const raw = await fs.promises.readFile(metaFile, 'utf-8')
      const envs: UvEnvInfo[] = JSON.parse(raw)
      // Filter out environments that may have been manually removed from disk
      const valid = envs.filter((e) => fs.existsSync(e.path))
      if (valid.length !== envs.length) {
        await fs.promises.writeFile(metaFile, JSON.stringify(valid, null, 2), 'utf-8')
      }
      return valid
    } catch {
      return []
    }
  }

  private async saveEnvs(envs: UvEnvInfo[]): Promise<void> {
    const metaFile = this.getMetadataFilePath()
    await fs.promises.writeFile(metaFile, JSON.stringify(envs, null, 2), 'utf-8')
  }

  public async createVenv(name: string, pythonVersion?: string, streamId?: string): Promise<{ success: boolean; env?: UvEnvInfo; error?: string }> {
    const det = await this.detectUv()
    if (!det.available || !this.uvPath) {
      return { success: false, error: 'uv is not installed or not found on system.' }
    }

    const sanitized = (name || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    const envId = `${sanitized}_${Date.now().toString(36)}`
    const envPath = path.join(this.getStorageDirectory(), envId)

    const args = ['venv', envPath]
    if (pythonVersion && pythonVersion.trim()) {
      args.push('--python', pythonVersion.trim())
    }

    if (streamId) {
      this.emitStream(streamId, 'status', `⚡ Creating isolated uv virtual environment at "${envPath}"...\n`)
      this.emitStream(streamId, 'stdout', `$ uv ${args.join(' ')}\n`)
    }

    return new Promise((resolve) => {
      const child = spawn(this.uvPath!, args, { cwd: this.getStorageDirectory() })
      if (streamId) this.activeProcesses.set(streamId, child)

      child.stdout.on('data', (d) => {
        if (streamId) this.emitStream(streamId, 'stdout', d.toString())
      })
      child.stderr.on('data', (d) => {
        if (streamId) this.emitStream(streamId, 'stderr', d.toString())
      })

      child.on('close', async (code) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'exit', `Environment creation finished with exit code ${code}\n`, code ?? 0)
        }

        if (code === 0 && fs.existsSync(envPath)) {
          const newEnv: UvEnvInfo = {
            id: envId,
            name: sanitized,
            path: envPath,
            pythonVersion: pythonVersion || 'default',
            createdDate: new Date().toISOString(),
            installedPackages: [],
          }
          const envs = await this.listEnvs()
          envs.unshift(newEnv)
          await this.saveEnvs(envs)
          resolve({ success: true, env: newEnv })
        } else {
          resolve({ success: false, error: `uv venv failed with exit code ${code}` })
        }
      })

      child.on('error', (err) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'stderr', `Process error: ${err.message}\n`)
        }
        resolve({ success: false, error: err.message })
      })
    })
  }

  public async deleteVenv(envId: string): Promise<{ success: boolean; error?: string }> {
    const envs = await this.listEnvs()
    const target = envs.find((e) => e.id === envId)
    if (!target) {
      return { success: false, error: `Environment ${envId} not found` }
    }

    try {
      if (fs.existsSync(target.path)) {
        await fs.promises.rm(target.path, { recursive: true, force: true })
      }
      const updated = envs.filter((e) => e.id !== envId)
      await this.saveEnvs(updated)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  public async installPackage(
    envId: string,
    packageSpec: string,
    streamId?: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const det = await this.detectUv()
    if (!det.available || !this.uvPath) {
      return { success: false, output: '', error: 'uv is not available' }
    }

    const envs = await this.listEnvs()
    const targetEnv = envs.find((e) => e.id === envId)
    if (!targetEnv) {
      return { success: false, output: '', error: `Environment "${envId}" not found` }
    }

    const cleanSpec = packageSpec.trim()
    if (!cleanSpec) {
      return { success: false, output: '', error: 'No package specification provided' }
    }

    const args = ['pip', 'install', '--python', targetEnv.path, cleanSpec]

    if (streamId) {
      this.emitStream(streamId, 'status', `📦 Installing "${cleanSpec}" into environment "${targetEnv.name}"...\n`)
      this.emitStream(streamId, 'stdout', `$ uv ${args.join(' ')}\n`)
    }

    let stdoutAcc = ''
    let stderrAcc = ''

    return new Promise((resolve) => {
      const child = spawn(this.uvPath!, args, { cwd: targetEnv.path })
      if (streamId) this.activeProcesses.set(streamId, child)

      child.stdout.on('data', (d) => {
        const text = d.toString()
        stdoutAcc += text
        if (streamId) this.emitStream(streamId, 'stdout', text)
      })

      child.stderr.on('data', (d) => {
        const text = d.toString()
        stderrAcc += text
        if (streamId) this.emitStream(streamId, 'stderr', text)
      })

      child.on('close', async (code) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'exit', `Installation exited with code ${code}\n`, code ?? 0)
        }

        if (code === 0) {
          // Record package in installed list
          const basePkg = cleanSpec.split(/[=><~ ]/)[0]
          if (!targetEnv.installedPackages.includes(basePkg)) {
            targetEnv.installedPackages.push(basePkg)
            await this.saveEnvs(envs)
          }
          resolve({ success: true, output: stdoutAcc })
        } else {
          resolve({ success: false, output: stdoutAcc, error: stderrAcc || `Exit code ${code}` })
        }
      })

      child.on('error', (err) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'stderr', `Spawn error: ${err.message}\n`)
        }
        resolve({ success: false, output: stdoutAcc, error: err.message })
      })
    })
  }

  public async analyzePackage(
    envId: string,
    packageName: string,
    streamId?: string
  ): Promise<{ success: boolean; report?: PackageAnalysisReport; error?: string }> {
    const det = await this.detectUv()
    if (!det.available || !this.uvPath) {
      return { success: false, error: 'uv is not available' }
    }

    const envs = await this.listEnvs()
    const targetEnv = envs.find((e) => e.id === envId)
    if (!targetEnv) {
      return { success: false, error: `Environment "${envId}" not found` }
    }

    const cleanPkg = packageName.trim()
    if (!cleanPkg) {
      return { success: false, error: 'Package name is required' }
    }

    if (streamId) {
      this.emitStream(streamId, 'status', `🔍 Inspecting package "${cleanPkg}" AST & public APIs...\n`)
    }

    // Run the introspection script inside the isolated environment via `uv run`
    const args = ['run', '--python', targetEnv.path, 'python', '-c', UV_INTROSPECT_SCRIPT, cleanPkg]

    return new Promise((resolve) => {
      let stdoutAcc = ''
      let stderrAcc = ''

      const child = spawn(this.uvPath!, args, { cwd: targetEnv.path })
      if (streamId) this.activeProcesses.set(streamId, child)

      child.stdout.on('data', (d) => {
        stdoutAcc += d.toString()
      })

      child.stderr.on('data', (d) => {
        const text = d.toString()
        stderrAcc += text
        if (streamId) this.emitStream(streamId, 'stderr', text)
      })

      child.on('close', (code) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'exit', `Analysis finished with code ${code}\n`, code ?? 0)
        }

        if (code === 0 && stdoutAcc.trim()) {
          try {
            // Find JSON in stdout (in case warnings were printed before JSON)
            const jsonStart = stdoutAcc.indexOf('{')
            const jsonEnd = stdoutAcc.lastIndexOf('}')
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              const jsonStr = stdoutAcc.substring(jsonStart, jsonEnd + 1)
              const parsed = JSON.parse(jsonStr) as PackageAnalysisReport
              if (parsed.error) {
                resolve({ success: false, error: parsed.error })
              } else {
                resolve({ success: true, report: parsed })
              }
              return
            }
          } catch (e: any) {
            resolve({ success: false, error: `Failed to parse analysis JSON: ${e.message}` })
            return
          }
        }
        resolve({
          success: false,
          error: stderrAcc || `Analysis process exited with code ${code}`,
        })
      })

      child.on('error', (err) => {
        if (streamId) this.activeProcesses.delete(streamId)
        resolve({ success: false, error: err.message })
      })
    })
  }

  public async executeCode(
    envId: string,
    code: string,
    streamId?: string
  ): Promise<{ success: boolean; output: string; stderr?: string; exitCode: number; executionTimeMs: number; error?: string }> {
    const det = await this.detectUv()
    if (!det.available || !this.uvPath) {
      return { success: false, output: '', exitCode: 1, executionTimeMs: 0, error: 'uv is not available' }
    }

    const envs = await this.listEnvs()
    const targetEnv = envs.find((e) => e.id === envId)
    if (!targetEnv) {
      return { success: false, output: '', exitCode: 1, executionTimeMs: 0, error: `Environment "${envId}" not found` }
    }

    const tempFile = path.join(targetEnv.path, `.wb_run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.py`)
    await fs.promises.writeFile(tempFile, code, 'utf-8')

    const args = ['run', '--python', targetEnv.path, 'python', tempFile]

    if (streamId) {
      this.emitStream(streamId, 'status', `⚡ Running Python snippet in "${targetEnv.name}"...\n`)
      this.emitStream(streamId, 'stdout', `$ uv run python script.py\n`)
    }

    const startTime = performance.now()
    let stdoutAcc = ''
    let stderrAcc = ''

    return new Promise((resolve) => {
      const child = spawn(this.uvPath!, args, { cwd: targetEnv.path })
      if (streamId) this.activeProcesses.set(streamId, child)

      child.stdout.on('data', (d) => {
        const text = d.toString()
        stdoutAcc += text
        if (streamId) this.emitStream(streamId, 'stdout', text)
      })

      child.stderr.on('data', (d) => {
        const text = d.toString()
        stderrAcc += text
        if (streamId) this.emitStream(streamId, 'stderr', text)
      })

      child.on('close', async (code) => {
        const duration = Math.round(performance.now() - startTime)
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'exit', `\n[Process exited with code ${code} in ${duration}ms]\n`, code ?? 0)
        }

        try {
          if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile)
        } catch (_) {}

        resolve({
          success: code === 0,
          output: stdoutAcc,
          stderr: stderrAcc,
          exitCode: code ?? 0,
          executionTimeMs: duration,
          error: code === 0 ? undefined : stderrAcc || `Exited with code ${code}`,
        })
      })

      child.on('error', async (err) => {
        const duration = Math.round(performance.now() - startTime)
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'stderr', `Execution error: ${err.message}\n`)
        }
        try {
          if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile)
        } catch (_) {}

        resolve({
          success: false,
          output: stdoutAcc,
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: duration,
          error: err.message,
        })
      })
    })
  }

  public async runArbitraryCommand(
    envId: string,
    rawCommand: string,
    streamId?: string
  ): Promise<{ success: boolean; exitCode: number; error?: string }> {
    const det = await this.detectUv()
    if (!det.available || !this.uvPath) {
      return { success: false, exitCode: 1, error: 'uv is not available' }
    }

    const envs = await this.listEnvs()
    const targetEnv = envs.find((e) => e.id === envId)
    if (!targetEnv) {
      return { success: false, exitCode: 1, error: `Environment "${envId}" not found` }
    }

    const trimmed = rawCommand.trim()
    if (!trimmed) {
      return { success: true, exitCode: 0 }
    }

    // Split args while keeping quoted strings
    const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
    const cleanParts = parts.map((p) => p.replace(/^["']|["']$/g, ''))

    let execCmd = this.uvPath!
    let execArgs: string[] = []

    if (cleanParts[0] === 'uv') {
      execArgs = cleanParts.slice(1)
    } else if (cleanParts[0] === 'python' || cleanParts[0] === 'python3') {
      execArgs = ['run', '--python', targetEnv.path, ...cleanParts]
    } else {
      execArgs = ['run', '--python', targetEnv.path, ...cleanParts]
    }

    if (streamId) {
      this.emitStream(streamId, 'stdout', `$ ${trimmed}\n`)
    }

    return new Promise((resolve) => {
      const child = spawn(execCmd, execArgs, { cwd: targetEnv.path, shell: true })
      if (streamId) this.activeProcesses.set(streamId, child)

      child.stdout.on('data', (d) => {
        if (streamId) this.emitStream(streamId, 'stdout', d.toString())
      })

      child.stderr.on('data', (d) => {
        if (streamId) this.emitStream(streamId, 'stderr', d.toString())
      })

      child.on('close', (code) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'exit', `\n[Process completed with code ${code}]\n`, code ?? 0)
        }
        resolve({ success: code === 0, exitCode: code ?? 0 })
      })

      child.on('error', (err) => {
        if (streamId) {
          this.activeProcesses.delete(streamId)
          this.emitStream(streamId, 'stderr', `Command error: ${err.message}\n`)
        }
        resolve({ success: false, exitCode: 1, error: err.message })
      })
    })
  }

  public killProcess(streamId: string): boolean {
    const proc = this.activeProcesses.get(streamId)
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM')
        setTimeout(() => {
          try {
            if (!proc.killed) proc.kill('SIGKILL')
          } catch (_) {}
        }, 500)
        this.activeProcesses.delete(streamId)
        this.emitStream(streamId, 'exit', '\n⚠️ Process terminated by user.\n', 130)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}
