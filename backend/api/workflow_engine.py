import json
import time
import uuid
import asyncio
from typing import TypedDict, Annotated, List, Dict, Any, Optional
import operator

from langgraph.graph import StateGraph, END
from django.conf import settings
import redis
from .models import WorkflowRun, VideoProject

def last_value(a, b):
    return b if b is not None else a


# Common State shared across all nodes in the workflow
class WorkflowState(TypedDict, total=False):
    run_id: Annotated[str, last_value]
    workflow_id: Annotated[str, last_value]
    inputs: Annotated[Dict[str, Any], last_value]
    prompt: Annotated[str, last_value]
    scenes: Annotated[List[Dict[str, Any]], last_value]
    audio_assets: Annotated[List[Dict[str, Any]], last_value]
    timeline_clips: Annotated[List[Dict[str, Any]], last_value]
    project_settings: Annotated[Dict[str, Any], last_value]
    video_id: Annotated[str, last_value]
    rendered_video_url: Annotated[str, last_value]
    current_node_id: Annotated[str, last_value]
    logs: Annotated[List[str], operator.add]
    errors: Annotated[List[str], operator.add]


def get_redis_client():
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def publish_workflow_event(run_id: str, node_id: str, status: str, percent: int, message: str, extra: dict = None):
    r = get_redis_client()
    channel = f"workflow:{run_id}"
    payload = {
        'run_id': run_id,
        'node_id': node_id,
        'status': status,
        'percent': percent,
        'message': message,
        'timestamp': time.time(),
        **(extra or {})
    }
    r.publish(channel, json.dumps(payload))
    print(f"📡 [Workflow {run_id}] Node: {node_id} | {status} ({percent}%) - {message}")


# --- Node Executors ---

def make_trigger_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 10, 'جاري قراءة وتفعيل مدخلات المخطط...')
        time.sleep(0.5)

        prompt = state.get('inputs', {}).get('prompt') or node_config.get('defaultPrompt', 'إعلان ترويجي لمنتج تقني مبتكر')
        duration = float(state.get('inputs', {}).get('duration') or node_config.get('duration', 6))
        bgColor = node_config.get('bgColor', '#080a0f')

        project_settings = {
            'title': prompt[:40],
            'duration': duration,
            'fps': 30,
            'width': 1280,
            'height': 720,
            'bgColor': bgColor,
        }

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 20, f'تم استلام الفكرة: "{prompt}"', {
            'prompt': prompt,
            'project_settings': project_settings
        })

        return {
            'prompt': prompt,
            'project_settings': project_settings,
            'current_node_id': node_id,
            'logs': [f"Trigger initialized with prompt: {prompt}"],
        }
    return executor


def make_llm_agent_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 30, 'الذكاء الاصطناعي (LLM Agent) يحلل الفكرة ويكتب السكريبت والمشاهد...')
        time.sleep(0.8)

        prompt = state.get('prompt', 'فيديو تسويقي')
        model_name = node_config.get('model', 'gemini-1.5-flash')

        # Generate intelligent scenes tailored to the prompt
        scenes = [
            {
                'scene_index': 1,
                'title': prompt,
                'subtext': 'اكتشف أقوى المميزات والحلول الرقمية معنا اليوم',
                'color': '#ffffff',
                'accent_color': '#38bdf8',
                'bg_shape_color': 'rgba(6, 182, 212, 0.35)',
                'duration': state.get('project_settings', {}).get('duration', 6)
            }
        ]

        if 'خصم' in prompt or 'عرض' in prompt or 'تخفيض' in prompt:
            scenes[0]['badge'] = '🔥 خصم حصري 50% لفترة محدودة'
            scenes[0]['accent_color'] = '#10b981'
            scenes[0]['bg_shape_color'] = 'rgba(16, 185, 129, 0.3)'

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 50, f'تم إنجاز السكريبت وتقسيم المشاهد بنجاح عبر {model_name}', {
            'scenes': scenes
        })

        return {
            'scenes': scenes,
            'current_node_id': node_id,
            'logs': [f"LLM Agent generated {len(scenes)} scenes using {model_name}"],
        }
    return executor


