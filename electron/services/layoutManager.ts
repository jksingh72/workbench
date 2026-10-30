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

export interface ActivePanesState {
  book: boolean
  ai: boolean
  note: boolean
}

export class LayoutManager {
  private mainWindow: BrowserWindow
  private bookHandler: BookViewHandler
  private aiHandler: AIViewHandler
  private noteHandler: NoteViewHandler

  private currentSplitRatio = 60
  private currentVerticalSplitRatio = 50
  private currentIsSwapped = false
  private activePanes: ActivePanesState = { book: true, ai: true, note: true }
  private modalHidden = { book: false, ai: false, note: false }
  private isModalOpen = false
  private isDraggingSplitter = false
  private lastMeasuredBounds: {
    book?: DOMBounds
    ai?: DOMBounds
    note?: DOMBounds
    activePanes?: ActivePanesState
  } | null = null
  private lastContentSize: { width: number; height: number } | null = null

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

  public setSplit(ratio: number, isSwapped?: boolean, activePanes?: ActivePanesState) {
    let changed = false
    if (typeof ratio === 'number' && Math.abs(this.currentSplitRatio - ratio) > 0.001) {
      this.currentSplitRatio = ratio
      changed = true
    }
    if (typeof isSwapped === 'boolean' && this.currentIsSwapped !== isSwapped) {
      this.currentIsSwapped = isSwapped
      changed = true
    }
    if (activePanes) {
      if (
        this.activePanes.book !== Boolean(activePanes.book) ||
        this.activePanes.ai !== Boolean(activePanes.ai) ||
        this.activePanes.note !== Boolean(activePanes.note)
      ) {
        this.activePanes = {
          book: Boolean(activePanes.book),
          ai: Boolean(activePanes.ai),
          note: Boolean(activePanes.note),
        }
        changed = true
      }
    }
    if (changed) {
      this.lastMeasuredBounds = null
    }
    if (!this.isDraggingSplitter) {
      this.applyBounds()
    }
  }

  public setVerticalSplit(ratio: number) {
    let changed = false
    if (typeof ratio === 'number' && Math.abs(this.currentVerticalSplitRatio - ratio) > 0.001) {
      this.currentVerticalSplitRatio = ratio
      changed = true
    }
    if (changed) {
      this.lastMeasuredBounds = null
    }
    if (!this.isDraggingSplitter) {
      this.applyBounds()
    }
  }

  public setViewsDragging(isDragging: boolean) {
    this.isDraggingSplitter = isDragging
    if (this.isModalOpen) return

    if (isDragging) {
      this.bookHandler.setVisible(false)
      this.aiHandler.setVisible(false)
      this.noteHandler.setVisible(false)
    } else {
      this.bookHandler.setVisible(this.activePanes.book && !this.modalHidden.book)
      this.aiHandler.setVisible(this.activePanes.ai && !this.modalHidden.ai)
      this.noteHandler.setVisible(this.activePanes.note && !this.modalHidden.note)
      this.applyBounds()
    }
  }

