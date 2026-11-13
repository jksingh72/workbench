import { formatBookPageMarkdown } from '../actions/bookBridgeActions'

export interface BookSummaryStylePreset {
  id: string
  label: string
  icon: string
  aliases: string[]
  description: string
  promptDirective: string
}

export interface CustomUserPromptTemplate {
  id: string
  name: string
  description?: string
  prompt: string
  isPreset?: boolean
}

export type BookCommandCategory = 'summarize' | 'explain' | 'general'

export interface BookCommandPromptConfigItem {
  key: string
  command: string
  category: BookCommandCategory
  label: string
  icon: string
  aliases: string[]
  description: string
  promptDirective: string
  isBuiltIn: boolean
}

export type BookMaterialType =
  | 'video-course'
  | 'ereader-spa'
  | 'ebook-web'
  | 'course-docs'
  | 'local-pdf'
  | 'local-ebook'
  | 'local-doc'
  | 'generic-article'

export interface PageDesignPromptSettings {
  includeDesignSummary: boolean
  preserveMarkdownStructure: boolean
  includeFigureCaptions: boolean
  includeVideoTranscript: boolean
  designGuidancePrompt: string
}

export const DEFAULT_PAGE_DESIGN_GUIDANCE =
  'Note on Source Material & Page Design: This extraction is tailored to the detected material layout (section hierarchy, callout boxes, code blocks, tables, figure/diagram descriptions, or video transcript timestamps). Use these structural cues—and reference code blocks, diagrams, tables, or timestamps directly—to produce an accurate, well-organized response.'

export const DEFAULT_PAGE_DESIGN_SETTINGS: PageDesignPromptSettings = {
  includeDesignSummary: true,
  preserveMarkdownStructure: true,
  includeFigureCaptions: true,
  includeVideoTranscript: true,
  designGuidancePrompt: DEFAULT_PAGE_DESIGN_GUIDANCE,
}

export interface BookCommandPromptOverrides {
  overrides: Record<
    string,
    {
      label?: string
      icon?: string
      description?: string
      promptDirective?: string
      aliases?: string[]
    }
  >
  customCommands?: Array<{
    key: string
    label: string
    icon: string
    description: string
    promptDirective: string
    category: BookCommandCategory
  }>
  pageDesign?: PageDesignPromptSettings
}

export const DEFAULT_DESIGN_COMMAND_DIRECTIVE =
  'Analyze both the content and the structural/pedagogical design of this BookView page:\n' +
  '1. **Material Format & Layout Strategy**: Identify how the page organizes concepts (e.g., heading outline, progressive examples, code listings, charts, or callouts).\n' +
  '2. **Core Concepts & Relationships**: Summarize what each major section, table, diagram/figure, or code block teaches.\n' +
  '3. **Key Visual & Structural Cues**: Highlight any crucial warnings, edge cases, complexity plots, or cross-references emphasized by the author.\n' +
  '4. **Synthesis**: Provide a clean study takeaway tying the text and visual elements together.'

export const DEFAULT_VIDEO_COMMAND_DIRECTIVE =
  'Analyze this BookView video lecture using its playback timestamp, transcript cues, and module outline:\n' +
  '1. **Current Focus / Timestamped Context**: Identify what the instructor is explaining right around the active timestamp (or across the full lecture).\n' +
  '2. **Key Technical Points & Examples**: Summarize core explanations, definitions, and code/workflow demonstrations mentioned in the transcript.\n' +
  '3. **Timestamped Topic Breakdown**: List major subtopics with their `[MM:SS]` timestamps so I can jump back quickly.\n' +
  '4. **Practical Takeaways & Check Questions**: Key rules to remember + 2 quick self-check questions.'

export const DEFAULT_QUIZ_DIRECTIVE =
  'Based on this BookView content, create 3–5 targeted review questions with detailed answers and explanations to test deep understanding (mix conceptual questions, edge cases, and practical application).'

export const DEFAULT_EXTRACT_INPUTS_DIRECTIVE =
  'Extract all parameters, form inputs, configuration fields, constraints, and actionable steps from this BookView page into a clean structured reference.'

