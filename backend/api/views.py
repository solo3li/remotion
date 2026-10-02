import json
import time
import uuid
import boto3
from botocore.client import Config
from django.conf import settings
from django.contrib.auth import login, get_user_model
from django.http import JsonResponse, StreamingHttpResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
import redis
import requests

import threading
from .models import VideoProject, Workflow, WorkflowRun
from .workflow_engine import execute_workflow_run_sync

User = get_user_model()

def get_redis_client():
    return redis.from_url(settings.REDIS_URL, decode_responses=True)

def get_s3_client():
    client = boto3.client(
        's3',
        endpoint_url=settings.MINIO_INTERNAL_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        config=Config(signature_version='s3v4'),
        region_name='us-east-1'
    )
    try:
        client.create_bucket(Bucket=settings.MINIO_DEFAULT_BUCKET)
    except Exception:
        pass
    return client

def get_public_s3_client():
    return boto3.client(
        's3',
        endpoint_url=settings.MINIO_ENDPOINT,
        aws_access_key_id=settings.MINIO_ROOT_USER,
        aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
        config=Config(signature_version='s3v4'),
        region_name='us-east-1'
    )

def landing_view(request):
    """SEO-friendly Marketing Landing Page served by Django MVT"""
    domain = getattr(settings, 'DOMAIN', '169.58.32.179.nip.io')
    return render(request, 'landing.html', {
        'domain': domain,
        'app_url': f"http://{domain}/app",
    })

@csrf_exempt
def auth_login_view(request):
    """Logs in a demo user and sets the shared session cookie"""
    if request.method == 'POST':
        user, _ = User.objects.get_or_create(username='demo_creator', defaults={'email': 'demo@nip.io'})
        login(request, user)
        return JsonResponse({
            'status': 'success',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        })
    return JsonResponse({'error': 'POST required'}, status=405)

def auth_user_view(request):
    """Returns the authenticated user or guest info"""
    if request.user.is_authenticated:
        return JsonResponse({
            'authenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email
            }
        })
    return JsonResponse({'authenticated': False, 'user': None})

