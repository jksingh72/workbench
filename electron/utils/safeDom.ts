/**
 * TrustedTypes / CSP-Safe DOM Builder (`setSafeInnerHTML`)
 *
 * Google Gemini (`gemini.google.com`) and other Google web properties enforce strict
 * `Content-Security-Policy: require-trusted-types-for 'script'` and restrict allowed
 * `trusted-types` policy names. Direct assignment to `element.innerHTML = ...` throws:
 *   `TypeError: Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.`
 *
 * `setSafeInnerHTML` builds DOM subtrees using `document.createElement`, `document.createElementNS`,
 * `document.createTextNode`, and `element.setAttribute` — completely bypassing `TrustedHTML` sinks
 * so HUD cards, action badges, and result cards work identically on Gemini, Claude, ChatGPT, and Grok.
 */

const SVG_TAGS = new Set([
  'svg',
  'path',
  'polyline',
  'circle',
  'line',
  'rect',
  'g',
  'polygon',
  'ellipse',
])

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export function decodeHtmlEntities(str: string): string {
  if (!str || !str.includes('&')) return str
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&amp;/g, '&')
}

function parseAttributes(attrString: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = []
  if (!attrString || !attrString.trim()) return attrs

  const attrRegex = /([a-zA-Z0-9_:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(attrString)) !== null) {
    const name = match[1]
    if (!name || name.toLowerCase().startsWith('on')) continue
    const rawVal = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : ''
    attrs.push([name, decodeHtmlEntities(rawVal)])
  }
  return attrs
}

/**
 * Safely populates `container` with the parsed DOM nodes from `html` without invoking `.innerHTML`.
 */
export function setSafeInnerHTML(container: Element, html: string): void {
  if (!container) return

  // Clear existing child nodes without touching innerHTML
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }

  if (!html) return

  const doc = container.ownerDocument || document
  const stack: Element[] = [container]
  const tagRegex = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9:-]+)\s*>|<([a-zA-Z0-9:-]+)((?:\s+[^>]*)?)\s*(\/?)>/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const rawText = html.slice(lastIndex, match.index)
      if (rawText) {
        const currentParent = stack[stack.length - 1]
        currentParent.appendChild(doc.createTextNode(decodeHtmlEntities(rawText)))
      }
    }

    lastIndex = tagRegex.lastIndex
    const closingTag = match[1]
    const openingTag = match[2]
    const attrStr = match[3] || ''
    const selfClosingSlash = match[4] === '/'

    if (closingTag) {
      const lowerClose = closingTag.toLowerCase()
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName.toLowerCase() === lowerClose) {
          stack.length = i
          break
        }
      }
    } else if (openingTag) {
      const lowerOpen = openingTag.toLowerCase()
      if (lowerOpen === 'script' || lowerOpen === 'iframe' || lowerOpen === 'object' || lowerOpen === 'embed') {
        continue
      }

      const isSvg = SVG_TAGS.has(lowerOpen) || stack.some((el) => el.tagName && el.tagName.toLowerCase() === 'svg')
      const el = isSvg
        ? doc.createElementNS('http://www.w3.org/2000/svg', lowerOpen)
        : doc.createElement(lowerOpen)

      const attrs = parseAttributes(attrStr)
      for (const [k, v] of attrs) {
        try {
          el.setAttribute(k, v)
        } catch (_) {}
      }

      const currentParent = stack[stack.length - 1]
      currentParent.appendChild(el)

      if (!selfClosingSlash && !VOID_TAGS.has(lowerOpen)) {
        stack.push(el)
      }
    }
  }

  if (lastIndex < html.length) {
    const trailingText = html.slice(lastIndex)
    if (trailingText) {
      const currentParent = stack[stack.length - 1]
      currentParent.appendChild(doc.createTextNode(decodeHtmlEntities(trailingText)))
    }
  }
}

