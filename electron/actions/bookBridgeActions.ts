import { ActionDefinition, ActionContext, ActionResult } from './types'

/**
 * Formats extracted BookView page data into a clean, structured Markdown block
 * suitable for LLM reasoning and in-chat preview cards.
 */
export function formatBookPageMarkdown(
  page: any,
  options?: {
    scope?: 'viewport' | 'full' | 'inputs' | 'links' | 'selection'
    maxTextLength?: number
    designOptions?: {
      includeDesignSummary?: boolean
      includeFigureCaptions?: boolean
      includeVideoTranscript?: boolean
    }
  }
): string {
  const scope = options?.scope || 'viewport'
  const maxLen = options?.maxTextLength || 25000
  const includeDesignSummary = options?.designOptions?.includeDesignSummary !== false
  const includeFigureCaptions = options?.designOptions?.includeFigureCaptions !== false
  const includeVideoTranscript = options?.designOptions?.includeVideoTranscript !== false
  const lines: string[] = []

  const materialLabels: Record<string, string> = {
    'video-course': '🎬 Video Course / Lecture',
    'ereader-spa': '📕 E-Reader (Kindle / Paginated)',
    'ebook-web': '📙 Online Technical Book (O’Reilly)',
    'course-docs': '📘 Course Notes & Documentation',
    'local-pdf': '📄 Local PDF Book',
    'local-ebook': '📗 Local E-Book (EPUB / MOBI)',
    'local-doc': '📝 Local Document',
    'generic-article': '🌐 Web Article',
  }

  lines.push(`### 📖 BookView Page Snapshot`)
  if (page.title) lines.push(`- **Title**: ${page.title}`)
  if (page.chapter && page.chapter !== page.title) lines.push(`- **Chapter / Heading**: ${page.chapter}`)
  if (page.url) lines.push(`- **URL / Source**: ${page.url}`)
  if (page.pageDesign?.materialType) {
    lines.push(`- **Material Format**: ${materialLabels[page.pageDesign.materialType] || page.pageDesign.materialType}`)
  }
  if (page.pageDesign?.paginationLabel) {
    lines.push(`- **Location / Pagination**: ${page.pageDesign.paginationLabel}`)
  } else if (typeof page.scrollPercent === 'number') {
    lines.push(`- **Scroll Position**: ~${page.scrollPercent}%`)
  }

  // Structural Page Design Map (headings outline, callouts, diagrams, breadcrumbs)
  const pd = page.pageDesign
  if (includeDesignSummary && pd && (scope === 'viewport' || scope === 'full')) {
    const designLines: string[] = []
    if (Array.isArray(pd.breadcrumbs) && pd.breadcrumbs.length > 0) {
      designLines.push(`- **Breadcrumbs**: ${pd.breadcrumbs.join(' › ')}`)
    }
    const outlineItems: string[] =
      Array.isArray(pd.headingOutline) && pd.headingOutline.length > 0
        ? pd.headingOutline.slice(0, 20).map((h: any) => `${'  '.repeat(Math.max(0, (h.level || 1) - 1))}• H${h.level || 2}: ${h.text}${h.inViewport ? ' 👁️' : ''}`)
        : Array.isArray(pd.inPageOutline) && pd.inPageOutline.length > 0
          ? pd.inPageOutline.slice(0, 20).map((o: string) => `• ${o}`)
          : []
    if (outlineItems.length > 0) {
      designLines.push(`- **Section Outline**:\n${outlineItems.join('\n')}`)
    }
    if (Array.isArray(pd.callouts) && pd.callouts.length > 0) {
      const cList = pd.callouts.slice(0, 4).map((c: any) => `  - **[${c.kind}]** ${String(c.text).replace(/\n/g, ' ').slice(0, 180)}`)
      designLines.push(`- **Callouts / Highlights (${pd.callouts.length})**:\n${cList.join('\n')}`)
    }
    if (includeFigureCaptions && Array.isArray(pd.figures) && pd.figures.length > 0) {
      const fList = pd.figures.slice(0, 8).map((f: any) => `  - **${f.kind.toUpperCase()}**: ${f.caption || f.alt}${f.inViewport ? ' 👁️' : ''}`)
      designLines.push(`- **Visual Diagrams & Figures (${pd.figures.length})**:\n${fList.join('\n')}`)
    }
    if (pd.tableCount > 0) {
      designLines.push(`- **Structured Tables Detected**: ${pd.tableCount}`)
    }
    if (designLines.length > 0) {
      lines.push(``, `#### 🏗️ Source Material & Page Structure:`, ...designLines)
    }
  }

  // Video Context & Transcript Block (when classified as video-course)
  if (includeVideoTranscript && pd?.materialType === 'video-course' && pd.video && (scope === 'viewport' || scope === 'full')) {
    const v = pd.video
    lines.push(``, `#### 🎬 Video Playback & Course Context:`)
    lines.push(`- **Playback Status**: ${v.paused ? 'Paused' : 'Playing'} at \`${v.currentTimestampFormatted || '00:00'}\` (Transcript: ${v.transcriptSource})`)
    if (Array.isArray(v.chapters) && v.chapters.length > 0) {
      lines.push(`- **Module / Playlist Chapters (${v.chapters.length})**: ${v.chapters.slice(0, 12).map((c: any) => c.title).join(' | ')}`)
    }
  }

  const rawBodyText =
    scope === 'full' ? page.fullText || page.visibleText || '' : page.visibleText || page.fullText || ''

  // Only include Highlighted Selection if it isn't just a large duplicate of the page body itself
  const selTrimmed = String(page.selectedText || '').trim()
  const isDuplicateFullSelection =
    (scope === 'viewport' || scope === 'full') &&
    selTrimmed.length > 400 &&
    rawBodyText.includes(selTrimmed.slice(0, 200))

  if (selTrimmed && !isDuplicateFullSelection) {
    lines.push(``, `#### ✨ Highlighted Selection in BookView:`)
    lines.push(`> ${selTrimmed.replace(/\n/g, '\n> ')}`)
  }

  if (scope === 'viewport' || scope === 'full') {
    const rawText = rawBodyText
    const isVideo = pd?.materialType === 'video-course'
    const label = isVideo
      ? (scope === 'full' ? 'Full Video Transcript & Lecture Text' : 'Active Video Segment Around Current Playback Time')
      : (scope === 'full' ? 'Full Page / Chapter Content' : 'Visible Viewport Content')
    if (rawText) {
      const clipped = rawText.length > maxLen ? rawText.slice(0, maxLen) + `\n... [truncated at ${maxLen} chars]` : rawText
      lines.push(``, `#### 📄 ${label}:`)
      lines.push(clipped)
    }
  }

  if (Array.isArray(page.inputs) && page.inputs.length > 0 && (scope === 'viewport' || scope === 'full' || scope === 'inputs')) {
    lines.push(``, `#### 🎛️ Page Inputs & Form Controls (${page.inputs.length}):`)
    for (const inp of page.inputs.slice(0, 30)) {
      const lbl = inp.label || inp.placeholder || inp.name || `${inp.tag}[${inp.type}]`
      const valStr = inp.value ? ` = "${inp.value}"` : ' (empty)'
      const optsStr = Array.isArray(inp.options) && inp.options.length > 0 ? ` | Options: [${inp.options.slice(0, 10).join(', ')}]` : ''
      lines.push(`- **[Input #${inp.id}]** \`${lbl}\` (${inp.type})${valStr}${optsStr}`)
    }
  }

  if (Array.isArray(page.links) && page.links.length > 0 && (scope === 'viewport' || scope === 'full' || scope === 'links')) {
    const vpLinks = page.links.filter((l: any) => l.inViewport)
    const displayLinks = (vpLinks.length > 0 && scope !== 'full') ? vpLinks : page.links
    lines.push(``, `#### 🔗 Interactive Links & Navigation (${displayLinks.length} shown):`)
    for (const l of displayLinks.slice(0, 50)) {
      const badge = `[#${l.id}]`
      const typeTag = l.type && l.type !== 'link' ? ` (${l.type.toUpperCase()})` : ''
      const hrefPart = l.href && !l.href.startsWith('javascript:') ? ` → \`${l.href}\`` : ''
      lines.push(`- **${badge}** "${l.text}"${typeTag}${hrefPart}`)
    }
  }

  return lines.join('\n')
}

