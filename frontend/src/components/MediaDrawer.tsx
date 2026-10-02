import React, { useState } from 'react';
import { TimelineClip } from '../types';
import {
  Type,
  CloudUpload,
  Square,
  Music,
  Play,
  Plus,
  Film,
  Sparkles,
  Volume2,
  FileCheck,
} from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

interface MediaDrawerProps {
  onAddClip: (clip: Omit<TimelineClip, 'id'>) => void;
  currentTime: number;
}

export const MediaDrawer: React.FC<MediaDrawerProps> = ({ onAddClip, currentTime }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'media' | 'audio' | 'shapes'>('text');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; type: string }>>([
    {
      name: 'فيديو تجريبي عالي الدقة مزود بصوت (Full HD)',
      url: 'http://169.58.32.179.nip.io:9000/videosaas/uploads/c2cdcb_demo_studio_clip.mp4',
      type: 'video',
    },
    {
      name: 'موسيقى خلفية هادئة (Lofi Beat Synth)',
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

  const addTextPreset = (preset: {
    title: string;
    text: string;
    fontSize: number;
    color: string;
    bgColor?: string;
    borderRadius?: number;
    textAlign?: 'right' | 'center' | 'left';
    width?: number;
    height?: number;
  }) => {
    onAddClip({
      trackId: 'track-text',
      type: 'text',
      title: preset.title,
      text: preset.text,
      start: currentTime,
      duration: 3.5,
      x: 240,
      y: 190,
      width: preset.width || 480,
      height: preset.height || 100,
      rotation: 0,
      opacity: 1,
      fontSize: preset.fontSize,
      color: preset.color,
      bgColor: preset.bgColor,
      borderRadius: preset.borderRadius,
      textAlign: preset.textAlign || 'center',
    });
  };

  const addShapePreset = (shape: { title: string; color: string; width: number; height: number; borderRadius?: number }) => {
    onAddClip({
      trackId: 'track-video',
      type: 'shape',
      title: shape.title,
      start: currentTime,
      duration: 4,
      x: 340,
      y: 170,
      width: shape.width,
      height: shape.height,
      rotation: 0,
      opacity: 0.85,
      color: shape.color,
      borderRadius: shape.borderRadius || 12,
    });
  };

  const addMediaToTimeline = (file: { name: string; url: string; type: string }) => {
    const isAudio = file.type === 'audio';
    onAddClip({
      trackId: isAudio ? 'track-audio' : 'track-video',
      type: isAudio ? 'audio' : 'video',
      title: file.name,
      start: currentTime,
      duration: isAudio ? 5 : 4,
      x: isAudio ? 0 : 80,
      y: isAudio ? 0 : 45,
      width: isAudio ? 0 : 800,
      height: isAudio ? 0 : 450,
      rotation: 0,
      opacity: 1,
      src: file.url,
      volume: 1,
    });
  };

  const addSoundEffect = (name: string, sfxType: 'whoosh' | 'pop' | 'chime' | 'success' | 'bass', duration: number = 1.5) => {
    onAddClip({
      trackId: 'track-audio',
      type: 'audio',
      title: name,
      start: currentTime,
      duration,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: 1,
      volume: 1,
    });
  };

  return (
    <aside className="media-drawer">
      {/* Drawer Tabs */}
      <div className="drawer-tabs-bar">
        <button
          className={`drawer-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
          title="نصوص وعناوين"
        >
          <Type size={16} />
          <span>نصوص</span>
        </button>
        <button
          className={`drawer-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => setActiveTab('media')}
          title="رفع ملفات وسائط"
        >
          <CloudUpload size={16} />
          <span>ميديا MinIO</span>
        </button>
        <button
          className={`drawer-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
          title="مؤثرات صوتية وموسيقى"
        >
          <Music size={16} />
          <span>صوتيات FX</span>
        </button>
        <button
          className={`drawer-tab-btn ${activeTab === 'shapes' ? 'active' : ''}`}
          onClick={() => setActiveTab('shapes')}
          title="أشكال هندسية وخلفيات"
        >
          <Square size={16} />
          <span>أشكال</span>
        </button>
      </div>

      <div className="drawer-body">
        {/* TEXT PRESETS TAB */}
        {activeTab === 'text' && (
          <div className="preset-grid">
            <div
              className="preset-card"
              onClick={() =>
                addTextPreset({
                  title: 'عنوان رئيسي فخم',
                  text: 'عنوان تسويقي ضخم وجذاب',
                  fontSize: 44,
                  color: '#ffffff',
                })
              }
            >
              <div className="preset-preview large-heading">عنوان رئيسي</div>
              <span className="preset-label">+ عنوان عريض (Heading)</span>
            </div>

            <div
              className="preset-card"
              onClick={() =>
                addTextPreset({
                  title: 'نص توضيحي وسردي',
                  text: 'اكتب تفاصيل ومزايا خدمتك بدقة واحترافية عالية',
                  fontSize: 22,
                  color: '#38bdf8',
                })
              }
            >
              <div className="preset-preview subheading">نص فرعي</div>
              <span className="preset-label">+ نص فرعي (Subheading)</span>
            </div>

            <div
              className="preset-card"
              onClick={() =>
                addTextPreset({
                  title: 'شارة خصم ترويجية',
                  text: '🔥 خصم حصري 50% لفترة محدودة',
                  fontSize: 26,
                  color: '#10b981',
                  bgColor: 'rgba(16, 185, 129, 0.25)',
                  borderRadius: 16,
                  width: 440,
                  height: 70,
                })
              }
            >
              <div className="preset-preview badge-heading">خصم 50% 🔥</div>
              <span className="preset-label">+ شارة ترويجية (Badge)</span>
            </div>

            <div
              className="preset-card"
              onClick={() =>
                addTextPreset({
                  title: 'شريط سفلي (Lower Third)',
                  text: 'م/ أحمد الشمري • المؤسس والرئيس التنفيذي',
                  fontSize: 20,
                  color: '#ffffff',
                  bgColor: 'rgba(15, 23, 42, 0.85)',
                  borderRadius: 8,
                  width: 500,
                  height: 60,
                })
              }
            >
              <div className="preset-preview lower-third">Lower Third 🎙️</div>
              <span className="preset-label">+ شريط تعريفي سفلي</span>
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
                <CloudUpload size={18} />
                <span>رفع ملف إلى MinIO S3 مباشرة</span>
              </label>
              {uploadStatus && <div className="upload-inline-status">{uploadStatus}</div>}
            </div>

            <h4 className="drawer-subhead">
              <Film size={14} />
              <span>الملفات المتاحة في السحابة:</span>
            </h4>
            <div className="media-files-list">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="media-item-card">
                  <div className="media-item-info">
                    <span className="media-icon">{file.type === 'audio' ? <Music size={16} /> : <Film size={16} />}</span>
                    <span className="media-name">{file.name}</span>
                  </div>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addMediaToTimeline(file)}
                    title="إدراج إلى المسار"
                  >
                    <Plus size={12} />
                    <span>إدراج</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUDIO & SFX TAB */}
        {activeTab === 'audio' && (
          <div className="audio-sfx-section">
            <h4 className="drawer-subhead">
              <Volume2 size={14} />
              <span>مكتبة المؤثرات الصوتية (Instant Preview):</span>
            </h4>
            <div className="sfx-list">
              <div className="sfx-card">
                <div className="sfx-info">
                  <span className="sfx-name">انتقال سريع (Whoosh FX)</span>
                  <span className="sfx-meta">0.3 ثانية • مؤثر حركي</span>
                </div>
                <div className="sfx-actions">
                  <button
                    className="btn-preview-sound"
                    onClick={() => audioEngine.playSfx('whoosh')}
                    title="استماع فوري للمؤثر"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addSoundEffect('Whoosh Transition', 'whoosh', 0.5)}
                    title="إضافة للتايم لاين"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="sfx-card">
                <div className="sfx-info">
                  <span className="sfx-name">نقرة تفاعلية (Pop Sound)</span>
                  <span className="sfx-meta">0.1 ثانية • ظهور نصوص وأزرار</span>
                </div>
                <div className="sfx-actions">
                  <button
                    className="btn-preview-sound"
                    onClick={() => audioEngine.playSfx('pop')}
                    title="استماع فوري"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addSoundEffect('Pop FX', 'pop', 0.3)}
                    title="إضافة للتايم لاين"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="sfx-card">
                <div className="sfx-info">
                  <span className="sfx-name">رنة تنبيه ناعمة (Chime FX)</span>
                  <span className="sfx-meta">0.5 ثانية • إشعار راقي</span>
                </div>
                <div className="sfx-actions">
                  <button
                    className="btn-preview-sound"
                    onClick={() => audioEngine.playSfx('chime')}
                    title="استماع فوري"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addSoundEffect('Chime Alert', 'chime', 0.8)}
                    title="إضافة للتايم لاين"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="sfx-card">
                <div className="sfx-info">
                  <span className="sfx-name">نغمة نجاح (Success Fanfare)</span>
                  <span className="sfx-meta">0.8 ثانية • إنجاز وتأكيد</span>
                </div>
                <div className="sfx-actions">
                  <button
                    className="btn-preview-sound"
                    onClick={() => audioEngine.playSfx('success')}
                    title="استماع فوري"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addSoundEffect('Success Fanfare', 'success', 1.0)}
                    title="إضافة للتايم لاين"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="sfx-card">
                <div className="sfx-info">
                  <span className="sfx-name">هبوط باز عميق (Deep Bass Drop)</span>
                  <span className="sfx-meta">0.6 ثانية • مشهد حماسي</span>
                </div>
                <div className="sfx-actions">
                  <button
                    className="btn-preview-sound"
                    onClick={() => audioEngine.playSfx('bass')}
                    title="استماع فوري"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => addSoundEffect('Bass Drop FX', 'bass', 1.2)}
                    title="إضافة للتايم لاين"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SHAPES TAB */}
        {activeTab === 'shapes' && (
          <div className="preset-grid">
            <div
              className="preset-card"
              onClick={() =>
                addShapePreset({
                  title: 'بطاقة زجاجية دائرية الحواف',
                  color: 'rgba(16, 185, 129, 0.4)',
                  width: 320,
                  height: 220,
                  borderRadius: 20,
                })
              }
            >
              <div className="shape-box" style={{ background: '#10b981', borderRadius: '16px' }} />
              <span className="preset-label">+ بطاقة زمردية</span>
            </div>

            <div
              className="preset-card"
              onClick={() =>
                addShapePreset({
                  title: 'شريط عرض عريض',
                  color: 'rgba(6, 182, 212, 0.7)',
                  width: 600,
                  height: 70,
                  borderRadius: 12,
                })
              }
            >
              <div className="shape-box" style={{ background: '#06b6d4', width: '85%', height: '24px' }} />
              <span className="preset-label">+ شريط خلفية عريض</span>
            </div>

            <div
              className="preset-card"
              onClick={() =>
                addShapePreset({
                  title: 'دائرة تركيز وبؤرة',
                  color: 'rgba(239, 68, 68, 0.6)',
                  width: 180,
                  height: 180,
                  borderRadius: 999,
                })
              }
            >
              <div className="shape-box" style={{ background: '#ef4444', borderRadius: '50%', width: '40px', height: '40px' }} />
              <span className="preset-label">+ دائرة تركيز حمراء</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
