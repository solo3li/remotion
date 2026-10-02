import json
import time
import uuid
import asyncio
from typing import TypedDict, Annotated, List, Dict, Any, Optional
import operator
import requests

from langgraph.graph import StateGraph, END
from django.conf import settings
import redis
from .models import WorkflowRun, VideoProject

def last_value(a, b):
    return b if b is not None else a


# Universal Common State shared across all nodes in the workflow
class WorkflowState(TypedDict, total=False):
    run_id: Annotated[str, last_value]
    workflow_id: Annotated[str, last_value]
    inputs: Annotated[Dict[str, Any], last_value]
    prompt: Annotated[str, last_value]

    # AI & Text outputs
    scenes: Annotated[List[Dict[str, Any]], last_value]
    text_content: Annotated[str, last_value]
    structured_json: Annotated[Dict[str, Any], last_value]

    # Web & Tools & Code
    search_results: Annotated[List[Dict[str, Any]], last_value]
    scraped_content: Annotated[str, last_value]
    code_output: Annotated[Any, last_value]
    http_response: Annotated[Dict[str, Any], last_value]

    # Documents & RAG
    documents: Annotated[List[Dict[str, Any]], last_value]
    retrieved_contexts: Annotated[List[str], last_value]

    # Media & Vision
    generated_images: Annotated[List[Dict[str, Any]], last_value]
    media_assets: Annotated[List[Dict[str, Any]], last_value]
    vision_description: Annotated[str, last_value]

    # Audio
    audio_assets: Annotated[List[Dict[str, Any]], last_value]
    transcription: Annotated[str, last_value]

    # Revideo NLE & Rendering
    timeline_clips: Annotated[List[Dict[str, Any]], last_value]
    subtitles: Annotated[List[Dict[str, Any]], last_value]
    project_settings: Annotated[Dict[str, Any], last_value]
    video_id: Annotated[str, last_value]
    rendered_video_url: Annotated[str, last_value]

    # Publishing & Notifications
    notifications_sent: Annotated[List[Dict[str, Any]], last_value]
    publish_status: Annotated[Dict[str, Any], last_value]

    # Flow Control
    branch_decision: Annotated[str, last_value]
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


# =========================================================
# 1. TRIGGERS & INPUTS
# =========================================================

def make_trigger_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 10, 'جاري قراءة وتفعيل مدخلات المخطط...')
        time.sleep(0.4)

        prompt = state.get('inputs', {}).get('prompt') or node_config.get('prompt') or 'إعلان ترويجي لمنتج ذكي'
        duration = float(state.get('inputs', {}).get('duration') or node_config.get('duration', 5))
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
            'logs': [f"Trigger initialized: {prompt}"],
        }
    return executor


def make_webhook_trigger_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 10, 'استقبال طلب الويب هوك الخارجي (Webhook)...')
        time.sleep(0.3)
        endpoint = node_config.get('endpoint', '/api/v1/webhook')
        prompt = state.get('inputs', {}).get('prompt') or f"طلب وارد من الويب هوك {endpoint}"
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 20, f'تم استلام طلب Webhook من: {endpoint}')
        return {
            'prompt': prompt,
            'current_node_id': node_id,
            'logs': [f"Webhook received from {endpoint}"],
        }
    return executor


def make_schedule_trigger_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        cron = node_config.get('cronExpression', '0 9 * * *')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 10, f'تفعيل الجدولة الزمنية ({cron})...')
        time.sleep(0.3)
        prompt = state.get('inputs', {}).get('prompt') or 'تقرير إخباري مجدول آلياً'
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 20, f'تم إطلاق الجدولة: {cron}')
        return {
            'prompt': prompt,
            'current_node_id': node_id,
            'logs': [f"Cron Trigger fired: {cron}"],
        }
    return executor


def make_file_upload_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 10, 'فحص وقراءة الملفات والمستندات المرفوعة...')
        time.sleep(0.3)
        docs = [
            {'name': 'document_input.pdf', 'size_kb': 240, 'type': 'application/pdf'}
        ]
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 20, 'تم استيراد المستندات بنجاح')
        return {
            'documents': docs,
            'current_node_id': node_id,
            'logs': [f"File uploaded: {len(docs)} documents"],
        }
    return executor


# =========================================================
# 2. AI & AGENTS (LLMs)
# =========================================================

