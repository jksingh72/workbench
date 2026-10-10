import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import * as docx from 'docx'
import mammoth from 'mammoth'
import { ActionDefinition, ActionContext, ActionResult } from './types'

export interface DocxColumnSpec {
  header: string
  width?: number // Width in inches
  align?: 'left' | 'center' | 'right'
}

export interface DocxBlockSpec {
  type:
    | 'title'
    | 'heading'
    | 'paragraph'
    | 'bullets'
    | 'bullet'
    | 'bulletList'
    | 'list'
    | 'numbered'
    | 'numberedList'
    | 'ordered'
    | 'orderedList'
    | 'table'
    | 'pageBreak'
    | 'page_break'
    | 'divider'
    | 'hr'
    | 'line'
  text?: string
  level?: number // 1 to 4 for headings
  items?: string[] // For bullets and numbered
  columns?: DocxColumnSpec[] // For table
  rows?: string[][] // For table
  headerShading?: string // Hex color e.g. "1F3A5F" or "D9E2F3"
  headerTextColor?: string // Hex color e.g. "FFFFFF"
  repeatHeader?: boolean
  cantSplit?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface DocxPageSpec {
  size?: 'Letter' | 'Legal' | 'A4'
  orientation?: 'portrait' | 'landscape'
  margins?: {
    top?: number // in inches
    bottom?: number
    left?: number
    right?: number
  }
}

export interface DocxStyleSpec {
  fontFamily?: string
  fontSize?: number // in pt, default 10.5
  primaryColor?: string // hex e.g. "1F3A5F" (navy)
  accentColor?: string // hex e.g. "4F81BD" (blue)
  textColor?: string // hex e.g. "262626"
  tableHeaderFill?: string // hex e.g. "D9E2F3"
  tableBorderColor?: string // hex e.g. "D3D3D3"
}

export interface DocxSpec {
  title?: string
  page?: DocxPageSpec
  header?: string | { text: string; align?: 'left' | 'center' | 'right' }
  footer?: string | { text?: string; includePageNumbers?: boolean; align?: 'left' | 'center' | 'right' }
  styles?: DocxStyleSpec
  blocks: DocxBlockSpec[]
}

function parseInlineRuns(
  rawText: string,
  baseFont: string,
  baseSizePt: number,
  baseColor: string
): docx.TextRun[] {
  if (!rawText) return []

  // Tokenize bold (**...**), italics (*...*), and source refs ([[...]])
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\])/g
  const parts = rawText.split(regex)
  const runs: docx.TextRun[] = []

  for (const part of parts) {
    if (!part) continue

    if (part.startsWith('[[') && part.endsWith(']]')) {
      const refText = part.slice(2, -2).trim()
      runs.push(
        new docx.TextRun({
          text: ` (${refText})`,
          font: baseFont,
          size: Math.max(14, Math.round((baseSizePt - 2) * 2)), // 8.5pt in half-points
          color: '708090', // Slate gray
          italics: true,
        })
      )
    } else if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldText = part.slice(2, -2)
      runs.push(
        new docx.TextRun({
          text: boldText,
          font: baseFont,
          size: Math.round(baseSizePt * 2),
          color: baseColor,
          bold: true,
        })
      )
    } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicText = part.slice(1, -1)
      runs.push(
        new docx.TextRun({
          text: italicText,
          font: baseFont,
          size: Math.round(baseSizePt * 2),
          color: baseColor,
          italics: true,
        })
      )
    } else {
      runs.push(
        new docx.TextRun({
          text: part,
          font: baseFont,
          size: Math.round(baseSizePt * 2),
          color: baseColor,
        })
      )
    }
  }

  return runs
}

function inchesToDxa(inches: number): number {
  return Math.round(inches * 1440)
}

function computeSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

