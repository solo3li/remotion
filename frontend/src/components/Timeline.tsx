import React from 'react';

interface TimelineProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (frame: number) => void;
  title: string;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentFrame,
  totalFrames,
  isPlaying,
  onTogglePlay,
  onSeek,
  title,
}) => {
  const progressPercent = (currentFrame / totalFrames) * 100;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(Math.floor(newPercent * totalFrames));
  };

  const formatTime = (frame: number) => {
    const totalSeconds = frame / 30;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="timeline-container">
      {/* Timeline Controls */}
      <div className="timeline-header">
        <div className="playback-controls">
          <button className="ctrl-btn" onClick={() => onSeek(0)} title="بداية الفيديو">⏮</button>
          <button className="ctrl-btn play-btn" onClick={onTogglePlay}>
            {isPlaying ? '⏸ إيقاف' : '▶ تشغيل'}
          </button>
          <button className="ctrl-btn" onClick={() => onSeek(totalFrames)} title="نهاية الفيديو">⏭</button>
        </div>

        <div className="time-display">
          <span className="current-time">{formatTime(currentFrame)}</span>
          <span className="separator">/</span>
          <span className="total-time">{formatTime(totalFrames)}</span>
          <span className="fps-badge">30 FPS</span>
        </div>

        <div className="zoom-info">
          <span>نطاق الرؤية: 100%</span>
        </div>
      </div>

      {/* Interactive Ruler and Scrubber */}
      <div className="timeline-ruler" onClick={handleTrackClick}>
        <div className="playhead" style={{ left: `${progressPercent}%` }}>
          <div className="playhead-handle">{currentFrame}</div>
          <div className="playhead-line"></div>
        </div>
        <div className="ruler-marks">
          {[0, 25, 50, 75, 100].map((p) => (
            <span key={p} style={{ left: `${p}%` }} className="ruler-label">
              {((p / 100) * (totalFrames / 30)).toFixed(1)}s
            </span>
          ))}
        </div>
      </div>

      {/* Multi-Track Area */}
      <div className="tracks-container" onClick={handleTrackClick}>
        {/* Track 1: Video */}
        <div className="track-row">
          <div className="track-label">🎬 فيديو (Visual)</div>
          <div className="track-content">
            <div className="track-block video-block" style={{ width: '100%' }}>
              <span>مشهد برمجيات Revideo • الرسوم الإجرائية</span>
            </div>
          </div>
        </div>

        {/* Track 2: Animated Subtitles */}
        <div className="track-row">
          <div className="track-label">💬 نصوص (Text)</div>
          <div className="track-content">
            <div className="track-block text-block" style={{ left: '15%', width: '70%' }}>
              <span>"{title}"</span>
            </div>
          </div>
        </div>

        {/* Track 3: Audio Waveform */}
        <div className="track-row">
          <div className="track-label">🎵 صوت (Audio)</div>
          <div className="track-content">
            <div className="track-block audio-block" style={{ width: '100%' }}>
              <div className="waveform-mock">
                {Array.from({ length: 48 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      height: `${20 + Math.sin(i * 0.5) * 15 + (i % 3) * 6}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
