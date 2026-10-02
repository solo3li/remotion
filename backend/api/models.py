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
