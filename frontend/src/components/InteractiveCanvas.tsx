import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip } from '../types';
import { RotateCw, Video, Sparkles, AlignCenter, AlignJustify, Maximize2 } from 'lucide-react';

interface InteractiveCanvasProps {
  currentTime: number;
  totalDuration: number;
  clips: TimelineClip[];
  selectedClipId: string | null;
  isPlaying: boolean;
  isVideoMuted?: boolean;
  onSelectClip: (id: string | null) => void;
  onUpdateClip: (id: string, updates: Partial<TimelineClip>) => void;
  bgColor: string;
}

export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  currentTime,
  totalDuration,
  clips,
  selectedClipId,
  isPlaying,
  isVideoMuted = false,
  onSelectClip,
  onUpdateClip,
  bgColor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, clipX: 0, clipY: 0, width: 0, height: 0 });
  const [snappedX, setSnappedX] = useState<boolean>(false);
  const [snappedY, setSnappedY] = useState<boolean>(false);

  const CANVAS_WIDTH = 960;
  const CANVAS_HEIGHT = 540;

  // Active clips at current timeline position
  const activeClips = clips.filter(
    (c) => currentTime >= c.start && currentTime <= c.start + c.duration
  );

  const selectedClip = clips.find((c) => c.id === selectedClipId);

  // Synchronize ALL active video elements with timeline clock & audio
  useEffect(() => {
    activeClips.forEach((clip) => {
      if (clip.type === 'video') {
        const videoEl = videoRefs.current.get(clip.id);
        if (videoEl) {
          const expectedOffset = Math.max(0, currentTime - clip.start);

          // Seek if desynchronized by more than 0.15s
          if (Math.abs(videoEl.currentTime - expectedOffset) > 0.15) {
            videoEl.currentTime = expectedOffset;
          }

          // Audio control for video element
          videoEl.muted = isVideoMuted;
          videoEl.volume = Math.max(0, Math.min(1, clip.volume ?? 1));

          if (isPlaying) {
            if (videoEl.paused) {
              const playPromise = videoEl.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {
                  // Fallback to muted playback if autoplay policy blocks unmuted audio
                  videoEl.muted = true;
                  videoEl.play().catch(() => {});
                });
              }
            }
          } else {
            if (!videoEl.paused) {
              videoEl.pause();
            }
          }
        }
      }
    });

    // Pause any inactive videos
    videoRefs.current.forEach((el, id) => {
      const isCurrentlyActive = activeClips.some((c) => c.id === id);
      if (!isCurrentlyActive && !el.paused) {
        el.pause();
      }
    });
  }, [currentTime, isPlaying, activeClips, isVideoMuted]);

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
        let newX = Math.round(dragStart.clipX + deltaX);
        let newY = Math.round(dragStart.clipY + deltaY);

        // Magnetic snapping to canvas center
        const centerX = CANVAS_WIDTH / 2 - selectedClip.width / 2;
        const centerY = CANVAS_HEIGHT / 2 - selectedClip.height / 2;

        let snapX = false;
        let snapY = false;

        if (Math.abs(newX - centerX) < 14) {
          newX = Math.round(centerX);
          snapX = true;
        }
        if (Math.abs(newY - centerY) < 14) {
          newY = Math.round(centerY);
          snapY = true;
        }

        setSnappedX(snapX);
        setSnappedY(snapY);

        onUpdateClip(selectedClip.id, { x: newX, y: newY });
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
      setSnappedX(false);
      setSnappedY(false);
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

  const centerElement = (axis: 'x' | 'y' | 'both') => {
    if (!selectedClip) return;
    const updates: Partial<TimelineClip> = {};
    if (axis === 'x' || axis === 'both') {
      updates.x = Math.round(CANVAS_WIDTH / 2 - selectedClip.width / 2);
    }
    if (axis === 'y' || axis === 'both') {
      updates.y = Math.round(CANVAS_HEIGHT / 2 - selectedClip.height / 2);
    }
    onUpdateClip(selectedClip.id, updates);
  };

  const getCssFilter = (filter?: string) => {
    switch (filter) {
      case 'cinematic':
        return 'contrast(125%) saturate(120%) brightness(95%)';
      case 'vintage':
        return 'sepia(40%) contrast(110%) brightness(105%)';
      case 'grayscale':
        return 'grayscale(100%)';
      case 'cool':
        return 'hue-rotate(180deg) saturate(110%)';
      default:
        return 'none';
    }
  };

  return (
    <div
      className="canvas-container"
      onClick={() => onSelectClip(null)}
      ref={containerRef}
      style={{ backgroundColor: bgColor }}
    >
      <div className="canvas-grid-lines" />

      {/* Center Snapping Guidelines */}
      {snappedX && <div className="snap-guideline snap-vertical" />}
      {snappedY && <div className="snap-guideline snap-horizontal" />}

      {/* Render Active Clips */}
      {activeClips.map((clip) => {
        const isSelected = clip.id === selectedClipId;
        const filterStyle = getCssFilter(clip.filter);

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
              filter: filterStyle,
            }}
            onMouseDown={(e) => startDrag(e, clip)}
          >
            {/* Text Clip */}
            {clip.type === 'text' && (
              <div
                className="element-text"
                style={{
                  fontSize: `${clip.fontSize || 32}px`,
                  color: clip.color || '#ffffff',
                  backgroundColor: clip.bgColor || 'transparent',
                  borderRadius: clip.borderRadius ? `${clip.borderRadius}px` : '8px',
                  textAlign: clip.textAlign || 'center',
                }}
              >
                {clip.text}
              </div>
            )}

            {/* Video Clip with synchronized HTML5 Video */}
            {clip.type === 'video' && (
              <div className="element-video-mock" style={{ borderRadius: clip.borderRadius ? `${clip.borderRadius}px` : '8px', overflow: 'hidden' }}>
                {clip.src ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(clip.id, el);
                      else videoRefs.current.delete(clip.id);
                    }}
                    src={clip.src}
                    playsInline
                    preload="auto"
                    className="preview-media"
                  />
                ) : (
                  <div className="video-placeholder">
                    <Video size={28} className="placeholder-icon-svg" />
                    <span className="placeholder-title">{clip.title}</span>
                  </div>
                )}
              </div>
            )}

            {/* Shape Clip */}
            {clip.type === 'shape' && (
              <div
                className="element-shape"
                style={{
                  backgroundColor: clip.color || '#10b981',
                  borderRadius: clip.borderRadius !== undefined ? `${clip.borderRadius}px` : '12px',
                }}
              />
            )}

            {/* Transform Bounding Box & 8 Handles */}
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
                <div className="rotate-handle" title="تدوير المقطع">
                  <RotateCw size={10} color="#fff" />
                </div>

                {/* Floating Quick Action Bar */}
                <div className="canvas-quick-toolbar" onMouseDown={(e) => e.stopPropagation()}>
                  <button onClick={() => centerElement('x')} title="محاذاة للوسط أفقيًا">
                    <AlignCenter size={12} />
                  </button>
                  <button onClick={() => centerElement('both')} title="توسيط كامل">
                    <Maximize2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Viewport Info Watermark */}
      <div className="canvas-watermark">
        <span>Full HD 1080p • {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s</span>
      </div>
    </div>
  );
};
