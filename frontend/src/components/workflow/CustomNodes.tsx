import React from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import {
  Zap,
  Bot,
  Mic,
  Film,
  Sparkles,
  Search,
  Globe,
  Code2,
  Database,
  BookOpen,
  Share2,
  Bell,
  Scissors,
  Eye,
  Video,
  FileJson,
  Clock,
  UploadCloud,
  Users,
  Brain,
  FileText,
  Send,
  AudioWaveform,
  Music,
  GitBranch,
  Merge,
  HardDrive,
  Subtitles,
  PlayCircle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { ALL_NODES, NodeDefinition } from './nodeCatalog';

// Icon resolver map
const ICON_MAP: Record<string, React.ElementType> = {
  Zap,
  Bot,
  Mic,
  Film,
  Sparkles,
  Search,
  Globe,
  Code2,
  Database,
  BookOpen,
  Share2,
  Bell,
  Scissors,
  Eye,
  Video,
  FileJson,
  Clock,
  UploadCloud,
  Users,
  Brain,
  FileText,
  Send,
  AudioWaveform,
  Music,
  GitBranch,
  Merge,
  HardDrive,
  Subtitles,
  PlayCircle,
  Layers,
};

// Status badge helper
export const renderStatusBadge = (status?: string) => {
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
  if (status === 'FAILED') {
    return (
      <div className="node-status-pill failed" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
        <AlertCircle size={12} />
        <span>حدث خطأ</span>
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
export const TriggerNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const status = (data.status as string) || 'IDLE';
  const { updateNodeData } = useReactFlow();

  const handleFieldChange = (key: string, val: any) => {
    updateNodeData(id, { [key]: val });
    if (data?.onChange) (data.onChange as any)(key, val);
  };

  return (
    <div className={`flow-node trigger-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`} dir="rtl">
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
            onChange={(e) => handleFieldChange('prompt', e.target.value)}
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
              value={Number(data.duration || 5)}
              onChange={(e) => handleFieldChange('duration', Number(e.target.value))}
            />
          </div>
          <div className="node-field-half">
            <label>لون الكانفاس:</label>
            <input
              type="color"
              className="node-color-input"
              value={String(data.bgColor || '#080a0f')}
              onChange={(e) => handleFieldChange('bgColor', e.target.value)}
            />
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 2. LLM AGENT NODE (LangGraph Intelligence)
export const LlmAgentNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const status = (data.status as string) || 'IDLE';
  const { updateNodeData } = useReactFlow();

  const handleFieldChange = (key: string, val: any) => {
    updateNodeData(id, { [key]: val });
    if (data?.onChange) (data.onChange as any)(key, val);
  };

  return (
    <div className={`flow-node llm-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`} dir="rtl">
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
            onChange={(e) => handleFieldChange('model', e.target.value)}
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
export const TtsVoiceNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const status = (data.status as string) || 'IDLE';
  const { updateNodeData } = useReactFlow();

  const handleFieldChange = (key: string, val: any) => {
    updateNodeData(id, { [key]: val });
    if (data?.onChange) (data.onChange as any)(key, val);
  };

  return (
    <div className={`flow-node tts-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`} dir="rtl">
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
            onChange={(e) => handleFieldChange('voiceStyle', e.target.value)}
          >
            <option value="حماسي إعلاني">حماسي إعلاني عالي الطاقة (Marketing)</option>
            <option value="وثائقي هادئ">وثائقي هادئ ورزين (Documentary)</option>
            <option value="مرح وتفاعلي">مرح وتفاعلي (Social Media / TikTok)</option>
            <option value="رسمي إخباري">رسمي وجاد (Corporate / News)</option>
          </select>
        </div>

        <div className="audio-wave-placeholder">
          <div className="wave-bar" style={{ height: '40%' }}></div>
          <div className="wave-bar" style={{ height: '75%' }}></div>
          <div className="wave-bar" style={{ height: '100%' }}></div>
          <div className="wave-bar" style={{ height: '60%' }}></div>
          <div className="wave-bar" style={{ height: '85%' }}></div>
          <div className="wave-bar" style={{ height: '50%' }}></div>
          <div className="wave-bar" style={{ height: '30%' }}></div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 4. REVIDEO TIMELINE NODE
export const RevideoTimelineNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node timeline-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`} dir="rtl">
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon timeline-icon">
            <Film size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'تشكيل التايم لاين (Revideo)')}</h4>
            <span className="node-subtitle">توزيع الطبقات والمحاذاة الزمنية</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="timeline-mock-box">
          <div className="track-row">
            <span className="track-badge text-track">نص</span>
            <div className="track-block" style={{ width: '80%', left: '10%' }}></div>
          </div>
          <div className="track-row">
            <span className="track-badge video-track">شكل</span>
            <div className="track-block" style={{ width: '90%', left: '5%' }}></div>
          </div>
          <div className="track-row">
            <span className="track-badge audio-track">صوت</span>
            <div className="track-block audio-block" style={{ width: '100%', left: '0%' }}></div>
          </div>
        </div>
        <p className="node-hint-text">توليد مسارات متناسقة تلقائياً قابلة للنقل للاستوديو.</p>
      </div>

      <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
    </div>
  );
};

// 5. RENDER / EXPORT NODE
export const RenderExportNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const status = (data.status as string) || 'IDLE';

  return (
    <div className={`flow-node render-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`} dir="rtl">
      <Handle type="target" position={Position.Top} className="custom-handle handle-target" />

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon render-icon">
            <PlayCircle size={16} />
          </span>
          <div>
            <h4 className="node-title">{String(data.label || 'تصدير ورندر MP4 (MinIO S3)')}</h4>
            <span className="node-subtitle">إنتاج الرابط السحابي النهائي</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        <div className="render-specs-box">
          <div className="spec-item">
            <span>الدقة:</span> <strong>1280x720 (HD)</strong>
          </div>
          <div className="spec-item">
            <span>المعدل:</span> <strong>30 FPS</strong>
          </div>
          <div className="spec-item">
            <span>الترميز:</span> <strong>H.264 / AAC</strong>
          </div>
        </div>

        {data.videoUrl && (
          <div className="rendered-preview-box">
            <span className="success-tag">تم الرندر بنجاح ✓</span>
            <a
              href={String(data.videoUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="download-video-link"
            >
              تحميل وتشغيل الفيديو 🎬
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

// 6. UNIVERSAL CATALOG NODE (Polymorphic renderer for all other 25+ catalog nodes)
export const UniversalNode: React.FC<NodeProps> = ({ id, type, data, selected }) => {
  const status = (data.status as string) || 'IDLE';
  const meta: NodeDefinition | undefined = ALL_NODES.find((n) => n.type === type);
  const { updateNodeData } = useReactFlow();

  const handleFieldChange = (key: string, val: any) => {
    updateNodeData(id, { [key]: val });
    if (data?.onChange) (data.onChange as any)(key, val);
  };

  const IconComp = meta?.icon && ICON_MAP[meta.icon] ? ICON_MAP[meta.icon] : Zap;
  const categoryColor = meta?.categoryColor || '#38bdf8';
  const categoryLabel = meta?.categoryLabel || 'أداة ذكية';

  return (
    <div
      className={`flow-node universal-node ${selected ? 'selected' : ''} ${status.toLowerCase()}`}
      style={{ borderTop: `3px solid ${categoryColor}` }}
      dir="rtl"
    >
      {meta?.hasInput !== false && (
        <Handle type="target" position={Position.Top} className="custom-handle handle-target" />
      )}

      <div className="node-header">
        <div className="node-title-group">
          <span className="node-icon" style={{ background: `${categoryColor}22`, color: categoryColor }}>
            <IconComp size={16} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h4 className="node-title">{String(data.label || meta?.label || type)}</h4>
              <span
                style={{
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: `${categoryColor}20`,
                  color: categoryColor,
                  fontWeight: 600,
                }}
              >
                {categoryLabel}
              </span>
            </div>
            <span className="node-subtitle">{meta?.description || 'عقدة ذكية ضمن مسار العمل'}</span>
          </div>
        </div>
        {renderStatusBadge(status)}
      </div>

      <div className="node-body">
        {/* Render relevant dynamic fields based on node type */}
        {type === 'webSearchNode' && (
          <div className="node-field">
            <label>عبارة البحث المباشر (Query):</label>
            <input
              type="text"
              className="node-input"
              value={String(data.query || data.searchQuery || '')}
              placeholder="مثال: آخر أخبار الذكاء الاصطناعي اليوم..."
              onChange={(e) => handleFieldChange('query', e.target.value)}
            />
          </div>
        )}

        {type === 'textToImageNode' && (
          <div className="node-field">
            <label>وصف الصورة (Prompt):</label>
            <input
              type="text"
              className="node-input"
              value={String(data.prompt || '')}
              placeholder="مثال: خلفية مستقبلية نيون لسيارة رياضية..."
              onChange={(e) => handleFieldChange('prompt', e.target.value)}
            />
          </div>
        )}

        {type === 'conditionIfElseNode' && (
          <div className="node-field-row">
            <div className="node-field-half">
              <label>المتغير:</label>
              <input
                type="text"
                className="node-input"
                value={String(data.conditionKey || 'platform')}
                onChange={(e) => handleFieldChange('conditionKey', e.target.value)}
              />
            </div>
            <div className="node-field-half">
              <label>القيمة المطلوبة:</label>
              <input
                type="text"
                className="node-input"
                value={String(data.conditionValue || 'tiktok')}
                onChange={(e) => handleFieldChange('conditionValue', e.target.value)}
              />
            </div>
          </div>
        )}

        {type === 'notificationAlertNode' && (
          <div className="node-field">
            <label>قناة التنبيه:</label>
            <select
              className="node-select"
              value={String(data.channelType || 'telegram')}
              onChange={(e) => handleFieldChange('channelType', e.target.value)}
            >
              <option value="telegram">Telegram Bot</option>
              <option value="discord">Discord Webhook</option>
              <option value="slack">Slack Channel</option>
            </select>
          </div>
        )}

        {type === 'codeSandboxNode' && (
          <div className="node-field">
            <label>كود بايثون السحابي:</label>
            <textarea
              rows={3}
              className="node-textarea"
              style={{ fontFamily: 'monospace', fontSize: '11px', direction: 'ltr' }}
              value={String(data.codeSnippet || '# Python expression\nresult = state.get("prompt", "").upper()')}
              onChange={(e) => handleFieldChange('codeSnippet', e.target.value)}
            />
          </div>
        )}

        {/* Live output preview if available */}
        {data.outputPreview && (
          <div className="node-output-preview" style={{ marginTop: '8px' }}>
            <span className="preview-label">مخرجات العقدة:</span>
            <p className="preview-text" style={{ fontSize: '11px' }}>{String(data.outputPreview)}</p>
          </div>
        )}
      </div>

      {meta?.hasOutput !== false && (
        <Handle type="source" position={Position.Bottom} className="custom-handle handle-source" />
      )}
    </div>
  );
};

// Complete Node Types mapping for React Flow
export const nodeTypes: Record<string, React.FC<NodeProps>> = {
  triggerNode: TriggerNode,
  llmAgentNode: LlmAgentNode,
  ttsVoiceNode: TtsVoiceNode,
  revideoTimelineNode: RevideoTimelineNode,
  renderExportNode: RenderExportNode,
  // Universal mapping for all other catalog nodes
  ...ALL_NODES.reduce((acc, def) => {
    if (!acc[def.type]) {
      acc[def.type] = UniversalNode;
    }
    return acc;
  }, {} as Record<string, React.FC<NodeProps>>),
};

export const customNodeTypes = nodeTypes;
