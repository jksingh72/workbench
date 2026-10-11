import { test, describe } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseMobi } from '../electron/utils/mobiParser'

function compressPalmDoc(data: Buffer): Buffer {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const chunk = data.subarray(i, Math.min(i + 8, data.length))
    out.push(chunk.length)
    for (const b of chunk) out.push(b)
    i += chunk.length
  }
  return Buffer.from(out)
}

describe('MOBI Book Parser', () => {
  test('parses synthetic MOBI book with PalmDOC compression and pagebreak chapters', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb_mobi_test_'))
    const mobiPath = path.join(tmpDir, 'sample.mobi')

    const title = 'Kindle Deep Dive'
    const titleBuf = Buffer.from(title, 'utf-8')

    // Record 0
    const rec0 = Buffer.alloc(300)
    rec0.writeUInt16BE(2, 0) // compression = 2 (PalmDOC)
    rec0.writeUInt32BE(500, 4) // textLength
    rec0.writeUInt16BE(1, 8) // recordCount = 1
    rec0.writeUInt16BE(4096, 10) // recordSize
    rec0.write('MOBI', 16, 'latin1')
    rec0.writeUInt32BE(232, 20) // headerLength

    const titleOffset = 250
    rec0.writeUInt32BE(titleOffset, 16 + 80)
    rec0.writeUInt32BE(titleBuf.length, 16 + 84)
    titleBuf.copy(rec0, titleOffset)

    // Record 1 (Text with chapter break)
    const rawText = Buffer.from(
      '<html><body><h1>Chapter 1: The Core</h1><p>Introduction to the reader.</p><mbp:pagebreak/><h1>Chapter 2: Scaling Up</h1><p>Advanced techniques and patterns.</p></body></html>'
    )
    const rec1 = compressPalmDoc(rawText)

    // PDB Header
    const numRecords = 2
    const headerSize = 78 + numRecords * 8
    const pdb = Buffer.alloc(headerSize)
    pdb.write('SampleBook', 0, 'latin1')
    pdb.writeUInt16BE(numRecords, 76)

    const rec0Offset = headerSize
    const rec1Offset = rec0Offset + rec0.length

    pdb.writeUInt32BE(rec0Offset, 78)
    pdb.writeUInt32BE(rec1Offset, 78 + 8)

    const fullMobi = Buffer.concat([pdb, rec0, rec1])
    fs.writeFileSync(mobiPath, fullMobi)

    const result = parseMobi(mobiPath)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.title, 'Kindle Deep Dive')
    assert.strictEqual(result.totalChapters, 2)
    assert.strictEqual(result.chapters[0].title, 'Chapter 1: The Core')
    assert.strictEqual(result.chapters[1].title, 'Chapter 2: Scaling Up')
    assert.ok(result.chapters[0].text.includes('Introduction to the reader.'))
    assert.ok(result.chapters[1].text.includes('Advanced techniques and patterns.'))

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('normalizes filepos internal links and injects target anchor markers with chapter offsets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb_mobi_link_test_'))
    const mobiPath = path.join(tmpDir, 'internal_links.mobi')

    // Record 0
    const rec0 = Buffer.alloc(200)
    rec0.writeUInt16BE(2, 0) // compression = 2
    rec0.writeUInt32BE(400, 4)
    rec0.writeUInt16BE(1, 8)
    rec0.writeUInt16BE(4096, 10)
    rec0.write('MOBI', 16, 'latin1')
    rec0.writeUInt32BE(232, 20)

    // Record 1: chapter 1 has link to chapter 2 at byte offset ~88
    // "<html><body><h1>TOC</h1><p><a href="filepos:0000000088">Jump to Chapter 2</a></p><mbp:pagebreak/><h1>Chapter 2</h1><p>Welcome to destination chapter!</p></body></html>"
    const textStr =
      '<html><body><h1>TOC</h1><p><a href="filepos:0000000088">Jump to Chapter 2</a></p><mbp:pagebreak/><h1>Chapter 2</h1><p>Welcome to destination chapter!</p></body></html>'
    const rawText = Buffer.from(textStr, 'utf-8')
    const rec1 = compressPalmDoc(rawText)

    // PDB Header
    const numRecords = 2
    const headerSize = 78 + numRecords * 8
    const pdb = Buffer.alloc(headerSize)
    pdb.write('LinkBook', 0, 'latin1')
    pdb.writeUInt16BE(numRecords, 76)

    const rec0Offset = headerSize
    const rec1Offset = rec0Offset + rec0.length

    pdb.writeUInt32BE(rec0Offset, 78)
    pdb.writeUInt32BE(rec1Offset, 78 + 8)

    const fullMobi = Buffer.concat([pdb, rec0, rec1])
    fs.writeFileSync(mobiPath, fullMobi)

    const result = parseMobi(mobiPath)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.totalChapters, 2)

    // Chapter 1 should have normalized link
    assert.ok(result.chapters[0].html.includes('data-filepos="88"'), 'Chapter 1 should contain data-filepos="88"')
    assert.ok(result.chapters[0].html.includes('href="#filepos_88"'), 'Chapter 1 should contain href="#filepos_88"')

    // Chapter 2 should have injected anchor marker
    assert.ok(result.chapters[1].html.includes('id="filepos_88"'), 'Chapter 2 should contain id="filepos_88"')

    // Both chapters should have startPos and endPos
    assert.strictEqual(typeof result.chapters[0].startPos, 'number')
    assert.strictEqual(typeof result.chapters[0].endPos, 'number')
    assert.strictEqual(typeof result.chapters[1].startPos, 'number')
    assert.strictEqual(typeof result.chapters[1].endPos, 'number')
    assert.ok(result.chapters[0].startPos! <= result.chapters[0].endPos!)
    assert.ok(result.chapters[1].startPos! <= result.chapters[1].endPos!)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