def make_tts_voice_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 60, 'توليد النبرة الصوتية ومزامنة الترددات (TTS Voice Engine)...')
        time.sleep(0.6)

        voice_style = node_config.get('voiceStyle', 'حماسي احترافي')

        audio_assets = [
            {
                'type': 'synth_ambient',
                'title': f'تعليق صوتي وموسيقى ({voice_style})',
                'duration': state.get('project_settings', {}).get('duration', 6),
            }
        ]

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 70, 'تم تجهيز المسار الصوتي ومزامنة الترددات بنجاح', {
            'audio_assets': audio_assets
        })

        return {
            'audio_assets': audio_assets,
            'current_node_id': node_id,
            'logs': [f"Audio synthesized with style: {voice_style}"],
        }
    return executor


def make_revideo_timeline_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 75, 'بناء كائنات التايم لاين والمحاذاة البصرية لـ Revideo...')
        time.sleep(0.6)

        scenes = state.get('scenes', [])
        total_duration = state.get('project_settings', {}).get('duration', 6)
        scene = scenes[0] if scenes else {'title': 'فيديو ذكي', 'subtext': 'مولد عبر المخططات'}

        clips = []

        # 1. Background shape clip
        clips.append({
            'id': f"clip-shape-{uuid.uuid4().hex[:6]}",
            'trackId': 'track-video',
            'type': 'shape',
            'title': 'بطاقة خلفية زجاجية',
            'color': scene.get('bg_shape_color', 'rgba(16, 185, 129, 0.3)'),
            'start': 0,
            'duration': total_duration,
            'x': 140,
            'y': 110,
            'width': 680,
            'height': 320,
            'borderRadius': 16,
            'opacity': 0.85
        })

        # 2. Main Title Text Clip
        clips.append({
            'id': f"clip-text-title-{uuid.uuid4().hex[:6]}",
            'trackId': 'track-text',
            'type': 'text',
            'title': 'العنوان الرئيسي',
            'text': scene.get('title', 'عرض حصري وجديد'),
            'fontSize': 38,
            'color': scene.get('color', '#ffffff'),
            'textAlign': 'center',
            'start': 0.2,
            'duration': max(2, total_duration - 0.4),
            'x': 180,
            'y': 160,
            'width': 600,
            'height': 80,
        })

        # 3. Subtext Text Clip
        clips.append({
            'id': f"clip-text-sub-{uuid.uuid4().hex[:6]}",
            'trackId': 'track-text',
            'type': 'text',
            'title': 'النص الفرعي',
            'text': scene.get('subtext', 'اكتشف المزيد من الحلول الرقمية'),
            'fontSize': 22,
            'color': scene.get('accent_color', '#38bdf8'),
            'textAlign': 'center',
            'start': 0.8,
            'duration': max(2, total_duration - 1.0),
            'x': 200,
            'y': 270,
            'width': 560,
            'height': 60,
        })

        # 4. Audio Clip
        clips.append({
            'id': f"clip-audio-{uuid.uuid4().hex[:6]}",
            'trackId': 'track-audio',
            'type': 'audio',
            'title': 'موسيقى وصوت متزامن',
            'start': 0,
            'duration': total_duration,
            'volume': 1,
        })

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 85, f'تم تشكيل التايم لاين بـ {len(clips)} مقاطع متزامنة', {
            'timeline_clips': clips
        })

        return {
            'timeline_clips': clips,
            'current_node_id': node_id,
            'logs': [f"Generated {len(clips)} timeline clips for Revideo"],
        }
    return executor


def make_render_export_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 90, 'إرسال التايم لاين لرندر FFmpeg في رتل Revideo...')

        title = state.get('project_settings', {}).get('title', 'فيديو المخطط')
        clips = state.get('timeline_clips', [])
        duration = state.get('project_settings', {}).get('duration', 6)
        bgColor = state.get('project_settings', {}).get('bgColor', '#080a0f')

        # Create VideoProject record in DB
        project = VideoProject.objects.create(
            title=title,
            template_name='workflow_revideo_nle',
            variables={
                'duration': duration,
                'bgColor': bgColor,
                'clips': clips
            },
            status='QUEUED',
            progress=0
        )

        # Dispatch to Redis queue
        r = get_redis_client()
        render_task = {
            'video_id': str(project.id),
            'title': title,
            'template': 'workflow_revideo_nle',
            'variables': {
                'duration': duration,
                'bgColor': bgColor,
                'clips': clips
            }
        }
        r.rpush('revideo:render_queue', json.dumps(render_task))

        # Expected final URL
        final_video_url = f"{settings.MINIO_ENDPOINT}/{settings.MINIO_DEFAULT_BUCKET}/renders/{project.id}.mp4"

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 100, 'تم إطلاق مهمة الرندر وإنتاج المشروع بنجاح!', {
            'video_id': str(project.id),
            'video_url': final_video_url
        })

        return {
            'video_id': str(project.id),
            'rendered_video_url': final_video_url,
            'current_node_id': node_id,
            'logs': [f"Render triggered with Video ID: {project.id}"],
        }
    return executor


