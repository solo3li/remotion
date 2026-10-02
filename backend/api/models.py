import uuid
from django.db import models

class VideoProject(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'مسودة'),
        ('QUEUED', 'في الانتظار'),
        ('RENDERING', 'جاري الرندر'),
        ('COMPLETED', 'مكتمل'),
        ('FAILED', 'فشل'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, default='مشروع فيديو جديد')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    progress = models.IntegerField(default=0)
    template_name = models.CharField(max_length=100, default='modern_promo')
    variables = models.JSONField(default=dict, blank=True)
    video_url = models.URLField(max_length=1000, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.status}) - {self.progress}%"

class Workflow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, default='مخطط ذكاء اصطناعي جديد')
    description = models.TextField(blank=True, default='')
    graph_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class WorkflowRun(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'قيد الانتظار'),
        ('RUNNING', 'جاري التشغيل'),
        ('COMPLETED', 'مكتمل'),
        ('FAILED', 'فشل'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name='runs', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    progress = models.IntegerField(default=0)
    current_node = models.CharField(max_length=100, blank=True, default='')
    state_data = models.JSONField(default=dict, blank=True)
    logs = models.JSONField(default=list, blank=True)
    video_project = models.ForeignKey(VideoProject, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Run {self.id} ({self.status}) - {self.progress}%"