export const renderDocxAction: ActionDefinition = {
  id: 'render_docx',
  aliases: ['generate_docx', 'build_docx', 'compile_docx', 'render_word'],
  description:
    'Renders a rich Word document (.docx) from a structured JSON specification. Supports headings, bold/italics/source references, bullets, numbered lists, page breaks, and real Word tables with custom column widths (in inches), repeating header rows, non-splitting rows, and custom shading.',
  parameters: {
    spec: {
      type: 'object',
      required: false,
      description: 'Inline JSON content specification object containing blocks, styles, page settings, etc.',
    },
    specPath: {
      type: 'string',
      required: false,
      description: 'Path to a JSON file containing the content specification on disk.',
    },
    outPath: {
      type: 'string',
      required: true,
      description: 'Destination .docx file path (relative to active directory or absolute).',
    },
    template: {
      type: 'string',
      required: false,
      description: 'Optional path to a style template JSON or predefined style preset.',
    },
    overwrite: {
      type: 'boolean',
      required: false,
      description: 'Whether to overwrite existing output file if it already exists (default: false).',
      default: false,
    },
  },
  example: {
    action: 'render_docx',
    outPath: 'Proposal-Report.docx',
    overwrite: true,
    spec: {
      page: { size: 'Letter', margins: { top: 0.8, bottom: 0.8, left: 0.9, right: 0.9 } },
      blocks: [
        { type: 'title', text: 'RFSA Proposal Summary' },
        { type: 'heading', level: 1, text: '1. Executive Summary' },
        { type: 'paragraph', text: 'HyLifen provides **Enterprise Architecture** [[PSA Section 4.9: AI Governance]].' },
        {
          type: 'table',
          repeatHeader: true,
          columns: [
            { header: '#', width: 0.6, align: 'center' },
            { header: 'Requirement', width: 3.5, align: 'left' },
            { header: 'Status', width: 2.4, align: 'left' },
          ],
          rows: [
            ['1', 'Canadian Place of Business', '**Confirmed**'],
            ['2', 'Reliability Clearance Pool', 'Active'],
          ],
          headerShading: '1F3A5F',
          headerTextColor: 'FFFFFF',
        },
      ],
    },
  },
  async execute(ctx: ActionContext, payload: any, targetPane = 'book'): Promise<ActionResult> {
    const params = payload.params || {}
    const outPathRaw = params.outPath ?? payload.outPath ?? params.path ?? payload.path
    if (!outPathRaw) {
      throw new Error('Missing required parameter "outPath"')
    }

    const overwrite = Boolean(params.overwrite ?? payload.overwrite ?? false)
    const resolvedOutPath = ctx.resolveSafePath(outPathRaw, targetPane)

    if (fs.existsSync(resolvedOutPath) && !overwrite) {
      return {
        success: false,
        action: 'render_docx',
        message: `File already exists: "${outPathRaw}". Pass "overwrite: true" to replace it.`,
        error: `File already exists: "${resolvedOutPath}"`,
      }
    }

    // Load spec from inline object or specPath
    let spec: DocxSpec | null = payload.spec || params.spec || null
    const specPathRaw = params.specPath ?? payload.specPath
    if (!spec && specPathRaw) {
      const resolvedSpecPath = ctx.resolveSafePath(specPathRaw, targetPane)
      if (!fs.existsSync(resolvedSpecPath)) {
        throw new Error(`Specification file not found: "${specPathRaw}"`)
      }
      const rawContent = await fs.promises.readFile(resolvedSpecPath, 'utf8')
      spec = JSON.parse(rawContent)
    }

    if (!spec || !Array.isArray(spec.blocks)) {
      throw new Error('Invalid or missing specification. Must provide "spec" with a "blocks" array or a valid "specPath".')
    }

    // Load optional template / style overrides
    let templateStyles: DocxStyleSpec = {}
    const templatePathRaw = params.template ?? payload.template
    if (templatePathRaw && typeof templatePathRaw === 'string') {
      const resolvedTemplatePath = ctx.resolveSafePath(templatePathRaw, targetPane)
      if (fs.existsSync(resolvedTemplatePath) && resolvedTemplatePath.endsWith('.json')) {
        try {
          const tplContent = await fs.promises.readFile(resolvedTemplatePath, 'utf8')
          templateStyles = JSON.parse(tplContent)
        } catch (_) {}
      }
    }

    // Merge styles with defaults
    const font = spec.styles?.fontFamily || templateStyles.fontFamily || 'Calibri'
    const baseFontSize = spec.styles?.fontSize || templateStyles.fontSize || 10.5
    const primaryColor = spec.styles?.primaryColor || templateStyles.primaryColor || '1F3A5F' // Navy
    const accentColor = spec.styles?.accentColor || templateStyles.accentColor || '4F81BD' // Blue
    const textColor = spec.styles?.textColor || templateStyles.textColor || '262626'
    const tableHeaderFill = spec.styles?.tableHeaderFill || templateStyles.tableHeaderFill || 'D9E2F3'
    const tableBorderColor = spec.styles?.tableBorderColor || templateStyles.tableBorderColor || 'CBD5E1'

    // Page setup
    const pageSpec = spec.page || {}
    const topMargin = inchesToDxa(pageSpec.margins?.top ?? 0.8)
    const bottomMargin = inchesToDxa(pageSpec.margins?.bottom ?? 0.8)
    const leftMargin = inchesToDxa(pageSpec.margins?.left ?? 0.9)
    const rightMargin = inchesToDxa(pageSpec.margins?.right ?? 0.9)

    const docChildren: (docx.Paragraph | docx.Table)[] = []

    if (spec.title && !spec.blocks?.some((b: any) => b?.type === 'title')) {
      docChildren.push(
        new docx.Paragraph({
          spacing: { before: 240, after: 200, line: 280 },
          border: {
            bottom: {
              color: accentColor,
              space: 4,
              style: docx.BorderStyle.SINGLE,
              size: 8,
            },
          },
          children: parseInlineRuns(spec.title, font, 24, primaryColor),
        })
      )
    }

    for (const block of spec.blocks) {
      if (!block || !block.type) continue

      switch (block.type) {
        case 'title': {
          docChildren.push(
            new docx.Paragraph({
              spacing: { before: 240, after: 200, line: 280 },
              border: {
                bottom: {
                  color: accentColor,
                  space: 4,
                  style: docx.BorderStyle.SINGLE,
                  size: 8,
                },
              },
              children: parseInlineRuns(block.text || '', font, 24, primaryColor),
            })
          )
          break
        }

        case 'heading': {
          const level = block.level || 1
          const sizeMap: Record<number, number> = { 1: 15, 2: 13, 3: 11.5, 4: 10.5 }
          const beforeMap: Record<number, number> = { 1: 320, 2: 220, 3: 160, 4: 120 }
          const afterMap: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40 }
          const headingSize = sizeMap[level] || 12
          const headingBefore = beforeMap[level] || 180
          const headingAfter = afterMap[level] || 60

          docChildren.push(
            new docx.Paragraph({
              heading:
                level === 1
                  ? docx.HeadingLevel.HEADING_1
                  : level === 2
                  ? docx.HeadingLevel.HEADING_2
                  : level === 3
                  ? docx.HeadingLevel.HEADING_3
                  : docx.HeadingLevel.HEADING_4,
              spacing: { before: headingBefore, after: headingAfter },
              keepNext: true,
              children: parseInlineRuns(block.text || '', font, headingSize, primaryColor),
            })
          )
          break
        }

        case 'paragraph': {
          const alignment =
            block.align === 'center'
              ? docx.AlignmentType.CENTER
              : block.align === 'right'
              ? docx.AlignmentType.RIGHT
              : docx.AlignmentType.LEFT

          docChildren.push(
            new docx.Paragraph({
              alignment,
              spacing: { after: 120, line: 264, lineRule: docx.LineRuleType.AUTO },
              children: parseInlineRuns(block.text || '', font, baseFontSize, textColor),
            })
          )
          break
        }

        case 'bullets':
        case 'bullet':
        case 'bulletList':
        case 'list': {
          const items = block.items || []
          for (const item of items) {
            docChildren.push(
              new docx.Paragraph({
                bullet: { level: 0 },
                spacing: { after: 60, line: 240 },
                children: parseInlineRuns(item, font, baseFontSize, textColor),
              })
            )
          }
          break
        }

        case 'numbered':
        case 'numberedList':
        case 'ordered':
        case 'orderedList': {
          const items = block.items || []
          let num = 1
          for (const item of items) {
            // Numbered list item formatted cleanly with tab indents
            docChildren.push(
              new docx.Paragraph({
                spacing: { after: 60, line: 240 },
                indent: { left: 360, hanging: 360 },
                children: [
                  new docx.TextRun({
                    text: `${num}. `,
                    font,
                    size: Math.round(baseFontSize * 2),
                    color: primaryColor,
                    bold: true,
                  }),
                  ...parseInlineRuns(item, font, baseFontSize, textColor),
                ],
              })
            )
            num++
          }
          break
        }

        case 'pageBreak':
        case 'page_break': {
          docChildren.push(
            new docx.Paragraph({
              children: [new docx.PageBreak()],
            })
          )
          break
        }

        case 'divider': {
          docChildren.push(
            new docx.Paragraph({
              spacing: { before: 140, after: 140 },
              border: {
                bottom: {
                  color: accentColor,
                  space: 2,
                  style: docx.BorderStyle.SINGLE,
                  size: 4,
                },
              },
            })
          )
          break
        }

        case 'table': {
          const cols = block.columns || []
          const rowsData = block.rows || []
          const headerFill = block.headerShading || tableHeaderFill
          const headerColor = block.headerTextColor || primaryColor
          const repeatHeader = block.repeatHeader !== false
          const cantSplit = block.cantSplit !== false

          const tableRows: docx.TableRow[] = []

          // Calculate column widths in twips/dxa
          const colWidthsDxa = cols.map((c) => (c.width ? inchesToDxa(c.width) : 1800))
          const totalWidthDxa = colWidthsDxa.reduce((sum, w) => sum + w, 0)

          const cellBorders = {
            top: { style: docx.BorderStyle.SINGLE, size: 4, color: tableBorderColor },
            bottom: { style: docx.BorderStyle.SINGLE, size: 4, color: tableBorderColor },
            left: { style: docx.BorderStyle.SINGLE, size: 4, color: tableBorderColor },
            right: { style: docx.BorderStyle.SINGLE, size: 4, color: tableBorderColor },
          }

          // Header row
          if (cols.length > 0) {
            const headerCells = cols.map((c, colIdx) => {
              const align =
                c.align === 'center'
                  ? docx.AlignmentType.CENTER
                  : c.align === 'right'
                  ? docx.AlignmentType.RIGHT
                  : docx.AlignmentType.LEFT

              return new docx.TableCell({
                width: { size: colWidthsDxa[colIdx], type: docx.WidthType.DXA },
                shading: { fill: headerFill, type: docx.ShadingType.CLEAR, color: 'auto' },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                borders: cellBorders,
                children: [
                  new docx.Paragraph({
                    alignment: align,
                    spacing: { after: 0 },
                    children: [
                      new docx.TextRun({
                        text: c.header,
                        font,
                        size: Math.round(baseFontSize * 2),
                        color: headerColor,
                        bold: true,
                      }),
                    ],
                  }),
                ],
              })
            })

            tableRows.push(
              new docx.TableRow({
                tableHeader: repeatHeader,
                cantSplit: true,
                children: headerCells,
              })
            )
          }

          // Data rows
          for (let rIdx = 0; rIdx < rowsData.length; rIdx++) {
            const row = rowsData[rIdx]
            const cells = row.map((cellText, cIdx) => {
              const colDef = cols[cIdx] || {}
              const align =
                colDef.align === 'center'
                  ? docx.AlignmentType.CENTER
                  : colDef.align === 'right'
                  ? docx.AlignmentType.RIGHT
                  : docx.AlignmentType.LEFT

              const rowFill = rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF'

              return new docx.TableCell({
                width: { size: colWidthsDxa[cIdx] || 1800, type: docx.WidthType.DXA },
                shading: { fill: rowFill, type: docx.ShadingType.CLEAR, color: 'auto' },
                margins: { top: 80, bottom: 80, left: 140, right: 140 },
                borders: cellBorders,
                children: [
                  new docx.Paragraph({
                    alignment: align,
                    spacing: { after: 0 },
                    children: parseInlineRuns(String(cellText || ''), font, baseFontSize, textColor),
                  }),
                ],
              })
            })

            tableRows.push(
              new docx.TableRow({
                cantSplit,
                children: cells,
              })
            )
          }

          docChildren.push(
            new docx.Table({
              width: { size: totalWidthDxa, type: docx.WidthType.DXA },
              alignment: docx.AlignmentType.CENTER,
              rows: tableRows,
            })
          )

          // Spacer after table
          docChildren.push(
            new docx.Paragraph({
              spacing: { after: 120 },
            })
          )
          break
        }
      }
    }

    // Build document header/footer
    let docHeader: docx.Header | undefined = undefined
    if (spec.header) {
      const headerText = typeof spec.header === 'string' ? spec.header : spec.header.text
      const headerAlign =
        typeof spec.header === 'object' && spec.header.align === 'right'
          ? docx.AlignmentType.RIGHT
          : typeof spec.header === 'object' && spec.header.align === 'center'
          ? docx.AlignmentType.CENTER
          : docx.AlignmentType.LEFT

      docHeader = new docx.Header({
        children: [
          new docx.Paragraph({
            alignment: headerAlign,
            children: [
              new docx.TextRun({
                text: headerText,
                font,
                size: 18,
                color: '94A3B8',
              }),
            ],
          }),
        ],
      })
    }

    let docFooter: docx.Footer | undefined = undefined
    if (spec.footer) {
      const footerText = typeof spec.footer === 'string' ? spec.footer : spec.footer.text || ''
      const includePageNum = typeof spec.footer === 'object' ? spec.footer.includePageNumbers : true
      const footerChildren: docx.ParagraphChild[] = []

      if (footerText) {
        footerChildren.push(
          new docx.TextRun({
            text: footerText,
            font,
            size: 18,
            color: '94A3B8',
          })
        )
      }

      if (includePageNum) {
        footerChildren.push(
          new docx.TextRun({
            children: [docx.PageNumber.CURRENT, ' / ', docx.PageNumber.TOTAL_PAGES],
            font,
            size: 18,
            color: '94A3B8',
          })
        )
      }

      docFooter = new docx.Footer({
        children: [
          new docx.Paragraph({
            alignment: docx.AlignmentType.RIGHT,
            children: footerChildren,
          }),
        ],
      })
    }

    // Assemble final document
    const doc = new docx.Document({
      styles: {
        default: {
          document: {
            run: {
              font,
              size: Math.round(baseFontSize * 2),
              color: textColor,
            },
            paragraph: {
              spacing: { after: 120, line: 264, lineRule: docx.LineRuleType.AUTO },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: topMargin,
                bottom: bottomMargin,
                left: leftMargin,
                right: rightMargin,
              },
            },
          },
          headers: docHeader ? { default: docHeader } : undefined,
          footers: docFooter ? { default: docFooter } : undefined,
          children: docChildren,
        },
      ],
    })

    // Write to a temporary file in os.tmpdir() first to avoid OneDrive sync lock
    const tempFileName = `wb_render_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.docx`
    const tempFilePath = path.join(os.tmpdir(), tempFileName)

    try {
      const docBuffer = await docx.Packer.toBuffer(doc)
      await fs.promises.writeFile(tempFilePath, docBuffer)

      // Verify written docx with mammoth to ensure it is valid OpenXML
      await mammoth.extractRawText({ path: tempFilePath })

      // Atomically copy/move to destination directory
      const outDir = path.dirname(resolvedOutPath)
      if (!fs.existsSync(outDir)) {
        await fs.promises.mkdir(outDir, { recursive: true })
      }

      await fs.promises.copyFile(tempFilePath, resolvedOutPath)
      const stats = await fs.promises.stat(resolvedOutPath)
      const sha256 = computeSha256(resolvedOutPath)

      // Refresh directory in explorer
      ctx.refreshExplorer(targetPane)

      // Get target folder listing
      let folders: string[] = []
      let files: string[] = []
      try {
        const entries = await fs.promises.readdir(outDir, { withFileTypes: true })
        folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
        files = entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort()
      } catch (_) {}

      const fileName = path.basename(resolvedOutPath)
      const sizeKb = (stats.size / 1024).toFixed(1)
      ctx.notify(`📄 Rendered Word Document: ${fileName} (${sizeKb} KB)`)

      return {
        success: true,
        action: 'render_docx',
        createdPath: resolvedOutPath,
        message: `Successfully generated Word document "${fileName}" (${stats.size.toLocaleString()} bytes, SHA-256: ${sha256})`,
        details: {
          filePath: resolvedOutPath,
          fileName,
          sizeBytes: stats.size,
          sha256,
          tableCount: spec.blocks.filter((b) => b.type === 'table').length,
          folderCount: folders.length,
          fileCount: files.length,
          folders,
          files,
        },
      }
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath)
        }
      } catch (_) {}
    }
  },
}