export const SUMMARY_STYLE_PRESETS: BookSummaryStylePreset[] = [
  {
    id: 'brief',
    label: 'Brief TL;DR',
    icon: '⚡',
    aliases: ['brief', 'tldr', 'short', 'quick', 'executive', 'bullets'],
    description: '1-sentence core thesis + 3–5 ultra-concise takeaway bullets',
    promptDirective:
      'Provide a crisp Executive TL;DR of this BookView content:\n' +
      '1. **One-Sentence Core Thesis**: What is the single most important idea?\n' +
      '2. **Key Takeaways (3–5 concise bullets)**: Only the highest-signal facts or rules.',
  },
  {
    id: 'deep',
    label: 'Deep Dive',
    icon: '🔬',
    aliases: ['deep', 'detailed', 'comprehensive', 'thorough', 'technical', 'full'],
    description: 'Comprehensive section-by-section technical breakdown with all definitions and examples',
    promptDirective:
      'Provide a comprehensive, deep technical summary of this BookView content:\n' +
      '1. **Core Purpose & Context**: What problem does this solve and why does it matter?\n' +
      '2. **Section-by-Section Technical Breakdown**: Cover every key mechanism, definition, invariant, and rule in detail without skipping nuances.\n' +
      '3. **Concrete Example & Data Flow**: Walk through the exact example(s) on the page with values and state transitions.\n' +
      '4. **Complexity, Trade-offs & Edge Cases**: Note any performance bounds, constraints, or subtle pitfalls.',
  },
  {
    id: 'steps',
    label: 'Step-by-Step',
    icon: '🔢',
    aliases: ['steps', 'step', 'algo', 'algorithm', 'walkthrough', 'trace', 'process', 'flow'],
    description: 'Structured step-by-step algorithm/process trace with state variables and edge cases',
    promptDirective:
      'Break down the algorithm, mechanism, or process in this BookView content step by step:\n' +
      '1. **Goal & Inputs/Outputs**: What are the inputs, preconditions, and expected output?\n' +
      '2. **State / Index Variables**: Define each variable, pointer, or component and its role.\n' +
      '3. **Step-by-Step Execution Trace**: Trace the exact steps sequentially (including how state changes on the page’s concrete example).\n' +
      '4. **Invariants & Edge Cases**: What invariant holds at each step, and what edge cases must be handled?',
  },
  {
    id: 'study',
    label: 'Study Notes',
    icon: '🎓',
    aliases: ['study', 'notes', 'cheatsheet', 'cornell', 'guide', 'exam', 'review'],
    description: 'Structured study sheet with mental model, key rules, pitfalls, and 3 self-test questions',
    promptDirective:
      'Create a structured Study Guide & Cheat Sheet from this BookView content:\n' +
      '1. **Core Mental Model**: How to visualize and remember this concept intuitively.\n' +
      '2. **Key Definitions, Rules & Formulas**: Bullet list of essential terms and rules.\n' +
      '3. **Worked Example Summary**: How the example on the page demonstrates the rule.\n' +
      '4. **Common Pitfalls / Gotchas**: Mistakes to avoid.\n' +
      '5. **Self-Test (3 Questions + Answers)**: 3 review questions with concise answers to verify mastery.',
  },
  {
    id: 'eli5',
    label: 'Intuition / ELI5',
    icon: '💡',
    aliases: ['eli5', 'intuition', 'simple', 'analogy', 'beginner', 'plain'],
    description: 'Plain-English real-world analogy first, then mapped to the formal technical concept',
    promptDirective:
      'Explain and summarize this BookView content using an intuition-first approach:\n' +
      '1. **Plain-English Intuition & Real-World Analogy**: Explain the idea simply as if to a smart beginner.\n' +
      '2. **Mapping to the Technical Mechanism**: Show how each part of the analogy corresponds to the actual variables, steps, or concepts on the page.\n' +
      '3. **Bottom-Line Takeaway**: A 2-sentence summary of what to remember.',
  },
  {
    id: 'table',
    label: 'Table / Matrix',
    icon: '📊',
    aliases: ['table', 'matrix', 'compare', 'comparison', 'grid', 'structured'],
    description: 'Summarizes concepts, variables, steps, or comparisons in a clean Markdown table',
    promptDirective:
      'Summarize this BookView content using a structured Markdown table:\n' +
      '1. **Overview**: 1–2 sentences introducing the topic.\n' +
      '2. **Structured Reference / Comparison Table**: Organize the key concepts, variables/indices, steps, or trade-offs into a clear Markdown table.\n' +
      '3. **Key Takeaways**: 3 concise bullet points highlighting the most important conclusions.',
  },
  {
    id: 'code',
    label: 'Code & Example',
    icon: '💻',
    aliases: ['code', 'implementation', 'impl', 'example', 'practical', 'snippet'],
    description: 'Concise conceptual summary + clean, well-commented runnable code implementation',
    promptDirective:
      'Summarize the concept on this BookView page and provide a clean, practical code implementation:\n' +
      '1. **Concept & Mechanism Summary**: Concisely explain how the mechanism/algorithm works.\n' +
      '2. **Clean, Commented Code Implementation**: Provide a complete, well-commented implementation with a runnable example matching the page.\n' +
      '3. **Complexity & Usage Notes**: Briefly note time/space complexity and key usage considerations.',
  },
]

export const DEFAULT_STRUCTURED_SUMMARY_DIRECTIVE =
  'Please provide a well-structured technical summary of this BookView content covering:\n' +
  '1. **Core Concept & Purpose**: What this section is about and the main problem it addresses.\n' +
  '2. **Key Mechanics & Step-by-Step Logic**: How the mechanism, algorithm, or concept works (including key variables, rules, or state changes).\n' +
  '3. **Concrete Example Walkthrough**: Trace the example shown on the page.\n' +
  '4. **Key Takeaways**: The most important points to remember.'

