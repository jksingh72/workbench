import { test, describe } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import { parseEpub } from '../electron/utils/epubParser'

describe('EPUB Book Parser', () => {
  test('parses EPUB with metadata, chapters, images, and TOC', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb_epub_test_'))
    const epubPath = path.join(tmpDir, 'sample_book.epub')

    const zip = new AdmZip()
    // 1. Container
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
    )

    // 2. OPF
    zip.addFile(
      'OEBPS/content.opf',
      Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Mastering TypeScript &amp; Architecture</dc:title>
    <dc:creator>Jane Developer</dc:creator>
    <dc:publisher>Tech Press</dc:publisher>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="diagram" href="images/arch.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`)
    )

    // 3. NCX
    zip.addFile(
      'OEBPS/toc.ncx',
      Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>Chapter 1: Getting Started</text></navLabel>
      <content src="text/ch1.xhtml"/>
    </navPoint>
    <navPoint id="np2" playOrder="2">
      <navLabel><text>Chapter 2: Advanced Patterns</text></navLabel>
      <content src="text/ch2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`)
    )

    // 4. Chapter 1 with image
    zip.addFile(
      'OEBPS/text/ch1.xhtml',
      Buffer.from(`<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1: Getting Started</title></head>
<body>
  <h1>Introduction to System Design</h1>
  <p>Welcome to this guide on robust application development.</p>
  <img src="../images/arch.png" alt="Architecture Diagram"/>
</body>
</html>`)
    )

    // 5. Chapter 2
    zip.addFile(
      'OEBPS/text/ch2.xhtml',
      Buffer.from(`<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 2: Advanced Patterns</title></head>
<body>
  <h2>Dependency Inversion</h2>
  <p>Decouple high-level modules from low-level details.</p>
</body>
</html>`)
    )

    // 6. Image
    zip.addFile('OEBPS/images/arch.png', Buffer.from('FAKEPNGDATA123'))

    zip.writeZip(epubPath)

    // Parse EPUB
    const result = parseEpub(epubPath)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.title, 'Mastering TypeScript & Architecture')
    assert.strictEqual(result.author, 'Jane Developer')
    assert.strictEqual(result.publisher, 'Tech Press')
    assert.strictEqual(result.totalChapters, 2)
    assert.strictEqual(result.toc.length, 2)
    assert.strictEqual(result.toc[0].title, 'Chapter 1: Getting Started')
    assert.strictEqual(result.toc[1].title, 'Chapter 2: Advanced Patterns')

    // Verify image inlining
    assert.ok(result.chapters[0].html.includes('data:image/png;base64,'))
    assert.ok(result.chapters[0].text.includes('Welcome to this guide on robust application development.'))
    assert.ok(result.chapters[1].text.includes('Decouple high-level modules from low-level details.'))

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
