import React, { useState, useEffect, useRef } from 'react';
import { TimelineClip, TimelineTrack, ProjectSettings } from './types';
import { InteractiveCanvas } from './components/InteractiveCanvas';
import { NLETimeline } from './components/NLETimeline';
import { InspectorPanel } from './components/InspectorPanel';
import { MediaDrawer } from './components/MediaDrawer';
import { ExportModal } from './components/ExportModal';

export const App: React.FC = () => {
  // Project Global Settings
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    title: 'عرض ترويجي لمنتجنا الجديد',
    duration: 5,
    fps: 30,
    width: 1920,
    height: 1080,
    bgColor: '#0b0e17',
  });

  // Timeline Tracks
  const [tracks] = useState<TimelineTrack[]>([
    { id: 'track-text', name: 'طبقة النصوص (Text)', type: 'text', icon: '💬' },
    { id: 'track-video', name: 'مسار الفيديو والأشكال (Visual)', type: 'video', icon: '🎬' },
    { id: 'track-audio', name: 'مسار الصوت (Audio)', type: 'audio', icon: '🎵' },
  ]);

  // Clips in Timeline
  const [clips, setClips] = useState<TimelineClip[]>([
    {
      id: 'clip-1',
      trackId: 'track-text',
      type: 'text',
      title: 'العنوان الرئيسي',
      text: 'عرض ترويجي لمنتجنا الجديد',
      start: 0,
      duration: 4.5,
      x: 240,
      y: 190,
      width: 480,
      height: 80,
      rotation: 0,
      opacity: 1,
      fontSize: 38,
      color: '#ffffff',
    },
    {
      id: 'clip-2',
      trackId: 'track-text',
      type: 'text',
      title: 'النص الفرعي',
      text: '🔥 أقوى العروض والتخفيضات الحصرية لهذا الموسم',
      start: 0.8,
      duration: 3.5,
      x: 250,
      y: 290,
      width: 460,
      height: 60,
      rotation: 0,
      opacity: 1,
      fontSize: 22,
      color: '#06b6d4',
    },
    {
      id: 'clip-3',
      trackId: 'track-video',
      type: 'shape',
      title: 'خلفية متدرجة',
      start: 0,
      duration: 5,
      x: 200,
      y: 150,
      width: 560,
      height: 230,
      rotation: 0,
      opacity: 0.25,
      color: '#10b981',
    },
    {
      id: 'clip-4',
      trackId: 'track-audio',
      type: 'audio',
      title: 'موسيقى خلفية حماسية',
      start: 0,
      duration: 5,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: 1,
    },
  ]);

  // Current Selection & Playback State
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-1');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // User Auth & Export State
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fetch session cookie
  useEffect(() => {
    fetch('/api/auth/user/')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  // Playback Loop
  useEffect(() => {
    let animId: number;
    let lastTimestamp: number | null = null;

    const loop = (timestamp: number) => {
      if (lastTimestamp === null) lastTimestamp = timestamp;
      const deltaSec = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= projectSettings.duration) {
          return 0; // loop back
        }
        return next;
      });

      animId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, projectSettings.duration]);

  // Clip CRUD Handlers
  const handleUpdateClip = (id: string, updates: Partial<TimelineClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleDeleteClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const handleDuplicateClip = (id: string) => {
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const newId = `clip-${Date.now()}`;
    const newClip: TimelineClip = {
      ...clip,
      id: newId,
      title: `${clip.title} (نسخة)`,
      start: Math.min(projectSettings.duration - clip.duration, clip.start + 0.5),
      x: clip.x + 20,
      y: clip.y + 20,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newId);
  };

  const handleSplitClip = (id: string, splitTime: number) => {
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    if (splitTime <= clip.start || splitTime >= clip.start + clip.duration) return;

    const firstDuration = Number((splitTime - clip.start).toFixed(2));
    const secondDuration = Number((clip.duration - firstDuration).toFixed(2));

    const firstClip: TimelineClip = {
      ...clip,
      duration: firstDuration,
    };

    const secondClip: TimelineClip = {
      ...clip,
      id: `clip-${Date.now()}`,
      title: `${clip.title} (جزء 2)`,
      start: Number(splitTime.toFixed(2)),
      duration: secondDuration,
    };

    setClips((prev) => prev.map((c) => (c.id === id ? firstClip : c)).concat(secondClip));
    setSelectedClipId(secondClip.id);
  };

  const handleAddClip = (newClipData: Omit<TimelineClip, 'id'>) => {
    const newId = `clip-${Date.now()}`;
    const newClip: TimelineClip = {
      ...newClipData,
      id: newId,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(newId);
  };

  // Trigger Video Export to Django + Inngest + Revideo Worker
  const handleStartRender = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/videos/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: projectSettings.title,
          template: 'revideo_nle_studio',
          variables: {
            duration: projectSettings.duration,
            bgColor: projectSettings.bgColor,
            clips,
          },
        }),
      });

      const data = await res.json();
      if (data.video_id) {
        setActiveVideoId(data.video_id);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('حدث خطأ أثناء إطلاق مهمة الرندر');
    } finally {
      setIsExporting(false);
    }
  };

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;

  return (
    <div className="nle-studio-root">
      {/* Top Studio Navbar */}
      <header className="nle-top-bar">
        <div className="bar-left">
          <div className="studio-brand">
            <span className="brand-badge">NLE PRO</span>
            <span className="brand-name">Revideo Studio</span>
          </div>

          <div className="project-title-box">
            <input
              type="text"
              value={projectSettings.title}
              onChange={(e) => setProjectSettings({ ...projectSettings, title: e.target.value })}
              className="top-title-input"
            />
          </div>
        </div>

        <div className="bar-right">
          {user ? (
            <div className="user-session-badge">
              <span className="dot-live"></span>
              <span>المستخدم: <strong>{user.username}</strong></span>
            </div>
          ) : (
            <a href="/" className="login-link">تسجيل دخول</a>
          )}

          <a href="/" className="btn btn-outline">
            الموقع التسويقي 🌐
          </a>

          <button
            className="btn btn-primary-render"
            onClick={handleStartRender}
            disabled={isExporting}
          >
            {isExporting ? 'جاري التجهيز...' : '⚡ تصدير الفيديو (Render)'}
          </button>
        </div>
      </header>

      {/* Main Studio 3-Column Layout */}
      <div className="nle-center-workspace">
        {/* Left Column: Media & Asset Presets Drawer */}
        <MediaDrawer
          onAddClip={handleAddClip}
          currentTime={currentTime}
        />

        {/* Center Column: Interactive Canvas & Timeline */}
        <div className="nle-middle-column">
          {/* Canvas Section */}
          <div className="canvas-viewport-wrapper">
            <InteractiveCanvas
              currentTime={currentTime}
              totalDuration={projectSettings.duration}
              clips={clips}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              onUpdateClip={handleUpdateClip}
              bgColor={projectSettings.bgColor}
            />
          </div>

          {/* Bottom Timeline Section */}
          <NLETimeline
            currentTime={currentTime}
            totalDuration={projectSettings.duration}
            tracks={tracks}
            clips={clips}
            selectedClipId={selectedClipId}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onSeek={(t) => setCurrentTime(t)}
            onSelectClip={setSelectedClipId}
            onUpdateClip={handleUpdateClip}
            onDeleteClip={handleDeleteClip}
            onSplitClip={handleSplitClip}
            onDuplicateClip={handleDuplicateClip}
          />
        </div>

        {/* Right Column: Properties Inspector */}
        <InspectorPanel
          selectedClip={selectedClip}
          onUpdateClip={handleUpdateClip}
          onDeleteClip={handleDeleteClip}
          onDuplicateClip={handleDuplicateClip}
          projectSettings={projectSettings}
          onUpdateProjectSettings={(updates) =>
            setProjectSettings((prev) => ({ ...prev, ...updates }))
          }
        />
      </div>

      {/* Server-Sent Events Export Modal */}
      {activeVideoId && (
        <ExportModal
          videoId={activeVideoId}
          onClose={() => setActiveVideoId(null)}
        />
      )}
    </div>
  );
};

export default App;
