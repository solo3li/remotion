import React, { useState } from 'react';
import { TimelineClip } from '../types';

interface MediaDrawerProps {
  onAddClip: (clip: Omit<TimelineClip, 'id'>) => void;
  currentTime: number;
}

export const MediaDrawer: React.FC<MediaDrawerProps> = ({ onAddClip, currentTime }) => {
  const [activeTab, setActiveTab] = useState<'media' | 'text' | 'shapes'>('text');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; type: string }>>([
    {
      name: 'مقطع فيديو ترويجي تجريبي',
      url: '',
      type: 'video',
    },
    {
      name: 'موسيقى خلفية هادئة (Lofi Beat)',
      url: '',
      type: 'audio',
    },
  ]);

  // Handle direct file upload to MinIO via Presigned URL
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('جاري توليد رابط الرفع المؤقت من دجانجو...');

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

      await fetch(presigned_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'video/mp4',
        },
        body: file,
      });

      setUploadStatus('✓ تم الرفع بنجاح ومباشرة إلى MinIO!');
      setUploadedFiles((prev) => [
        {
          name: file.name,
          url: file_url,
          type: file.type.startsWith('audio') ? 'audio' : 'video',
        },
        ...prev,
      ]);
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadStatus(`❌ فشل الرفع: ${err.message}`);
    }
  };

  const addTextPreset = (preset: { title: string; text: string; fontSize: number; color: string; bgColor?: string }) => {
    onAddClip({
      trackId: 'track-text',
      type: 'text',
      title: preset.title,
      text: preset.text,
      start: currentTime,
      duration: 3,
      x: 280,
      y: 200,
      width: 400,
      height: 100,
      rotation: 0,
      opacity: 1,
      fontSize: preset.fontSize,
      color: preset.color,
      bgColor: preset.bgColor,
    });
  };

  const addShapePreset = (shape: { title: string; color: string; width: number; height: number }) => {
    onAddClip({
      trackId: 'track-video',
      type: 'shape',
      title: shape.title,
      start: currentTime,
      duration: 3,
      x: 380,
      y: 180,
      width: shape.width,
      height: shape.height,
      rotation: 0,
      opacity: 0.9,
      color: shape.color,
    });
  };

  const addMediaToTimeline = (file: { name: string; url: string; type: string }) => {
    const isAudio = file.type === 'audio';
    onAddClip({
      trackId: isAudio ? 'track-audio' : 'track-video',
      type: isAudio ? 'audio' : 'video',
      title: file.name,
      start: currentTime,
      duration: 4,
      x: isAudio ? 0 : 100,
      y: isAudio ? 0 : 50,
      width: isAudio ? 0 : 760,
      height: isAudio ? 0 : 440,
      rotation: 0,
      opacity: 1,
      src: file.url,
    });
  };

  return (
    <aside className="media-drawer">
      {/* Drawer Tabs */}
      <div className="drawer-tabs-bar">
        <button
          className={`drawer-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          ✍️ نصوص
        </button>
        <button
          className={`drawer-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          ☁️ ميديا MinIO
        </button>
        <button
          className={`drawer-tab-btn ${activeTab === 'shapes' ? 'active' : ''}`}
          onClick={() => setActiveTab('shapes')}
        >
          🎨 أشكال
        </button>
      </div>

      <div className="drawer-body">
        {/* TEXT PRESETS TAB */}
        {activeTab === 'text' && (
          <div className="preset-grid">
            <div className="preset-card" onClick={() => addTextPreset({
              title: 'عنوان عريض',
              text: 'عنوان تسويقي ضخم',
              fontSize: 48,
              color: '#ffffff'
            })}>
              <div className="preset-preview large-heading">عنوان عريض</div>
              <span className="preset-label">+ إضافة عنوان رئيسي</span>
            </div>

            <div className="preset-card" onClick={() => addTextPreset({
              title: 'نص توضيحي',
              text: 'اكتب تفاصيل العرض هنا بدقة وبساطة',
              fontSize: 24,
              color: '#06b6d4'
            })}>
              <div className="preset-preview subheading">نص توضيحي</div>
              <span className="preset-label">+ إضافة نص فرعي</span>
            </div>

            <div className="preset-card" onClick={() => addTextPreset({
              title: 'شارة خصم',
              text: '🔥 خصم خاص 50% لفترة محدودة',
              fontSize: 28,
              color: '#10b981',
              bgColor: 'rgba(16, 185, 129, 0.2)'
            })}>
              <div className="preset-preview badge-heading">شارة خصم 🔥</div>
              <span className="preset-label">+ إضافة شارة مميزة</span>
            </div>
          </div>
        )}

        {/* MEDIA & MINIO S3 TAB */}
        {activeTab === 'media' && (
          <div className="media-section">
            <div className="direct-upload-box">
              <input
                type="file"
                id="media-drawer-file"
                accept="video/*,audio/*,image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="media-drawer-file" className="btn-drawer-upload">
                <span>☁️ رفع ملف إلى MinIO S3 مباشرة</span>
              </label>
              {uploadStatus && <div className="upload-inline-status">{uploadStatus}</div>}
            </div>

            <h4 className="drawer-subhead">الملفات المتاحة:</h4>
            <div className="media-files-list">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="media-item-card">
                  <div className="media-item-info">
                    <span className="media-icon">{file.type === 'audio' ? '🎵' : '🎬'}</span>
                    <span className="media-name">{file.name}</span>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addMediaToTimeline(file)}
                  >
                    + للتايم لاين
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHAPES TAB */}
        {activeTab === 'shapes' && (
          <div className="preset-grid">
            <div className="preset-card" onClick={() => addShapePreset({
              title: 'مربع متدرج',
              color: '#10b981',
              width: 200,
              height: 200,
            })}>
              <div className="shape-box" style={{ background: '#10b981' }} />
              <span className="preset-label">+ مربع زمردي</span>
            </div>

            <div className="preset-card" onClick={() => addShapePreset({
              title: 'مستطيل عريض',
              color: '#06b6d4',
              width: 380,
              height: 80,
            })}>
              <div className="shape-box" style={{ background: '#06b6d4', width: '80%', height: '30px' }} />
              <span className="preset-label">+ شريط خلفية</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
