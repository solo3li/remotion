import React, { useRef, useState, useEffect } from 'react';
import { TimelineClip, TimelineTrack } from '../types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
} from 'lucide-react';

interface NLETimelineProps {
  currentTime: number;
  totalDuration: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  selectedClipId: string | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (id: string | null) => void;
  onUpdateClip: (id: string, updates: Partial<TimelineClip>) => void;
  onDeleteClip: (id: string) => void;
  onSplitClip: (id: string, splitTime: number) => void;
  onDuplicateClip: (id: string) => void;
  onToggleTrackMute?: (trackId: string) => void;
}

export const NLETimeline: React.FC<NLETimelineProps> = ({
  currentTime,
  totalDuration,
  tracks,
  clips,
  selectedClipId,
  isPlaying,
  onTogglePlay,
  onSeek,
  onSelectClip,
  onUpdateClip,
  onDeleteClip,
  onSplitClip,
  onDuplicateClip,
  onToggleTrackMute,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [trimmingEdge, setTrimmingEdge] = useState<'left' | 'right' | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [initialClipState, setInitialClipState] = useState<{ start: number; duration: number } | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);

  // Drag & Trim Mouse Move Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!rulerRef.current || !draggingClipId || !initialClipState) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const pixelsPerSecond = (rect.width * zoomLevel) / totalDuration;
      const deltaSeconds = (e.clientX - dragStartX) / pixelsPerSecond;

      if (trimmingEdge === 'left') {
        const newStart = Math.max(0, Math.min(initialClipState.start + initialClipState.duration - 0.2, initialClipState.start + deltaSeconds));
        const newDuration = initialClipState.duration - (newStart - initialClipState.start);
        onUpdateClip(draggingClipId, { start: Number(newStart.toFixed(2)), duration: Number(newDuration.toFixed(2)) });
      } else if (trimmingEdge === 'right') {
        const newDuration = Math.max(0.2, Math.min(totalDuration - initialClipState.start, initialClipState.duration + deltaSeconds));
        onUpdateClip(draggingClipId, { duration: Number(newDuration.toFixed(2)) });
      } else {
        const newStart = Math.max(0, Math.min(totalDuration - initialClipState.duration, initialClipState.start + deltaSeconds));
        onUpdateClip(draggingClipId, { start: Number(newStart.toFixed(2)) });
      }
    };

    const handleMouseUp = () => {
      setDraggingClipId(null);
      setTrimmingEdge(null);
      setInitialClipState(null);
    };

    if (draggingClipId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingClipId, trimmingEdge, dragStartX, initialClipState, zoomLevel, totalDuration, onUpdateClip]);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Number((clickPercent * totalDuration).toFixed(2)));
  };

  const startClipDrag = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setDraggingClipId(clip.id);
    setTrimmingEdge(null);
    setDragStartX(e.clientX);
    setInitialClipState({ start: clip.start, duration: clip.duration });
  };

  const startTrim = (e: React.MouseEvent, clip: TimelineClip, edge: 'left' | 'right') => {
    e.stopPropagation();
    onSelectClip(clip.id);
    setDraggingClipId(clip.id);
    setTrimmingEdge(edge);
    setDragStartX(e.clientX);
    setInitialClipState({ start: clip.start, duration: clip.duration });
  };

  const handleSplitCurrent = () => {
    if (selectedClipId) {
      onSplitClip(selectedClipId, currentTime);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const selectedClip = clips.find((c) => c.id === selectedClipId);

  return (
    <div className="nle-timeline">
      {/* Top Toolbar */}
      <div className="timeline-toolbar">
        <div className="playback-group">
          <button className="tool-btn" onClick={() => onSeek(0)} title="البداية">
            <SkipBack size={15} />
          </button>
          <button className={`tool-btn play-btn ${isPlaying ? 'playing' : ''}`} onClick={onTogglePlay}>
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? 'إيقاف' : 'تشغيل'}</span>
          </button>
          <button className="tool-btn" onClick={() => onSeek(totalDuration)} title="النهاية">
            <SkipForward size={15} />
          </button>
        </div>

        <div className="time-indicator">
          <span className="current-txt">{formatTime(currentTime)}</span>
          <span className="slash">/</span>
          <span className="total-txt">{formatTime(totalDuration)}</span>
        </div>

        <div className="edit-actions-group">
          <button
            className="tool-btn action-btn"
            onClick={handleSplitCurrent}
            disabled={!selectedClip || currentTime <= selectedClip.start || currentTime >= selectedClip.start + selectedClip.duration}
            title="تقسيم المقطع عند مكان المؤشر الحالي (Split / Blade)"
          >
            <Scissors size={14} />
            <span>قص</span>
          </button>
          <button
            className="tool-btn action-btn"
            onClick={() => selectedClipId && onDuplicateClip(selectedClipId)}
            disabled={!selectedClipId}
            title="تكرار المقطع المحدد"
          >
            <Copy size={14} />
            <span>مضاعفة</span>
          </button>
          <button
            className="tool-btn action-btn delete-btn"
            onClick={() => selectedClipId && onDeleteClip(selectedClipId)}
            disabled={!selectedClipId}
            title="حذف المقطع المحدد"
          >
            <Trash2 size={14} />
            <span>حذف</span>
          </button>
        </div>

        <div className="zoom-controls">
          <button className="tool-btn zoom-btn" onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))} title="تصغير">
            <ZoomOut size={14} />
          </button>
          <span className="zoom-val">{Math.round(zoomLevel * 100)}%</span>
          <button className="tool-btn zoom-btn" onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))} title="تكبير">
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* Timeline Workspace */}
      <div className="timeline-workspace">
        {/* Track Headers Column */}
        <div className="track-headers-column">
          <div className="ruler-header-spacer">المسارات الصوتية والمرئية</div>
          {tracks.map((track) => (
            <div key={track.id} className="track-header-item">
              <span className="track-icon">{track.icon}</span>
              <span className="track-name">{track.name}</span>
              {track.type === 'audio' && onToggleTrackMute && (
                <button
                  className="track-mute-btn"
                  onClick={() => onToggleTrackMute(track.id)}
                  title={track.isMuted ? 'إلغاء كتم الصوت' : 'كتم صوت المسار'}
                >
                  {track.isMuted ? <VolumeX size={14} color="#ef4444" /> : <Volume2 size={14} color="#10b981" />}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Scrollable Timeline Lanes */}
        <div className="timeline-lanes-scroll">
          {/* Time Ruler */}
          <div className="timeline-ruler-bar" ref={rulerRef} onClick={handleRulerClick}>
            {/* Playhead Indicator */}
            <div
              className="timeline-playhead"
              style={{ left: `${(currentTime / totalDuration) * 100}%` }}
            >
              <div className="playhead-tag">{currentTime.toFixed(1)}s</div>
              <div className="playhead-needle" />
            </div>

            {/* Time Ticks */}
            {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="ruler-tick"
                style={{ left: `${(i / totalDuration) * 100}%` }}
              >
                <span>{i}s</span>
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="lanes-container">
            {tracks.map((track) => {
              const trackClips = clips.filter((c) => c.trackId === track.id);

              return (
                <div key={track.id} className="lane-row">
                  {trackClips.map((clip) => {
                    const isSelected = clip.id === selectedClipId;
                    const leftPct = (clip.start / totalDuration) * 100;
                    const widthPct = (clip.duration / totalDuration) * 100;
                    const isCurrentlyPlayingThisClip = isPlaying && currentTime >= clip.start && currentTime <= clip.start + clip.duration;

                    return (
                      <div
                        key={clip.id}
                        className={`timeline-clip-block ${clip.type}-clip ${isSelected ? 'selected' : ''}`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                        onMouseDown={(e) => startClipDrag(e, clip)}
                      >
                        {/* Left Trim Handle */}
                        <div
                          className="trim-handle trim-left"
                          onMouseDown={(e) => startTrim(e, clip, 'left')}
                          title="سحب لتقصير أو تمديد البداية"
                        />

                        {/* Clip Content Box */}
                        <div className="clip-content-box">
                          <span className="clip-title">{clip.title || clip.text || 'مقطع'}</span>
                          <span className="clip-dur">{clip.duration.toFixed(1)}s</span>

                          {/* Dynamic Audio Waveform Pulsing on Playback */}
                          {clip.type === 'audio' && (
                            <div className={`audio-wave-anim ${isCurrentlyPlayingThisClip ? 'active-pulse' : ''}`}>
                              {Array.from({ length: 28 }).map((_, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    height: `${10 + Math.sin(idx * 0.7 + (isCurrentlyPlayingThisClip ? currentTime * 6 : 0)) * 12 + (idx % 3) * 4}px`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Right Trim Handle */}
                        <div
                          className="trim-handle trim-right"
                          onMouseDown={(e) => startTrim(e, clip, 'right')}
                          title="سحب لتقصير أو تمديد النهاية"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
