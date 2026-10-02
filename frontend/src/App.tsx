import React, { useState, useEffect, useRef } from 'react';
import { VideoCanvas } from './components/VideoCanvas';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';

export const App: React.FC = () => {
  // Video Project Variables
  const [title, setTitle] = useState<string>('عرض ترويجي لمنتجنا الجديد');
  const [subtitle, setSubtitle] = useState<string>('جودة فائقة • أتمتة بالكود');
  const [primaryColor, setPrimaryColor] = useState<string>('#10b981');
  const [accentColor, setAccentColor] = useState<string>('#06b6d4');

  // Timeline / Playback State
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const totalFrames = 120; // 4 seconds at 30 fps
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animRef = useRef<number | null>(null);

  // Active Sidebar Tab
  const [activeTab, setActiveTab] = useState<'variables' | 'media' | 'plugins'>('variables');

  // Direct MinIO Upload State
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // User Auth State from Django Session Cookie
  const [user, setUser] = useState<{ username: string } | null>(null);

  // Export Modal State
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fetch Auth status from Django via same-origin cookie
  useEffect(() => {
    fetch('/api/auth/user/')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch((e) => console.log('Auth check error:', e));
  }, []);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1 >= totalFrames ? 0 : prev + 1));
      }, 1000 / 30);
      return () => clearInterval(interval);
    }
  }, [isPlaying, totalFrames]);

  // Handle direct file upload to MinIO via Presigned URL
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('جاري طلب رابط رفع مؤقت (Presigned URL) من دجانجو...');

    try {
      const presignedRes = await fetch('/api/s3/presigned-url/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'video/mp4',
        }),
      });

      const { presigned_url, file_url } = await presignedRes.json();

      setUploadStatus('جاري الرفع المباشر إلى MinIO S3...');

      // Direct upload to MinIO via PUT
      await fetch(presigned_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'video/mp4',
        },
        body: file,
      });

      setUploadStatus('✓ تم الرفع بنجاح ومباشرة إلى MinIO دون المرور بالباك إند!');
      setUploadedUrl(file_url);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadStatus(`❌ فشل الرفع: ${err.message}`);
    }
  };

  // Trigger Video Render
  const handleStartRender = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/videos/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          template: 'revideo_promo',
          variables: {
            subtitle,
            primaryColor,
            accentColor,
            mediaUrl: uploadedUrl,
          },
        }),
      });

      const data = await res.json();
      if (data.video_id) {
        setActiveVideoId(data.video_id);
      }
    } catch (err) {
      console.error('Render trigger error:', err);
      alert('حدث خطأ أثناء إطلاق مهمة الرندر');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="studio-root">
      {/* Top Navbar */}
      <header className="studio-header">
        <div className="header-left">
          <div className="brand-logo">
            <span className="logo-icon">🎬</span>
            <span className="logo-title">Revideo Studio</span>
            <span className="logo-tag">PRO</span>
          </div>

          <div className="project-title-input">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اسم المشروع..."
            />
          </div>
        </div>

        <div className="header-actions">
          {user ? (
            <div className="user-badge">
              <span className="online-indicator"></span>
              <span>مرحباً، <strong>{user.username}</strong> (جلسة موحدة)</span>
            </div>
          ) : (
            <a href="/" className="guest-badge" title="تسجيل الدخول من دجانجو">
              جلسة زائر • تسجيل الدخول
            </a>
          )}

          <a href="/" className="btn btn-nav">
            الصفحة التسويقية 🌐
          </a>

          <button
            className="btn btn-export"
            onClick={handleStartRender}
            disabled={isExporting}
          >
            {isExporting ? 'جاري الإطلاق...' : '⚡ تصدير الفيديو (Render)'}
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="studio-body">
        {/* Left Sidebar (Variables, Media, Custom Plugins) */}
        <aside className="studio-sidebar">
          <div className="sidebar-tabs">
            <button
              className={`tab-btn ${activeTab === 'variables' ? 'active' : ''}`}
              onClick={() => setActiveTab('variables')}
            >
              ⚙️ المتغيرات
            </button>
            <button
              className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
              onClick={() => setActiveTab('media')}
            >
              ☁️ تخزين MinIO
            </button>
            <button
              className={`tab-btn ${activeTab === 'plugins' ? 'active' : ''}`}
              onClick={() => setActiveTab('plugins')}
            >
              🧩 الـ Plugins
            </button>
          </div>

          <div className="sidebar-content">
            {activeTab === 'variables' && (
              <div className="tab-pane">
                <div className="input-group">
                  <label>العنوان الرئيسي (Title):</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="styled-input"
                  />
                </div>

                <div className="input-group">
                  <label>النص الفرعي (Subtitle):</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="styled-input"
                  />
                </div>

                <div className="color-row">
                  <div className="input-group">
                    <label>اللون الأساسي:</label>
                    <div className="color-picker-wrap">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                      <span>{primaryColor}</span>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>لون الإضاءة:</label>
                    <div className="color-picker-wrap">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                      />
                      <span>{accentColor}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="tab-pane">
                <p className="tab-hint">
                  رفع الوسائط يتم مباشرة من المتصفح إلى <strong>MinIO S3</strong> عبر رابط Presigned URL دون المرور بسيرفر Django.
                </p>

                <div className="upload-box">
                  <input
                    type="file"
                    id="media-file-input"
                    accept="video/*,audio/*,image/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="media-file-input" className="btn btn-upload">
                    📂 اختر ملف وسائط للرفع المباشر
                  </label>
                </div>

                {uploadStatus && (
                  <div className="upload-status-box">
                    <p>{uploadStatus}</p>
                    {uploadedUrl && (
                      <div className="uploaded-link-preview">
                        <code>{uploadedUrl}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'plugins' && (
              <div className="tab-pane">
                <p className="tab-hint">
                  هذه النافذة تمثل <strong>المستوى 2 (Plugin System)</strong>: نافذة مخصصة بهويتك لعرض قوالب أو أدوات شركتك داخل محرر Revideo دون الحاجة لـ Fork كامل.
                </p>

                <div className="plugin-card">
                  <h4>قالب الترويجي الذكي</h4>
                  <p>توليد فيديو 4 ثوانٍ بمؤثرات إجرائية وصوت مدمج.</p>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTitle('أقوى عروض الموسم!')}>
                    تطبيق القالب
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas Area */}
        <section className="studio-canvas-area">
          <div className="canvas-header">
            <span className="view-mode-badge">معاينة حية • Revideo Canvas Engine</span>
          </div>

          <VideoCanvas
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            title={title}
            subtitle={subtitle}
            primaryColor={primaryColor}
            accentColor={accentColor}
            uploadedImageUrl={uploadedUrl || undefined}
          />

          {/* Bottom Timeline */}
          <Timeline
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onSeek={(f) => setCurrentFrame(f)}
            title={title}
          />
        </section>
      </div>

      {/* Real-time SSE Export Modal */}
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
