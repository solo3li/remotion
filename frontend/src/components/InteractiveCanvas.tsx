import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip } from '../types';

interface InteractiveCanvasProps {
  currentTime: number;
  totalDuration: number;
  clips: TimelineClip[];
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onUpdateClip: (id: string, updates: Partial<TimelineClip>) => void;
  bgColor: string;
}

export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  currentTime,
  totalDuration,
  clips,
  selectedClipId,
  onSelectClip,
  onUpdateClip,
  bgColor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, clipX: 0, clipY: 0, width: 0, height: 0 });

  const CANVAS_WIDTH = 960;
  const CANVAS_HEIGHT = 540;

  // Filter clips active at currentTime
  const activeClips = clips.filter(
    (c) => currentTime >= c.start && currentTime <= c.start + c.duration
  );

  const selectedClip = clips.find((c) => c.id === selectedClipId);

  // Mouse move handler for dragging and resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedClip || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      const deltaX = (e.clientX - dragStart.x) * scaleX;
      const deltaY = (e.clientY - dragStart.y) * scaleY;

      if (isDragging) {
        onUpdateClip(selectedClip.id, {
          x: Math.round(dragStart.clipX + deltaX),
          y: Math.round(dragStart.clipY + deltaY),
        });
      } else if (isResizing) {
        let newWidth = dragStart.width;
        let newHeight = dragStart.height;
        let newX = dragStart.clipX;
        let newY = dragStart.clipY;

        if (isResizing.includes('e')) newWidth = Math.max(40, dragStart.width + deltaX);
        if (isResizing.includes('s')) newHeight = Math.max(20, dragStart.height + deltaY);
        if (isResizing.includes('w')) {
          const w = Math.max(40, dragStart.width - deltaX);
          newX = dragStart.clipX + (dragStart.width - w);
          newWidth = w;
        }
        if (isResizing.includes('n')) {
          const h = Math.max(20, dragStart.height - deltaY);
          newY = dragStart.clipY + (dragStart.height - h);
          newHeight = h;
        }

        onUpdateClip(selectedClip.id, {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, selectedClip, onUpdateClip]);

  const startDrag = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      clipX: clip.x,
      clipY: clip.y,
      width: clip.width,
      height: clip.height,
    });
  };

  const startResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    if (!selectedClip) return;
    setIsResizing(handle);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      clipX: selectedClip.x,
      clipY: selectedClip.y,
      width: selectedClip.width,
      height: selectedClip.height,
    });
  };

  return (
    <div
      className="canvas-container"
      onClick={() => onSelectClip(null)}
      ref={containerRef}
      style={{ backgroundColor: bgColor }}
    >
      {/* Background procedural grid */}
      <div className="canvas-grid-lines" />

      {/* Render Active Clips */}
      {activeClips.map((clip) => {
        const isSelected = clip.id === selectedClipId;

        return (
          <div
            key={clip.id}
            className={`canvas-element ${isSelected ? 'selected' : ''}`}
            style={{
              left: `${(clip.x / CANVAS_WIDTH) * 100}%`,
              top: `${(clip.y / CANVAS_HEIGHT) * 100}%`,
              width: `${(clip.width / CANVAS_WIDTH) * 100}%`,
              height: `${(clip.height / CANVAS_HEIGHT) * 100}%`,
              transform: `rotate(${clip.rotation || 0}deg)`,
              opacity: clip.opacity ?? 1,
            }}
            onMouseDown={(e) => startDrag(e, clip)}
          >
            {clip.type === 'text' && (
              <div
                className="element-text"
                style={{
                  fontSize: `${clip.fontSize || 32}px`,
                  color: clip.color || '#ffffff',
                  backgroundColor: clip.bgColor || 'transparent',
                }}
              >
                {clip.text}
              </div>
            )}

            {clip.type === 'video' && (
              <div className="element-video-mock">
                {clip.src ? (
                  <video src={clip.src} muted loop className="preview-media" />
                ) : (
                  <div className="video-placeholder">
                    <span className="placeholder-icon">🎬</span>
                    <span className="placeholder-title">{clip.title}</span>
                  </div>
                )}
              </div>
            )}

            {clip.type === 'shape' && (
              <div
                className="element-shape"
                style={{
                  backgroundColor: clip.color || '#10b981',
                  borderRadius: '12px',
                }}
              />
            )}

            {/* Transform Handles Bounding Box */}
            {isSelected && (
              <div className="transform-bounding-box">
                <div className="handle handle-nw" onMouseDown={(e) => startResize(e, 'nw')} />
                <div className="handle handle-ne" onMouseDown={(e) => startResize(e, 'ne')} />
                <div className="handle handle-se" onMouseDown={(e) => startResize(e, 'se')} />
                <div className="handle handle-sw" onMouseDown={(e) => startResize(e, 'sw')} />
                <div className="handle handle-n" onMouseDown={(e) => startResize(e, 'n')} />
                <div className="handle handle-s" onMouseDown={(e) => startResize(e, 's')} />
                <div className="handle handle-e" onMouseDown={(e) => startResize(e, 'e')} />
                <div className="handle handle-w" onMouseDown={(e) => startResize(e, 'w')} />
                <div className="rotate-handle" title="تدوير العنصر" />
              </div>
            )}
          </div>
        );
      })}

      {/* Canvas Viewport Info */}
      <div className="canvas-watermark">
        <span>1920 × 1080 (16:9) • {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s</span>
      </div>
    </div>
  );
};
