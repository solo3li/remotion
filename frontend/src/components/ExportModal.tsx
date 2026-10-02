import React, { useEffect, useState } from 'react';

interface ExportModalProps {
  videoId: string;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ videoId, onClose }) => {
  const [percent, setPercent] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('جاري الاتصال بخادم الرندر...');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;

    // Connect to Server-Sent Events (SSE) endpoint
    const eventSource = new EventSource(`/events/render/${videoId}/`);

    eventSource.onopen = () => {
      setStatusText('تم فتح قناة البث المباشر (SSE) • في انتظار المهام...');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.percent !== undefined) {
          setPercent(data.percent);
        }
        if (data.status) {
          setStatusText(data.status);
        }
        if (data.video_url) {
          setVideoUrl(data.video_url);
        }
        if (data.percent >= 100 || data.status === 'COMPLETED') {
          setIsCompleted(true);
          setStatusText('تم إنجاز الفيديو ورفعه إلى MinIO بنجاح! 🎉');
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE EventSource error/closed:', err);
      // If we already finished, don't show error
      if (!isCompleted) {
        // Fallback polling check
        fetch(`/api/videos/${videoId}/`)
          .then((r) => r.json())
          .then((d) => {
            if (d.status === 'COMPLETED') {
              setPercent(100);
              setIsCompleted(true);
              setVideoUrl(d.video_url);
              setStatusText('تم الانتهاء بنجاح!');
              eventSource.close();
            }
          })
          .catch(() => {});
      }
    };

    return () => {
      eventSource.close();
    };
  }, [videoId, isCompleted]);

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>🚀 رندر الفيديو المباشر (Server-Sent Events)</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error ? (
            <div className="error-box">{error}</div>
          ) : !isCompleted ? (
            <div className="render-in-progress">
              <div className="progress-info">
                <span className="status-label">{statusText}</span>
                <span className="percent-label">{percent}%</span>
              </div>

              {/* Real-time Progress Bar */}
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${percent}%` }}
                ></div>
              </div>

              <div className="step-chips">
                <span className={`chip ${percent >= 25 ? 'active' : ''}`}>1. تجهيز الكانفاس</span>
                <span className={`chip ${percent >= 50 ? 'active' : ''}`}>2. رندر FFmpeg</span>
                <span className={`chip ${percent >= 75 ? 'active' : ''}`}>3. معالجة الصوت</span>
                <span className={`chip ${percent >= 90 ? 'active' : ''}`}>4. تخزين MinIO</span>
              </div>
            </div>
          ) : (
            <div className="render-completed">
              <div className="success-badge">✓ تم الانتهاء بنجاح!</div>
              <p className="success-desc">تم حفظ الفيديو في خزانة MinIO وتوليد ملف MP4 بجودة عالية.</p>

              {videoUrl && (
                <div className="video-preview-box">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    className="rendered-video-player"
                  />
                  <div className="download-actions">
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-download"
                      download
                    >
                      ⬇️ تحميل ملف MP4 مباشرة
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {isCompleted ? 'إغلاق النافذة' : 'إلغاء المتابعة'}
          </button>
        </div>
      </div>
    </div>
  );
};
