import React from 'react'

interface HorizontalSplitterProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  isDragging: boolean
}

export const HorizontalSplitter: React.FC<HorizontalSplitterProps> = ({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  isDragging,
}) => {
  return (
    <div
      className={`pane-horizontal-splitter ${isDragging ? 'dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      title="Drag up/down to resize ChatGPT and OneNote (Double-click to reset to 50:50)"
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