@csrf_exempt
def s3_presigned_url_view(request):
    """Generates a Presigned PUT URL for direct-to-MinIO file uploads"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        # Ensure bucket exists first
        get_s3_client()

        body = json.loads(request.body)
        filename = body.get('filename', f"upload_{uuid.uuid4().hex[:8]}.mp4")
        content_type = body.get('content_type', 'video/mp4')
        key = f"uploads/{uuid.uuid4().hex[:6]}_{filename}"

        s3 = get_public_s3_client()
        presigned_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': settings.MINIO_DEFAULT_BUCKET,
                'Key': key,
                'ContentType': content_type,
            },
            ExpiresIn=3600
        )
        file_url = f"{settings.MINIO_ENDPOINT}/{settings.MINIO_DEFAULT_BUCKET}/{key}"

        return JsonResponse({
            'presigned_url': presigned_url,
            'file_url': file_url,
            'key': key
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
def create_video_render_view(request):
    """Creates a VideoProject and triggers rendering on the worker"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
        title = data.get('title', 'فيديو جديد')
        template_name = data.get('template', 'revideo_promo')
        variables = data.get('variables', {})

        project = VideoProject.objects.create(
            title=title,
            template_name=template_name,
            variables=variables,
            status='QUEUED',
            progress=0
        )

        # Notify Redis queue for worker
        r = get_redis_client()
        render_task = {
            'video_id': str(project.id),
            'title': title,
            'template': template_name,
            'variables': variables,
        }
        r.rpush('revideo:render_queue', json.dumps(render_task))

        # Also emit to Inngest Dev Server if available
        try:
            requests.post(
                settings.INNGEST_EVENT_URL,
                json={'name': 'video/render.requested', 'data': render_task},
                timeout=1
            )
        except Exception:
            pass

        return JsonResponse({
            'video_id': str(project.id),
            'status': 'QUEUED',
            'progress': 0
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

def get_video_status_view(request, video_id):
    """Returns the current render status and progress of a video"""
    try:
        project = VideoProject.objects.get(id=video_id)
        return JsonResponse({
            'video_id': str(project.id),
            'title': project.title,
            'status': project.status,
            'progress': project.progress,
            'video_url': project.video_url,
            'created_at': project.created_at.isoformat()
        })
    except VideoProject.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

async def events_stream_view(request, video_id):
    """
    Server-Sent Events (SSE) Stream.
    Listens to Redis Pub/Sub channel 'render:<video_id>'
    and streams realtime progress to the React frontend.
    """
    import asyncio
    import redis.asyncio as aioredis

    async def event_stream():
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"render:{video_id}")

        # Initial handshake ping
        yield f"data: {json.dumps({'percent': 0, 'status': 'CONNECTED'})}\n\n"

        start_time = time.time()
        timeout_seconds = 180

        while time.time() - start_time < timeout_seconds:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
            if message and message.get('type') == 'message':
                data_str = message['data']
                yield f"data: {data_str}\n\n"
                try:
                    payload = json.loads(data_str)
                    if payload.get('percent', 0) >= 100 or payload.get('status') == 'COMPLETED':
                        break
                except Exception:
                    pass
            await asyncio.sleep(0.1)

        await pubsub.unsubscribe(f"render:{video_id}")
        await pubsub.close()
        await r.close()

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response

@csrf_exempt
def inngest_handler(request):
    """Inngest SDK endpoint"""
    return JsonResponse({'status': 'ok', 'functions': []})

# =========================================================
# WORKFLOW ENGINE & LANGGRAPH ENDPOINTS
# =========================================================

@csrf_exempt
def workflows_list_create_view(request):
    """Lists existing workflows or creates/updates a workflow definition"""
    if request.method == 'GET':
        workflows = Workflow.objects.all().order_by('-created_at')
        return JsonResponse({
            'workflows': [
                {
                    'id': str(w.id),
                    'title': w.title,
                    'description': w.description,
                    'graph_data': w.graph_data,
                    'created_at': w.created_at.isoformat()
                } for w in workflows
            ]
        })
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            wf_id = data.get('id')
            title = data.get('title', 'مخطط فيديو جديد')
            description = data.get('description', '')
            graph_data = data.get('graph_data', {})

            if wf_id:
                try:
                    wf = Workflow.objects.get(id=wf_id)
                    wf.title = title
                    wf.description = description
                    wf.graph_data = graph_data
                    wf.save()
                except Workflow.DoesNotExist:
                    wf = Workflow.objects.create(id=wf_id, title=title, description=description, graph_data=graph_data)
            else:
                wf = Workflow.objects.create(title=title, description=description, graph_data=graph_data)

            return JsonResponse({
                'status': 'success',
                'workflow': {
                    'id': str(wf.id),
                    'title': wf.title,
                    'description': wf.description,
                    'graph_data': wf.graph_data
                }
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def workflow_detail_view(request, workflow_id):
    """Retrieve or delete a single workflow"""
    try:
        wf = Workflow.objects.get(id=workflow_id)
        if request.method == 'GET':
            return JsonResponse({
                'id': str(wf.id),
                'title': wf.title,
                'description': wf.description,
                'graph_data': wf.graph_data,
                'created_at': wf.created_at.isoformat()
            })
        elif request.method == 'DELETE':
            wf.delete()
            return JsonResponse({'status': 'deleted'})
    except Workflow.DoesNotExist:
        return JsonResponse({'error': 'Workflow not found'}, status=404)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def workflow_run_view(request, workflow_id):
    """Executes a workflow via LangGraph in background and returns run_id"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        wf = Workflow.objects.get(id=workflow_id)
        data = json.loads(request.body) if request.body else {}
        inputs = data.get('inputs', {})

        run = WorkflowRun.objects.create(
            workflow=wf,
            status='PENDING',
            progress=0,
            state_data={'inputs': inputs},
            logs=[f"Run requested for workflow '{wf.title}'"]
        )

        # Launch LangGraph execution in background thread
        thread = threading.Thread(target=execute_workflow_run_sync, args=(str(run.id),))
        thread.daemon = True
        thread.start()

        return JsonResponse({
            'run_id': str(run.id),
            'workflow_id': str(wf.id),
            'status': 'RUNNING',
            'stream_url': f"/events/workflow/{run.id}/"
        })
    except Workflow.DoesNotExist:
        return JsonResponse({'error': 'Workflow not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


async def workflow_events_stream_view(request, run_id):
    """
    Real-time SSE stream for workflow execution.
    Subscribes to Redis channel 'workflow:<run_id>'
    and streams node-by-node state transitions to React Flow.
    """
    import asyncio
    import redis.asyncio as aioredis

    async def event_stream():
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        channel = f"workflow:{run_id}"
        await pubsub.subscribe(channel)

        # Initial ping
        yield f"data: {json.dumps({'status': 'CONNECTED', 'run_id': run_id, 'percent': 0})}\n\n"

        start_time = time.time()
        timeout_seconds = 180

        while time.time() - start_time < timeout_seconds:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
            if message and message.get('type') == 'message':
                data_str = message['data']
                yield f"data: {data_str}\n\n"
                try:
                    payload = json.loads(data_str)
                    if payload.get('node_id') == 'GLOBAL_END' or payload.get('status') == 'FAILED':
                        break
                except Exception:
                    pass
            await asyncio.sleep(0.1)

        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await r.close()

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response
