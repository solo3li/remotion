import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from './CustomNodes';
import { ALL_NODES, CATEGORIES, NodeDefinition } from './nodeCatalog';
import { TimelineClip, ProjectSettings } from '../../types';
import {
  Play,
  Save,
  Plus,
  ArrowRight,
  Layers,
  Sparkles,
  Download,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Bot,
  Zap,
  Mic,
  Film,
  FileVideo,
  Search,
  LayoutTemplate,
  Trash2,
  Grab,
  Maximize2,
} from 'lucide-react';

interface WorkflowBuilderProps {
  onLoadTimelineClips: (clips: TimelineClip[], settings?: Partial<ProjectSettings>) => void;
  onSwitchToStudio: () => void;
}

// Pre-built Template 1: End-to-End AI Video Generation
const templateVideoFlow: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'node-trigger',
      type: 'triggerNode',
      position: { x: 380, y: 30 },
      data: {
        label: '1. فكرة الفيديو والمدخلات',
        prompt: '🔥 أقوى عروض الموسم تخفيض 50% على جميع المنتجات لفترة محدودة',
        duration: 5,
        bgColor: '#080a0f',
        status: 'IDLE',
      },
    },
    {
      id: 'node-llm',
      type: 'llmAgentNode',
      position: { x: 380, y: 240 },
      data: {
        label: '2. وكيل السكريبت (Gemini)',
        model: 'gemini-1.5-flash',
        status: 'IDLE',
      },
    },
    {
      id: 'node-tts',
      type: 'ttsVoiceNode',
      position: { x: 140, y: 460 },
      data: {
        label: '3. محرك الصوتيات (Voiceover)',
        voiceStyle: 'حماسي إعلاني',
        status: 'IDLE',
      },
    },
    {
      id: 'node-timeline',
      type: 'revideoTimelineNode',
      position: { x: 620, y: 460 },
      data: {
        label: '4. تنسيق التايم لاين (Revideo)',
        status: 'IDLE',
      },
    },
    {
      id: 'node-render',
      type: 'renderExportNode',
      position: { x: 380, y: 690 },
      data: {
        label: '5. تصدير ورندر MP4 (MinIO S3)',
        status: 'IDLE',
      },
    },
  ],
  edges: [
    { id: 'e-trigger-llm', source: 'node-trigger', target: 'node-llm', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
    { id: 'e-llm-tts', source: 'node-llm', target: 'node-tts', animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 } },
    { id: 'e-llm-timeline', source: 'node-llm', target: 'node-timeline', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 'e-tts-render', source: 'node-tts', target: 'node-render', animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 } },
    { id: 'e-timeline-render', source: 'node-timeline', target: 'node-render', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
  ],
};

// Pre-built Template 2: Web Research & Telegram Summary
const templateResearchFlow: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'res-trigger',
      type: 'triggerNode',
      position: { x: 380, y: 30 },
      data: { label: 'استفسار البحث', prompt: 'آخر أخبار تطورات الذكاء الاصطناعي اليوم', status: 'IDLE' },
    },
    {
      id: 'res-search',
      type: 'webSearchNode',
      position: { x: 380, y: 220 },
      data: { label: 'بحث الويب المباشر', maxResults: 3, status: 'IDLE' },
    },
    {
      id: 'res-llm',
      type: 'universalLlmNode',
      position: { x: 380, y: 430 },
      data: { label: 'تلخيص وتدقيق (Gemini Pro)', model: 'gemini-1.5-pro', status: 'IDLE' },
    },
    {
      id: 'res-alert',
      type: 'notificationAlertNode',
      position: { x: 380, y: 640 },
      data: { label: 'إرسال التقرير لتليجرام', channelType: 'telegram', status: 'IDLE' },
    },
  ],
  edges: [
    { id: 're1', source: 'res-trigger', target: 'res-search', animated: true, style: { stroke: '#06b6d4', strokeWidth: 2 } },
    { id: 're2', source: 'res-search', target: 'res-llm', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
    { id: 're3', source: 'res-llm', target: 'res-alert', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
  ],
};

// Pre-built Template 3: Social Media Auto-Pipeline
const templateSocialFlow: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'soc-cron',
      type: 'scheduleTrigger',
      position: { x: 380, y: 30 },
      data: { label: 'جدولة يومية 9:00 ص', cronExpression: '0 9 * * *', status: 'IDLE' },
    },
    {
      id: 'soc-llm',
      type: 'llmAgentNode',
      position: { x: 380, y: 220 },
      data: { label: 'صياغة بوست وسيناريو', model: 'gemini-1.5-flash', status: 'IDLE' },
    },
    {
      id: 'soc-img',
      type: 'textToImageNode',
      position: { x: 180, y: 440 },
      data: { label: 'توليد كوفر المنشور (Imagen 3)', aspectRatio: '1:1', status: 'IDLE' },
    },
    {
      id: 'soc-subs',
      type: 'autoSubtitlesNode',
      position: { x: 580, y: 440 },
      data: { label: 'ترجمة وهوك إعلاني', stylePreset: 'glow_yellow', status: 'IDLE' },
    },
    {
      id: 'soc-pub',
      type: 'socialPublisherNode',
      position: { x: 380, y: 660 },
      data: { label: 'نشر تلقائي لـ TikTok و YouTube', targetPlatform: 'youtube_shorts', status: 'IDLE' },
    },
  ],
  edges: [
    { id: 'se1', source: 'soc-cron', target: 'soc-llm', animated: true, style: { stroke: '#f59e0b', strokeWidth: 2 } },
    { id: 'se2', source: 'soc-llm', target: 'soc-img', animated: true, style: { stroke: '#ec4899', strokeWidth: 2 } },
    { id: 'se3', source: 'soc-llm', target: 'soc-subs', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 } },
    { id: 'se4', source: 'soc-img', target: 'soc-pub', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
    { id: 'se5', source: 'soc-subs', target: 'soc-pub', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
  ],
};

