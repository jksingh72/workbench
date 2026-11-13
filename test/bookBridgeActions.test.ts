import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

import { ActionRegistry } from '../electron/actions/registry.ts'
import { ActionContext, ActionResult } from '../electron/actions/types.ts'
import {
  readBookPageAction,
  listBookLinksAction,
  clickBookLinkAction,
  navigateBookAction,
  formatBookPageMarkdown,
} from '../electron/actions/bookBridgeActions.ts'
import {
  parseBookChatCommand,
  buildExpandedBookPrompt,
  getDefaultBookCommandCatalog,
  getEffectiveExplainPresets,
  getEffectiveSummaryPresets,
} from '../electron/utils/bookCommandParser.ts'
import { setSafeInnerHTML } from '../electron/utils/safeDom.ts'
import type {
  BookPageExtractionResult,
  BookLinkItem,
  BookClickResult,
  BookNavResult,
} from '../electron/views/bookViewHandler.ts'

describe('ChatView <-> BookView Bridge Test Suite', () => {
  let registry: ActionRegistry
  let mockContext: ActionContext
  let samplePageData: BookPageExtractionResult
  let lastClickTarget: any = null
  let lastNavParams: any = null

  before(() => {
    registry = ActionRegistry.getInstance()
    registry.register(readBookPageAction)
    registry.register(listBookLinksAction)
    registry.register(clickBookLinkAction)
    registry.register(navigateBookAction)

    const sampleLinks: BookLinkItem[] = [
      { id: 1, text: 'Chapter 1: Foundations of Distributed Systems', href: 'https://learning.oreilly.com/ch1', type: 'link', inViewport: true },
      { id: 2, text: 'Chapter 2: Consensus & Raft Protocol', href: 'https://learning.oreilly.com/ch2', type: 'toc', inViewport: true },
      { id: 3, text: 'Next Chapter', href: 'https://learning.oreilly.com/ch3', type: 'nav', inViewport: true },
      { id: 4, text: 'Run Interactive Sandbox', href: '', type: 'button', inViewport: false },
    ]

    samplePageData = {
      success: true,
      mode: 'web',
      title: 'Designing Data-Intensive Applications - Chapter 2',
      chapter: 'Chapter 2: Replication and Consensus',
      url: 'https://learning.oreilly.com/library/view/ddia/ch02.html',
      scrollPercent: 42,
      selectedText: 'Linearizability is a recency guarantee on reads and writes of a register.',
      visibleText: 'Replication and Consensus\n\nIn this section we examine how distributed nodes reach consensus over unreliable networks.',
      fullText: 'Chapter 2 Full Content: Replication and Consensus\n\nIn this section we examine how distributed nodes reach consensus over unreliable networks.\n\nExtended section on Paxos and Raft.',
      headings: ['H1: Chapter 2: Replication and Consensus', 'H2: Leader Election', 'H3: Log Replication'],
      codeBlocks: ['function requestVote(term, candidateId) {\n  return sendRpc(term, candidateId);\n}'],
      inputs: [
        {
          id: 1,
          tag: 'input',
          label: 'Cluster Size (N)',
          name: 'cluster_size',
          type: 'number',
          value: '5',
          placeholder: 'Enter odd number of nodes',
        },
        {
          id: 2,
          tag: 'select',
          label: 'Consistency Level',
          name: 'consistency_mode',
          type: 'select',
          value: 'quorum',
          options: ['one', 'quorum', 'all'],
        },
      ],
      links: sampleLinks,
    }

    mockContext = {
      resolveSafePath: (t) => t,
      getActiveDirectory: () => process.cwd(),
      notify: () => {},
      refreshExplorer: () => {},
      openInTab: () => {},
      confirm: async () => true,
      getWorkspaceFolders: () => ({
        activeTarget: 'book',
        activeDirectory: process.cwd(),
        bookDirectory: process.cwd(),
        noteDirectory: process.cwd(),
      }),
      setActiveTarget: () => {},
      dispatch: async (payload: any, targetPane = 'book'): Promise<ActionResult> => {
        const actionName = (payload.action || payload.type || '').toLowerCase().trim()
        const def = registry.get(actionName)
        if (!def) {
          return {
            success: false,
            action: actionName,
            message: `Unknown action: ${actionName}`,
            error: `Unknown action: ${actionName}`,
          }
        }
        return def.execute(mockContext, payload, targetPane as any)
      },
      bookBridge: {
        extractVisiblePage: async () => samplePageData,
        extractAndIndexLinks: async (opts) => {
          const q = (opts?.filter || '').toLowerCase().trim()
          const filtered = q
            ? sampleLinks.filter((l) => l.text.toLowerCase().includes(q) || l.href.toLowerCase().includes(q))
            : sampleLinks
          return {
            success: true,
            title: samplePageData.title,
            url: samplePageData.url,
            links: filtered,
          }
        },
        clickLinkOrElement: async (target): Promise<BookClickResult> => {
          lastClickTarget = target
          if (typeof target.id === 'number') {
            const found = sampleLinks.find((l) => l.id === target.id)
            if (!found) {
              return { success: false, message: `Link #${target.id} not found`, error: `Link #${target.id} not found` }
            }
            return {
              success: true,
              message: `Clicked #${found.id} ("${found.text}")`,
              clickedId: found.id,
              clickedText: found.text,
              href: found.href,
              newUrl: found.href || samplePageData.url,
              newTitle: samplePageData.title,
            }
          }
          if (target.text) {
            const q = target.text.toLowerCase()
            const found = sampleLinks.find((l) => l.text.toLowerCase().includes(q))
            if (!found) {
              return { success: false, message: `No link matching "${target.text}"`, error: `No link matching "${target.text}"` }
            }
            return {
              success: true,
              message: `Clicked "${found.text}" (#${found.id})`,
              clickedId: found.id,
              clickedText: found.text,
              href: found.href,
              newUrl: found.href || samplePageData.url,
              newTitle: samplePageData.title,
            }
          }
          return { success: true, message: 'Clicked selector' }
        },
        scrollOrNavigate: async (params): Promise<BookNavResult> => {
          lastNavParams = params
          return {
            success: true,
            command: params.command,
            message: `BookView navigated (${params.command})`,
            scrollPercent: 68,
            title: samplePageData.title,
            url: samplePageData.url,
          }
        },
      },
    }
  })

  describe('1. Action Registry & Tool Group Integration', () => {
    test('registers read_book_page, list_book_links, click_book_link, and navigate_book with aliases', () => {
      assert.ok(registry.get('read_book_page'), 'read_book_page must be registered')
      assert.ok(registry.get('extract_book_page'), 'extract_book_page alias must resolve')
      assert.ok(registry.get('list_book_links'), 'list_book_links must be registered')
      assert.ok(registry.get('click_book_link'), 'click_book_link must be registered')
      assert.ok(registry.get('click_book'), 'click_book alias must resolve')
      assert.ok(registry.get('navigate_book'), 'navigate_book must be registered')
      assert.ok(registry.get('scroll_book'), 'scroll_book alias must resolve')
    })

    test('includes live BookView bridge actions in the "books" tool group and system prompt guide', () => {
      const groups = registry.getAvailableToolGroups()
      const booksGroup = groups.find((g) => g.id === 'books')
      assert.ok(booksGroup, 'books tool group must exist')
      assert.ok(booksGroup.actionIds.includes('read_book_page'))
      assert.ok(booksGroup.actionIds.includes('list_book_links'))
      assert.ok(booksGroup.actionIds.includes('click_book_link'))
      assert.ok(booksGroup.actionIds.includes('navigate_book'))

      const promptGuide = registry.generatePromptGuide({ provider: 'claude', selectedGroups: ['books'] })
      assert.ok(promptGuide.includes('read_book_page'), 'Prompt guide should document read_book_page')
      assert.ok(promptGuide.includes('click_book_link'), 'Prompt guide should document click_book_link')
      assert.ok(promptGuide.includes('navigate_book'), 'Prompt guide should document navigate_book')
    })
  })

  describe('2. Autonomous Book Bridge Actions Execution', () => {
    test('read_book_page extracts viewport text, inputs, and links', async () => {
      const res = await readBookPageAction.execute(mockContext, {
        scope: 'viewport',
        includeInputs: true,
        includeLinks: true,
        showBadges: true,
      })

      assert.strictEqual(res.success, true)
      assert.ok(res.details?.content.includes('Designing Data-Intensive Applications'))
      assert.ok(res.details?.content.includes('Replication and Consensus'))
      assert.ok(res.details?.content.includes('Cluster Size (N)'))
      assert.ok(res.details?.content.includes('**[Input #1]**'))
      assert.ok(res.details?.content.includes('**[#2]** "Chapter 2: Consensus & Raft Protocol" (TOC)'))
      assert.strictEqual(res.details?.inputCount, 2)
      assert.strictEqual(res.details?.linkCount, 4)
    })

    test('list_book_links supports filtering by keyword and returns indexed links', async () => {
      const res = await listBookLinksAction.execute(mockContext, {
        filter: 'Raft',
        showBadges: true,
      })

      assert.strictEqual(res.success, true)
      assert.strictEqual(res.details?.count, 1)
      assert.strictEqual(res.details?.links[0].id, 2)
      assert.ok(res.details?.content.includes('**[#2]** "Chapter 2: Consensus & Raft Protocol" [TOC | 👁️ Visible]'))
    })

    test('click_book_link clicks by badge id or fuzzy text match', async () => {
      const resById = await clickBookLinkAction.execute(mockContext, { id: 2 })
      assert.strictEqual(resById.success, true)
      assert.strictEqual(lastClickTarget.id, 2)
      assert.ok(resById.message.includes('Clicked #2'))

      const resByText = await clickBookLinkAction.execute(mockContext, { text: 'Next Chapter' })
      assert.strictEqual(resByText.success, true)
      assert.strictEqual(lastClickTarget.text, 'Next Chapter')
      assert.ok(resByText.message.includes('Next Chapter'))
    })

    test('navigate_book scrolls or navigates BookView', async () => {
      const res = await navigateBookAction.execute(mockContext, { command: 'down' })
      assert.strictEqual(res.success, true)
      assert.strictEqual(lastNavParams.command, 'scroll-down')
      assert.strictEqual(res.details?.command, 'scroll-down')
    })
  })

  describe('3. Pre-Send Chat Command & @Macro Parser', () => {
    test('parses /page, /chapter, /inputs, /links, /click, /book, /badges, and !wb equivalents', () => {
      const pPage = parseBookChatCommand('/page Summarize the Raft leader election algorithm')
      assert.ok(pPage)
      assert.strictEqual(pPage.kind, 'book-prompt-expansion')
      if (pPage.kind === 'book-prompt-expansion') {
        assert.strictEqual(pPage.scope, 'viewport')
        assert.strictEqual(pPage.instruction, 'Summarize the Raft leader election algorithm')
      }

      const pPageCard = parseBookChatCommand('/page')
      assert.ok(pPageCard)
      assert.strictEqual(pPageCard.kind, 'book-extract-card')
      if (pPageCard.kind === 'book-extract-card') {
        assert.strictEqual(pPageCard.scope, 'viewport')
      }

      const pChapter = parseBookChatCommand('!chapter Create study flashcards')
      assert.ok(pChapter)
      assert.strictEqual(pChapter.kind, 'book-prompt-expansion')
      if (pChapter.kind === 'book-prompt-expansion') {
        assert.strictEqual(pChapter.scope, 'full')
        assert.strictEqual(pChapter.instruction, 'Create study flashcards')
      }

      const pInputs = parseBookChatCommand('/inputs Fill out these parameters for a 5-node cluster')
      assert.ok(pInputs)
      assert.strictEqual(pInputs.kind, 'book-prompt-expansion')
      if (pInputs.kind === 'book-prompt-expansion') {
        assert.strictEqual(pInputs.scope, 'inputs')
        assert.strictEqual(pInputs.instruction, 'Fill out these parameters for a 5-node cluster')
      }

      const pLinks = parseBookChatCommand('/links consensus')
      assert.ok(pLinks)
      assert.strictEqual(pLinks.kind, 'book-links')
      if (pLinks.kind === 'book-links') {
        assert.strictEqual(pLinks.filter, 'consensus')
      }

      const pClickNum = parseBookChatCommand('/click #3')
      assert.ok(pClickNum)
      assert.strictEqual(pClickNum.kind, 'book-click')
      if (pClickNum.kind === 'book-click') {
        assert.strictEqual(pClickNum.id, 3)
      }

      const pClickText = parseBookChatCommand('/click "Next Chapter"')
      assert.ok(pClickText)
      assert.strictEqual(pClickText.kind, 'book-click')
      if (pClickText.kind === 'book-click') {
        assert.strictEqual(pClickText.text, 'Next Chapter')
      }

      const pNav = parseBookChatCommand('/book next')
      assert.ok(pNav)
      assert.strictEqual(pNav.kind, 'book-nav')
      if (pNav.kind === 'book-nav') {
        assert.strictEqual(pNav.command, 'next')
      }

      const pBadges = parseBookChatCommand('/unbadge')
      assert.ok(pBadges)
      assert.strictEqual(pBadges.kind, 'book-badges')
      if (pBadges.kind === 'book-badges') {
        assert.strictEqual(pBadges.show, false)
      }

      assert.strictEqual(parseBookChatCommand('/help')?.kind, 'help')
      assert.strictEqual(parseBookChatCommand('!help')?.kind, 'help')
      assert.strictEqual(parseBookChatCommand('/book help')?.kind, 'help')
    })

    test('parses inline @page, @inputs, @links, @chapter, @selection macros and expands prompt', () => {
      const raw = 'Given @inputs and the current @selection, explain how to configure the cluster.'
      const parsed = parseBookChatCommand(raw)

      assert.ok(parsed)
      assert.strictEqual(parsed.kind, 'book-prompt-expansion')
      if (parsed.kind === 'book-prompt-expansion') {
        assert.strictEqual(parsed.hasInlineMacros, true)
        const expanded = buildExpandedBookPrompt(parsed, samplePageData)
        assert.ok(expanded.includes('#### 🎛️ Page Inputs & Form Controls (2):'))
        assert.ok(expanded.includes('Cluster Size (N)'))
        assert.ok(expanded.includes('### ✨ Selected Text from BookView'))
        assert.ok(expanded.includes('Linearizability is a recency guarantee'))
        assert.ok(expanded.includes('explain how to configure the cluster.'))
      }
    })

    test('formats markdown snapshot cleanly via formatBookPageMarkdown', () => {
      const md = formatBookPageMarkdown(samplePageData, {
        scope: 'viewport',
      })
      assert.ok(md.includes('### 📖 BookView Page Snapshot'))
      assert.ok(md.includes('- **Title**: Designing Data-Intensive Applications - Chapter 2'))
      assert.ok(md.includes('#### ✨ Highlighted Selection in BookView:'))
      assert.ok(md.includes('#### 🎛️ Page Inputs & Form Controls (2):'))
      assert.ok(md.includes('#### 🔗 Interactive Links & Navigation (3 shown):'))
    })

    test('does not re-intercept already-expanded BookView context prompts or action results', () => {
      const alreadyExpanded = `Explain this\n\n---\n### 📖 BookView Context: "CSS @page Rule"\nSome text with @page inside.`
      assert.strictEqual(parseBookChatCommand(alreadyExpanded), null)

      const actionFeedback = `[Workbench Action Result: read_book_page]\nStatus: SUCCESS\nContains @page and @links`
      assert.strictEqual(parseBookChatCommand(actionFeedback), null)
    })

    test('expands summarization & explanation style shorthands (/chapter summarize:*, /chapter explain:*) and custom user templates', () => {
      // 1. Bare "/chapter summarize" expands to structured multi-part technical summary directive
      const bareCmd = parseBookChatCommand('/chapter summarize')
      assert.ok(bareCmd && bareCmd.kind === 'book-prompt-expansion')
      if (bareCmd && bareCmd.kind === 'book-prompt-expansion') {
        const expandedBare = buildExpandedBookPrompt(bareCmd, samplePageData)
        assert.ok(expandedBare.includes('Core Concept & Purpose'))
        assert.ok(expandedBare.includes('Key Mechanics & Step-by-Step Logic'))
        assert.ok(expandedBare.includes('Concrete Example Walkthrough'))
      }

      // 2. Shorthand "/chapter summarize:steps" expands to algorithm / step-by-step trace directive
      const stepsCmd = parseBookChatCommand('/chapter summarize:steps focus on pointer indices i, j, k')
      assert.ok(stepsCmd && stepsCmd.kind === 'book-prompt-expansion')
      if (stepsCmd && stepsCmd.kind === 'book-prompt-expansion') {
        const expandedSteps = buildExpandedBookPrompt(stepsCmd, samplePageData)
        assert.ok(expandedSteps.includes('Step-by-Step Execution Trace'))
        assert.ok(expandedSteps.includes('State / Index Variables'))
        assert.ok(expandedSteps.includes('Additional Focus / Instruction:** focus on pointer indices i, j, k'))
      }

      // 3. Shorthand "/page summarize:study" expands to Study Guide & Cheat Sheet
      const studyCmd = parseBookChatCommand('/page summarize:study')
      assert.ok(studyCmd && studyCmd.kind === 'book-prompt-expansion')
      if (studyCmd && studyCmd.kind === 'book-prompt-expansion') {
        const expandedStudy = buildExpandedBookPrompt(studyCmd, samplePageData)
        assert.ok(expandedStudy.includes('Study Guide & Cheat Sheet'))
        assert.ok(expandedStudy.includes('Self-Test (3 Questions + Answers)'))
      }

      // 4. Bare "/chapter explain" expands to structured pedagogical explanation directive
      const bareExplainCmd = parseBookChatCommand('/chapter explain')
      assert.ok(bareExplainCmd && bareExplainCmd.kind === 'book-prompt-expansion')
      if (bareExplainCmd && bareExplainCmd.kind === 'book-prompt-expansion') {
        const expandedExplain = buildExpandedBookPrompt(bareExplainCmd, samplePageData)
        assert.ok(expandedExplain.includes('Plain-English Intuition & Motivation'))
        assert.ok(expandedExplain.includes('How & Why It Works (Step-by-Step)'))
        assert.ok(expandedExplain.includes('Practical Takeaways & Common Gotchas'))
      }

      // 5. Shorthands "/chapter explain:why", "explain:trace @chapter", "/chapter explain:pitfalls"
      const explainWhyCmd = parseBookChatCommand('/chapter explain:why focus on loop invariants')
      assert.ok(explainWhyCmd && explainWhyCmd.kind === 'book-prompt-expansion')
      if (explainWhyCmd && explainWhyCmd.kind === 'book-prompt-expansion') {
        const expandedWhy = buildExpandedBookPrompt(explainWhyCmd, samplePageData)
        assert.ok(expandedWhy.includes('The Underlying Problem & Motivation'))
        assert.ok(expandedWhy.includes('Core Invariants & Guarantees'))
        assert.ok(expandedWhy.includes('Additional Focus / Instruction:** focus on loop invariants'))
      }

      const explainTraceCmd = parseBookChatCommand('explain:trace @chapter')
      assert.ok(explainTraceCmd && explainTraceCmd.kind === 'book-prompt-expansion')
      if (explainTraceCmd && explainTraceCmd.kind === 'book-prompt-expansion') {
        const expandedTrace = buildExpandedBookPrompt(explainTraceCmd, samplePageData)
        assert.ok(expandedTrace.includes('Initial Setup & State Variables'))
        assert.ok(expandedTrace.includes('Step-by-Step Visual State Trace'))
      }

      const explainPitfallsCmd = parseBookChatCommand('/chapter explain:pitfalls')
      assert.ok(explainPitfallsCmd && explainPitfallsCmd.kind === 'book-prompt-expansion')
      if (explainPitfallsCmd && explainPitfallsCmd.kind === 'book-prompt-expansion') {
        const expandedPitfalls = buildExpandedBookPrompt(explainPitfallsCmd, samplePageData)
        assert.ok(expandedPitfalls.includes('Top Misconceptions'))
        assert.ok(expandedPitfalls.includes('Common Bugs & Off-by-One / Boundary Traps'))
      }

      // 6. Custom user template from AskAITemplateModal (/chapter #my-custom-style or customized "summarize")
      const customCmd = parseBookChatCommand('/chapter #interview-prep')
      assert.ok(customCmd && customCmd.kind === 'book-prompt-expansion')
      if (customCmd && customCmd.kind === 'book-prompt-expansion') {
        const expandedCustom = buildExpandedBookPrompt(customCmd, samplePageData, {
          userTemplates: [
            {
              id: 'interview-prep',
              name: 'Interview Prep',
              prompt: 'Extract 5 systems design interview questions and trade-offs from:\n\n"{text}"',
            },
          ],
        })
        assert.ok(expandedCustom.includes('Extract 5 systems design interview questions and trade-offs from:'))
        assert.ok(!expandedCustom.includes('{text}'))
      }
    })

    test('applies configured command overrides and custom commands from BookCommandConfigModal', () => {
      const catalog = getDefaultBookCommandCatalog()
      assert.ok(catalog.length >= 15, 'Catalog should expose all built-in Summarize, Explain, and Utility commands')
      assert.ok(catalog.some((i) => i.key === 'summarize:deep'))
      assert.ok(catalog.some((i) => i.key === 'explain:why'))
      assert.ok(catalog.some((i) => i.key === 'quiz'))

      const commandOverrides = {
        overrides: {
          'summarize:deep': {
            label: 'Ultra Deep',
            promptDirective: 'CUSTOM_DEEP_DIRECTIVE: Analyze memory layout and invariants carefully.',
          },
          'explain:why': {
            promptDirective: 'CUSTOM_WHY_DIRECTIVE: Focus strictly on amortized bounds.',
          },
        },
        customCommands: [
          {
            key: 'flashcards',
            category: 'explain' as const,
            label: 'Anki Cards',
            icon: '🃏',
            description: 'Generate Anki front/back flashcards',
            promptDirective: 'CUSTOM_FLASHCARD_DIRECTIVE: Produce 5 Anki cards.',
          },
        ],
      }

      const cmdDeep = parseBookChatCommand('/chapter summarize:deep focus on pointers')
      assert.ok(cmdDeep && cmdDeep.kind === 'book-prompt-expansion')
      if (cmdDeep && cmdDeep.kind === 'book-prompt-expansion') {
        const expanded = buildExpandedBookPrompt(cmdDeep, samplePageData, { commandOverrides })
        assert.ok(expanded.includes('CUSTOM_DEEP_DIRECTIVE: Analyze memory layout and invariants carefully.'))
        assert.ok(expanded.includes('Additional Focus / Instruction:** focus on pointers'))
      }

      const cmdFlash = parseBookChatCommand('/chapter explain:flashcards')
      assert.ok(cmdFlash && cmdFlash.kind === 'book-prompt-expansion')
      if (cmdFlash && cmdFlash.kind === 'book-prompt-expansion') {
        const expanded = buildExpandedBookPrompt(cmdFlash, samplePageData, { commandOverrides })
        assert.ok(expanded.includes('CUSTOM_FLASHCARD_DIRECTIVE: Produce 5 Anki cards.'))
      }

      const effSummary = getEffectiveSummaryPresets(commandOverrides)
      assert.strictEqual(effSummary.find((p) => p.id === 'deep')?.label, 'Ultra Deep')
      const effExplain = getEffectiveExplainPresets(commandOverrides)
      assert.ok(effExplain.some((p) => p.id === 'flashcards' && p.label === 'Anki Cards'))
    })

    test('parses PDF page hints, renders material-aware design/video snapshots, and applies pageDesign toggles', () => {
      // 1. Optional PDF page hints (/page p14 explain:why and /chapter p10-15)
      const pdfPageCmd = parseBookChatCommand('/page p14 explain:why')
      assert.ok(pdfPageCmd && pdfPageCmd.kind === 'book-prompt-expansion')
      if (pdfPageCmd && pdfPageCmd.kind === 'book-prompt-expansion') {
        assert.deepStrictEqual(pdfPageCmd.pageRangeHint, { startPage: 14, endPage: 14 })
        assert.strictEqual(pdfPageCmd.instruction, 'explain:why')
      }

      const pdfRangeCardCmd = parseBookChatCommand('/chapter p10-15')
      assert.ok(pdfRangeCardCmd && pdfRangeCardCmd.kind === 'book-extract-card')
      if (pdfRangeCardCmd && pdfRangeCardCmd.kind === 'book-extract-card') {
        assert.deepStrictEqual(pdfRangeCardCmd.pageRangeHint, { startPage: 10, endPage: 15 })
      }

      // 2. Course Docs page with PageDesign structure (outline, callouts, chart figures)
      const coursePage = {
        ...samplePageData,
        title: '5. Analyzing Complexity | CS 2110',
        pageDesign: {
          materialType: 'course-docs' as const,
          platformHint: 'course-docs',
          containerSelector: '.bd-article-container',
          breadcrumbs: ['CS 2110', '5. Analyzing Complexity'],
          inPageOutline: ['Measuring Runtime', 'Asymptotic Notation'],
          hasSidebarToc: true,
          headingOutline: [{ level: 1, text: '5. Analyzing Complexity', inViewport: true }],
          figures: [{ caption: 'Runtime on paritySplit()', alt: 'Linear runtime plot', kind: 'chart' as const, inViewport: true }],
          callouts: [{ kind: 'NOTE', text: 'Loop invariant must hold at entry and exit.', inViewport: true }],
          tableCount: 1,
          interactiveWidgets: [],
        },
      }

      const designCmd = parseBookChatCommand('/chapter design')
      assert.ok(designCmd && designCmd.kind === 'book-prompt-expansion')
      if (designCmd && designCmd.kind === 'book-prompt-expansion') {
        const expandedWithDesign = buildExpandedBookPrompt(designCmd, coursePage)
        assert.ok(expandedWithDesign.includes('Material Format**: 📘 Course Notes & Documentation'))
        assert.ok(expandedWithDesign.includes('#### 🏗️ Source Material & Page Structure:'))
        assert.ok(expandedWithDesign.includes('Runtime on paritySplit()'))
        assert.ok(expandedWithDesign.includes('Note on Source Material & Page Design:'))

        const expandedMinimal = buildExpandedBookPrompt(designCmd, coursePage, {
          commandOverrides: {
            overrides: {},
            pageDesign: {
              includeDesignSummary: false,
              preserveMarkdownStructure: true,
              includeFigureCaptions: false,
              includeVideoTranscript: false,
              designGuidancePrompt: 'CUSTOM_DISABLED',
            },
          },
        })
        assert.ok(!expandedMinimal.includes('#### 🏗️ Source Material & Page Structure:'))
        assert.ok(!expandedMinimal.includes('CUSTOM_DISABLED'))
      }

      // 3. Video Course snapshot renders playback timestamp & active transcript context
      const videoPage = {
        success: true,
        mode: 'web' as const,
        title: 'Distributed Consensus Video Lecture',
        chapter: 'Distributed Consensus [04:32 / 18:15]',
        url: 'https://learning.oreilly.com/videos/ddia-video/1234',
        scrollPercent: 25,
        selectedText: '',
        visibleText: '▶ [04:32] Leader sends AppendEntries RPC to followers.',
        fullText: '[00:10] Introduction\n[04:32] Leader sends AppendEntries RPC to followers.',
        headings: ['1. Intro', '2. Leader Election'],
        codeBlocks: [],
        inputs: [],
        links: [],
        pageDesign: {
          materialType: 'video-course' as const,
          platformHint: 'oreilly-video',
          containerSelector: 'video-player',
          breadcrumbs: [],
          inPageOutline: ['1. Intro', '2. Leader Election'],
          hasSidebarToc: true,
          paginationLabel: 'Playback 04:32 / 18:15',
          headingOutline: [],
          figures: [],
          callouts: [],
          tableCount: 0,
          interactiveWidgets: [{ kind: 'video' as const, label: 'oreilly-video (04:32 / 18:15)' }],
          video: {
            hasVideo: true,
            platform: 'oreilly-video' as const,
            videoTitle: 'Distributed Consensus Video Lecture',
            currentTimeSec: 272,
            durationSec: 1095,
            currentTimestampFormatted: '04:32 / 18:15',
            paused: false,
            transcriptSource: 'dom-transcript' as const,
            nearbyCues: [{ time: '04:32', text: 'Leader sends AppendEntries RPC to followers.', isCurrent: true }],
            fullTranscript: '[00:10] Introduction\n[04:32] Leader sends AppendEntries RPC to followers.',
            chapters: [{ title: '1. Intro' }, { title: '2. Leader Election' }],
          },
        },
      }

      const videoCmd = parseBookChatCommand('/page video')
      assert.ok(videoCmd && videoCmd.kind === 'book-prompt-expansion')
      if (videoCmd && videoCmd.kind === 'book-prompt-expansion') {
        const expandedVideo = buildExpandedBookPrompt(videoCmd, videoPage)
        assert.ok(expandedVideo.includes('#### 🎬 Video Playback & Course Context:'))
        assert.ok(expandedVideo.includes('Playing at `04:32 / 18:15`'))
        assert.ok(expandedVideo.includes('Active Video Segment Around Current Playback Time'))
      }
    })

    test('setSafeInnerHTML builds DOM nodes without calling innerHTML (Gemini TrustedTypes CSP compatibility)', () => {
      class MockNode {
        nodeType = 1
        tagName: string
        namespaceURI?: string
        attributes = new Map<string, string>()
        children: Array<MockNode | { nodeType: 3; textContent: string }> = []
        ownerDocument: any

        constructor(tagName: string, doc: any, namespaceURI?: string) {
          this.tagName = tagName.toUpperCase()
          this.ownerDocument = doc
          this.namespaceURI = namespaceURI
        }

        get firstChild() {
          return this.children[0] || null
        }

        removeChild(child: any) {
          const idx = this.children.indexOf(child)
          if (idx >= 0) this.children.splice(idx, 1)
        }

        appendChild(child: any) {
          this.children.push(child)
          return child
        }

        setAttribute(k: string, v: string) {
          this.attributes.set(k, v)
        }

        set innerHTML(_val: string) {
          throw new TypeError("Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.")
        }
      }

      const mockDoc = {
        createElement: (tag: string) => new MockNode(tag, mockDoc),
        createElementNS: (ns: string, tag: string) => new MockNode(tag, mockDoc, ns),
        createTextNode: (text: string) => ({ nodeType: 3 as const, textContent: text }),
      }

      const container = new MockNode('div', mockDoc)
      setSafeInnerHTML(
        container as any,
        `<div style="display:flex;"><span class="title">📖 BookView &amp; &lt;Gemini&gt;</span><button id="wb-card-close-btn" data-prompt="Explain:">✕</button></div>`
      )

      assert.strictEqual(container.children.length, 1)
      const outerDiv = container.children[0] as MockNode
      assert.strictEqual(outerDiv.tagName, 'DIV')
      assert.strictEqual(outerDiv.attributes.get('style'), 'display:flex;')
      assert.strictEqual(outerDiv.children.length, 2)

      const spanNode = outerDiv.children[0] as MockNode
      assert.strictEqual(spanNode.tagName, 'SPAN')
      assert.strictEqual((spanNode.children[0] as any).textContent, '📖 BookView & <Gemini>')

      const btnNode = outerDiv.children[1] as MockNode
      assert.strictEqual(btnNode.tagName, 'BUTTON')
      assert.strictEqual(btnNode.attributes.get('id'), 'wb-card-close-btn')
      assert.strictEqual(btnNode.attributes.get('data-prompt'), 'Explain:')
    })
  })
})
