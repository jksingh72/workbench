import React from 'react'

interface SplitterProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  isDragging: boolean
  disabled?: boolean
}

export const Splitter: React.FC<SplitterProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  isDragging,
  disabled = false,
}) => {
  return (
    <div
      className={`pane-splitter ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerMove={disabled ? undefined : onPointerMove}
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerCancel={disabled ? undefined : onPointerUp}
      onDoubleClick={disabled ? () => {} : onDoubleClick}
      title={disabled ? 'Splitter resizing is paused while a dialog is open' : 'Drag left/right to resize panes (Double-click to reset to 60:40)'}
    >
      <div className="splitter-handle">
        <span className="grip-dot" />
        <span className="grip-dot" />
        <span className="grip-dot" />
      </div>
    </div>
  )
}