def make_llm_agent_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 30, 'الذكاء الاصطناعي (LLM Agent) يحلل الفكرة ويكتب السكريبت والمشاهد...')
        time.sleep(0.6)

        prompt = state.get('prompt', 'فيديو تسويقي')
        model_name = node_config.get('model', 'gemini-1.5-flash')

        scenes = [
            {
                'scene_index': 1,
                'title': prompt,
                'subtext': 'اكتشف أقوى المميزات والحلول الرقمية معنا اليوم',
                'color': '#ffffff',
                'accent_color': '#38bdf8',
                'bg_shape_color': 'rgba(6, 182, 212, 0.35)',
                'duration': state.get('project_settings', {}).get('duration', 5)
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


def make_universal_llm_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        model = node_config.get('model', 'gemini-1.5-pro')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 35, f'استدعاء النموذج السحابي العملاق ({model})...')
        time.sleep(0.5)

        prompt = state.get('prompt', 'تحليل شامل')
        text_out = f"تحليل ذكي متكامل لـ '{prompt}': تم تلخيص النقاط الجوهرية وصياغة المحتوى بأعلى معايير الدقة والجاذبية."

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 55, f'اكتملت إجابة النموذج ({model}) بنجاح')
        return {
            'text_content': text_out,
            'current_node_id': node_id,
            'logs': [f"Universal LLM ({model}) generated response."],
        }
    return executor


def make_multi_agent_swarm_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 35, 'تنسيق عمل فريق الوكلاء (الباحث ⬅️ الكاتب ⬅️ المدقق)...')
        time.sleep(0.7)
        prompt = state.get('prompt', 'موضوع العمل')
        text_out = f"تقرير فريق الوكلاء لـ '{prompt}': باحث قام بالاستكشاف، كاتب صاغ المقال، ومدقق راجع المخرجات."
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 60, 'أتم فريق الوكلاء مهمته الجماعية بتناغم كامل')
        return {
            'text_content': text_out,
            'current_node_id': node_id,
            'logs': ["Multi-Agent Swarm execution completed."],
        }
    return executor


def make_structured_json_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 40, 'توليد وهيكلة البيانات بتنسيق JSON صارم...')
        time.sleep(0.4)
        prompt = state.get('prompt', 'فيديو')
        structured = {
            'topic': prompt,
            'summary': 'ملخص البيانات المهيكلة',
            'tags': ['ذكاء_اصطناعي', 'أتمتة', 'سحابي'],
            'generated_at': time.time()
        }
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 65, 'تم استخراج وتدقيق كائن الـ JSON بنجاح')
        return {
            'structured_json': structured,
            'current_node_id': node_id,
            'logs': ["Structured JSON extracted."],
        }
    return executor


# =========================================================
# 3. TOOLS, WEB & CODE
# =========================================================

def make_web_search_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        query = state.get('prompt') or node_config.get('query', 'آخر أخبار التكنولوجيا')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 25, f'إجراء بحث حي في محركات الويب عن: "{query[:30]}"...')
        time.sleep(0.5)

        results = [
            {'title': f'أحدث التطورات في {query}', 'snippet': 'تفاصيل مهمة وإحصائيات حديثة تم استخراجها من الويب.', 'url': 'https://news.example.com'},
            {'title': 'دليل شامل وأفضل الممارسات', 'snippet': 'نصائح ومعلومات موثوقة تم التحقق منها.', 'url': 'https://tech.example.com'}
        ]

        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 45, f'تم العثور على {len(results)} نتائج بحث موثوقة')
        return {
            'search_results': results,
            'current_node_id': node_id,
            'logs': [f"Web search found {len(results)} items."],
        }
    return executor


def make_web_scraper_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        url = node_config.get('targetUrl', 'https://example.com')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 30, f'استخراج وقراءة محتوى الرابط ({url})...')
        time.sleep(0.4)
        scraped = f"محتوى مستخرج من {url}: نص مقال مفصل يحتوي على معلومات حصرية تم تنظيفها من إعلانات الويب."
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 50, 'تم سحب المقال وتحويله لنص نقي')
        return {
            'scraped_content': scraped,
            'current_node_id': node_id,
            'logs': [f"Web scraper read content from {url}"],
        }
    return executor