export const EXPLAIN_STYLE_PRESETS: BookSummaryStylePreset[] = [
  {
    id: 'eli5',
    label: 'Intuition / ELI5',
    icon: '🧠',
    aliases: ['eli5', 'intuition', 'simple', 'analogy', 'beginner', 'plain'],
    description: 'Real-world analogy first, then mapped 1-to-1 to the technical concept',
    promptDirective:
      'Teach and explain this BookView content using an intuition-first approach:\n' +
      '1. **Plain-English Intuition & Real-World Analogy**: Explain the core idea simply as if teaching a smart beginner, using a concrete everyday analogy.\n' +
      '2. **1-to-1 Mapping to Technical Terms**: Show exactly how each piece of the analogy maps to the formal variables, data structures, or rules on the page.\n' +
      '3. **Why It Clicks**: A concise summary of the mental model to keep in mind.',
  },
  {
    id: 'why',
    label: 'First Principles',
    icon: '🧱',
    aliases: ['why', 'first-principles', 'principles', 'deep', 'design', 'motivation', 'rationale'],
    description: 'Why is it designed this way? What problem forces this design & what invariants hold?',
    promptDirective:
      'Explain this BookView content from first principles like a senior computer science / engineering professor:\n' +
      '1. **The Underlying Problem & Motivation**: Why does this concept, algorithm, or architecture exist? What naive approach fails or is too slow?\n' +
      '2. **Design Rationale ("Why This Way?")**: Why is it designed this exact way rather than an alternative?\n' +
      '3. **Core Invariants & Guarantees**: What property or invariant holds true throughout execution, and what would break if a rule were violated?\n' +
      '4. **Complexity & Engineering Trade-offs**: Time/space costs and practical implications.',
  },
  {
    id: 'trace',
    label: 'Visual State Trace',
    icon: '🔍',
    aliases: ['trace', 'steps', 'step', 'visual', 'walkthrough', 'state', 'diagram', 'dryrun'],
    description: 'Step-by-step ASCII/Markdown state trace showing pointers, frames, or data structures at each step',
    promptDirective:
      'Explain the mechanism or algorithm on this BookView page using a visual step-by-step state trace:\n' +
      '1. **Initial Setup & State Variables**: Show the starting input and initial state (pointers, stack/queue contents, or variables).\n' +
      '2. **Step-by-Step Visual State Trace**: Walk through each step sequentially using clear ASCII/Markdown state diagrams showing **Before → Operation → After**.\n' +
      '3. **Termination & Final Output**: Show how the termination condition is reached and the final resulting state.',
  },
  {
    id: 'code',
    label: 'Code & Demo',
    icon: '💻',
    aliases: ['code', 'demo', 'example', 'impl', 'implementation', 'practical', 'runnable'],
    description: 'Tutor walkthrough with a clean, heavily commented runnable code implementation and sample output',
    promptDirective:
      'Explain this BookView concept through a practical, well-commented code tutorial:\n' +
      '1. **Conceptual Overview**: Briefly explain how the mechanism or data structure works.\n' +
      '2. **Clean, Line-by-Line Commented Implementation**: Write a complete, runnable implementation with clear inline comments explaining *why* each critical line is written that way.\n' +
      '3. **Driver Example & Expected Output**: Include a small runnable driver/test case and show its exact output.',
  },
  {
    id: 'compare',
    label: 'Compare / Vs',
    icon: '⚖️',
    aliases: ['compare', 'vs', 'versus', 'tradeoffs', 'alternatives', 'contrast', 'matrix'],
    description: 'Compares this concept against closely related alternatives, trade-offs, and when to use each',
    promptDirective:
      'Explain this BookView concept by comparing and contrasting it with its closest alternatives:\n' +
      '1. **What This Concept Does Best**: Core strengths and primary use cases.\n' +
      '2. **Head-to-Head Comparison Table**: Compare it against related concepts/structures (e.g., on the page or in the same domain) across operations, complexity, memory, and behavior.\n' +
      '3. **Decision Guide ("When to Use Which")**: Clear rules of thumb for choosing this approach vs. an alternative in practice.',
  },
  {
    id: 'pitfalls',
    label: 'Pitfalls & Q&A',
    icon: '🧑‍🏫',
    aliases: ['pitfalls', 'socratic', 'gotchas', 'bugs', 'misconceptions', 'edge-cases', 'qa', 'faq'],
    description: 'Unpacks common misconceptions ("Why might you think X?"), subtle bugs, and edge cases',
    promptDirective:
      'Act as an expert tutor and explain the trickiest parts, misconceptions, and edge cases of this BookView content:\n' +
      '1. **Top Misconceptions ("Why might you think X, and why is it actually Y?")**: Clarify the most confusing or counter-intuitive aspects.\n' +
      '2. **Common Bugs & Off-by-One / Boundary Traps**: What mistakes do engineers or students most frequently make when implementing or applying this?\n' +
      '3. **Edge Cases to Watch Out For**: Empty inputs, single-element inputs, duplicates, or capacity limits.\n' +
      '4. **Quick Diagnostic Check**: 2 thought-provoking questions (with answers) to verify deep understanding.',
  },
]

export const DEFAULT_STRUCTURED_EXPLAIN_DIRECTIVE =
  'Please act as an expert technical tutor and explain this BookView content clearly so it clicks intuitively:\n' +
  '1. **Plain-English Intuition & Motivation**: What problem does this solve, and what is the simplest mental model or real-world analogy for it?\n' +
  '2. **How & Why It Works (Step-by-Step)**: Unpack the underlying mechanism, rules, and invariants step by step—explaining *why* each part works the way it does.\n' +
  '3. **Concrete Visual / Example Walkthrough**: Walk through a concrete example (showing how state or values change at each step).\n' +
  '4. **Practical Takeaways & Common Gotchas**: Key insights for applying this in practice and common mistakes to avoid.'

export type ParsedBookChatCommand =
  | {
      kind: 'status' | 'connect' | 'help'
      raw: string
    }
  | {
      kind: 'book-links'
      filter?: string
      showBadges: boolean
      raw: string
    }
  | {
      kind: 'book-badges'
      show: boolean
      raw: string
    }
  | {
      kind: 'book-click'
      id?: number
      text?: string
      raw: string
    }
  | {
      kind: 'book-nav'
      command:
        | 'scroll-down'
        | 'scroll-up'
        | 'scroll-top'
        | 'scroll-bottom'
        | 'next'
        | 'prev'
        | 'back'
        | 'forward'
        | 'reload'
        | 'home'
        | 'url'
      url?: string
      raw: string
    }
  | {
      kind: 'book-extract-card'
      scope: 'viewport' | 'full' | 'inputs'
      pageRangeHint?: { startPage: number; endPage: number }
      raw: string
    }
  | {
      kind: 'book-prompt-expansion'
      rawPrompt: string
      scope: 'viewport' | 'full' | 'inputs' | 'links' | 'selection'
      instruction: string
      hasInlineMacros: boolean
      pageRangeHint?: { startPage: number; endPage: number }
    }

