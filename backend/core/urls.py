from django.contrib import admin
from django.urls import path, include
from api.views import landing_view, events_stream_view

urlpatterns = [
    path('', landing_view, name='landing'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('events/render/<str:video_id>/', events_stream_view, name='events_stream'),
]