// Pre-built Template 4: Document RAG QA
const templateRagFlow: { nodes: Node[]; edges: Edge[] } = {
  nodes: [
    {
      id: 'rag-upload',
      type: 'fileUploadNode',
      position: { x: 380, y: 30 },
      data: { label: 'رفع ملفات الـ PDF والعقود', allowedTypes: 'pdf', status: 'IDLE' },
    },
    {
      id: 'rag-parser',
      type: 'docParserNode',
      position: { x: 380, y: 220 },
      data: { label: 'تقطيع وفهرسة المقاطع (Chunks)', chunkSize: 500, status: 'IDLE' },
    },
    {
      id: 'rag-retriever',
      type: 'vectorSearchNode',
      position: { x: 380, y: 430 },
      data: { label: 'البحث الدلالي بقواعد المتجهات', topK: 4, status: 'IDLE' },
    },
    {
      id: 'rag-json',
      type: 'structuredJsonNode',
      position: { x: 380, y: 640 },
      data: { label: 'استخراج النتائج المهيكلة', schemaFormat: 'answers, citations', status: 'IDLE' },
    },
  ],
  edges: [
    { id: 're1', source: 'rag-upload', target: 'rag-parser', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 're2', source: 'rag-parser', target: 'rag-retriever', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
    { id: 're3', source: 'rag-retriever', target: 'rag-json', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
  ],
};

const WorkflowBuilderInner: React.FC<WorkflowBuilderProps> = ({
  onLoadTimelineClips,
  onSwitchToStudio,
}) => {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<Node[]>(templateVideoFlow.nodes);
  const [edges, setEdges] = useState<Edge[]>(templateVideoFlow.edges);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runProgress, setRunProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('جاهز للتشغيل');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    videoUrl?: string;
    clips?: TimelineClip[];
  } | null>(null);

  // Search and Category filtering
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show quick toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
          },
          eds
        )
      ),
    []
  );

  // Initial fit view on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 150);
    return () => clearTimeout(timer);
  }, [fitView]);

  // Load a Pre-built Template
  const handleLoadTemplate = (templateKey: string) => {
    let t = templateVideoFlow;
    if (templateKey === 'research') t = templateResearchFlow;
    if (templateKey === 'social') t = templateSocialFlow;
    if (templateKey === 'rag') t = templateRagFlow;

    setNodes(
      t.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: 'IDLE',
        },
      }))
    );
    setEdges(t.edges);
    setRunProgress(0);
    setStatusMessage('تم تحميل القالب بنجاح');
    setCompletedResult(null);
    showToast('✓ تم تحميل القالب بنجاح');
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
  };

  // Add any catalog node to canvas (supports click or drop)
  const addNodeToCanvas = (nodeDef: NodeDefinition, customPosition?: { x: number; y: number }) => {
    const id = `node-${nodeDef.type}-${Date.now().toString(36)}`;

    let position = customPosition;

    // If no custom drop position provided (i.e. clicked), calculate visible center
    if (!position && canvasRef.current) {
      try {
        const rect = canvasRef.current.getBoundingClientRect();
        const centerPoint = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        if (centerPoint && isFinite(centerPoint.x) && isFinite(centerPoint.y)) {
          position = {
            x: centerPoint.x + (Math.random() * 80 - 40),
            y: centerPoint.y + (Math.random() * 80 - 40),
          };
        }
      } catch (err) {
        console.warn('Error calculating center point:', err);
      }
    }

    // Fallback safe position
    if (!position || !isFinite(position.x) || !isFinite(position.y)) {
      const offset = (nodes.length * 40) % 250;
      position = { x: 380 + offset, y: 220 + offset };
    }

    const newNode: Node = {
      id,
      type: nodeDef.type,
      position,
      data: {
        ...nodeDef.defaultData,
        status: 'IDLE',
      },
    };

    setNodes((nds) => [...nds, newNode]);
    showToast(`✓ تمت إضافة: ${nodeDef.label}`);

    // Center view on nodes smoothly
    setTimeout(() => {
      fitView({ duration: 300, padding: 0.2 });
    }, 60);
  };

  // HTML5 Drag and Drop handlers
  const handleDragStart = (event: React.DragEvent, nodeDef: NodeDefinition) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeDef));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const rawData = event.dataTransfer.getData('application/reactflow');
    if (!rawData) return;

    try {
      const nodeDef: NodeDefinition = JSON.parse(rawData);
      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeToCanvas(nodeDef, dropPosition);
    } catch (e) {
      console.warn('Failed to parse dropped node data:', e);
    }
  };

  // Filter catalog nodes by category and search
  const filteredCatalog = ALL_NODES.filter((n) => {
    const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Save current workflow graph to Django Backend
  const handleSaveWorkflow = async () => {
    try {
      setStatusMessage('جاري حفظ المخطط في قاعدة البيانات...');
      const graphData = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: {
            ...n.data,
            onChange: undefined,
          },
        })),
        edges,
      };

      const res = await fetch('/api/workflows/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'مخطط الأتمتة الشامل بالذكاء الاصطناعي',
          description: 'خط إنتاج متكامل يربط بين وكلاء الذكاء والميديا والتايم لاين',
          graph_data: graphData,
        }),
      });

      const data = await res.json();
      if (data.id) {
        setWorkflowId(data.id);
        setStatusMessage(`تم حفظ المخطط بنجاح (ID: ${data.id.slice(0, 8)}...)`);
        showToast('✓ تم حفظ المخطط في قاعدة البيانات');
      }
    } catch (err: any) {
      console.error('Failed to save workflow:', err);
      setStatusMessage('فشل في حفظ المخطط: ' + err.message);
    }
  };

  // Run the Workflow through Backend LangGraph
  const handleRunWorkflow = async () => {
    try {
      setIsRunning(true);
      setRunProgress(5);
      setStatusMessage('جاري بدء تشغيل محرك LangGraph في الباك إند...');
      setCompletedResult(null);

      // Reset nodes visual state to IDLE
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, status: 'IDLE' },
        }))
      );

      // Save/Get workflow ID first
      let currentWfId = workflowId;
      const graphData = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: { ...n.data, onChange: undefined },
        })),
        edges,
      };

      const saveRes = await fetch('/api/workflows/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'تشغيل فوري للمخطط',
          graph_data: graphData,
        }),
      });
      const saveData = await saveRes.json();
      currentWfId = saveData.id;
      setWorkflowId(saveData.id);

      // Extract trigger inputs
      const triggerNode = nodes.find((n) => n.type === 'triggerNode' || n.type === 'scheduleTrigger');
      const inputs = {
        prompt: triggerNode?.data?.prompt || 'فيديو إعلاني ذكي متكامل',
        duration: triggerNode?.data?.duration || 5,
      };

      // Trigger Execution
      const runRes = await fetch(`/api/workflows/${currentWfId}/run/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      const runData = await runRes.json();
      const runId = runData.run_id;

      if (!runId) throw new Error('لم يتم استلام رقم تشغيل صالح من الخادم');

      // Subscribe to Real-time SSE Stream
      const eventSource = new EventSource(`/events/workflow/${runId}/`);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { node_id, status, percent, message, video_url, timeline_clips, final_state } = payload;

          if (percent !== undefined) setRunProgress(percent);
          if (message) setStatusMessage(message);

          // Update active node status in React Flow
          if (node_id && node_id !== 'GLOBAL_END' && node_id !== 'GLOBAL_ERROR') {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === node_id) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      status: status || 'RUNNING',
                      outputPreview: payload.scenes?.[0]?.title || payload.video_url || undefined,
                    },
                  };
                }
                return n;
              })
            );
          }

          // Handle Final Video or Timeline Completion
          const resolvedVideoUrl = video_url || final_state?.video_url;
          const resolvedClips = timeline_clips || final_state?.timeline_clips;

          if (resolvedVideoUrl || resolvedClips) {
            setCompletedResult({
              videoUrl: resolvedVideoUrl,
              clips: resolvedClips,
            });
          }

          if (status === 'COMPLETED' && (node_id === 'GLOBAL_END' || percent >= 100)) {
            setIsRunning(false);
            setRunProgress(100);
            setStatusMessage('اكتمل تنفيذ المخطط بالكامل بنجاح! 🎉');
            showToast('🎉 اكتمل تنفيذ المخطط بنجاح!');
            eventSource.close();
          } else if (status === 'FAILED') {
            setIsRunning(false);
            setStatusMessage('فشل تنفيذ المخطط: ' + message);
            eventSource.close();
          }
        } catch (e) {
          console.warn('Error parsing SSE message:', e);
        }
      };

      eventSource.onerror = () => {
        setIsRunning(false);
        eventSource.close();
      };
    } catch (err: any) {
      setIsRunning(false);
      console.error('Run workflow failed:', err);
      setStatusMessage('خطأ في إطلاق المخطط: ' + err.message);
    }
  };

  // Transfer generated clips directly to NLE Timeline
  const handleSendToTimeline = () => {
    if (completedResult?.clips && completedResult.clips.length > 0) {
      const triggerNode = nodes.find((n) => n.type === 'triggerNode');
      const duration = Number(triggerNode?.data?.duration || 5);
      const bgColor = String(triggerNode?.data?.bgColor || '#080a0f');

      onLoadTimelineClips(completedResult.clips, { duration, bgColor });
      onSwitchToStudio();
    } else {
      onSwitchToStudio();
    }
  };

  // Clear canvas
  const handleClearCanvas = () => {
    if (window.confirm('هل تريد مسح مساحة العمل والبدء من جديد؟')) {
      setNodes([]);
      setEdges([]);
      setCompletedResult(null);
      showToast('تم مسح مساحة العمل');
    }
  };

  return (
    <div className="workflow-studio-root" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            padding: '8px 18px',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 9999,
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Sparkles size={15} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Action Header */}
      <div className="workflow-top-bar">
        <div className="wf-title-section">
          <div className="wf-badge-live">
            <Sparkles size={14} className="sparkle-icon" />
            <span>محرك المخططات الشامل (Universal Flow OS)</span>
          </div>
          <h2 className="wf-title">منظومة الوكلاء والميديا والأتمتة السحابية</h2>
        </div>

        {/* Templates Selector */}
        <div className="wf-templates-dropdown">
          <LayoutTemplate size={14} />
          <span>القوالب:</span>
          <select
            className="node-select-compact"
            onChange={(e) => handleLoadTemplate(e.target.value)}
            defaultValue="video"
          >
            <option value="video">🎬 فيديو إعلاني ذكي متكامل</option>
            <option value="research">🔍 باحث الأخبار والأتمتة</option>
            <option value="social">📲 خط إنتاج محتوى السوشيال ميديا</option>
            <option value="rag">📚 نظام الإجابة من المستندات (RAG)</option>
          </select>
        </div>

        {/* Execution progress banner */}
        <div className="wf-progress-container">
          <div className="progress-bar-bg">
            <div
              className={`progress-bar-fill ${isRunning ? 'pulse' : ''}`}
              style={{ width: `${runProgress}%` }}
            ></div>
          </div>
          <span className="progress-status-text">
            {runProgress}% - {statusMessage}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="wf-actions-group">
          <button
            className="btn-wf-save"
            onClick={() => fitView({ padding: 0.2, duration: 400 })}
            title="إعادة ضبط الرؤية لمنتصف الشاشة"
            style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}
          >
            <Maximize2 size={13} />
            <span>توسيط</span>
          </button>

          <button
            className="btn-wf-save"
            onClick={handleClearCanvas}
            title="مسح الكانفاس والبدء من جديد"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            <Trash2 size={13} />
            <span>مسح</span>
          </button>

          <button
            className="btn-wf-save"
            onClick={handleSaveWorkflow}
            disabled={isRunning}
            title="حفظ هيكل المخطط في قاعدة البيانات"
          >
            <Save size={14} />
            <span>حفظ</span>
          </button>

          <button
            className={`btn-wf-run ${isRunning ? 'running' : ''}`}
            onClick={handleRunWorkflow}
            disabled={isRunning}
          >
            <Play size={14} />
            <span>{isRunning ? 'جاري التنفيذ...' : 'تشغيل المخطط ⚡'}</span>
          </button>

          <button
            className="btn-wf-studio-bridge"
            onClick={handleSendToTimeline}
            title="نقل نتائج المخطط إلى تايم لاين محرر الاستوديو"
          >
            <Film size={14} />
            <span>فتح في الاستوديو 🎬</span>
          </button>
        </div>
      </div>

      {/* Main Canvas + Expanded Node Catalog Sidebar */}
      <div className="workflow-workspace">
        {/* Left Node Palette Sidebar */}
        <aside className="wf-node-palette" style={{ width: '340px' }} dir="rtl">
          <div className="palette-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={15} />
              <span>مكتبة العقد ({ALL_NODES.length}+ عقدة)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#94a3b8' }}>
              <Grab size={12} />
              <span>اسحب أو انقر للإضافة</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="palette-search-box" style={{ padding: '8px 12px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', right: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                className="node-input"
                style={{ paddingRight: '28px', fontSize: '11px', height: '30px' }}
                placeholder="ابحث عن أي عقدة (ذكاء، بحث، ميديا...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="category-filter-pills" style={{ padding: '0 10px 8px 10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <button
              className={`pill-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '12px',
                background: selectedCategory === 'all' ? '#38bdf8' : '#1e293b',
                color: selectedCategory === 'all' ? '#000' : '#cbd5e1',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              الكل ({ALL_NODES.length})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`pill-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  fontSize: '10px',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: selectedCategory === cat.id ? cat.color : '#1e293b',
                  color: selectedCategory === cat.id ? '#000' : '#cbd5e1',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {cat.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Filtered Nodes List with Draggable and Clickable behavior */}
          <div className="palette-items-list" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {filteredCatalog.map((nodeDef) => (
              <div
                key={nodeDef.type}
                className="palette-item"
                draggable
                onDragStart={(e) => handleDragStart(e, nodeDef)}
                onClick={() => addNodeToCanvas(nodeDef)}
                title="انقر للإضافة مباشرة، أو اسحب وضعها في المكان الذي تريده"
                style={{
                  borderRight: `3px solid ${nodeDef.categoryColor}`,
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <div
                  className="palette-icon"
                  style={{ background: `${nodeDef.categoryColor}22`, color: nodeDef.categoryColor }}
                >
                  <Plus size={14} />
                </div>
                <div className="palette-info">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                    <strong style={{ fontSize: '11px' }}>{nodeDef.label}</strong>
                    <span
                      style={{
                        fontSize: '8px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: `${nodeDef.categoryColor}25`,
                        color: nodeDef.categoryColor,
                        fontWeight: 700,
                      }}
                    >
                      {nodeDef.categoryLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.2 }}>
                    {nodeDef.description}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Result Card if Finished */}
          {completedResult?.videoUrl && (
            <div className="wf-completed-card" style={{ marginTop: '12px' }}>
              <div className="card-top">
                <CheckCircle2 size={16} color="#10b981" />
                <span>اكتمل إنتاج الفيديو بنجاح!</span>
              </div>
              <a
                href={completedResult.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-download-result"
              >
                <span>مشاهدة وتحميل MP4</span>
                <ExternalLink size={13} />
              </a>
              <button className="btn-send-timeline" onClick={handleSendToTimeline}>
                تعديل في التايم لاين 🎬
              </button>
            </div>
          )}
        </aside>

        {/* Center: React Flow Canvas in LTR coordinate space for flawless dragging and positioning */}
        <div
          ref={canvasRef}
          className="wf-canvas-container"
          dir="ltr"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ width: '100%', height: '100%', position: 'relative' }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            style={{ width: '100%', height: '100%' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color="rgba(255, 255, 255, 0.08)"
            />
            <Controls className="custom-flow-controls" />
            <MiniMap
              className="custom-flow-minimap"
              nodeColor={() => '#10b981'}
              maskColor="rgba(8, 10, 15, 0.75)"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
};