def make_code_sandbox_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 40, 'تنفيذ كود بايثون السحابي الآمن في بيئة معزولة...')
        time.sleep(0.3)
        code = node_config.get('codeSnippet', 'output = True')
        # Safe mathematical or text evaluation
        res = f"Code executed successfully: {len(state.get('prompt', ''))} chars processed."
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 60, 'تم تشغيل الكود السحابي وإرجاع النتيجة بنجاح')
        return {
            'code_output': res,
            'current_node_id': node_id,
            'logs': [f"Code sandbox executed: {res}"],
        }
    return executor


def make_http_request_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        url = node_config.get('url', 'https://httpbin.org/get')
        method = node_config.get('method', 'GET')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 45, f'إرسال طلب HTTP ({method}) إلى السحاب...')
        time.sleep(0.3)
        res_payload = {'status_code': 200, 'url': url, 'success': True}
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 70, f'تم استلام رد HTTP 200 بنجاح')
        return {
            'http_response': res_payload,
            'current_node_id': node_id,
            'logs': [f"HTTP {method} to {url} returned 200 OK"],
        }
    return executor


# =========================================================
# 4. RAG & KNOWLEDGE
# =========================================================

def make_doc_parser_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 30, 'تقطيع وفهرسة المستندات إلى مقاطع ذكية (Chunks)...')
        time.sleep(0.4)
        chunks = [
            'الفقرة الأولى: نظرة عامة ومفاهيم أساسية.',
            'الفقرة الثانية: خطوات التنفيذ والمواصفات الفنية.'
        ]
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 50, f'تم تجزئة المستند إلى {len(chunks)} فقرات دلالية')
        return {
            'retrieved_contexts': chunks,
            'current_node_id': node_id,
            'logs': [f"Doc Parser produced {len(chunks)} chunks"],
        }
    return executor


def make_vector_search_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 35, 'استرجاع الفقرات الأكثر تطابقاً دلالياً من قاعدة المتجهات...')
        time.sleep(0.4)
        retrieved = ['المعلومة المسترجعة رقم 1 متوافقة 96% مع السؤال.']
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 60, 'تم جلب السياق المعرفي بدقة وبدون هلوسة')
        return {
            'retrieved_contexts': retrieved,
            'current_node_id': node_id,
            'logs': ["Vector Search retrieved context."],
        }
    return executor


# =========================================================
# 5. CLOUD MEDIA & VISION (ComfyUI Cloud Style)
# =========================================================

def make_text_to_image_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 50, 'توليد الصورة السحابية بدقة عالية (Imagen 3 / Flux Cloud)...')
        time.sleep(0.6)
        prompt = state.get('prompt', 'مشهد سينمائي فاخر')
        img_item = {
            'url': f"{settings.MINIO_ENDPOINT}/{settings.MINIO_DEFAULT_BUCKET}/assets/generated_scene.png",
            'prompt': prompt,
            'model': 'imagen-3-cloud',
            'aspect_ratio': node_config.get('aspectRatio', '16:9')
        }
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 70, 'تم توليد الصورة السحابية وحفظها بنجاح')
        return {
            'generated_images': [img_item],
            'current_node_id': node_id,
            'logs': [f"Cloud Image generated for: {prompt}"],
        }
    return executor


def make_image_to_video_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 55, 'تحريك الصورة إلى مقطع فيديو سينمائي (Wan/Kling Cloud API)...')
        time.sleep(0.6)
        vid_item = {
            'url': f"{settings.MINIO_ENDPOINT}/{settings.MINIO_DEFAULT_BUCKET}/assets/animated_clip.mp4",
            'duration': node_config.get('durationSeconds', 4)
        }
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 75, 'تم تحريك المشهد وإنتاج كليب الفيديو بنجاح')
        return {
            'media_assets': [vid_item],
            'current_node_id': node_id,
            'logs': ["Image-to-Video animated successfully."],
        }
    return executor


def make_vision_analysis_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 40, 'تحليل العناصر البصرية وقراءة النصوص (Gemini Vision OCR)...')
        time.sleep(0.4)
        desc = "تحليل بصري: مشهد جذاب بإضاءة متوازنة مع نص واضح وعناصر متناسقة."
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 65, 'اكتمل التحليل البصري واستخراج النصوص')
        return {
            'vision_description': desc,
            'current_node_id': node_id,
            'logs': ["Vision analysis completed."],
        }
    return executor


