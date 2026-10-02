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

from .models import VideoProject

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
