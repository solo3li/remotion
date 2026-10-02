# معمارية النظام المتكامل لصناعة الفيديو (Full End-to-End Architecture)

هذا المستند يوثق المعمارية الكاملة لنظام صناعة الفيديو البرمجي، القائم على دمج **Django + React (Vite) + Revideo + Traefik + MinIO + Redis + Inngest + Server-Sent Events (SSE)** بدون الحاجة لشراء دومين حالياً (باستخدام `nip.io`).

---

## 1. المخطط العام للنظام (System Topology)

```
                            [العميل / المتصفح]
                                    │
                                    ▼ http://<IP>.nip.io
               ┌───────────────────────────────────────────────┐
               │              Traefik Reverse Proxy            │
               │           (توجيه تلقائي عبر المسارات)           │
               └───────┬───────────────┬───────────────┬───────┘
                       │               │               │
      PathPrefix(/app) │  Path(/, /api)│   Path(/s3)   │
                       ▼               ▼               ▼
               ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
               │ React + Vite │ │ Django MVT  │ │ MinIO S3     │
               │ (المحرر والـ  │ │ (قاعدة     │ │ (تخزين       │
               │  تايم لاين)  │ │ البيانات)   │ │ الفيديوهات)  │
               └──────────────┘ └──────┬──────┘ └──────────────┘
                                       │
                                       ├─► [Inngest Engine] (توجيه مهام الرندر)
                                       │         │
                                       │         ▼
                                       │   ┌───────────────────────────┐
                                       │   │ Revideo Node.js Worker    │
                                       │   │ (توليد الفيديو بـ FFmpeg) │
                                       │   └─────────────┬─────────────┘
                                       │                 │
                                       │                 ├─► يرفع الـ MP4 إلى MinIO
                                       │                 │
                                       │                 └─► ينشر نسبة التقدم (0%..100%)
                                       ▼                                 │
                               ┌───────────────┐                         ▼
                               │ Redis Pub/Sub │ ◄───────────────────────┘
                               └───────┬───────┘
                                       │
                        (بث النسبة الحية عبر SSE)
                                       │
                                       ▼
                       [المتصفح: شريط التقدم اللحظي]
```

---

## 2. جدول الخدمات والمنافذ (Services & Ports)

| الخدمة | التقنية | المنفذ الداخلي | المسار الخارجي عبر Traefik | الوظيفة |
| :--- | :--- | :--- | :--- | :--- |
| **Traefik** | Traefik v3 | `80`, `8080` | `http://<IP>.nip.io` | البوابة الرئيسية وموجّه المرور التلقائي |
| **Django** | Python 3.11 + ASGI | `8000` | `/`, `/api/*`, `/events/*` | الحسابات، الجلسات، API، وبث الـ SSE |
| **Frontend** | React 18 + Vite | `80` (Nginx) | `/app`, `/app/*` | محرر Revideo، التايم لاين، وشريط التقدم |
| **Revideo Worker** | Node.js 20 + FFmpeg | - | خدمة خلفية | محرك الرندر وتوليد ملفات الفيديو |
| **MinIO** | MinIO Storage | `9000`, `9001` | `http://<IP>.nip.io:9000` | تخزين الميديا والفيديوهات (S3 Compatible) |
| **Redis** | Redis Alpine | `6379` | شبكة Docker الداخلية | قناة نشر واشتراك لنسبة التقدم اللحظية |
| **Inngest** | Inngest Dev Server | `8288` | `http://<IP>.nip.io:8288` | محرك الأحداث وجدولة مهام الرندر |

---

## 3. مسار رحلة المستخدم (End-to-End Lifecycle)

1. **الدخول والـ SEO (`/`):**
   * يدخل المستخدم إلى `http://<IP>.nip.io/` فيظهر له الموقع التعريفي بـ Django MVT السريع والمتوافق 100% مع محركات البحث.
   * يسجل دخوله، فيقوم دجانجو بوضع **Shared Session Cookie** عادية.
2. **فتح المحرر (`/app`):**
   * يضغط المستخدم على "فتح المحرر"، فينتقل إلى `http://<IP>.nip.io/app`.
   * تطبيق React يقرأ بيانات المستخدم من دجانجو مباشرة لأن الكوكي مدمجة ونفس الـ Origin (`nip.io`).
3. **رفع الملفات (Direct-to-S3):**
   * المستخدم يرفع فيديو أو ملف صوت في المحرر.
   * دجانجو يولد رابط **Presigned URL** من MinIO.
   * المتصفح يرفع الملف مباشرة إلى MinIO دون الضغط على سيرفر دجانجو.
4. **التعديل والتايم لاين:**
   * المستخدم يعدل النصوص والألوان ومسارات الفيديو على تايم لاين Revideo.
5. **بدء الرندر وشريط التقدم الحي (SSE):**
   * يضغط المستخدم زر "تصدير الفيديو (Render)".
   * دجانجو يطلق حدث إلى **Inngest** (`video/render.requested`).
   * يلتقط محرك **Revideo Worker** الطلب ويبدأ في تجميع الفريمات بـ FFmpeg.
   * أثناء الرندر، يقوم Revideo بنشر نسبة الإنجاز في Redis:
     `redis.publish("render:<video_id>", {"percent": 45})`
   * المتصفح يستمع إلى المسار `/events/render/<video_id>/` عبر **EventSource (SSE)**:
     يتحرك شريط التقدم اللحظي بسلاسة من 0% إلى 100%.
6. **اكتمال الفيديو والتحميل:**
   * الحاوية ترفع الفيديو المنجز إلى مجلد `renders` في MinIO.
   * يتم إشعار المتصفح عبر الـ SSE بانتهاء العملية مع رابط التحميل النهائي للـ MP4.

---

## 4. إعدادات الأمان والـ Environment Variables

```env
# إعدادات النطاق والشبكة
SERVER_IP=169.58.32.179
DOMAIN=169.58.32.179.nip.io

# Django
DJANGO_SECRET_KEY=production-secure-key-change-me
DEBUG=True
ALLOWED_HOSTS=*

# MinIO S3
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_DEFAULT_BUCKET=videosaas
MINIO_ENDPOINT=http://169.58.32.179.nip.io:9000

# Redis & Inngest
REDIS_URL=redis://redis:6379/0
INNGEST_EVENT_URL=http://inngest:8288/e/key
```
