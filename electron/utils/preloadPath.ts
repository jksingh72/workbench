import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

let cachedViewPreloadPath: string | null = null

/**
 * Returns the absolute path to the compiled viewPreload.cjs script.
 * Searches across dist-electron and project root directories.
 */
export function getViewPreloadPath(): string {
  if (cachedViewPreloadPath && fs.existsSync(cachedViewPreloadPath)) {
    return cachedViewPreloadPath
  }

  const currentDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url))

  const candidatePaths = [
    path.join(currentDir, 'viewPreload.cjs'),
    path.join(currentDir, 'viewPreload.mjs'),
    path.join(currentDir, 'viewPreload.js'),
    path.join(process.cwd(), 'dist-electron', 'viewPreload.cjs'),
    path.join(process.cwd(), 'dist-electron', 'viewPreload.js'),
  ]

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      cachedViewPreloadPath = candidate
      return candidate
    }
  }

  // Fallback to expected dist-electron path
  return candidatePaths[0]
}
