import React from 'react';
import { TimelineClip, ProjectSettings } from '../types';
import {
  Type,
  Sliders,
  Clock,
  Copy,
  Trash2,
  Sparkles,
  Volume2,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

interface InspectorPanelProps {
  selectedClip: TimelineClip | null;
  onUpdateClip: (id: string, updates: Partial<TimelineClip>) => void;
  onDeleteClip: (id: string) => void;
  onDuplicateClip: (id: string) => void;
  projectSettings: ProjectSettings;
  onUpdateProjectSettings: (updates: Partial<ProjectSettings>) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selectedClip,
  onUpdateClip,
  onDeleteClip,
  onDuplicateClip,
  projectSettings,
  onUpdateProjectSettings,
}) => {
  return (
    <aside className="inspector-panel">
      <div className="inspector-header">
        <span className="panel-badge">
          {selectedClip ? `خصائص: ${selectedClip.title || selectedClip.type}` : 'إعدادات المشروع الكلي'}
        </span>
      </div>

      <div className="inspector-scroll-area">
        {selectedClip ? (
          <div className="clip-properties-form">
            {/* Quick Type & Layer Pill */}
            <div className="property-section">
              <div className="clip-type-pill">
                <span className="type-dot"></span>
                <span>نوع العنصر: <strong>{selectedClip.type.toUpperCase()}</strong></span>
              </div>
              <div className="prop-row" style={{ marginTop: '8px' }}>
                <label>اسم المقطع:</label>
                <input
                  type="text"
                  value={selectedClip.title || ''}
                  onChange={(e) => onUpdateClip(selectedClip.id, { title: e.target.value })}
                  className="inspector-input"
                />
              </div>
            </div>

            {/* Text Properties (if text) */}
            {selectedClip.type === 'text' && (
              <div className="property-section">
                <h4 className="section-title">
                  <Type size={14} className="title-icon" />
                  <span>محتوى النص والمظهر</span>
                </h4>
                <div className="prop-row">
                  <label>النص المعروض:</label>
                  <textarea
                    rows={2}
                    value={selectedClip.text || ''}
                    onChange={(e) => onUpdateClip(selectedClip.id, { text: e.target.value })}
                    className="inspector-textarea"
                  />
                </div>

                <div className="prop-grid-2">
                  <div className="prop-row">
                    <label>حجم الخط (px):</label>
                    <input
                      type="number"
                      min={12}
                      max={120}
                      value={selectedClip.fontSize || 32}
                      onChange={(e) => onUpdateClip(selectedClip.id, { fontSize: Number(e.target.value) })}
                      className="inspector-input"
                    />
                  </div>
                  <div className="prop-row">
                    <label>لون الخط:</label>
                    <div className="inspector-color-wrap">
                      <input
                        type="color"
                        value={selectedClip.color || '#ffffff'}
                        onChange={(e) => onUpdateClip(selectedClip.id, { color: e.target.value })}
                      />
                      <span>{selectedClip.color}</span>
                    </div>
                  </div>
                </div>

                <div className="prop-row">
                  <label>محاذاة النص:</label>
                  <div className="align-buttons-group">
                    <button
                      className={`btn-align ${selectedClip.textAlign === 'right' ? 'active' : ''}`}
                      onClick={() => onUpdateClip(selectedClip.id, { textAlign: 'right' })}
                      title="يمين"
                    >
                      <AlignRight size={14} />
                    </button>
                    <button
                      className={`btn-align ${selectedClip.textAlign === 'center' || !selectedClip.textAlign ? 'active' : ''}`}
                      onClick={() => onUpdateClip(selectedClip.id, { textAlign: 'center' })}
                      title="وسط"
                    >
                      <AlignCenter size={14} />
                    </button>
                    <button
                      className={`btn-align ${selectedClip.textAlign === 'left' ? 'active' : ''}`}
                      onClick={() => onUpdateClip(selectedClip.id, { textAlign: 'left' })}
                      title="يسار"
                    >
                      <AlignLeft size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Video & Media Specific Controls */}
            {(selectedClip.type === 'video' || selectedClip.type === 'audio') && (
              <div className="property-section">
                <h4 className="section-title">
                  <Volume2 size={14} className="title-icon" />
                  <span>الصوت ومستوى الإشارة</span>
                </h4>
                <div className="prop-row">
                  <div className="slider-label-row">
                    <label>مستوى الصوت (Volume):</label>
                    <span>{Math.round((selectedClip.volume ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedClip.volume ?? 1}
                    onChange={(e) => onUpdateClip(selectedClip.id, { volume: Number(e.target.value) })}
                    className="inspector-slider"
                  />
                </div>
              </div>
            )}

            {/* Filter / Color Grade for Video & Shape */}
            {(selectedClip.type === 'video' || selectedClip.type === 'shape') && (
              <div className="property-section">
                <h4 className="section-title">
                  <Sparkles size={14} className="title-icon" />
                  <span>الفلاتر والمؤثرات البصرية</span>
                </h4>
                <div className="prop-row">
                  <label>فلتر الألوان (LUT / Grading):</label>
                  <select
                    value={selectedClip.filter || 'none'}
                    onChange={(e) => onUpdateClip(selectedClip.id, { filter: e.target.value })}
                    className="inspector-input"
                  >
                    <option value="none">طبيعي (بدون فلتر)</option>
                    <option value="cinematic">سينمائي عميق (Cinematic Contrast)</option>
                    <option value="vintage">فينتاج دافئ (Warm Vintage)</option>
                    <option value="grayscale">أبيض وأسود كلاسيكي (Black & White)</option>
                    <option value="cool">نيون مستقبلي (Cyber Cool)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Transform Properties */}
            {selectedClip.type !== 'audio' && (
              <div className="property-section">
                <h4 className="section-title">
                  <Sliders size={14} className="title-icon" />
                  <span>الموضع والأبعاد (Transform)</span>
                </h4>
                <div className="prop-grid-2">
                  <div className="prop-row">
                    <label>الموضع X:</label>
                    <input
                      type="number"
                      value={selectedClip.x}
                      onChange={(e) => onUpdateClip(selectedClip.id, { x: Number(e.target.value) })}
                      className="inspector-input"
                    />
                  </div>
                  <div className="prop-row">
                    <label>الموضع Y:</label>
                    <input
                      type="number"
                      value={selectedClip.y}
                      onChange={(e) => onUpdateClip(selectedClip.id, { y: Number(e.target.value) })}
                      className="inspector-input"
                    />
                  </div>
                  <div className="prop-row">
                    <label>العرض (W):</label>
                    <input
                      type="number"
                      value={selectedClip.width}
                      onChange={(e) => onUpdateClip(selectedClip.id, { width: Number(e.target.value) })}
                      className="inspector-input"
                    />
                  </div>
                  <div className="prop-row">
                    <label>الارتفاع (H):</label>
                    <input
                      type="number"
                      value={selectedClip.height}
                      onChange={(e) => onUpdateClip(selectedClip.id, { height: Number(e.target.value) })}
                      className="inspector-input"
                    />
                  </div>
                </div>

                <div className="prop-row">
                  <div className="slider-label-row">
                    <label>الشفافية (Opacity):</label>
                    <span>{Math.round((selectedClip.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selectedClip.opacity ?? 1}
                    onChange={(e) => onUpdateClip(selectedClip.id, { opacity: Number(e.target.value) })}
                    className="inspector-slider"
                  />
                </div>

                <div className="prop-row">
                  <div className="slider-label-row">
                    <label>الدوران (Rotation):</label>
                    <span>{selectedClip.rotation || 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedClip.rotation || 0}
                    onChange={(e) => onUpdateClip(selectedClip.id, { rotation: Number(e.target.value) })}
                    className="inspector-slider"
                  />
                </div>
              </div>
            )}

            {/* Timing Section */}
            <div className="property-section">
              <h4 className="section-title">
                <Clock size={14} className="title-icon" />
                <span>التوقيت والمدة (Timing)</span>
              </h4>
              <div className="prop-grid-2">
                <div className="prop-row">
                  <label>وقت البدء (ثانية):</label>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedClip.start}
                    onChange={(e) => onUpdateClip(selectedClip.id, { start: Number(e.target.value) })}
                    className="inspector-input"
                  />
                </div>
                <div className="prop-row">
                  <label>مدة العرض (ثانية):</label>
                  <input
                    type="number"
                    step={0.1}
                    value={selectedClip.duration}
                    onChange={(e) => onUpdateClip(selectedClip.id, { duration: Number(e.target.value) })}
                    className="inspector-input"
                  />
                </div>
              </div>
            </div>

            {/* Actions Section */}
            <div className="property-section action-buttons-row">
              <button
                className="btn btn-secondary btn-full"
                onClick={() => onDuplicateClip(selectedClip.id)}
              >
                <Copy size={14} />
                <span>مضاعفة المقطع</span>
              </button>
              <button
                className="btn btn-danger btn-full"
                onClick={() => onDeleteClip(selectedClip.id)}
              >
                <Trash2 size={14} />
                <span>حذف المقطع</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="project-settings-form">
            <div className="empty-selection-hint">
              <span className="hint-icon">🎯</span>
              <p>انقر على أي مقطع في الكانفاس أو التايم لاين لتعديل أبعاده وموضعه ولونه بحرية.</p>
            </div>

            <div className="property-section">
              <h4 className="section-title">
                <Palette size={14} className="title-icon" />
                <span>إعدادات الفيديو الكلي</span>
              </h4>
              <div className="prop-row">
                <label>اسم المشروع:</label>
                <input
                  type="text"
                  value={projectSettings.title}
                  onChange={(e) => onUpdateProjectSettings({ title: e.target.value })}
                  className="inspector-input"
                />
              </div>

              <div className="prop-row">
                <label>مدة الفيديو الإجمالية (ثواني):</label>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={projectSettings.duration}
                  onChange={(e) => onUpdateProjectSettings({ duration: Number(e.target.value) })}
                  className="inspector-input"
                />
              </div>

              <div className="prop-row">
                <label>لون خلفية الفيديو:</label>
                <div className="inspector-color-wrap">
                  <input
                    type="color"
                    value={projectSettings.bgColor}
                    onChange={(e) => onUpdateProjectSettings({ bgColor: e.target.value })}
                  />
                  <span>{projectSettings.bgColor}</span>
                </div>
              </div>

              <div className="prop-row">
                <label>الأبعاد ومعدل الفريمات:</label>
                <div className="resolution-badge">
                  <span>Full HD 1080p (1920 × 1080) • 30 FPS</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
