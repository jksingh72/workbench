import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Save,
  Plus,
  RotateCw,
  ExternalLink,
  FolderOpen,
  Check,
  Table as TableIcon
} from 'lucide-react'

interface SpreadsheetEditorProps {
  filePath: string
  fileName: string
  onNotify: (msg: string) => void
  onOpenOutside?: () => void
  onShowInFolder?: () => void
}

type SheetData = (string | number | null)[][]

export const SpreadsheetEditor: React.FC<SpreadsheetEditorProps> = ({
  filePath,
  fileName,
  onNotify,
  onOpenOutside,
  onShowInFolder
}) => {
  const [sheetNames, setSheetNames] = useState<string[]>(['Sheet1'])
  const [activeSheet, setActiveSheet] = useState<string>('Sheet1')
  const [sheets, setSheets] = useState<Record<string, SheetData>>({
    Sheet1: Array.from({ length: 30 }, () => Array.from({ length: 10 }, () => ''))
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDirty, setIsDirty] = useState<boolean>(false)

  // Active cell selection & formula bar
  const [activeCell, setActiveCell] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [formulaValue, setFormulaValue] = useState<string>('')
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null)

  const cellInputRef = useRef<HTMLInputElement>(null)

  // Convert index to column letter (0 -> A, 25 -> Z, 26 -> AA)
  const getColLetter = (index: number): string => {
    let letter = ''
    let temp = index
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter
      temp = Math.floor(temp / 26) - 1
    }
    return letter
  }

  // Parse column letter to index ('A' -> 0, 'B' -> 1)
  const parseColLetter = (str: string): number => {
    let result = 0
    const upper = str.toUpperCase()
    for (let i = 0; i < upper.length; i++) {
      result = result * 26 + (upper.charCodeAt(i) - 64)
    }
    return result - 1
  }

  // Load workbook
  useEffect(() => {
    let isMounted = true
    const loadWorkbook = async () => {
      setIsLoading(true)
      try {
        if (window.electron?.readSpreadsheet) {
          const res = await window.electron.readSpreadsheet(filePath)
          if (res.success && res.sheets && isMounted) {
            const rawSheets: Record<string, SheetData> = {}
            for (const [sName, sObj] of Object.entries(res.sheets)) {
              rawSheets[sName] = sObj.data || []
            }
            const names = res.sheetNames && res.sheetNames.length > 0 ? res.sheetNames : Object.keys(rawSheets)
            setSheetNames(names)
            setActiveSheet(names[0] || 'Sheet1')
            setSheets(rawSheets)
            setIsDirty(false)
          } else if (res.error) {
            onNotify(`⚠️ Could not load spreadsheet: ${res.error}`)
          }
        }
      } catch (err: any) {
        onNotify(`⚠️ Error reading spreadsheet: ${err.message}`)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadWorkbook()
    return () => {
      isMounted = false
    }
  }, [filePath])

  // Current sheet data
  const currentData: SheetData = sheets[activeSheet] || [[]]
  const rowCount = currentData.length
  const colCount = currentData[0]?.length || 8

  // Sync formula bar when active cell changes
  useEffect(() => {
    const rawVal = currentData[activeCell.r]?.[activeCell.c]
    setFormulaValue(rawVal !== undefined && rawVal !== null ? String(rawVal) : '')
  }, [activeCell, activeSheet, sheets])

  // Simple formula evaluator
  const evaluateCellValue = (rawVal: any, data: SheetData): string => {
    if (rawVal === null || rawVal === undefined || rawVal === '') return ''
    const str = String(rawVal).trim()
    if (!str.startsWith('=')) return str

    try {
      const expr = str.substring(1).trim().toUpperCase()

      // =SUM(A1:A5)
      const sumMatch = expr.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/)
      if (sumMatch) {
        const startCol = parseColLetter(sumMatch[1])
        const startRow = parseInt(sumMatch[2], 10) - 1
        const endCol = parseColLetter(sumMatch[3])
        const endRow = parseInt(sumMatch[4], 10) - 1
        let sum = 0
        for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
          for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
            const val = parseFloat(String(data[r]?.[c] || 0))
            if (!isNaN(val)) sum += val
          }
        }
        return String(sum)
      }

      // =AVERAGE(A1:A5)
      const avgMatch = expr.match(/^AVERAGE\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/)
      if (avgMatch) {
        const startCol = parseColLetter(avgMatch[1])
        const startRow = parseInt(avgMatch[2], 10) - 1
        const endCol = parseColLetter(avgMatch[3])
        const endRow = parseInt(avgMatch[4], 10) - 1
        let sum = 0
        let count = 0
        for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
          for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
            const val = parseFloat(String(data[r]?.[c] || 0))
            if (!isNaN(val)) {
              sum += val
              count++
            }
          }
        }
        return count > 0 ? String(Math.round((sum / count) * 100) / 100) : '0'
      }

      // Replace cell coordinates in basic math: e.g. A1 + B1
      const mathExpr = expr.replace(/([A-Z]+)(\d+)/g, (_, colStr, rowStr) => {
        const c = parseColLetter(colStr)
        const r = parseInt(rowStr, 10) - 1
        const val = parseFloat(String(data[r]?.[c] || 0))
        return isNaN(val) ? '0' : String(val)
      })

      // Safely evaluate math expression
      if (/^[0-9+\-*/().\s]+$/.test(mathExpr)) {
        // eslint-disable-next-line no-eval
        const result = Function(`"use strict"; return (${mathExpr})`)()
        return String(Math.round(result * 1000) / 1000)
      }

      return str
    } catch (_) {
      return '#VALUE!'
    }
  }

  // Update cell value
  const updateCellValue = (r: number, c: number, value: string) => {
    const updated = currentData.map((row, rIdx) => {
      if (rIdx !== r) return row
      const nextRow = [...row]
      nextRow[c] = value
      return nextRow
    })

    setSheets((prev) => ({
      ...prev,
      [activeSheet]: updated
    }))
    setIsDirty(true)
  }

  // Save workbook
  const handleSave = useCallback(async () => {
    if (!window.electron?.saveSpreadsheet) return
    setIsSaving(true)
    try {
      const res = await window.electron.saveSpreadsheet({ filePath, sheets })
      if (res.success) {
        setIsDirty(false)
        onNotify(`💾 Saved spreadsheet ${fileName}`)
      } else {
        onNotify(`⚠️ Save failed: ${res.error}`)
      }
    } catch (err: any) {
      onNotify(`⚠️ Error saving spreadsheet: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }, [filePath, sheets, fileName, onNotify])

  // Save shortcut (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // Row and Column operations
  const handleAddRow = () => {
    const emptyRow = Array.from({ length: colCount }, () => '')
    setSheets((prev) => ({
      ...prev,
      [activeSheet]: [...currentData, emptyRow]
    }))
    setIsDirty(true)
  }

  const handleAddColumn = () => {
    const updated = currentData.map((row) => [...row, ''])
    setSheets((prev) => ({
      ...prev,
      [activeSheet]: updated
    }))
    setIsDirty(true)
  }

  const handleAddSheet = () => {
    let counter = sheetNames.length + 1
    let newName = `Sheet${counter}`
    while (sheetNames.includes(newName)) {
      counter++
      newName = `Sheet${counter}`
    }
    const newSheetData = Array.from({ length: 30 }, () => Array.from({ length: 10 }, () => ''))
    setSheetNames((prev) => [...prev, newName])
    setSheets((prev) => ({ ...prev, [newName]: newSheetData }))
    setActiveSheet(newName)
    setIsDirty(true)
  }

  if (isLoading) {
    return (
      <div className="wb-doc-loading">
        <RotateCw size={24} className="spin text-cyan" />
        <span>Loading spreadsheet...</span>
      </div>
    )
  }

  const activeCellCoord = `${getColLetter(activeCell.c)}${activeCell.r + 1}`

  return (
    <div className="wb-doc-editor wb-spreadsheet-editor">
      {/* Top Spreadsheet Toolbar */}
      <div className="wb-editor-toolbar">
        <div className="wb-toolbar-group">
          <button
            className="wb-tool-btn"
            onClick={handleAddRow}
            title="Insert Row at Bottom"
          >
            <Plus size={13} />
            <span>Row</span>
          </button>
          <button
            className="wb-tool-btn"
            onClick={handleAddColumn}
            title="Insert Column at Right"
          >
            <Plus size={13} />
            <span>Col</span>
          </button>
        </div>

        <div className="wb-toolbar-right">
          {/* Save Button */}
          <button
            className={`wb-save-btn ${isDirty ? 'dirty' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
            title="Save Workbook (Ctrl+S)"
          >
            {isSaving ? (
              <RotateCw size={13} className="spin" />
            ) : isDirty ? (
              <Save size={13} />
            ) : (
              <Check size={13} />
            )}
            <span>{isDirty ? 'Save *' : 'Saved'}</span>
          </button>

          {/* Open in External Excel */}
          {onOpenOutside && (
            <button
              className="wb-tool-btn"
              onClick={onOpenOutside}
              title="Open outside in Microsoft Excel"
            >
              <ExternalLink size={14} />
              <span>Open in Excel</span>
            </button>
          )}

          {/* Show in Explorer */}
          {onShowInFolder && (
            <button
              className="wb-tool-btn"
              onClick={onShowInFolder}
              title="Show in File Explorer"
            >
              <FolderOpen size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Formula Bar */}
      <div className="wb-formula-bar">
        <div className="wb-formula-cell-indicator">{activeCellCoord}</div>
        <div className="wb-formula-fx">fx</div>
        <input
          type="text"
          className="wb-formula-input"
          value={formulaValue}
          onChange={(e) => {
            setFormulaValue(e.target.value)
            updateCellValue(activeCell.r, activeCell.c, e.target.value)
          }}
          placeholder="Enter text, number, or formula (e.g. =SUM(A1:A5))..."
        />
      </div>

      {/* Grid Container */}
      <div className="wb-sheet-grid-container">
        <table className="wb-sheet-table">
          <thead>
            <tr>
              <th className="wb-row-header wb-corner-header"></th>
              {Array.from({ length: colCount }).map((_, cIdx) => (
                <th
                  key={cIdx}
                  className={`wb-col-header ${activeCell.c === cIdx ? 'header-highlight' : ''}`}
                >
                  {getColLetter(cIdx)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentData.map((row, rIdx) => (
              <tr key={rIdx}>
                <td className={`wb-row-header ${activeCell.r === rIdx ? 'header-highlight' : ''}`}>
                  {rIdx + 1}
                </td>
                {Array.from({ length: colCount }).map((_, cIdx) => {
                  const rawVal = row[cIdx]
                  const displayVal = evaluateCellValue(rawVal, currentData)
                  const isSelected = activeCell.r === rIdx && activeCell.c === cIdx
                  const isEditing = editingCell?.r === rIdx && editingCell?.c === cIdx
                  const isNumber = !isNaN(Number(displayVal)) && displayVal !== ''

                  return (
                    <td
                      key={cIdx}
                      className={`wb-sheet-cell ${isSelected ? 'cell-selected' : ''} ${
                        isNumber ? 'cell-number' : ''
                      }`}
                      onClick={() => {
                        setActiveCell({ r: rIdx, c: cIdx })
                        setEditingCell(null)
                      }}
                      onDoubleClick={() => {
                        setActiveCell({ r: rIdx, c: cIdx })
                        setEditingCell({ r: rIdx, c: cIdx })
                        setTimeout(() => cellInputRef.current?.focus(), 10)
                      }}
                    >
                      {isEditing ? (
                        <input
                          ref={cellInputRef}
                          className="wb-cell-inline-input"
                          defaultValue={rawVal !== null && rawVal !== undefined ? String(rawVal) : ''}
                          onBlur={(e) => {
                            updateCellValue(rIdx, cIdx, e.target.value)
                            setEditingCell(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateCellValue(rIdx, cIdx, e.currentTarget.value)
                              setEditingCell(null)
                              if (rIdx + 1 < rowCount) {
                                setActiveCell({ r: rIdx + 1, c: cIdx })
                              }
                            } else if (e.key === 'Escape') {
                              setEditingCell(null)
                            }
                          }}
                        />
                      ) : (
                        <span className="cell-text">{displayVal}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Sheet Tabs Bar */}
      <div className="wb-sheet-tabs-bar">
        <div className="wb-sheet-tabs-list">
          {sheetNames.map((name) => (
            <button
              key={name}
              className={`wb-sheet-tab ${activeSheet === name ? 'active' : ''}`}
              onClick={() => {
                setActiveSheet(name)
                setActiveCell({ r: 0, c: 0 })
              }}
            >
              <TableIcon size={12} />
              <span>{name}</span>
            </button>
          ))}
          <button
            className="wb-sheet-tab wb-add-tab"
            onClick={handleAddSheet}
            title="Add New Worksheet"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="wb-sheet-status">
          <span>{rowCount} rows × {colCount} cols</span>
          <span>{isDirty ? '● Unsaved changes' : '✓ Saved'}</span>
        </div>
      </div>
    </div>
  )
}
