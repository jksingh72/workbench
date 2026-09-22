import React from 'react'

interface SplitterProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  isDragging: boolean
}

export const Splitter: React.FC<SplitterProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  isDragging,
}) => {
  return (
    <div
      className={`pane-splitter ${isDragging ? 'dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      title="Drag left/right to resize panes (Double-click to reset to 60:40)"
    >
      <div className="splitter-handle">
        <span className="grip-dot" />
        <span className="grip-dot" />
        <span className="grip-dot" />
      </div>
    </div>
  )
}