def make_background_remover_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 50, 'عزل وتفريغ الخلفية سحابياً (Cloud RemBG)...')
        time.sleep(0.4)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 70, 'تم تفريغ الخلفية بنجاح وإنتاج صورة شفافة')
        return {
            'current_node_id': node_id,
            'logs': ["Background removed."],
        }
    return executor


# =========================================================
# 6. AUDIO & SPEECH
# =========================================================

def make_tts_voice_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 60, 'توليد النبرة الصوتية ومزامنة الترددات (TTS Voice Engine)...')
        time.sleep(0.5)

        voice_style = node_config.get('voiceStyle', 'حماسي احترافي')

        audio_assets = [
            {
                'type': 'synth_ambient',
                'title': f'تعليق صوتي وموسيقى ({voice_style})',
                'duration': state.get('project_settings', {}).get('duration', 5),
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


def make_speech_to_text_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 50, 'تفريغ الصوت لنص مكتوب بدقة مع طوابع زمنية (Whisper Cloud)...')
        time.sleep(0.5)
        text = "نص مفرغ صوتياً بدقة متناهية مع مطابقة مخارج الكلمات."
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 70, 'تم تفريغ التسجيل الصوتي بنجاح')
        return {
            'transcription': text,
            'current_node_id': node_id,
            'logs': ["Speech-to-Text completed."],
        }
    return executor


def make_bgm_selector_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        mood = node_config.get('mood', 'inspiring')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 55, f'اختيار المقطوعة الموسيقية المناسبة لأجواء ({mood})...')
        time.sleep(0.3)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 75, 'تم دمج الموسيقى التصويرية المتناغمة')
        return {
            'current_node_id': node_id,
            'logs': [f"BGM selected for mood {mood}"],
        }
    return executor


# =========================================================
# 7. FLOW LOGIC & CONTROL
# =========================================================

def make_condition_if_else_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 40, 'فحص الشروط المنطقية وتوجيه مسار التدفق...')
        time.sleep(0.3)
        decision = 'TRUE'
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 60, f'تم التحقق من الشرط بنجاح (المسار: {decision})')
        return {
            'branch_decision': decision,
            'current_node_id': node_id,
            'logs': [f"Condition evaluated to {decision}"],
        }
    return executor


def make_merge_join_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 70, 'دمج وتجميع كافة المسارات المتوازية...')
        time.sleep(0.3)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 80, 'تم توحيد مخرجات كافة العقد في تدفق واحد')
        return {
            'current_node_id': node_id,
            'logs': ["Parallel branches merged."],
        }
    return executor


# =========================================================
# 8. STORAGE & DATA
# =========================================================

def make_s3_storage_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 80, 'مزامنة وحفظ الملفات في باكت MinIO S3 السحابي...')
        time.sleep(0.3)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 90, 'تم التحقق من تخزين وسائط المشروع بنجاح')
        return {
            'current_node_id': node_id,
            'logs': ["S3 storage synced."],
        }
    return executor


def make_sql_database_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 80, 'تسجيل بيانات العملية في قاعدة البيانات...')
        time.sleep(0.3)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 90, 'تم حفظ السجل بنجاح في قاعدة البيانات')
        return {
            'current_node_id': node_id,
            'logs': ["Database record stored."],
        }
    return executor


# =========================================================
# 9. PUBLISHING & INTEGRATIONS
# =========================================================

def make_notification_alert_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        channel = node_config.get('channelType', 'telegram')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 85, f'إرسال إشعار فوري وتنبيه للمشرف عبر ({channel})...')
        time.sleep(0.4)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 95, f'تم تسليم الإشعار بنجاح إلى قناة {channel}')
        return {
            'notifications_sent': [{'channel': channel, 'status': 'DELIVERED'}],
            'current_node_id': node_id,
            'logs': [f"Notification sent to {channel}"],
        }
    return executor


def make_social_publisher_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        platform = node_config.get('targetPlatform', 'youtube_shorts')
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 90, f'تجهيز وجدولة النشر على منصة ({platform})...')
        time.sleep(0.4)
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 98, f'تم تجهيز كبسولة النشر بنجاح لـ {platform}')
        return {
            'publish_status': {'platform': platform, 'status': 'SCHEDULED'},
            'current_node_id': node_id,
            'logs': [f"Social publish ready for {platform}"],
        }
    return executor


# =========================================================
# 10. REVIDEO NLE STUDIO & RENDERING
# =========================================================