/**
 * Extracts an optional PDF page or range token (e.g. `p14`, `p.14`, `p10-18`, `pages 5-10`, `@p14`)
 * and returns the normalized pageRangeHint plus remaining text.
 */
export function extractPdfPageRangeHint(text: string): {
  pageRangeHint?: { startPage: number; endPage: number }
  cleanedText: string
} {
  if (!text) return { cleanedText: '' }
  const match =
    text.match(/(?:^|\s)(?:@?p\.?|pg\.?|pages?:)\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?(?=\s|$)/i) ||
    text.match(/(?:^|\s)(?:page|pages)\s+(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?(?=\s*$)/i)
  if (!match) return { cleanedText: text }
  const p1 = Math.max(1, parseInt(match[1], 10))
  const p2 = match[2] ? Math.max(p1, parseInt(match[2], 10)) : p1
  const cleanedText = (text.slice(0, match.index || 0) + text.slice((match.index || 0) + match[0].length))
    .replace(/\s{2,}/g, ' ')
    .trim()
  return {
    pageRangeHint: { startPage: p1, endPage: p2 },
    cleanedText,
  }
}

/**
 * Parses a raw chat input string to determine if it is a Workbench ChatView command
 * or contains inline BookView context macros (@page, @book, @chapter, @inputs, @links, @selection).
 */
export function parseBookChatCommand(rawInput: string): ParsedBookChatCommand | null {
  const cleaned = (rawInput || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim()
  if (!cleaned) return null

  // Never re-intercept already-expanded BookView prompts, action results, or priming instructions
  if (
    cleaned.includes('### 📖 BookView Context:') ||
    cleaned.includes('### 📖 BookView Page Snapshot') ||
    cleaned.includes('### 🔗 BookView Interactive Links') ||
    cleaned.includes('### 🎛️ BookView Form & Interactive Inputs') ||
    cleaned.includes('[Workbench Action Result:') ||
    cleaned.includes('You are integrated with Workbench Desktop')
  ) {
    return null
  }

  const lower = cleaned.toLowerCase()

  // 1. Existing /status, /connect, and /help commands
  if (lower === '/status' || lower === '!status' || lower === 'wb:status') {
    return { kind: 'status', raw: cleaned }
  }
  if (
    lower === '/help' ||
    lower === '!help' ||
    lower === 'wb:help' ||
    lower === '/commands' ||
    lower === '!commands' ||
    lower === '/book-help' ||
    lower === '!book-help'
  ) {
    return { kind: 'help', raw: cleaned }
  }
  if (
    lower === '/connect' ||
    lower === '!connect' ||
    lower === 'wb:connect' ||
    lower === '/prime' ||
    lower === '!prime' ||
    lower === 'wb:prime'
  ) {
    return { kind: 'connect', raw: cleaned }
  }

  // 2. Link listing commands: /links, !links, /book-links, wb:links
  const linksMatch = cleaned.match(/^(?:\/|!|wb:)(?:book-)?links(?:\s+(.*))?$/i)
  if (linksMatch) {
    const arg = (linksMatch[1] || '').trim()
    return {
      kind: 'book-links',
      filter: arg || undefined,
      showBadges: true,
      raw: cleaned,
    }
  }

  // 3. Badge toggle commands: /badges, !badges, /unbadge, /clear-badges
  if (/^(?:\/|!|wb:)(?:badges|show-badges)$/i.test(cleaned)) {
    return { kind: 'book-badges', show: true, raw: cleaned }
  }
  if (/^(?:\/|!|wb:)(?:unbadge|clear-badges|hide-badges)$/i.test(cleaned)) {
    return { kind: 'book-badges', show: false, raw: cleaned }
  }

  // 4. Link / Button Click commands: /click <id|text>, !click <id|text>, /book-click <id|text>, wb:click <id|text>
  const clickMatch = cleaned.match(/^(?:\/|!|wb:)(?:book-)?click\s+(.+)$/i)
  if (clickMatch) {
    const targetRaw = clickMatch[1].trim().replace(/^["']|["']$/g, '')
    const idMatch = targetRaw.match(/^#?(\d+)$/)
    if (idMatch) {
      return {
        kind: 'book-click',
        id: parseInt(idMatch[1], 10),
        raw: cleaned,
      }
    }
    return {
      kind: 'book-click',
      text: targetRaw,
      raw: cleaned,
    }
  }

  // 5. Navigation & Scrolling commands: /book <cmd>, /nav <cmd>, /next, /prev, /scroll-down, /scroll-up
  const directNavMatch = cleaned.match(
    /^(?:\/|!|wb:)(next|prev|previous|scroll-down|scroll-up|scrolldown|scrollup|scroll-top|scroll-bottom)(?:\s+page|\s+chapter)?$/i
  )
  if (directNavMatch) {
    const token = directNavMatch[1].toLowerCase()
    const map: Record<string, any> = {
      next: 'next',
      prev: 'prev',
      previous: 'prev',
      'scroll-down': 'scroll-down',
      scrolldown: 'scroll-down',
      'scroll-up': 'scroll-up',
      scrollup: 'scroll-up',
      'scroll-top': 'scroll-top',
      'scroll-bottom': 'scroll-bottom',
    }
    return {
      kind: 'book-nav',
      command: map[token] || 'scroll-down',
      raw: cleaned,
    }
  }

  const navSubMatch = cleaned.match(/^(?:\/|!|wb:)(?:book|nav|book-nav)\s+(.+)$/i)
  if (navSubMatch) {
    const sub = navSubMatch[1].trim()
    const subLower = sub.toLowerCase()
    if (subLower.startsWith('click ')) {
      const targetStr = sub.slice(6).trim().replace(/^["']|["']$/g, '')
      const idM = targetStr.match(/^#?(\d+)$/)
      return idM
        ? { kind: 'book-click', id: parseInt(idM[1], 10), raw: cleaned }
        : { kind: 'book-click', text: targetStr, raw: cleaned }
    }
    if (subLower === 'help' || subLower === 'commands') {
      return { kind: 'help', raw: cleaned }
    }
    if (subLower === 'links') {
      return { kind: 'book-links', showBadges: true, raw: cleaned }
    }
    if (subLower === 'page' || subLower === 'read') {
      return { kind: 'book-extract-card', scope: 'viewport', raw: cleaned }
    }
    const navMap: Record<string, any> = {
      down: 'scroll-down',
      'scroll-down': 'scroll-down',
      up: 'scroll-up',
      'scroll-up': 'scroll-up',
      top: 'scroll-top',
      'scroll-top': 'scroll-top',
      bottom: 'scroll-bottom',
      'scroll-bottom': 'scroll-bottom',
      next: 'next',
      prev: 'prev',
      previous: 'prev',
      back: 'back',
      forward: 'forward',
      reload: 'reload',
      refresh: 'reload',
      home: 'home',
    }
    if (navMap[subLower]) {
      return {
        kind: 'book-nav',
        command: navMap[subLower],
        raw: cleaned,
      }
    }
    if (subLower.startsWith('http://') || subLower.startsWith('https://') || subLower.startsWith('url ')) {
      const urlVal = subLower.startsWith('url ') ? sub.slice(4).trim() : sub
      return {
        kind: 'book-nav',
        command: 'url',
        url: urlVal,
        raw: cleaned,
      }
    }
  }

  // 6. Page / Chapter / Inputs Extraction Slash Commands:
  //    - "/page" or "/read-page" alone -> opens interactive extraction preview card in ChatView
  //    - "/page <instruction>" -> extracts visible page, combines with instruction, and submits to AI
  //    - "/chapter [instruction]" -> full chapter extraction
  //    - "/inputs [instruction]" -> extracts form inputs from BookView
  const pageCmdMatch = cleaned.match(/^(?:\/|!|wb:)(page|read-page|book-page|chapter|full-page|inputs|book-inputs)(?:\s+([\s\S]+))?$/i)
  if (pageCmdMatch) {
    const cmdType = pageCmdMatch[1].toLowerCase()
    const rawInstr = (pageCmdMatch[2] || '').trim()
    const { pageRangeHint, cleanedText: instruction } = extractPdfPageRangeHint(rawInstr)
    const scope: 'viewport' | 'full' | 'inputs' =
      cmdType === 'chapter' || cmdType === 'full-page'
        ? 'full'
        : cmdType === 'inputs' || cmdType === 'book-inputs'
        ? 'inputs'
        : 'viewport'

    if (!instruction) {
      return {
        kind: 'book-extract-card',
        scope,
        pageRangeHint,
        raw: cleaned,
      }
    }

    return {
      kind: 'book-prompt-expansion',
      rawPrompt: cleaned,
      scope,
      instruction,
      hasInlineMacros: false,
      pageRangeHint,
    }
  }

  // 7. Inline Context Macros inside normal chat prompts:
  //    Supports @page, @book, @chapter, @inputs, @links, @selection
  if (/(?:^|\s)@(page|book|chapter|inputs|links|selection)\b/i.test(cleaned)) {
    const needsFull = /(?:^|\s)@chapter\b/i.test(cleaned)
    return {
      kind: 'book-prompt-expansion',
      rawPrompt: cleaned,
      scope: needsFull ? 'full' : 'viewport',
      instruction: cleaned,
      hasInlineMacros: true,
    }
  }

  return null
}

/**
 * Builds the default catalog of all configurable BookView chat commands across
 * Summarize, Explain, and General utility actions.
 */
export function getDefaultBookCommandCatalog(): BookCommandPromptConfigItem[] {
  const summaryStyleIds = ['brief', 'deep', 'steps', 'study', 'table']
  const items: BookCommandPromptConfigItem[] = [
    {
      key: 'summarize',
      command: '/chapter summarize',
      category: 'summarize',
      label: 'Summarize (Default)',
      icon: '📝',
      aliases: ['summarize', 'summary'],
      description: 'Default 4-part structured technical summary (Core Concept, Mechanics, Example, Takeaways)',
      promptDirective: DEFAULT_STRUCTURED_SUMMARY_DIRECTIVE,
      isBuiltIn: true,
    },
    ...SUMMARY_STYLE_PRESETS.filter((p) => summaryStyleIds.includes(p.id)).map((p) => ({
      key: `summarize:${p.id}`,
      command: `/chapter summarize:${p.id}`,
      category: 'summarize' as const,
      label: p.label,
      icon: p.icon,
      aliases: p.aliases,
      description: p.description,
      promptDirective: p.promptDirective,
      isBuiltIn: true,
    })),
    {
      key: 'explain',
      command: '/chapter explain',
      category: 'explain',
      label: 'Explain (Default)',
      icon: '💡',
      aliases: ['explain'],
      description: 'Default 4-part pedagogical tutor explanation (Intuition, How & Why, Walkthrough, Gotchas)',
      promptDirective: DEFAULT_STRUCTURED_EXPLAIN_DIRECTIVE,
      isBuiltIn: true,
    },
    ...EXPLAIN_STYLE_PRESETS.map((p) => ({
      key: `explain:${p.id}`,
      command: `/chapter explain:${p.id}`,
      category: 'explain' as const,
      label: p.label,
      icon: p.icon,
      aliases: p.aliases,
      description: p.description,
      promptDirective: p.promptDirective,
      isBuiltIn: true,
    })),
    {
      key: 'quiz',
      command: '/chapter quiz',
      category: 'general',
      label: 'Quiz Me',
      icon: '❓',
      aliases: ['quiz', 'test', 'questions'],
      description: 'Generates targeted review questions with detailed answers to test comprehension',
      promptDirective: DEFAULT_QUIZ_DIRECTIVE,
      isBuiltIn: true,
    },
    {
      key: 'extract-inputs',
      command: '/chapter extract-inputs',
      category: 'general',
      label: 'Extract Inputs & Steps',
      icon: '🎛️',
      aliases: ['extract-inputs', 'extract'],
      description: 'Extracts parameters, form fields, constraints, and actionable steps from the page',
      promptDirective: DEFAULT_EXTRACT_INPUTS_DIRECTIVE,
      isBuiltIn: true,
    },
    {
      key: 'design',
      command: '/chapter design',
      category: 'general',
      label: 'Analyze Page Design',
      icon: '🏗️',
      aliases: ['design', 'structure', 'layout'],
      description: 'Analyzes headings, tables, code blocks, callouts, charts/diagrams, and visual page structure',
      promptDirective: DEFAULT_DESIGN_COMMAND_DIRECTIVE,
      isBuiltIn: true,
    },
    {
      key: 'video',
      command: '/chapter video',
      category: 'general',
      label: 'Video Lecture Breakdown',
      icon: '🎬',
      aliases: ['video', 'transcript', 'lecture'],
      description: 'Summarizes video course lectures using active playback timestamps and transcript cues',
      promptDirective: DEFAULT_VIDEO_COMMAND_DIRECTIVE,
      isBuiltIn: true,
    },
  ]
  return items
}

/**
 * Returns the effective Summarize style presets after applying user overrides & custom summarize commands.
 */
export function getEffectiveSummaryPresets(commandOverrides?: BookCommandPromptOverrides): BookSummaryStylePreset[] {
  const ov = commandOverrides?.overrides || {}
  const base = SUMMARY_STYLE_PRESETS.map((p) => {
    const patch = ov[`summarize:${p.id}`]
    if (!patch) return p
    return {
      ...p,
      label: patch.label ?? p.label,
      icon: patch.icon ?? p.icon,
      description: patch.description ?? p.description,
      promptDirective: patch.promptDirective ?? p.promptDirective,
      aliases: Array.isArray(patch.aliases) && patch.aliases.length > 0 ? patch.aliases : p.aliases,
    }
  })

  const customSummarize = (commandOverrides?.customCommands || []).filter((c) => c.category === 'summarize')
  for (const c of customSummarize) {
    base.push({
      id: c.key,
      label: c.label,
      icon: c.icon || '📝',
      aliases: [c.key],
      description: c.description,
      promptDirective: c.promptDirective,
    })
  }
  return base
}

/**
 * Returns the effective Explain style presets after applying user overrides & custom explain commands.
 */
export function getEffectiveExplainPresets(commandOverrides?: BookCommandPromptOverrides): BookSummaryStylePreset[] {
  const ov = commandOverrides?.overrides || {}
  const base = EXPLAIN_STYLE_PRESETS.map((p) => {
    const patch = ov[`explain:${p.id}`]
    if (!patch) return p
    return {
      ...p,
      label: patch.label ?? p.label,
      icon: patch.icon ?? p.icon,
      description: patch.description ?? p.description,
      promptDirective: patch.promptDirective ?? p.promptDirective,
      aliases: Array.isArray(patch.aliases) && patch.aliases.length > 0 ? patch.aliases : p.aliases,
    }
  })

  const customExplain = (commandOverrides?.customCommands || []).filter((c) => c.category === 'explain')
  for (const c of customExplain) {
    base.push({
      id: c.key,
      label: c.label,
      icon: c.icon || '💡',
      aliases: [c.key],
      description: c.description,
      promptDirective: c.promptDirective,
    })
  }
  return base
}

/**
 * Resolves shorthand summarization style flags (e.g., `summarize:deep`, `summarize:steps`, `:study`, `--table`),
 * bare template triggers (`summarize`, `explain`, `quiz`), configured command overrides, and custom user templates (`#template-id`)
 * into rich, structured prompt instructions.
 */
export function resolveBookInstructionWithPresets(
  rawInstruction: string,
  userTemplates?: CustomUserPromptTemplate[],
  commandOverrides?: BookCommandPromptOverrides
): string {
  const trimmed = (rawInstruction || '').trim()
  const ov = commandOverrides?.overrides || {}
  const customCommands = commandOverrides?.customCommands || []

  if (!trimmed) {
    return ov['summarize']?.promptDirective || DEFAULT_STRUCTURED_SUMMARY_DIRECTIVE
  }

  // Helper to strip `{text}` placeholder from AskAITemplate prompts when used as a header instruction
  const cleanTemplatePrompt = (tplPrompt: string): string => {
    return tplPrompt
      .replace(/\n*["']?\{text\}["']?\s*$/i, '')
      .replace(/\{text\}/gi, 'the BookView content below')
      .trim()
  }

  const effectiveSummaryPresets = getEffectiveSummaryPresets(commandOverrides)
  const effectiveExplainPresets = getEffectiveExplainPresets(commandOverrides)

  // 1. Check explicit `#template-id`, `summarize:<style>`, `explain:<style>`, or `:style` prefix at start of instruction:
  //    e.g. "/chapter #study-notes", "/chapter :deep", "/chapter summarize:steps", "/chapter explain:trace", "/page --table"
  const styleMatch = trimmed.match(
    /^(?:(summarize|summary|explain)\s*(?::|--|\s+)|(?:#|:|--))([a-zA-Z0-9_-]+)(?:\s+([\s\S]+))?$/i
  )
  if (styleMatch) {
    const modePrefix = (styleMatch[1] || '').toLowerCase()
    const styleToken = styleMatch[2].toLowerCase()
    const extraFocus = (styleMatch[3] || '').trim()

    // 1a. Check custom commands from BookCommandConfigModal
    const matchedCustomCmd = customCommands.find((c) => c.key.toLowerCase() === styleToken)
    if (matchedCustomCmd && matchedCustomCmd.promptDirective) {
      const base = cleanTemplatePrompt(matchedCustomCmd.promptDirective)
      return extraFocus ? `${base}\n\n**Additional Focus / Instruction:** ${extraFocus}` : base
    }

    // 1b. Check user-defined AskAI templates (by id or slugified name)
    if (userTemplates && userTemplates.length > 0) {
      const matchedUserTpl = userTemplates.find(
        (t) =>
          t.id.toLowerCase() === styleToken ||
          t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === styleToken ||
          t.name.toLowerCase() === styleToken
      )
      if (matchedUserTpl && matchedUserTpl.prompt) {
        const base = cleanTemplatePrompt(matchedUserTpl.prompt)
        return extraFocus ? `${base}\n\n**Additional Focus / Instruction:** ${extraFocus}` : base
      }
    }

    // 1c. If explicitly prefixed with `explain`, check effectiveExplainPresets first, then fallback to effectiveSummaryPresets
    const primaryList = modePrefix === 'explain' ? effectiveExplainPresets : effectiveSummaryPresets
    const fallbackList = modePrefix === 'explain' ? effectiveSummaryPresets : effectiveExplainPresets

    const matchedPreset =
      primaryList.find((p) => p.id === styleToken || p.aliases.includes(styleToken)) ||
      fallbackList.find((p) => p.id === styleToken || p.aliases.includes(styleToken))

    if (matchedPreset) {
      const base = cleanTemplatePrompt(matchedPreset.promptDirective)
      return extraFocus ? `${base}\n\n**Additional Focus / Instruction:** ${extraFocus}` : base
    }
  }

  // 2. Check bare single-keyword triggers & configured command keys: "summarize", "summary", "explain", "quiz", "code", "extract-inputs"
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase()
  const restAfterFirstWord = trimmed.slice(firstWord.length).trim()
  const matchedCustomBare = customCommands.find((c) => c.key.toLowerCase() === firstWord)
  if (matchedCustomBare && matchedCustomBare.promptDirective) {
    const base = cleanTemplatePrompt(matchedCustomBare.promptDirective)
    return restAfterFirstWord ? `${base}\n\n**Additional Focus / Instruction:** ${restAfterFirstWord}` : base
  }

  const lower = trimmed.toLowerCase()
  if (lower === 'summarize' || lower === 'summary') {
    if (ov['summarize']?.promptDirective) {
      return cleanTemplatePrompt(ov['summarize'].promptDirective)
    }
    const customSummarize = userTemplates?.find((t) => t.id === 'summarize')
    const defaultStockSummarize = 'Please summarize the key takeaways of the following excerpt:\n\n"{text}"'
    if (
      customSummarize &&
      customSummarize.prompt &&
      customSummarize.prompt.trim() !== defaultStockSummarize
    ) {
      return cleanTemplatePrompt(customSummarize.prompt)
    }
    return DEFAULT_STRUCTURED_SUMMARY_DIRECTIVE
  }

  if (lower === 'explain') {
    if (ov['explain']?.promptDirective) {
      return cleanTemplatePrompt(ov['explain'].promptDirective)
    }
    const customExplain = userTemplates?.find((t) => t.id === 'explain')
    const defaultStockExplain =
      'Please explain the following concept clearly in simple terms with practical examples:\n\n"{text}"'
    if (
      customExplain &&
      customExplain.prompt &&
      customExplain.prompt.trim() !== defaultStockExplain
    ) {
      return cleanTemplatePrompt(customExplain.prompt)
    }
    return DEFAULT_STRUCTURED_EXPLAIN_DIRECTIVE
  }

  if (lower === 'extract-inputs' || lower === 'extract') {
    return cleanTemplatePrompt(ov['extract-inputs']?.promptDirective || DEFAULT_EXTRACT_INPUTS_DIRECTIVE)
  }

  if (lower === 'design' || lower === 'structure' || lower === 'layout') {
    return cleanTemplatePrompt(ov['design']?.promptDirective || DEFAULT_DESIGN_COMMAND_DIRECTIVE)
  }

  if (lower === 'video' || lower === 'transcript' || lower === 'lecture') {
    return cleanTemplatePrompt(ov['video']?.promptDirective || DEFAULT_VIDEO_COMMAND_DIRECTIVE)
  }

  if (lower === 'quiz') {
    if (ov['quiz']?.promptDirective) {
      return cleanTemplatePrompt(ov['quiz'].promptDirective)
    }
    const matchedTpl = userTemplates?.find((t) => t.id === 'quiz')
    if (matchedTpl && matchedTpl.prompt) {
      return cleanTemplatePrompt(matchedTpl.prompt)
    }
    return DEFAULT_QUIZ_DIRECTIVE
  }

  if (lower === 'code') {
    if (ov['explain:code']?.promptDirective) {
      return cleanTemplatePrompt(ov['explain:code'].promptDirective)
    }
    const matchedTpl = userTemplates?.find((t) => t.id === 'code')
    if (matchedTpl && matchedTpl.prompt) {
      return cleanTemplatePrompt(matchedTpl.prompt)
    }
    const codePreset = effectiveSummaryPresets.find((p) => p.id === 'code')
    if (codePreset) return codePreset.promptDirective
  }

  // 3. Check if the user typed `#<template-id>` anywhere or exact custom template name
  if (trimmed.startsWith('#') && userTemplates && userTemplates.length > 0) {
    const token = trimmed.slice(1).trim().toLowerCase()
    const matchedUserTpl = userTemplates.find(
      (t) =>
        t.id.toLowerCase() === token ||
        t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === token ||
        t.name.toLowerCase() === token
    )
    if (matchedUserTpl && matchedUserTpl.prompt) {
      return cleanTemplatePrompt(matchedUserTpl.prompt)
    }
  }

  return trimmed
}

/**
 * Expands a parsed `book-prompt-expansion` command or inline `@page` / `@chapter` / `@inputs` / `@links` / `@selection`
 * prompt using the extracted `BookPageExtractionResult` from `BookViewHandler`.
 */
export function buildExpandedBookPrompt(
  parsed: Extract<ParsedBookChatCommand, { kind: 'book-prompt-expansion' }>,
  pageData: any,
  options?: { userTemplates?: CustomUserPromptTemplate[]; commandOverrides?: BookCommandPromptOverrides }
): string {
  const effectiveDesignSettings: PageDesignPromptSettings = {
    ...DEFAULT_PAGE_DESIGN_SETTINGS,
    ...(options?.commandOverrides?.pageDesign || {}),
  }

  const designOptions = {
    includeDesignSummary: effectiveDesignSettings.includeDesignSummary,
    includeFigureCaptions: effectiveDesignSettings.includeFigureCaptions,
    includeVideoTranscript: effectiveDesignSettings.includeVideoTranscript,
  }

  const guidanceNote =
    effectiveDesignSettings.includeDesignSummary && effectiveDesignSettings.designGuidancePrompt?.trim()
      ? `\n\n> ${effectiveDesignSettings.designGuidancePrompt.trim()}`
      : ''

  if (!parsed.hasInlineMacros) {
    const resolvedInstruction = resolveBookInstructionWithPresets(
      parsed.instruction,
      options?.userTemplates,
      options?.commandOverrides
    )
    const contextBlock = formatBookPageMarkdown(pageData, {
      scope: parsed.scope,
      designOptions,
    })
    return `${resolvedInstruction}${guidanceNote}\n\n---\n${contextBlock}`
  }

  // Replace inline @tokens with clean labels and append the structured BookView context sections at the end
  const appendedSections: string[] = []
  const seenScopes = new Set<string>()

  // Also support shorthand style prefixes before inline @macros (e.g., "summarize:deep @chapter", "explain:trace @page")
  const rawWithResolvedPrefix = parsed.rawPrompt.replace(
    /^(summarize:[a-zA-Z0-9_-]+|summary:[a-zA-Z0-9_-]+|explain:[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+)\s+(?=@(?:page|book|chapter|inputs|links|selection)\b)/i,
    (_m, styleToken) =>
      `${resolveBookInstructionWithPresets(styleToken, options?.userTemplates, options?.commandOverrides)}\n\nContext: `
  )

  const expandedInstruction = rawWithResolvedPrefix.replace(
    /(^|\s)@(page|book|chapter|inputs|links|selection)\b/gi,
    (_full, prefix, tokenRaw) => {
      const token = String(tokenRaw).toLowerCase()
      if (token === 'page' || token === 'book') {
        if (!seenScopes.has('viewport')) {
          seenScopes.add('viewport')
          appendedSections.push(formatBookPageMarkdown(pageData, { scope: 'viewport', designOptions }))
        }
        return `${prefix}[the visible BookView page ("${pageData.title || 'Active Page'}")]`
      }
      if (token === 'chapter') {
        if (!seenScopes.has('full')) {
          seenScopes.add('full')
          appendedSections.push(formatBookPageMarkdown(pageData, { scope: 'full', designOptions }))
        }
        return `${prefix}[the full BookView chapter ("${pageData.chapter || pageData.title || 'Active Chapter'}")]`
      }
      if (token === 'inputs') {
        if (!seenScopes.has('inputs')) {
          seenScopes.add('inputs')
          appendedSections.push(formatBookPageMarkdown(pageData, { scope: 'inputs', designOptions }))
        }
        return `${prefix}[the form inputs on the BookView page]`
      }
      if (token === 'links') {
        if (!seenScopes.has('links')) {
          seenScopes.add('links')
          appendedSections.push(formatBookPageMarkdown(pageData, { scope: 'links', designOptions }))
        }
        return `${prefix}[the links on the BookView page]`
      }
      if (token === 'selection') {
        if (!seenScopes.has('selection')) {
          seenScopes.add('selection')
          const selText = pageData.selectedText || pageData.visibleText || ''
          appendedSections.push(
            `### ✨ Selected Text from BookView ("${pageData.title || ''}")\n> ${String(selText).replace(/\n/g, '\n> ')}`
          )
        }
        return `${prefix}[the highlighted selection in BookView]`
      }
      return _full
    }
  )

  return `${expandedInstruction.trim()}${guidanceNote}\n\n---\n${appendedSections.join('\n\n---\n')}`
}

