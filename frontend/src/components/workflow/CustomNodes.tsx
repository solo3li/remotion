import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Sparkles,
  Bot,
  Mic,
  Film,
  Zap,
  CheckCircle2,
  Loader2,
  Sliders,
  Play,
  Volume2,
  FileVideo,
  Layers,
} from 'lucide-react';

// Status badge helper
const renderStatusBadge = (status?: string) => {
  if (status === 'RUNNING') {
    return (
      <div className="node-status-pill running">
        <Loader2 size={12} className="spin-icon" />
        <span>قيد التنفيذ...</span>
      </div>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <div className="node-status-pill completed">
        <CheckCircle2 size={12} />
        <span>مكتمل بنجاح</span>
      </div>
    );
  }
  return (
    <div className="node-status-pill idle">
      <span>جاهز</span>
    </div>
  );
};

// 1. TRIGGER / INPUT NODE
export const TriggerNode: React.FC<NodeProps> = ({ data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node trigger-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}>
      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon trigger-icon">
            <Zap size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'بداية المخطط (Trigger)')}</h4>
            <span className="node-subtitle">المدخلات والموضوع الأساسي</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="node-field">
          <label>موضوع أو فكرة الفيديو:</label>
          <textarea
            rows={2}
            className="node-textarea"
            value={String(data.prompt || '')}
            onChange={(e) => {
              if (data.onChange) (data.onChange as any)('prompt', e.target.value);
            }}
            placeholder="مثال: إعلان ترويجي لمتجر إلكتروني مع خصم 50%..."
          />
        </div>

        <div className="node-field-row">
          <div className="node-field-half">
            <label>المدة (ثواني):</label>
            <input
              type="number"
              min={2}
              max={30}
              className="node-input"
              value={Number(data.duration || 6)}
              onChange={(e) => {
                if (data.onChange) (data.onChange as any)('duration', Number(e.target.value));
              }}
            />
          </div>
          <div className="node-field-half">
            <label>لون الكانفاس:</label>
            <input
              type="color"
              className="node-color-input"
              value={String(data.bgColor || '#080a0f')}
              onChange={(e) => {
                if (data.onChange) (data.onChange as any)('bgColor', e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {/* Outgoing Handle */}
      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 2. LLM AGENT NODE (LangGraph Intelligence)
export const LlmAgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node llm-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}>
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon llm-icon">
            <Bot size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'وكيل الذكاء الاصطناعي (LLM)')}</h4>
            <span className="node-subtitle">تحليل وتأليف سكريبت المشاهد</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="node-field">
          <label>النموذج الذكي (Model):</label>
          <select
            className="node-select"
            value={String(data.model || 'gemini-1.5-flash')}
            onChange={(e) => {
              if (data.onChange) (data.onChange as any)('model', e.target.value);
            }}
          >
            <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (فائق السرعة)</option>
            <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (إبداعي دقيق)</option>
            <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
            <option value="gpt-4o">OpenAI GPT-4o Multimodal</option>
          </select>
        </div>

        <div className="node-field">
          <label>الدور الوظيفي للوكيل (System Persona):</label>
          <div className="persona-badge">
            <Sparkles size={12} />
            <span>كاتب محتوى إعلاني ومخرج مشاهد بصرية</span>
          </div>
        </div>

        {data.outputPreview && (
          <div className="node-output-preview">
            <span className="preview-label">المخرجات المولدة:</span>
            <p className="preview-text">{String(data.outputPreview)}</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 3. TTS VOICEOVER NODE
export const TtsVoiceNode: React.FC<NodeProps> = ({ data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node tts-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}>
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon tts-icon">
            <Mic size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'التعليق الصوتي والموسيقى (TTS)')}</h4>
            <span className="node-subtitle">توليد نبرة الصوت والمؤثرات</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="node-field">
          <label>نبرة ونوع الصوت (Voice Tone):</label>
          <select
            className="node-select"
            value={String(data.voiceStyle || 'حماسي إعلاني')}
            onChange={(e) => {
              if (data.onChange) (data.onChange as any)('voiceStyle', e.target.value);
            }}
          >
            <option value="حماسي إعلاني">حماسي إعلاني عالي الطاقة (Marketing)</option>
            <option value="وثائقي هادئ">وثائقي هادئ وعميق (Storytelling)</option>
            <option value="إخباري رسمي">إخباري رسمي وواضح (News & Anchor)</option>
          </select>
        </div>

        <div className="voice-wave-preview">
          <Volume2 size={14} color="#38bdf8" />
          <div className="fake-wave-bars">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} style={{ height: `${8 + (i % 5) * 4}px` }} />
            ))}
          </div>
          <span>العربية (فصحى / خليجية)</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 4. REVIDEO TIMELINE NODE
export const RevideoTimelineNode: React.FC<NodeProps> = ({ data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node timeline-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}>
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon timeline-icon">
            <Layers size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'منسق التايم لاين (Revideo NLE)')}</h4>
            <span className="node-subtitle">توزيع الطبقات، الأبعاد والمزامنة</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="timeline-caps-box">
          <div className="cap-item">
            <span className="dot text-dot" />
            <span>طبقة النصوص المتحركة</span>
          </div>
          <div className="cap-item">
            <span className="dot shape-dot" />
            <span>خلفيات وبطاقات زجاجية</span>
          </div>
          <div className="cap-item">
            <span className="dot audio-dot" />
            <span>مسار الصوت المتزامن</span>
          </div>
        </div>

        <div className="node-resolution-pill">
          <span>دقة الإخراج: Full HD (1280×720) • 30 FPS</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 5. RENDER & EXPORT NODE
export const RenderExportNode: React.FC<NodeProps> = ({ data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node render-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}>
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon render-icon">
            <FileVideo size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'تصدير الفيديو (Render & Export)')}</h4>
            <span className="node-subtitle">معالجة FFmpeg والرفع لـ MinIO</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="render-target-box">
          <span className="target-label">خزانة التخزين السحابي:</span>
          <span className="target-val">MinIO S3 (videosaas/renders)</span>
        </div>

        {data.videoUrl ? (
          <div className="render-success-box">
            <CheckCircle2 size={16} color="#10b981" />
            <a href={String(data.videoUrl)} target="_blank" rel="noreferrer" className="btn-video-link">
              مشاهدة وتحميل MP4 ↗
            </a>
          </div>
        ) : (
          <div className="render-waiting-hint">
            <span>في انتظار تشغيل المخطط لإنتاج الفيديو...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const customNodeTypes = {
  triggerNode: TriggerNode,
  llmAgentNode: LlmAgentNode,
  ttsVoiceNode: TtsVoiceNode,
  revideoTimelineNode: RevideoTimelineNode,
  renderExportNode: RenderExportNode,
};
