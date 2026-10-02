from django.urls import path
from . import views

urlpatterns = [
    path('auth/login/', views.auth_login_view, name='auth_login'),
    path('auth/user/', views.auth_user_view, name='auth_user'),
    path('s3/presigned-url/', views.s3_presigned_url_view, name='s3_presigned_url'),
    path('videos/create/', views.create_video_render_view, name='video_create'),
    path('videos/<str:video_id>/', views.get_video_status_view, name='video_status'),
    path('inngest', views.inngest_handler, name='inngest_handler'),
]