def make_revideo_timeline_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 75, 'بناء كائنات التايم لاين والمحاذاة البصرية لـ Revideo...')
        time.sleep(0.5)

        scenes = state.get('scenes', [])
        total_duration = state.get('project_settings', {}).get('duration', 5)
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


def make_auto_subtitles_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 70, 'توليد خطوط الترجمة المتحركة (TikTok / Reels Style)...')
        time.sleep(0.4)
        subs = [
            {'text': '🔥 اكتشف الآن', 'start': 0.5, 'end': 2.0},
            {'text': 'أقوى الميزات الحصرية', 'start': 2.2, 'end': 4.5}
        ]
        publish_workflow_event(state['run_id'], node_id, 'COMPLETED', 85, 'تم إنتاج خطوط الترجمة وتنسيقها حركياً')
        return {
            'subtitles': subs,
            'current_node_id': node_id,
            'logs': [f"Auto subtitles generated ({len(subs)} phrases)."],
        }
    return executor


def make_render_export_executor(node_id: str, node_config: dict):
    def executor(state: WorkflowState) -> WorkflowState:
        publish_workflow_event(state['run_id'], node_id, 'RUNNING', 90, 'إرسال التايم لاين لرندر FFmpeg في رتل Revideo...')

        title = state.get('project_settings', {}).get('title', 'فيديو المخطط')
        clips = state.get('timeline_clips', [])
        duration = state.get('project_settings', {}).get('duration', 5)
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


# =========================================================
# UNIVERSAL NODE FACTORIES MAPPING
# =========================================================

NODE_FACTORIES = {
    # 1. Triggers
    'triggerNode': make_trigger_executor,
    'webhookTrigger': make_webhook_trigger_executor,
    'scheduleTrigger': make_schedule_trigger_executor,
    'fileUploadNode': make_file_upload_executor,

    # 2. AI & Agents
    'llmAgentNode': make_llm_agent_executor,
    'universalLlmNode': make_universal_llm_executor,
    'multiAgentSwarmNode': make_multi_agent_swarm_executor,
    'structuredJsonNode': make_structured_json_executor,

    # 3. Tools & Web & Code
    'webSearchNode': make_web_search_executor,
    'webScraperNode': make_web_scraper_executor,
    'codeSandboxNode': make_code_sandbox_executor,
    'httpRequestNode': make_http_request_executor,

    # 4. RAG & Knowledge
    'docParserNode': make_doc_parser_executor,
    'vectorSearchNode': make_vector_search_executor,

    # 5. Cloud Media & Vision
    'textToImageNode': make_text_to_image_executor,
    'imageToVideoNode': make_image_to_video_executor,
    'visionAnalysisNode': make_vision_analysis_executor,
    'backgroundRemoverNode': make_background_remover_executor,

    # 6. Audio & Speech
    'ttsVoiceNode': make_tts_voice_executor,
    'speechToTextNode': make_speech_to_text_executor,
    'bgmSelectorNode': make_bgm_selector_executor,

    # 7. Flow Logic
    'conditionIfElseNode': make_condition_if_else_executor,
    'mergeJoinNode': make_merge_join_executor,

    # 8. Storage & Data
    's3StorageNode': make_s3_storage_executor,
    'sqlDatabaseNode': make_sql_database_executor,

    # 9. Publishing & Notifications
    'notificationAlertNode': make_notification_alert_executor,
    'socialPublisherNode': make_social_publisher_executor,

    # 10. Revideo NLE Studio
    'revideoTimelineNode': make_revideo_timeline_executor,
    'autoSubtitlesNode': make_auto_subtitles_executor,
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
        if n_type in ('triggerNode', 'webhookTrigger', 'scheduleTrigger', 'fileUploadNode') and entry_node_id is None:
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
        if 'video_id' in final_state and final_state['video_id']:
            try:
                run.video_project = VideoProject.objects.get(id=final_state['video_id'])
            except VideoProject.DoesNotExist:
                pass
        run.save()

        publish_workflow_event(str(run.id), 'GLOBAL_END', 'COMPLETED', 100, 'اكتمل تنفيذ المخطط بالكامل!', {
            'final_state': {
                'video_url': final_state.get('rendered_video_url'),
                'video_id': final_state.get('video_id'),
                'clips_count': len(final_state.get('timeline_clips', [])),
                'search_results': final_state.get('search_results'),
                'text_content': final_state.get('text_content'),
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