export const readBookPageAction: ActionDefinition = {
  id: 'read_book_page',
  aliases: ['extract_book_page', 'get_book_page', 'read_book_view', 'inspect_book_page'],
  description:
    'Extracts the currently visible page content, form inputs, code blocks, and interactive links from the BookView pane.',
  parameters: {
    scope: {
      type: 'string',
      required: false,
      description: '"viewport" (currently visible screen text, default) or "full" (entire scrollable chapter/article)',
      default: 'viewport',
    },
    includeLinks: {
      type: 'boolean',
      required: false,
      description: 'Whether to include numbered interactive links (#1..#N) on the page (default: true)',
      default: true,
    },
    includeInputs: {
      type: 'boolean',
      required: false,
      description: 'Whether to extract visible form inputs, textboxes, and selects (default: true)',
      default: true,
    },
    showBadges: {
      type: 'boolean',
      required: false,
      description: 'Whether to display visual #1..#N badges next to links in BookView (default: false)',
      default: false,
    },
  },
  example: {
    action: 'read_book_page',
    scope: 'viewport',
    includeLinks: true,
    includeInputs: true,
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    if (!ctx.bookBridge) {
      return {
        success: false,
        action: 'read_book_page',
        message: 'BookView bridge is not available in current context',
        error: 'BookView bridge unavailable',
      }
    }

    const scopeRaw = (payload.scope || payload.params?.scope || 'viewport').toLowerCase()
    const scope: 'viewport' | 'full' = scopeRaw === 'full' ? 'full' : 'viewport'
    const includeLinks = payload.includeLinks ?? payload.params?.includeLinks ?? true
    const includeInputs = payload.includeInputs ?? payload.params?.includeInputs ?? true
    const showBadges = Boolean(payload.showBadges ?? payload.params?.showBadges ?? false)

    const page = await ctx.bookBridge.extractVisiblePage({
      scope: scope === 'full' ? 'full' : 'viewport',
      includeLinks,
      includeInputs,
      showBadges,
    })

    if (!page.success) {
      return {
        success: false,
        action: 'read_book_page',
        message: `Failed to read BookView page: ${page.error || 'Unknown error'}`,
        error: page.error || 'Failed to read BookView page',
      }
    }

    const formatted = formatBookPageMarkdown(page, { scope })
    ctx.notify(`📖 Extracted ${scope === 'full' ? 'full chapter' : 'visible page'} from BookView ("${page.title || 'Book'}")`)

    return {
      success: true,
      action: 'read_book_page',
      message: `Extracted ${scope === 'full' ? 'full page' : 'visible viewport'} from BookView: "${page.title || page.chapter || 'Active Page'}" (${(page.visibleText || '').length} visible chars, ${(page.links || []).length} links, ${(page.inputs || []).length} inputs)`,
      details: {
        title: page.title,
        chapter: page.chapter,
        url: page.url,
        scrollPercent: page.scrollPercent,
        linkCount: (page.links || []).length,
        inputCount: (page.inputs || []).length,
        content: formatted,
      },
    }
  },
}

