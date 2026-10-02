import React, { useState, useEffect, useRef } from 'react';
import { TimelineClip, TimelineTrack, ProjectSettings } from './types';
import { InteractiveCanvas } from './components/InteractiveCanvas';
import { NLETimeline } from './components/NLETimeline';
import { InspectorPanel } from './components/InspectorPanel';
import { MediaDrawer } from './components/MediaDrawer';
import { ExportModal } from './components/ExportModal';
import { audioEngine } from './utils/audioEngine';
import {
  Film,
  Sparkles,
  ExternalLink,
  Zap,
  Volume2,
  VolumeX,
  Workflow,
  Video,
} from 'lucide-react';
import { WorkflowBuilder } from './components/workflow/WorkflowBuilder';

export const App: React.FC = () => {
  // Project Global Settings
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    title: 'عرض ترويجي لمنتجنا الجديد',
    duration: 6,
    fps: 30,
    width: 1920,
    height: 1080,
    bgColor: '#0b0e17',
  });

  // Timeline Tracks
  const [tracks, setTracks] = useState<TimelineTrack[]>([
    { id: 'track-text', name: 'طبقة النصوص (Text)', type: 'text', icon: '💬', isMuted: false },
    { id: 'track-video', name: 'مسار الفيديو والأشكال (Visual)', type: 'video', icon: '🎬', isMuted: false },
    { id: 'track-audio', name: 'مسار الصوت (Audio)', type: 'audio', icon: '🎵', isMuted: false },
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
      duration: 5.5,
      x: 240,
      y: 190,
      width: 480,
      height: 80,
      rotation: 0,
      opacity: 1,
      fontSize: 38,
      color: '#ffffff',
      textAlign: 'center',
    },
    {
      id: 'clip-2',
      trackId: 'track-text',
      type: 'text',
      title: 'النص الفرعي',
      text: '🔥 أقوى العروض والتخفيضات الحصرية لهذا الموسم',
      start: 0.8,
      duration: 4.5,
      x: 250,
      y: 290,
      width: 460,
      height: 60,
      rotation: 0,
      opacity: 1,
      fontSize: 22,
      color: '#06b6d4',
      textAlign: 'center',
    },
    {
      id: 'clip-3',
      trackId: 'track-video',
      type: 'shape',
      title: 'خلفية متدرجة',
      start: 0,
      duration: 6,
      x: 200,
      y: 150,
      width: 560,
      height: 230,
      rotation: 0,
      opacity: 0.25,
      color: '#10b981',
      borderRadius: 16,
    },
    {
      id: 'clip-4',
      trackId: 'track-audio',
      type: 'audio',
      title: 'موسيقى خلفية حماسية',
      start: 0,
      duration: 6,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: 1,
      volume: 1,
    },
  ]);

  // Current Selection & Playback State
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-1');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStudioMode, setActiveStudioMode] = useState<'nle' | 'workflow'>('nle');

  // User Auth & Export State
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleLoadGeneratedClips = (newClips: TimelineClip[], newSettings?: Partial<ProjectSettings>) => {
    setClips(newClips);
    if (newSettings) {
      setProjectSettings((prev) => ({ ...prev, ...newSettings }));
    }
    if (newClips.length > 0) {
      setSelectedClipId(newClips[0].id);
    }
    setActiveStudioMode('nle');
  };

  // Fetch session cookie
  useEffect(() => {
    fetch('/api/auth/user/')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  // Audio Engine Synchronization Loop
  useEffect(() => {
    const audioTrack = tracks.find((t) => t.id === 'track-audio');
    const isTrackMuted = audioTrack?.isMuted ?? false;

    if (!isPlaying) {
      audioEngine.stopAll();
      return;
    }

    const audioClips = clips.filter((c) => c.trackId === 'track-audio');
    let hasActiveAudio = false;

    audioClips.forEach((clip) => {
      const isActive = currentTime >= clip.start && currentTime <= clip.start + clip.duration;
      if (isActive) {
        hasActiveAudio = true;
        const offset = currentTime - clip.start;
        audioEngine.syncAudioClip(clip.id, clip.src || '', offset, isPlaying, isTrackMuted);
      } else {
        audioEngine.stopClip(clip.id);
      }
    });

    if (!hasActiveAudio) {
      audioEngine.stopSyntheticBeat();
    }
  }, [currentTime, isPlaying, clips, tracks]);

  // Timeline Playback Loop
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
    } else {
      audioEngine.stopAll();
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, projectSettings.duration]);

  // Track Mute Toggle
  const handleToggleTrackMute = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isMuted: !t.isMuted } : t))
    );
  };

  // Keyboard Shortcuts (Space: Play/Pause, Del: Delete, C: Split, Arrows: Seek)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteClip(selectedClipId);
        }
      } else if (e.key === 'c' || e.key === 'C') {
        if (selectedClipId) {
          e.preventDefault();
          handleSplitClip(selectedClipId, currentTime);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        setCurrentTime((t) => Math.min(projectSettings.duration, Number((t + step).toFixed(2))));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        setCurrentTime((t) => Math.max(0, Number((t - step).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedClipId) {
          handleDuplicateClip(selectedClipId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTime, projectSettings.duration]);

  // Clip CRUD Handlers
  const handleUpdateClip = (id: string, updates: Partial<TimelineClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleDeleteClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    audioEngine.stopClip(id);
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

  // Trigger Video Export to Django + Redis + Worker
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
  const isVideoTrackMuted = tracks.find((t) => t.id === 'track-video')?.isMuted || false;

  return (
    <div className="nle-studio-root">
      {/* Top Studio Navbar */}
      <header className="nle-top-bar">
        <div className="bar-left">
          <div className="studio-brand">
            <span className="brand-badge">PRO SUITE</span>
            <span className="brand-name">Revideo Cloud Studio</span>
          </div>

          {/* Unified Suite Switcher linking all 4 ecosystem apps */}
          <nav className="unified-suite-nav" aria-label="Creative Suite Navigation">
            <a href="/app/" className="suite-nav-link active" title="Revideo Timeline NLE Studio">
              <Film size={13} />
              <span>Revideo NLE</span>
            </a>
            <a href="/designcombo/" className="suite-nav-link" title="DesignCombo Web Video Editor">
              <Video size={13} />
              <span>DesignCombo</span>
            </a>
            <a href="/langflow/" className="suite-nav-link" title="Langflow Visual AI Agent Workflows">
              <Sparkles size={13} />
              <span>Langflow</span>
            </a>
            <a href="/comfyui/" className="suite-nav-link" title="ComfyUI Generative AI Nodes Graph">
              <Workflow size={13} />
              <span>ComfyUI</span>
            </a>
          </nav>

          {/* Mode Switcher: NLE Timeline Studio vs AI Workflow Builder */}
          <div className="studio-mode-switcher">
            <button
              className={`btn-mode-tab ${activeStudioMode === 'nle' ? 'active' : ''}`}
              onClick={() => setActiveStudioMode('nle')}
            >
              <Film size={14} />
              <span>محرر التايم لاين (NLE Studio)</span>
            </button>
            <button
              className={`btn-mode-tab ${activeStudioMode === 'workflow' ? 'active' : ''}`}
              onClick={() => setActiveStudioMode('workflow')}
            >
              <Workflow size={14} />
              <span>مخططات الذكاء (AI Workflows)</span>
            </button>
          </div>

          {activeStudioMode === 'nle' && (
            <div className="project-title-box">
              <input
                type="text"
                value={projectSettings.title}
                onChange={(e) => setProjectSettings({ ...projectSettings, title: e.target.value })}
                className="top-title-input"
                placeholder="اسم المشروع"
              />
            </div>
          )}
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

          <a href="/" className="btn btn-outline" target="_blank" rel="noreferrer">
            <span>الموقع التسويقي</span>
            <ExternalLink size={13} />
          </a>

          {activeStudioMode === 'nle' && (
            <button
              className="btn btn-primary-render"
              onClick={handleStartRender}
              disabled={isExporting}
            >
              <Zap size={15} />
              <span>{isExporting ? 'جاري التحضير...' : 'تصدير الفيديو (Render)'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Conditional Studio View: AI Workflow Builder vs 3-Column NLE Studio */}
      {activeStudioMode === 'workflow' ? (
        <WorkflowBuilder
          onLoadTimelineClips={handleLoadGeneratedClips}
          onSwitchToStudio={() => setActiveStudioMode('nle')}
        />
      ) : (
        /* Main Studio 3-Column Layout */
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
                isPlaying={isPlaying}
                isVideoMuted={isVideoTrackMuted}
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
              onToggleTrackMute={handleToggleTrackMute}
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
      )}


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
