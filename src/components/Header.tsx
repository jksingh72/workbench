import React from 'react'
import {
  BookOpen,
  Bot,
  ArrowLeftRight,
  Sparkles,
  Columns2
} from 'lucide-react'

interface HeaderProps {
  splitRatio: number
  onSetSplitRatio: (ratio: number) => void
  onSwapPanes: () => void
  isSwapped: boolean
  notification: string | null
}

export const Header: React.FC<HeaderProps> = ({
  splitRatio,
  onSetSplitRatio,
  onSwapPanes,
  isSwapped,
  notification,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-badge">
          <div className="logo-icons">
            <span className="icon-oreilly-dot" title="O'Reilly Media" />
            <span className="icon-chatgpt-dot" title="ChatGPT" />
          </div>
          <span className="brand-name">Workbench</span>
        </div>

        <div className="status-pill">
          <span className="dot active" />
          <span>Dual Session</span>
        </div>
      </div>

      <div className="header-center">
        {notification ? (
          <div className="notification-banner">
            <Sparkles size={14} className="accent-icon" />
            <span>{notification}</span>
          </div>
        ) : (
          <div className="ratio-presets">
            <button
              className={`preset-btn ${Math.round(splitRatio) === 60 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(60)}
              title="Default: 60% Book / 40% AI"
            >
              <Columns2 size={13} />
              <span>60 : 40</span>
            </button>

            <button
              className={`preset-btn ${Math.round(splitRatio) === 50 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(50)}
              title="Equal: 50% Book / 50% AI"
            >
              <span>50 : 50</span>
            </button>

            <button
              className={`preset-btn ${Math.round(splitRatio) === 70 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(70)}
              title="Wide Book: 70% Book / 30% AI"
            >
              <span>70 : 30</span>
            </button>

            <button
              className={`preset-btn ${Math.round(splitRatio) === 40 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(40)}
              title="AI Focus: 40% Book / 60% AI"
            >
              <span>40 : 60</span>
            </button>

            <button
              className={`preset-btn ${splitRatio >= 98 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(splitRatio >= 98 ? 60 : 100)}
              title="Full Bookview"
            >
              <BookOpen size={13} />
              <span>Full Book</span>
            </button>

            <button
              className={`preset-btn ${splitRatio <= 2 ? 'active' : ''}`}
              onClick={() => onSetSplitRatio(splitRatio <= 2 ? 60 : 0)}
              title="Full AI View"
            >
              <Bot size={13} />
              <span>Full AI</span>
            </button>
          </div>
        )}
      </div>

      <div className="header-right">
        <button
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