export const listBookLinksAction: ActionDefinition = {
  id: 'list_book_links',
  aliases: ['get_book_links', 'extract_book_links', 'show_book_links'],
  description:
    'Lists all interactive links, buttons, and Table of Contents items on the active BookView page with numeric IDs (#1, #2, ...) for clicking.',
  parameters: {
    viewportOnly: {
      type: 'boolean',
      required: false,
      description: 'Only list links currently visible in the viewport (default: false)',
      default: false,
    },
    filter: {
      type: 'string',
      required: false,
      description: 'Optional keyword to filter links by text or URL',
    },
    showBadges: {
      type: 'boolean',
      required: false,
      description: 'Show visual #1..#N badges next to links in BookView (default: true)',
      default: true,
    },
  },
  example: {
    action: 'list_book_links',
    viewportOnly: false,
    showBadges: true,
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    if (!ctx.bookBridge) {
      return {
        success: false,
        action: 'list_book_links',
        message: 'BookView bridge is not available',
        error: 'BookView bridge unavailable',
      }
    }

    const viewportOnly = Boolean(payload.viewportOnly ?? payload.params?.viewportOnly ?? false)
    const filter = payload.filter || payload.params?.filter || ''
    const showBadges = payload.showBadges ?? payload.params?.showBadges ?? true

    const res = await ctx.bookBridge.extractAndIndexLinks({
      viewportOnly,
      filter,
      showBadges: Boolean(showBadges),
    })

    if (!res.success) {
      return {
        success: false,
        action: 'list_book_links',
        message: `Failed to list BookView links: ${res.error}`,
        error: res.error,
      }
    }

    const links = res.links || []
    const lines = [
      `### 🔗 BookView Links on "${res.title || 'Active Page'}" (${links.length} found)`,
      ...links.slice(0, 80).map((l: any) => {
        const vpTag = l.inViewport ? '👁️ Visible' : '↕️ Off-screen'
        const hrefStr = l.href && !l.href.startsWith('javascript:') ? ` → ${l.href}` : ''
        return `- **[#${l.id}]** "${l.text}" [${l.type.toUpperCase()} | ${vpTag}]${hrefStr}`
      }),
    ]

    ctx.notify(`🔗 Indexed ${links.length} link(s) in BookView`)

    return {
      success: true,
      action: 'list_book_links',
      message: `Found ${links.length} interactive link(s) in BookView`,
      details: {
        count: links.length,
        links: links.slice(0, 80),
        content: lines.join('\n'),
      },
    }
  },
}

