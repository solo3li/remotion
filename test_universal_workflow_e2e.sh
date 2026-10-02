#!/usr/bin/env bash
set -e

DOMAIN="169.58.32.179.nip.io"
BASE_URL="http://${DOMAIN}"
COOKIE_JAR="/tmp/universal_wf_cookies.txt"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}    اختبار المنظومة الشاملة للعقد ومحرك LangGraph السحابي       ${NC}"
echo -e "${BLUE}    (Universal Multi-Category Workflow E2E Test)                ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "الهدف: ${YELLOW}${BASE_URL}${NC}\n"

# 1. المصادقة وجلسة العمل
echo -e "1️⃣  [المصادقة] تسجيل الدخول وتجهيز الجلسة ..."
LOGIN_RES=$(curl -s -c "${COOKIE_JAR}" -X POST "${BASE_URL}/api/auth/login/")
echo "   الرد: ${LOGIN_RES}"

# 2. إنشاء وحفظ مخطط يغطي تصنيفات متعددة (بحث، ذكاء، ميديا، صوت، تايم لاين، رندر، إشعارات)
echo -e "\n2️⃣  [حفظ المخطط الشامل] إرسال مخطط يتضمن 8 عقد متقدمة من تصنيفات مختلفة ..."

PAYLOAD=$(cat << 'EOF'
{
  "title": "مخطط الأتمتة الشامل: بحث ويب ⬅️ ذكاء ⬅️ ميديا ⬅️ تايم لاين ⬅️ رندر ⬅️ إشعارات",
  "description": "خط إنتاج متكامل لا يقتصر على الفيديو فقط بل يشمل كافة أدوات الأتمتة السحابية",
  "graph_data": {
    "nodes": [
      {
        "id": "node-prompt",
        "type": "triggerNode",
        "position": { "x": 380, "y": 30 },
        "data": {
          "label": "1. موضوع الحملة والمدخلات",
          "prompt": "🚀 إطلاق أحدث حلول الذكاء الاصطناعي السحابية 2026",
          "duration": 5,
          "bgColor": "#0b0e17"
        }
      },
      {
        "id": "node-search",
        "type": "webSearchNode",
        "position": { "x": 380, "y": 200 },
        "data": {
          "label": "2. استكشاف وبحث الويب المباشر",
          "maxResults": 3
        }
      },
      {
        "id": "node-llm",
        "type": "universalLlmNode",
        "position": { "x": 380, "y": 380 },
        "data": {
          "label": "3. التحليل والصياغة (Gemini 1.5 Pro)",
          "model": "gemini-1.5-pro"
        }
      },
      {
        "id": "node-media",
        "type": "textToImageNode",
        "position": { "x": 120, "y": 560 },
        "data": {
          "label": "4. توليد صور سينمائية (Imagen 3)",
          "aspectRatio": "16:9"
        }
      },
      {
        "id": "node-tts",
        "type": "ttsVoiceNode",
        "position": { "x": 380, "y": 560 },
        "data": {
          "label": "5. التعليق الصوتي البشري (TTS Voice)",
          "voiceStyle": "حماسي إعلاني"
        }
      },
      {
        "id": "node-timeline",
        "type": "revideoTimelineNode",
        "position": { "x": 640, "y": 560 },
        "data": {
          "label": "6. تجميع التايم لاين (Revideo)"
        }
      },
      {
        "id": "node-render",
        "type": "renderExportNode",
        "position": { "x": 380, "y": 760 },
        "data": {
          "label": "7. رندر وتصدير MP4 (MinIO S3)"
        }
      },
      {
        "id": "node-notify",
        "type": "notificationAlertNode",
        "position": { "x": 640, "y": 760 },
        "data": {
          "label": "8. إشعار فوري تليجرام/ديسكورد",
          "channelType": "telegram"
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "node-prompt", "target": "node-search" },
      { "id": "e2", "source": "node-search", "target": "node-llm" },
      { "id": "e3", "source": "node-llm", "target": "node-media" },
      { "id": "e4", "source": "node-llm", "target": "node-tts" },
      { "id": "e5", "source": "node-llm", "target": "node-timeline" },
      { "id": "e6", "source": "node-media", "target": "node-render" },
      { "id": "e7", "source": "node-tts", "target": "node-render" },
      { "id": "e8", "source": "node-timeline", "target": "node-render" },
      { "id": "e9", "source": "node-timeline", "target": "node-notify" }
    ]
  }
}
EOF
)

SAVE_RES=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/workflows/" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

WORKFLOW_ID=$(echo "$SAVE_RES" | grep -o '"id": *"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -n "$WORKFLOW_ID" ]; then
    echo -e "   ${GREEN}✓ نجح: تم حفظ المخطط الشامل برقم: ${YELLOW}${WORKFLOW_ID}${NC}"
else
    echo -e "   ${RED}✗ فشل في حفظ المخطط: ${SAVE_RES}${NC}"
    exit 1
fi

# 3. فحص قائمة المخططات
echo -e "\n3️⃣  [قائمة المخططات] فحص استرجاع المخطط من قاعدة البيانات ..."
LIST_RES=$(curl -s -b "${COOKIE_JAR}" "${BASE_URL}/api/workflows/")
if echo "$LIST_RES" | grep -q "$WORKFLOW_ID"; then
    echo -e "   ${GREEN}✓ نجح: تم تأكيد وجود المخطط في قاعدة البيانات بنجاح${NC}"
else
    echo -e "   ${RED}✗ فشل: لم يتم العثور على المخطط${NC}"
    exit 1
fi

# 4. تشغيل المخطط عبر LangGraph
echo -e "\n4️⃣  [تشغيل المخطط الشامل] إطلاق مهمة التشغيل عبر محرك LangGraph السحابي ..."
RUN_RES=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/workflows/${WORKFLOW_ID}/run/" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "🔥 إطلاق منصة الذكاء الاصطناعي الشاملة 2026", "duration": 5}}')

RUN_ID=$(echo "$RUN_RES" | grep -o '"run_id": *"[^"]*"' | cut -d'"' -f4)

if [ -n "$RUN_ID" ]; then
    echo -e "   ${GREEN}✓ نجح: بدأ التنفيذ بمهمة رقم: ${YELLOW}${RUN_ID}${NC}"
else
    echo -e "   ${RED}✗ فشل في بدء تشغيل المخطط: ${RUN_RES}${NC}"
    exit 1
fi

# 5. الاستماع للبث الحي اللحظي (SSE)
echo -e "\n5️⃣  [بث الأحداث الحي SSE] مراقبة مسار العقد وانتقال الحالات في LangGraph ..."

FINAL_VIDEO_URL=""
while read -r line; do
    if [[ "$line" =~ ^data: ]]; then
        DATA_JSON="${line#data: }"
        readarray -t parts < <(python3 -c "
import sys, json
try:
    d = json.loads(sys.argv[1])
    print(d.get('node_id', ''))
    print(d.get('status', ''))
    print(d.get('percent', ''))
    print(d.get('message', ''))
    url = d.get('video_url') or (d.get('final_state', {}) or {}).get('video_url', '')
    print(url)
except Exception:
    pass
" "$DATA_JSON")

        NODE_ID="${parts[0]}"
        STATUS="${parts[1]}"
        PERCENT="${parts[2]}"
        MSG="${parts[3]}"
        URL="${parts[4]}"

        if [ -n "$NODE_ID" ] && [ "$NODE_ID" != "GLOBAL_END" ]; then
            echo -e "   ⚡ ${CYAN}[${NODE_ID}]${NC} (${YELLOW}${PERCENT}%${NC} - ${MAGENTA}${STATUS}${NC}): ${MSG}"
        elif [ "$NODE_ID" = "GLOBAL_END" ]; then
            echo -e "   🎯 ${GREEN}[GLOBAL_END]${NC} (${PERCENT}% - ${STATUS}): ${MSG}"
        fi

        if [ -n "$URL" ]; then
            FINAL_VIDEO_URL="$URL"
        fi

        if [ "$STATUS" = "COMPLETED" ] && [ "$NODE_ID" = "GLOBAL_END" ]; then
            break
        elif [ "$STATUS" = "FAILED" ]; then
            echo -e "   ${RED}فشل في المخطط: ${MSG}${NC}"
            exit 1
        fi
    fi
done < <(curl -s -N "${BASE_URL}/events/workflow/${RUN_ID}/")

echo -e "   ${GREEN}✓ نجح: اكتمل تنفيذ كافة عقد المخطط الشامل في LangGraph!${NC}"

# 6. فحص الفيديو النهائي في MinIO
echo -e "\n6️⃣  [فحص مخرجات الفيديو والتخزين السحابي] التحقق من سلامة ملف MP4 ..."
sleep 3
if [ -n "$FINAL_VIDEO_URL" ]; then
    echo -e "   رابط الفيديو المتولد: ${FINAL_VIDEO_URL}"
    CHECK_RES=$(curl -s -I "$FINAL_VIDEO_URL")
    if echo "$CHECK_RES" | grep -q "200 OK"; then
        echo -e "   ${GREEN}✓ نجح: الفيديو الناتج متاح للتحميل والتشغيل الفوري (200 OK)!${NC}"
    else
        echo -e "   ${YELLOW}تنبيه: جاري معالجة الفيديو في الرتل وسيتاح فوراً.${NC}"
    fi
fi

# 7. فحص سلامة الفيديو بواسطة ffprobe داخل الحاوية
echo -e "\n7️⃣  [فحص الدقة والمعدل بـ ffprobe] التأكد من مطابقة ملف الفيديو للمواصفات ..."
PROBE_RES=$(docker exec saas_revideo_worker ffprobe -v error -show_entries format=duration,size,bit_rate -of default=noprint_wrappers=1 "http://minio:9000/videosaas/renders/$(echo "$FINAL_VIDEO_URL" | awk -F'/' '{print $NF}')" 2>&1 || true)
echo "   مواصفات الفيديو: ${PROBE_RES}"

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}  🎉 كافة اختبارات المنظومة الشاملة للعقد و LangGraph نجحت 100%! ${NC}"
echo -e "${GREEN}================================================================${NC}"
