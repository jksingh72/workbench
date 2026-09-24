import React from 'react'
import {
  BookOpen,
  Bot,
  FileText,
  Check,
  ArrowLeftRight,
  Sparkles,
  Columns2
} from 'lucide-react'

export type PaneId = 'book' | 'ai' | 'note'

interface HeaderProps {
  splitRatio: number
  onSetSplitRatio: (ratio: number) => void
  onSwapPanes: () => void
  isSwapped: boolean
  notification: string | null
  activePanes: Record<PaneId, boolean>
  onTogglePane: (pane: PaneId) => void
}

export const Header: React.FC<HeaderProps> = ({
  splitRatio,
  onSetSplitRatio,
  onSwapPanes,
  isSwapped,
  notification,
  activePanes,
  onTogglePane,
}) => {
  const activeCount = Object.values(activePanes).filter(Boolean).length

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-badge">
          <div className="logo-icons">
            <span className="icon-oreilly-dot" title="Bookview" />
            <span className="icon-chatgpt-dot" title="Chatview" />
          </div>
          <span className="brand-name">Workbench</span>
        </div>

        <div className="status-pill" title={`Active panes: ${activeCount} of 3`}>
          <span className="dot active" />
          <span>{activeCount === 3 ? 'Triple View' : 'Dual View'}</span>
        </div>
      </div>

      <div className="header-center">
        {notification ? (
          <div className="notification-banner">
            <Sparkles size={14} className="accent-icon" />
            <span>{notification}</span>
          </div>
        ) : (
          <div className="header-controls">
            {/* Pane Selector Toggles */}
            <div className="pane-selector-group">
              <span className="group-label">Panes:</span>
              <button
                type="button"
                className={`pane-chip ${activePanes.book ? 'active' : ''} ${activePanes.book && activeCount <= 2 ? 'locked' : ''}`}
                onClick={() => onTogglePane('book')}
                title={
                  activePanes.book && activeCount <= 2
                    ? 'At least 2 panes must remain selected'
                    : activePanes.book
                    ? 'Click to hide Bookview'
                    : 'Click to show Bookview'
                }
              >
                <BookOpen size={12} />
                <span>Book</span>
                {activePanes.book && <Check size={11} className="chip-check" />}
              </button>

              <button
                type="button"
                className={`pane-chip ${activePanes.ai ? 'active' : ''} ${activePanes.ai && activeCount <= 2 ? 'locked' : ''}`}
                onClick={() => onTogglePane('ai')}
                title={
                  activePanes.ai && activeCount <= 2
                    ? 'At least 2 panes must remain selected'
                    : activePanes.ai
                    ? 'Click to hide Chatview'
                    : 'Click to show Chatview'
                }
              >
                <Bot size={12} />
                <span>Chat</span>
                {activePanes.ai && <Check size={11} className="chip-check" />}
              </button>

              <button
                type="button"
                className={`pane-chip ${activePanes.note ? 'active' : ''} ${activePanes.note && activeCount <= 2 ? 'locked' : ''}`}
                onClick={() => onTogglePane('note')}
                title={
                  activePanes.note && activeCount <= 2
                    ? 'At least 2 panes must remain selected'
                    : activePanes.note
                    ? 'Click to hide Noteview'
                    : 'Click to show Noteview'
                }
              >
                <FileText size={12} />
                <span>Note</span>
                {activePanes.note && <Check size={11} className="chip-check" />}
              </button>
            </div>

            {/* Column Width Split Presets */}
            <div className="ratio-presets">
              <button
                type="button"
                className={`preset-btn ${Math.round(splitRatio) === 60 ? 'active' : ''}`}
                onClick={() => onSetSplitRatio(60)}
                title="Ratio: 60% Left / 40% Right"
              >
                <Columns2 size={13} />
                <span>60 : 40</span>
              </button>

              <button
                type="button"
                className={`preset-btn ${Math.round(splitRatio) === 50 ? 'active' : ''}`}
                onClick={() => onSetSplitRatio(50)}
                title="Ratio: 50% Left / 50% Right"
              >
                <span>50 : 50</span>
              </button>

              <button
                type="button"
                className={`preset-btn ${Math.round(splitRatio) === 70 ? 'active' : ''}`}
                onClick={() => onSetSplitRatio(70)}
                title="Ratio: 70% Left / 30% Right"
              >
                <span>70 : 30</span>
              </button>

              <button
                type="button"
                className={`preset-btn ${Math.round(splitRatio) === 40 ? 'active' : ''}`}
                onClick={() => onSetSplitRatio(40)}
                title="Ratio: 40% Left / 60% Right"
              >
                <span>40 : 60</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="header-right">
        <button
          type="button"
          className={`action-icon-btn ${isSwapped ? 'swapped' : ''}`}
          onClick={onSwapPanes}
          title="Swap Left / Right Panes"
        >
          <ArrowLeftRight size={14} />
          <span className="btn-label">Swap</span>
        </button>

        <div className="quick-tip" title="Highlight text in Bookview and click 'Ask AI' or press Ctrl+Shift+A">
          <span className="tip-kbd">Ctrl+Shift+A</span>
          <span className="tip-text">Ask AI</span>
        </div>
      </div>
    </header>
  )
}