export const clickBookLinkAction: ActionDefinition = {
  id: 'click_book_link',
  aliases: ['click_book', 'book_click', 'click_book_element', 'open_book_link'],
  description:
    'Clicks a link, chapter anchor, or button inside the BookView pane by its numeric ID (#1, #2...), visible text match (e.g. "Next", "Chapter 3"), or CSS selector.',
  parameters: {
    id: {
      type: 'number',
      required: false,
      description: 'Numeric link ID from list_book_links or read_book_page (e.g. 4)',
    },
    text: {
      type: 'string',
      required: false,
      description: 'Visible text or label of the link/button to click (e.g. "Next", "Chapter 4", "Introduction")',
    },
    selector: {
      type: 'string',
      required: false,
      description: 'Optional CSS selector to click inside BookView',
    },
  },
  example: {
    action: 'click_book_link',
    text: 'Next',
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    if (!ctx.bookBridge) {
      return {
        success: false,
        action: 'click_book_link',
        message: 'BookView bridge is not available',
        error: 'BookView bridge unavailable',
      }
    }

    const rawId = payload.id ?? payload.linkId ?? payload.params?.id ?? payload.params?.linkId
    const parsedId = rawId !== undefined && rawId !== null && rawId !== '' ? Number(rawId) : undefined
    const text =
      payload.text ||
      payload.label ||
      payload.query ||
      payload.target ||
      payload.params?.text ||
      payload.params?.label ||
      payload.params?.query
    const selector = payload.selector || payload.params?.selector

    if (parsedId === undefined && !text && !selector) {
      return {
        success: false,
        action: 'click_book_link',
        message: 'Please provide "id" (number), "text" (string), or "selector" to click in BookView.',
        error: 'Missing click target parameter',
      }
    }

    const clickRes = await ctx.bookBridge.clickLinkOrElement({
      id: parsedId,
      text: text ? String(text) : undefined,
      selector: selector ? String(selector) : undefined,
    })

    if (!clickRes.success) {
      return {
        success: false,
        action: 'click_book_link',
        message: clickRes.message || `Could not find or click target in BookView`,
        error: clickRes.error || 'Click target not found',
      }
    }

    // Extract a brief snapshot of the new state after clicking
    const afterPage = await ctx.bookBridge.extractVisiblePage({
      scope: 'viewport',
      includeLinks: true,
      includeInputs: false,
    })

    ctx.notify(`🖱️ ${clickRes.message}`)

    const summaryContent = [
      `Clicked: **${clickRes.clickedText || 'Element'}**${clickRes.clickedId ? ` (#${clickRes.clickedId})` : ''}`,
      `New Page Title: ${afterPage.title || clickRes.newTitle || 'Unknown'}`,
      `New URL: ${afterPage.url || clickRes.newUrl || 'Unknown'}`,
      ``,
      `#### 📄 Updated Visible Page Preview:`,
      (afterPage.visibleText || '').slice(0, 4000) || '(Page loading or empty)',
    ].join('\n')

    return {
      success: true,
      action: 'click_book_link',
      message: `${clickRes.message}. Current page is now "${afterPage.title || clickRes.newTitle || ''}"`,
      details: {
        clickedId: clickRes.clickedId,
        clickedText: clickRes.clickedText,
        href: clickRes.href,
        newTitle: afterPage.title || clickRes.newTitle,
        newUrl: afterPage.url || clickRes.newUrl,
        content: summaryContent,
      },
    }
  },
}

export const navigateBookAction: ActionDefinition = {
  id: 'navigate_book',
  aliases: ['book_navigate', 'book_nav', 'scroll_book'],
  description:
    'Navigates or scrolls the BookView pane: "scroll-down", "scroll-up", "scroll-top", "scroll-bottom", "next", "prev", "back", "forward", "reload", "home", or "url".',
  parameters: {
    command: {
      type: 'string',
      required: true,
      description:
        'Navigation command: "scroll-down" | "scroll-up" | "scroll-top" | "scroll-bottom" | "next" | "prev" | "back" | "forward" | "reload" | "home" | "url"',
    },
    url: {
      type: 'string',
      required: false,
      description: 'Target URL to open in BookView when command is "url"',
    },
  },
  example: {
    action: 'navigate_book',
    command: 'scroll-down',
  },
  async execute(ctx: ActionContext, payload: any): Promise<ActionResult> {
    if (!ctx.bookBridge) {
      return {
        success: false,
        action: 'navigate_book',
        message: 'BookView bridge is not available',
        error: 'BookView bridge unavailable',
      }
    }

    let rawCmd = String(
      payload.command || payload.direction || payload.nav || payload.params?.command || payload.params?.direction || 'scroll-down'
    )
      .trim()
      .toLowerCase()

    const url = payload.url || payload.params?.url
    if (url && (!rawCmd || rawCmd === 'open' || rawCmd === 'goto' || rawCmd === 'navigate')) {
      rawCmd = 'url'
    }

    const cmdMap: Record<string, any> = {
      down: 'scroll-down',
      'scroll-down': 'scroll-down',
      scrolldown: 'scroll-down',
      up: 'scroll-up',
      'scroll-up': 'scroll-up',
      scrollup: 'scroll-up',
      top: 'scroll-top',
      'scroll-top': 'scroll-top',
      bottom: 'scroll-bottom',
      'scroll-bottom': 'scroll-bottom',
      next: 'next',
      'next-page': 'next',
      'next-chapter': 'next',
      prev: 'prev',
      previous: 'prev',
      'prev-page': 'prev',
      'prev-chapter': 'prev',
      back: 'back',
      forward: 'forward',
      reload: 'reload',
      refresh: 'reload',
      home: 'home',
      url: 'url',
      'show-badges': 'show-badges',
      'clear-badges': 'clear-badges',
    }

    const mappedCommand = cmdMap[rawCmd] || 'scroll-down'
    const navRes = await ctx.bookBridge.scrollOrNavigate({
      command: mappedCommand,
      url: url ? String(url) : undefined,
    })

    if (!navRes.success) {
      return {
        success: false,
        action: 'navigate_book',
        message: navRes.message || `BookView navigation "${mappedCommand}" failed`,
        error: navRes.error,
      }
    }

    const afterPage = await ctx.bookBridge.extractVisiblePage({
      scope: 'viewport',
      includeLinks: false,
      includeInputs: false,
    })

    ctx.notify(`🧭 ${navRes.message}`)

    return {
      success: true,
      action: 'navigate_book',
      message: navRes.message,
      details: {
        command: mappedCommand,
        title: afterPage.title || navRes.title,
        url: afterPage.url || navRes.url,
        scrollPercent: afterPage.scrollPercent ?? navRes.scrollPercent,
        content: afterPage.visibleText
          ? `### 📖 Visible BookView Content After \`${mappedCommand}\` (~${afterPage.scrollPercent ?? 0}%):\n\n${afterPage.visibleText.slice(0, 4000)}`
          : navRes.message,
      },
    }
  },
}

