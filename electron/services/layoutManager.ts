import { BrowserWindow, Rectangle } from 'electron'
import { BookViewHandler } from '../views/bookViewHandler'
import { AIViewHandler } from '../views/aiViewHandler'
import { NoteViewHandler } from '../views/noteViewHandler'

export interface DOMBounds {
  x: number
  y: number
  width: number
  height: number
}

export class LayoutManager {
  private mainWindow: BrowserWindow
  private bookHandler: BookViewHandler
  private aiHandler: AIViewHandler
  private noteHandler: NoteViewHandler

  private currentSplitRatio = 60
  private currentVerticalSplitRatio = 50
  private currentIsSwapped = false

  constructor(
    mainWindow: BrowserWindow,
    bookHandler: BookViewHandler,
    aiHandler: AIViewHandler,
    noteHandler: NoteViewHandler
  ) {
    this.mainWindow = mainWindow
    this.bookHandler = bookHandler
    this.aiHandler = aiHandler
    this.noteHandler = noteHandler
  }

  public setSplit(ratio: number, isSwapped?: boolean) {
    if (typeof ratio === 'number') this.currentSplitRatio = ratio
    if (typeof isSwapped === 'boolean') this.currentIsSwapped = isSwapped
    this.applyBounds()
  }

  public setVerticalSplit(ratio: number) {
    if (typeof ratio === 'number') this.currentVerticalSplitRatio = ratio
    this.applyBounds()
  }

  public setViewsVisible(params: boolean | { target?: 'book' | 'ai' | 'note' | 'all'; visible: boolean }) {
    if (typeof params === 'boolean') {
      this.bookHandler.setVisible(params)
      this.aiHandler.setVisible(params)
      this.noteHandler.setVisible(params)
      if (params) this.applyBounds()
      return
    }

    const { target = 'all', visible } = params
    if (target === 'book' || target === 'all') {
      this.bookHandler.setVisible(visible)
    }
    if (target === 'ai' || target === 'all') {
      this.aiHandler.setVisible(visible)
    }
    if (target === 'note' || target === 'all') {
      this.noteHandler.setVisible(visible)
    }
    if (visible) {
      this.applyBounds()
    }
  }

  public updateMeasuredBounds(bounds: { book?: DOMBounds; ai?: DOMBounds; note?: DOMBounds }) {
    const { book, ai, note } = bounds

    if (book && typeof book.x === 'number') {
      this.bookHandler.setBounds({
        x: Math.round(book.x),
        y: Math.round(book.y),
        width: Math.max(0, Math.round(book.width)),
        height: Math.max(0, Math.round(book.height)),
      })
    }

    if (ai && typeof ai.x === 'number') {
      this.aiHandler.setBounds({
        x: Math.round(ai.x),
        y: Math.round(ai.y),
        width: Math.max(0, Math.round(ai.width)),
        height: Math.max(0, Math.round(ai.height)),
      })
    }

    if (note && typeof note.x === 'number') {
      this.noteHandler.setBounds({
        x: Math.round(note.x),
        y: Math.round(note.y),
        width: Math.max(0, Math.round(note.width)),
        height: Math.max(0, Math.round(note.height)),
      })
    }
  }

  public applyBounds() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const bounds = this.mainWindow.contentView.getBounds()
    const headerHeight = 44
    const paneToolbarHeight = 38
    const topBarHeight = headerHeight + paneToolbarHeight
    const verticalSplitterWidth = 9
    const horizontalSplitterHeight = 9

    const availableWidth = bounds.width
    const availableWorkspaceHeight = Math.max(0, bounds.height - headerHeight)
    const fullContentHeight = Math.max(0, bounds.height - topBarHeight)

    if (this.currentSplitRatio >= 99) {
      const fullBounds = { x: 0, y: topBarHeight, width: availableWidth, height: fullContentHeight }
      const hiddenBounds = { x: 0, y: topBarHeight, width: 0, height: 0 }
      if (!this.currentIsSwapped) {
        this.bookHandler.setBounds(fullBounds)
        this.aiHandler.setBounds(hiddenBounds)
        this.noteHandler.setBounds(hiddenBounds)
      } else {
        this.aiHandler.setBounds(fullBounds)
        this.bookHandler.setBounds(hiddenBounds)
        this.noteHandler.setBounds(hiddenBounds)
      }
      return
    }

    if (this.currentSplitRatio <= 1) {
      const fullBounds = { x: 0, y: topBarHeight, width: availableWidth, height: fullContentHeight }
      const hiddenBounds = { x: 0, y: topBarHeight, width: 0, height: 0 }
      if (!this.currentIsSwapped) {
        this.bookHandler.setBounds(hiddenBounds)
        this.aiHandler.setBounds(fullBounds)
        this.noteHandler.setBounds(hiddenBounds)
      } else {
        this.aiHandler.setBounds(hiddenBounds)
        this.bookHandler.setBounds(fullBounds)
        this.noteHandler.setBounds(hiddenBounds)
      }
      return
    }

    const leftRatio = this.currentSplitRatio / 100
    const leftWidth = Math.max(0, Math.round((availableWidth - verticalSplitterWidth) * leftRatio))
    const rightWidth = Math.max(0, availableWidth - verticalSplitterWidth - leftWidth)
    const rightX = leftWidth + verticalSplitterWidth

    const chatPaneHeight = Math.round((availableWorkspaceHeight - horizontalSplitterHeight) * (this.currentVerticalSplitRatio / 100))
    const aiViewHeight = Math.max(0, chatPaneHeight - paneToolbarHeight)

    const totalRightColumnHeight = availableWorkspaceHeight - horizontalSplitterHeight
    const notePaneHeight = Math.max(0, totalRightColumnHeight - chatPaneHeight)
    const noteViewY = topBarHeight + aiViewHeight + horizontalSplitterHeight + paneToolbarHeight
    const noteViewHeight = Math.max(0, notePaneHeight - paneToolbarHeight)

    const bookBounds: Rectangle = { x: 0, y: topBarHeight, width: leftWidth, height: fullContentHeight }
    const aiBounds: Rectangle = { x: rightX, y: topBarHeight, width: rightWidth, height: aiViewHeight }
    const noteBounds: Rectangle = { x: rightX, y: noteViewY, width: rightWidth, height: noteViewHeight }

    if (!this.currentIsSwapped) {
      this.bookHandler.setBounds(bookBounds)
      this.aiHandler.setBounds(aiBounds)
      this.noteHandler.setBounds(noteBounds)
    } else {
      this.aiHandler.setBounds({ x: 0, y: topBarHeight, width: leftWidth, height: aiViewHeight })
      this.noteHandler.setBounds({ x: 0, y: noteViewY, width: leftWidth, height: noteViewHeight })
      this.bookHandler.setBounds({ x: rightX, y: topBarHeight, width: rightWidth, height: fullContentHeight })
    }
  }
}
