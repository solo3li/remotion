import React, { useState, useCallback, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { customNodeTypes } from './CustomNodes';
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
} from 'lucide-react';

interface WorkflowBuilderProps {
  onLoadTimelineClips: (clips: TimelineClip[], settings?: Partial<ProjectSettings>) => void;
  onSwitchToStudio: () => void;
}

// Initial default pipeline template (End-to-End AI Video Generation)
const initialNodes: Node[] = [
  {
    id: 'node-trigger',
    type: 'triggerNode',
    position: { x: 380, y: 30 },
    data: {
      label: '1. فكرة الفيديو والمدخلات',
      prompt: '🔥 أقوى عروض الموسم تخفيض 50% على جميع المنتجات لفترة محدودة',
      duration: 6,
      bgColor: '#080a0f',
      status: 'IDLE',
    },
  },
  {
    id: 'node-llm',
    type: 'llmAgentNode',
    position: { x: 380, y: 250 },
    data: {
      label: '2. وكيل الذكاء الاصطناعي (LangGraph)',
      model: 'gemini-1.5-flash',
      status: 'IDLE',
    },
  },
  {
    id: 'node-tts',
    type: 'ttsVoiceNode',
    position: { x: 140, y: 470 },
    data: {
      label: '3. محرك الصوتيات (Voiceover)',
      voiceStyle: 'حماسي إعلاني',
      status: 'IDLE',
    },
  },
  {
    id: 'node-timeline',
    type: 'revideoTimelineNode',
    position: { x: 620, y: 470 },
    data: {
      label: '4. تنسيق التايم لاين (Revideo)',
      status: 'IDLE',
    },
  },
  {
    id: 'node-render',
    type: 'renderExportNode',
    position: { x: 380, y: 700 },
    data: {
      label: '5. تصدير ورندر MP4 (MinIO S3)',
      status: 'IDLE',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e-trigger-llm',
    source: 'node-trigger',
    target: 'node-llm',
    animated: true,
    style: { stroke: '#06b6d4', strokeWidth: 2 },
  },
  {
    id: 'e-llm-tts',
    source: 'node-llm',
    target: 'node-tts',
    animated: true,
    style: { stroke: '#38bdf8', strokeWidth: 2 },
  },
  {
    id: 'e-llm-timeline',
    source: 'node-llm',
    target: 'node-timeline',
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
  {
    id: 'e-tts-render',
    source: 'node-tts',
    target: 'node-render',
    animated: true,
    style: { stroke: '#38bdf8', strokeWidth: 2 },
  },
  {
    id: 'e-timeline-render',
    source: 'node-timeline',
    target: 'node-render',
    animated: true,
    style: { stroke: '#10b981', strokeWidth: 2 },
  },
];

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  onLoadTimelineClips,
  onSwitchToStudio,
}) => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runProgress, setRunProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('جاهز للتشغيل');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    videoUrl?: string;
    clips?: TimelineClip[];
  } | null>(null);

  // Update node data helper
  const updateNodeData = useCallback((nodeId: string, key: string, value: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              [key]: value,
            },
          };
        }
        return node;
      })
    );
  }, []);

  // Wire onChange to node data so inputs within nodes reflect in state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onChange: (key: string, val: any) => updateNodeData(node.id, key, val),
        },
      }))
    );
  }, [updateNodeData]);

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

  // Save workflow definition to Django Backend
  const handleSaveWorkflow = async () => {
    try {
      const res = await fetch('/api/workflows/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workflowId || undefined,
          title: 'مخطط إنتاج الفيديو الآلي (LangGraph Pipeline)',
          description: 'مخطط مرئي يربط الذكاء الاصطناعي مع Revideo و FFmpeg',
          graph_data: { nodes, edges },
        }),
      });
      const data = await res.json();
      if (data.workflow) {
        setWorkflowId(data.workflow.id);
        alert('✓ تم حفظ المخطط بنجاح في قاعدة البيانات!');
      }
    } catch (err) {
      console.error('Error saving workflow:', err);
      alert('حدث خطأ أثناء حفظ المخطط');
    }
  };

  // Run Workflow via LangGraph in Django Backend + Listen to SSE Stream
  const handleRunWorkflow = async () => {
    setIsRunning(true);
    setRunProgress(5);
    setStatusMessage('جاري تشغيل المخطط عبر محرك LangGraph في الباكنج...');
    setCompletedResult(null);

    // Reset nodes status to IDLE
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, status: 'IDLE' },
      }))
    );

    try {
      // 1. Ensure workflow is saved/created first
      const saveRes = await fetch('/api/workflows/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workflowId || undefined,
          title: 'مخطط تشغيل فيديو مباشر',
          graph_data: { nodes, edges },
        }),
      });
      const saveData = await saveRes.json();
      const currentWfId = saveData.workflow.id;
      setWorkflowId(currentWfId);

      // 2. Launch Workflow Run
      const triggerNode = nodes.find((n) => n.type === 'triggerNode');
      const runRes = await fetch(`/api/workflows/${currentWfId}/run/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            prompt: triggerNode?.data.prompt || 'فيديو إعلاني',
            duration: triggerNode?.data.duration || 6,
          },
        }),
      });
      const runData = await runRes.json();
      const runId = runData.run_id;

      // 3. Listen to Realtime SSE Events from Backend
      const eventSource = new EventSource(`/events/workflow/${runId}/`);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { node_id, status, percent, message, final_state } = payload;

          if (percent !== undefined) setRunProgress(percent);
          if (message) setStatusMessage(message);

          // Update active node status on canvas
          if (node_id && node_id !== 'GLOBAL_END' && node_id !== 'GLOBAL_ERROR') {
            setNodes((nds) =>
              nds.map((node) => {
                if (node.id === node_id) {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      status: status || 'RUNNING',
                    },
                  };
                }
                return node;
              })
            );
          }

          // On Completion
          if (status === 'COMPLETED' && (percent >= 100 || payload.status === 'COMPLETED')) {
            if (payload.video_url) {
              setCompletedResult((prev) => ({ ...prev, videoUrl: payload.video_url }));
            }
            if (final_state) {
              setCompletedResult({
                videoUrl: final_state.video_url,
                clips: final_state.timeline_clips,
              });
            }
          }

          if (payload.status === 'COMPLETED' && node_id === 'GLOBAL_END') {
            eventSource.close();
            setIsRunning(false);
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsRunning(false);
      };
    } catch (err: any) {
      console.error('Workflow run error:', err);
      setIsRunning(false);
      setStatusMessage(`فشل التشغيل: ${err.message}`);
    }
  };

  // Add a new node to canvas from palette
  const addNodeToCanvas = (type: string, label: string) => {
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 300 + Math.random() * 80, y: 200 + Math.random() * 80 },
      data: {
        label,
        status: 'IDLE',
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  // Transfer generated clips to NLE timeline & switch view
  const handleSendToTimeline = () => {
    if (completedResult?.clips) {
      onLoadTimelineClips(completedResult.clips);
    }
    onSwitchToStudio();
  };

  return (
    <div className="workflow-studio-root">
      {/* Top Workflow Studio Bar */}
      <div className="workflow-top-bar">
        <div className="wf-bar-left">
          <div className="studio-brand">
            <span className="brand-badge wf-badge">LANGGRAPH</span>
            <span className="brand-name">AI Workflow Builder</span>
          </div>

          <div className="run-status-indicator">
            <span className={`status-dot ${isRunning ? 'pulse' : ''}`} />
            <span className="status-text">{statusMessage}</span>
            {isRunning && <span className="progress-num">{runProgress}%</span>}
          </div>
        </div>

        <div className="wf-bar-right">
          <button
            className="btn btn-outline"
            onClick={handleSaveWorkflow}
            title="حفظ المخطط في الباكنج"
          >
            <Save size={14} />
            <span>حفظ المخطط</span>
          </button>

          <button
            className="btn btn-run-workflow"
            onClick={handleRunWorkflow}
            disabled={isRunning}
            title="تنفيذ المخطط بالكامل عبر محرك LangGraph"
          >
            <Play size={14} fill={isRunning ? 'none' : '#041410'} />
            <span>{isRunning ? `جاري التنفيذ (${runProgress}%)...` : 'تشغيل المخطط (LangGraph)'}</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleSendToTimeline}
            title="نقل نتائج المخطط إلى محرر التايم لاين"
          >
            <Film size={14} />
            <span>فتح في محرر الاستوديو 🎬</span>
          </button>
        </div>
      </div>

      {/* Main Canvas + Sidebar Area */}
      <div className="workflow-workspace">
        {/* Left Node Palette Sidebar */}
        <aside className="wf-node-palette">
          <div className="palette-header">
            <Layers size={15} />
            <span>إضافة عقد (Add Nodes)</span>
          </div>

          <div className="palette-items-list">
            <div
              className="palette-item"
              onClick={() => addNodeToCanvas('triggerNode', 'مدخلات وموضوع جديد')}
            >
              <div className="palette-icon trigger-icon">
                <Zap size={14} />
              </div>
              <div className="palette-info">
                <strong>مدخلات (Trigger)</strong>
                <span>نص وموضوع الفيديو</span>
              </div>
              <Plus size={14} className="plus-icon" />
            </div>

            <div
              className="palette-item"
              onClick={() => addNodeToCanvas('llmAgentNode', 'وكيل ذكي مخصص')}
            >
              <div className="palette-icon llm-icon">
                <Bot size={14} />
              </div>
              <div className="palette-info">
                <strong>وكيل ذكاء (LLM Agent)</strong>
                <span>تأليف وتقسيم المشاهد</span>
              </div>
              <Plus size={14} className="plus-icon" />
            </div>

            <div
              className="palette-item"
              onClick={() => addNodeToCanvas('ttsVoiceNode', 'صوتيات وتعليق')}
            >
              <div className="palette-icon tts-icon">
                <Mic size={14} />
              </div>
              <div className="palette-info">
                <strong>صوتيات (TTS Voice)</strong>
                <span>توليد النبرة والموسيقى</span>
              </div>
              <Plus size={14} className="plus-icon" />
            </div>

            <div
              className="palette-item"
              onClick={() => addNodeToCanvas('revideoTimelineNode', 'منسق التايم لاين')}
            >
              <div className="palette-icon timeline-icon">
                <Film size={14} />
              </div>
              <div className="palette-info">
                <strong>تايم لاين (Revideo)</strong>
                <span>تشكيل النصوص والأبعاد</span>
              </div>
              <Plus size={14} className="plus-icon" />
            </div>

            <div
              className="palette-item"
              onClick={() => addNodeToCanvas('renderExportNode', 'تصدير ورندر')}
            >
              <div className="palette-icon render-icon">
                <FileVideo size={14} />
              </div>
              <div className="palette-info">
                <strong>تصدير (Render MP4)</strong>
                <span>معالجة FFmpeg و MinIO</span>
              </div>
              <Plus size={14} className="plus-icon" />
            </div>
          </div>

          {/* Result Card if Finished */}
          {completedResult?.videoUrl && (
            <div className="wf-completed-card">
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

        {/* Center: React Flow Canvas */}
        <div className="wf-canvas-container">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={customNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
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