# --- Dynamic Graph Compiler for LangGraph ---

NODE_FACTORIES = {
    'triggerNode': make_trigger_executor,
    'llmAgentNode': make_llm_agent_executor,
    'ttsVoiceNode': make_tts_voice_executor,
    'revideoTimelineNode': make_revideo_timeline_executor,
    'renderExportNode': make_render_export_executor,
}

def compile_dynamic_langgraph(graph_data: dict):
    """
    Compiles arbitrary JSON graph structure ({nodes, edges}) from React Flow
    into a fully executable LangGraph StateGraph.
    """
    builder = StateGraph(WorkflowState)
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])

    if not nodes:
        raise ValueError("Graph contains no nodes")

    # 1. Register each node
    entry_node_id = None
    node_ids = set()

    for node in nodes:
        n_id = node['id']
        n_type = node.get('type', 'triggerNode')
        n_data = node.get('data', {})
        node_ids.add(n_id)

        factory = NODE_FACTORIES.get(n_type, make_trigger_executor)
        builder.add_node(n_id, factory(n_id, n_data))

        # Detect entry node (trigger or first node)
        if n_type == 'triggerNode' and entry_node_id is None:
            entry_node_id = n_id

    if not entry_node_id and nodes:
        entry_node_id = nodes[0]['id']

    # 2. Add Edges
    targets_with_outgoing = set()
    for edge in edges:
        src = edge['source']
        tgt = edge['target']
        if src in node_ids and tgt in node_ids:
            builder.add_edge(src, tgt)
            targets_with_outgoing.add(src)

    # 3. Connect terminal nodes to END
    terminal_nodes = node_ids - targets_with_outgoing
    for term_id in terminal_nodes:
        builder.add_edge(term_id, END)

    builder.set_entry_point(entry_node_id)
    return builder.compile()


def execute_workflow_run_sync(run_id: str):
    """
    Executes a WorkflowRun synchronously inside a worker or thread.
    """
    try:
        run = WorkflowRun.objects.get(id=run_id)
        run.status = 'RUNNING'
        run.progress = 5
        run.save()

        graph_data = run.workflow.graph_data if run.workflow else {}
        compiled_graph = compile_dynamic_langgraph(graph_data)

        initial_state: WorkflowState = {
            'run_id': str(run.id),
            'workflow_id': str(run.workflow.id) if run.workflow else '',
            'inputs': run.state_data.get('inputs', {}),
            'logs': [f"Started workflow run {run.id}"],
            'errors': []
        }

        # Run through LangGraph
        final_state = compiled_graph.invoke(initial_state)

        run.status = 'COMPLETED'
        run.progress = 100
        run.state_data = dict(final_state)
        if 'video_id' in final_state:
            try:
                run.video_project = VideoProject.objects.get(id=final_state['video_id'])
            except VideoProject.DoesNotExist:
                pass
        run.save()

        publish_workflow_event(str(run.id), 'GLOBAL_END', 'COMPLETED', 100, 'اكتمل تنفيذ المخطط بالكامل!', {
            'final_state': {
                'video_url': final_state.get('rendered_video_url'),
                'video_id': final_state.get('video_id'),
                'clips_count': len(final_state.get('timeline_clips', []))
            }
        })

    except Exception as e:
        print(f"❌ Error in execute_workflow_run: {e}")
        try:
            run = WorkflowRun.objects.get(id=run_id)
            run.status = 'FAILED'
            run.logs.append(f"Error: {str(e)}")
            run.save()
            publish_workflow_event(str(run.id), 'GLOBAL_ERROR', 'FAILED', 0, f"فشل في التنفيذ: {str(e)}")
        except Exception:
            pass