  public setViewsVisible(params: boolean | { target?: 'book' | 'ai' | 'note' | 'all'; visible: boolean }) {
    const visible = typeof params === 'boolean' ? params : params.visible
    this.isModalOpen = !visible

    if (!visible) {
      this.modalHidden = { book: true, ai: true, note: true }
      // Physically detach every single child view from mainWindow
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        while (this.mainWindow.contentView.children.length > 0) {
          try {
            this.mainWindow.contentView.removeChildView(this.mainWindow.contentView.children[0])
          } catch (_) {
            break
          }
        }
      }
      this.bookHandler.setVisible(false)
      this.aiHandler.setVisible(false)
      this.noteHandler.setVisible(false)
    } else {
      this.modalHidden = { book: false, ai: false, note: false }
      this.bookHandler.setVisible(this.activePanes.book)
      this.aiHandler.setVisible(this.activePanes.ai)
      this.noteHandler.setVisible(this.activePanes.note)
      if (this.lastMeasuredBounds) {
        this.updateMeasuredBounds(this.lastMeasuredBounds)
      } else {
        this.applyBounds()
      }
    }
  }

  private normalizeAndClampRect(
    raw: DOMBounds,
    contentWidth: number,
    contentHeight: number,
    scale: number
  ): Rectangle {
    const x = Math.max(0, Math.min(contentWidth, Math.round(raw.x * scale)))
    const y = Math.max(0, Math.min(contentHeight, Math.round(raw.y * scale)))
    const width = Math.max(0, Math.min(contentWidth - x, Math.round(raw.width * scale)))
    const height = Math.max(0, Math.min(contentHeight - y, Math.round(raw.height * scale)))
    return { x, y, width, height }
  }

  public updateMeasuredBounds(bounds: {
    book?: DOMBounds
    ai?: DOMBounds
    note?: DOMBounds
    activePanes?: ActivePanesState
  }) {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || this.mainWindow.isMinimized()) return

    if (bounds.activePanes) {
      this.activePanes = {
        book: Boolean(bounds.activePanes.book),
        ai: Boolean(bounds.activePanes.ai),
        note: Boolean(bounds.activePanes.note),
      }
    } else {
      const hasAnyPositiveRect =
        Boolean(bounds.book && bounds.book.width > 0 && bounds.book.height > 0) ||
        Boolean(bounds.ai && bounds.ai.width > 0 && bounds.ai.height > 0) ||
        Boolean(bounds.note && bounds.note.width > 0 && bounds.note.height > 0)
      if (hasAnyPositiveRect) {
        this.activePanes = {
          book: Boolean(bounds.book && bounds.book.width > 0 && bounds.book.height > 0),
          ai: Boolean(bounds.ai && bounds.ai.width > 0 && bounds.ai.height > 0),
          note: Boolean(bounds.note && bounds.note.width > 0 && bounds.note.height > 0),
        }
      }
    }

    const contentBounds = this.mainWindow.contentView.getBounds()
    const contentWidth = Math.max(0, contentBounds.width)
    const contentHeight = Math.max(0, contentBounds.height)
    if (contentWidth <= 0 || contentHeight <= 0) return

    this.lastMeasuredBounds = bounds
    this.lastContentSize = { width: contentWidth, height: contentHeight }
    if (this.isModalOpen || this.isDraggingSplitter) return

    let scale = 1.0
    try {
      const zoomFactor = this.mainWindow.webContents.getZoomFactor()
      if (zoomFactor > 0 && Math.abs(zoomFactor - 1.0) > 0.001) {
        scale = zoomFactor
        // Reset mainWindow shell zoom back to 1.0 so DOM CSS pixels match physical DIPs 1:1
        this.mainWindow.webContents.setZoomFactor(1.0)
        this.mainWindow.webContents.setZoomLevel(0)
      }
    } catch (_) {}

    const { book, ai, note } = bounds

    if (book && typeof book.x === 'number') {
      const rect = this.normalizeAndClampRect(book, contentWidth, contentHeight, scale)
      const isVisible = rect.width > 0 && rect.height > 0 && !this.modalHidden.book && this.activePanes.book
      this.bookHandler.setVisible(isVisible)
      if (isVisible) {
        this.bookHandler.setBounds(rect)
      }
    }

    if (ai && typeof ai.x === 'number') {
      const rect = this.normalizeAndClampRect(ai, contentWidth, contentHeight, scale)
      const isVisible = rect.width > 0 && rect.height > 0 && !this.modalHidden.ai && this.activePanes.ai
      this.aiHandler.setVisible(isVisible)
      if (isVisible) {
        this.aiHandler.setBounds(rect)
      }
    }

    if (note && typeof note.x === 'number') {
      const rect = this.normalizeAndClampRect(note, contentWidth, contentHeight, scale)
      const isVisible = rect.width > 0 && rect.height > 0 && !this.modalHidden.note && this.activePanes.note
      this.noteHandler.setVisible(isVisible)
      if (isVisible) {
        this.noteHandler.setBounds(rect)
      }
    }
  }

  public applyBounds() {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || this.mainWindow.isMinimized()) return
    if (this.isModalOpen || this.isDraggingSplitter) return

    const bounds = this.mainWindow.contentView.getBounds()
    if (bounds.width <= 0 || bounds.height <= 0) return

    // If we already have exact DOM-measured bounds for the current content size, prefer them directly
    if (
      this.lastMeasuredBounds &&
      this.lastContentSize &&
      this.lastContentSize.width === bounds.width &&
      this.lastContentSize.height === bounds.height
    ) {
      this.updateMeasuredBounds(this.lastMeasuredBounds)
      return
    }

    const headerHeight = 44
    const paneToolbarHeight = 38
    const topBarHeight = headerHeight + paneToolbarHeight
    const verticalSplitterWidth = 9
    const horizontalSplitterHeight = 9

    const availableWidth = bounds.width
    const availableWorkspaceHeight = Math.max(0, bounds.height - headerHeight)
    const fullContentHeight = Math.max(0, bounds.height - topBarHeight)
    const hiddenBounds: Rectangle = { x: 0, y: topBarHeight, width: 0, height: 0 }

    if (this.currentSplitRatio >= 99) {
      const fullBounds = { x: 0, y: topBarHeight, width: availableWidth, height: fullContentHeight }
      if (!this.currentIsSwapped) {
        this.bookHandler.setVisible(this.activePanes.book && !this.modalHidden.book)
        this.bookHandler.setBounds(fullBounds)
        this.aiHandler.setVisible(false)
        this.aiHandler.setBounds(hiddenBounds)
        this.noteHandler.setVisible(false)
        this.noteHandler.setBounds(hiddenBounds)
      } else {
        this.aiHandler.setVisible(this.activePanes.ai && !this.modalHidden.ai)
        this.aiHandler.setBounds(fullBounds)
        this.bookHandler.setVisible(false)
        this.bookHandler.setBounds(hiddenBounds)
        this.noteHandler.setVisible(false)
        this.noteHandler.setBounds(hiddenBounds)
      }
      return
    }

    if (this.currentSplitRatio <= 1) {
      const fullBounds = { x: 0, y: topBarHeight, width: availableWidth, height: fullContentHeight }
      if (!this.currentIsSwapped) {
        this.bookHandler.setVisible(false)
        this.bookHandler.setBounds(hiddenBounds)
        this.aiHandler.setVisible(this.activePanes.ai && !this.modalHidden.ai)
        this.aiHandler.setBounds(fullBounds)
        this.noteHandler.setVisible(false)
        this.noteHandler.setBounds(hiddenBounds)
      } else {
        this.aiHandler.setVisible(false)
        this.aiHandler.setBounds(hiddenBounds)
        this.bookHandler.setVisible(this.activePanes.book && !this.modalHidden.book)
        this.bookHandler.setBounds(fullBounds)
        this.noteHandler.setVisible(false)
        this.noteHandler.setBounds(hiddenBounds)
      }
      return
    }

    const leftRatio = this.currentSplitRatio / 100
    const leftWidth = Math.max(0, Math.round((availableWidth - verticalSplitterWidth) * leftRatio))
    const rightWidth = Math.max(0, availableWidth - verticalSplitterWidth - leftWidth)
    const rightX = leftWidth + verticalSplitterWidth

    const leftColBounds: Rectangle = { x: 0, y: topBarHeight, width: leftWidth, height: fullContentHeight }
    const rightColBounds: Rectangle = { x: rightX, y: topBarHeight, width: rightWidth, height: fullContentHeight }

    const isTripleMode = this.activePanes.book && this.activePanes.ai && this.activePanes.note

    if (!isTripleMode) {
      // Dual View mode: both active panes occupy full height in their respective columns
      if (this.activePanes.book && this.activePanes.ai) {
        this.noteHandler.setVisible(false)
        this.noteHandler.setBounds(hiddenBounds)
        this.bookHandler.setVisible(!this.modalHidden.book)
        this.aiHandler.setVisible(!this.modalHidden.ai)
        if (!this.currentIsSwapped) {
          this.bookHandler.setBounds(leftColBounds)
          this.aiHandler.setBounds(rightColBounds)
        } else {
          this.aiHandler.setBounds(leftColBounds)
          this.bookHandler.setBounds(rightColBounds)
        }
      } else if (this.activePanes.book && this.activePanes.note) {
        this.aiHandler.setVisible(false)
        this.aiHandler.setBounds(hiddenBounds)
        this.bookHandler.setVisible(!this.modalHidden.book)
        this.noteHandler.setVisible(!this.modalHidden.note)
        if (!this.currentIsSwapped) {
          this.bookHandler.setBounds(leftColBounds)
          this.noteHandler.setBounds(rightColBounds)
        } else {
          this.noteHandler.setBounds(leftColBounds)
          this.bookHandler.setBounds(rightColBounds)
        }
      } else {
        // activePanes.ai && activePanes.note (Book disabled: Note on left, Chat on right by default)
        this.bookHandler.setVisible(false)
        this.bookHandler.setBounds(hiddenBounds)
        this.noteHandler.setVisible(!this.modalHidden.note)
        this.aiHandler.setVisible(!this.modalHidden.ai)
        if (!this.currentIsSwapped) {
          this.noteHandler.setBounds(leftColBounds)
          this.aiHandler.setBounds(rightColBounds)
        } else {
          this.aiHandler.setBounds(leftColBounds)
          this.noteHandler.setBounds(rightColBounds)
        }
      }
      return
    }

    // Triple View mode: Book on one column, Chat + Note stacked vertically on the other column
    const chatPaneHeight = Math.round((availableWorkspaceHeight - horizontalSplitterHeight) * (this.currentVerticalSplitRatio / 100))
    const aiViewHeight = Math.max(0, chatPaneHeight - paneToolbarHeight)

    const totalRightColumnHeight = availableWorkspaceHeight - horizontalSplitterHeight
    const notePaneHeight = Math.max(0, totalRightColumnHeight - chatPaneHeight)
    const noteViewY = topBarHeight + aiViewHeight + horizontalSplitterHeight + paneToolbarHeight
    const noteViewHeight = Math.max(0, notePaneHeight - paneToolbarHeight)

    this.bookHandler.setVisible(!this.modalHidden.book)
    this.aiHandler.setVisible(!this.modalHidden.ai)
    this.noteHandler.setVisible(!this.modalHidden.note)

    if (!this.currentIsSwapped) {
      this.bookHandler.setBounds(leftColBounds)
      this.aiHandler.setBounds({ x: rightX, y: topBarHeight, width: rightWidth, height: aiViewHeight })
      this.noteHandler.setBounds({ x: rightX, y: noteViewY, width: rightWidth, height: noteViewHeight })
    } else {
      this.aiHandler.setBounds({ x: 0, y: topBarHeight, width: leftWidth, height: aiViewHeight })
      this.noteHandler.setBounds({ x: 0, y: noteViewY, width: leftWidth, height: noteViewHeight })
      this.bookHandler.setBounds(rightColBounds)
    }
  }
}
