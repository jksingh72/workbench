import React from 'react'

interface HorizontalSplitterProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  isDragging: boolean
  disabled?: boolean
}

export const HorizontalSplitter: React.FC<HorizontalSplitterProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  isDragging,
  disabled = false,
}) => {
  return (
    <div
      className={`pane-horizontal-splitter ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerMove={disabled ? undefined : onPointerMove}
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerCancel={disabled ? undefined : onPointerUp}
      onDoubleClick={disabled ? () => {} : onDoubleClick}
      title={disabled ? 'Splitter resizing is paused while a dialog is open' : 'Drag up/down to resize ChatGPT and OneNote (Double-click to reset to 50:50)'}
    >
      <div className="horizontal-splitter-handle">
        <span className="h-grip-dot" />
        <span className="h-grip-dot" />
        <span className="h-grip-dot" />
        <span className="h-grip-dot" />
      </div>
    </div>
  )
}
