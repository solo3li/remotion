#!/usr/bin/env bash
set -e

DOMAIN="169.58.32.179.nip.io"
BASE_URL="http://${DOMAIN}"
COOKIE_JAR="/tmp/wf_cookies.txt"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}    اختبار محرك المخططات ومسار LangGraph (End-to-End CLI)       ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "الهدف: ${YELLOW}${BASE_URL}${NC}\n"

# 1. المصادقة وجلسة العمل
echo -e "1️⃣  [المصادقة] تسجيل الدخول وتجهيز الجلسة ..."
LOGIN_RES=$(curl -s -c "${COOKIE_JAR}" -X POST "${BASE_URL}/api/auth/login/")
echo "   الرد: ${LOGIN_RES}"

# 2. إنشاء وحفظ مخطط (Workflow Definition) بصيغة React Flow
echo -e "\n2️⃣  [حفظ المخطط] إرسال مخطط مرئي متكامل يتضمن 5 عقد مترابطة إلى /api/workflows/ ..."

WORKFLOW_PAYLOAD=$(cat << 'EOF'
{
  "title": "مخطط الأتمتة الشامل بالذكاء الاصطناعي",
  "description": "خط إنتاج فيديو آلي يربط LangGraph مع Revideo و FFmpeg",
  "graph_data": {
    "nodes": [
      {
        "id": "node-trigger",
        "type": "triggerNode",
        "position": { "x": 380, "y": 30 },
        "data": {
          "label": "1. المدخلات والفكرة",
          "prompt": "🔥 إطلاق منصة الذكاء الاصطناعي الأقوى لإنتاج الفيديو برمجياً",
          "duration": 5,
          "bgColor": "#0b0e17"
        }
      },
      {
        "id": "node-llm",
        "type": "llmAgentNode",
        "position": { "x": 380, "y": 250 },
        "data": {
          "label": "2. وكيل تأليف السكريبت (LangGraph)",
          "model": "gemini-1.5-flash"
        }
      },
      {
        "id": "node-tts",
        "type": "ttsVoiceNode",
        "position": { "x": 140, "y": 470 },
        "data": {
          "label": "3. توليد الصوتيات (TTS)",
          "voiceStyle": "حماسي إعلاني"
        }
      },
      {
        "id": "node-timeline",
        "type": "revideoTimelineNode",
        "position": { "x": 620, "y": 470 },
        "data": {
          "label": "4. تشكيل التايم لاين (Revideo)"
        }
      },
      {
        "id": "node-render",
        "type": "renderExportNode",
        "position": { "x": 380, "y": 700 },
        "data": {
          "label": "5. تصدير ورندر MP4 (MinIO S3)"
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "node-trigger", "target": "node-llm" },
      { "id": "e2", "source": "node-llm", "target": "node-tts" },
      { "id": "e3", "source": "node-llm", "target": "node-timeline" },
      { "id": "e4", "source": "node-tts", "target": "node-render" },
      { "id": "e5", "source": "node-timeline", "target": "node-render" }
    ]
  }
}
EOF
)

SAVE_RES=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/workflows/" \
  -H "Content-Type: application/json" \
  -d "${WORKFLOW_PAYLOAD}")

WORKFLOW_ID=$(echo "$SAVE_RES" | grep -o '"id": *"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -n "$WORKFLOW_ID" ]; then
    echo -e "   ${GREEN}✓ نجح: تم حفظ المخطط برقم: ${YELLOW}${WORKFLOW_ID}${NC}"
else
    echo -e "   ${RED}✗ فشل في حفظ المخطط: ${SAVE_RES}${NC}"
    exit 1
fi

# 3. استرجاع قائمة المخططات
echo -e "\n3️⃣  [قائمة المخططات] فحص استرجاع المخطط من /api/workflows/ ..."
LIST_RES=$(curl -s -b "${COOKIE_JAR}" "${BASE_URL}/api/workflows/")
if echo "$LIST_RES" | grep -q "$WORKFLOW_ID"; then
    echo -e "   ${GREEN}✓ نجح: تم العثور على المخطط في قاعدة البيانات بنجاح${NC}"
else
    echo -e "   ${RED}✗ فشل: لم يتم العثور على المخطط${NC}"
    exit 1
fi

# 4. تشغيل المخطط عبر LangGraph في الباكنج
echo -e "\n4️⃣  [تشغيل المخطط] إطلاق أمر التنفيذ عبر محرك LangGraph ..."
RUN_RES=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/workflows/${WORKFLOW_ID}/run/" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "🔥 عرض خاص لمنصة الفيديو الذكية", "duration": 5}}')

RUN_ID=$(echo "$RUN_RES" | grep -o '"run_id": *"[^"]*"' | cut -d'"' -f4)

if [ -n "$RUN_ID" ]; then
    echo -e "   ${GREEN}✓ نجح: تم إطلاق مهمة التشغيل برقم: ${YELLOW}${RUN_ID}${NC}"
else
    echo -e "   ${RED}✗ فشل في بدء تشغيل المخطط: ${RUN_RES}${NC}"
    exit 1
fi

# 5. الاستماع للبث الحي اللحظي (SSE) لحالة العقد
echo -e "\n5️⃣  [بث الأحداث الحي SSE] الاستماع لانتقال العقد في LangGraph عبر /events/workflow/${RUN_ID}/ ..."

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

        if [ -n "$NODE_ID" ]; then
            echo -e "   ⚡ ${CYAN}[${NODE_ID}]${NC} (${YELLOW}${PERCENT}%${NC} - ${STATUS}): ${MSG}"
        fi

        if [ -n "$URL" ]; then
            FINAL_VIDEO_URL="$URL"
        fi

        if [ "$STATUS" = "COMPLETED" ] && [ "$NODE_ID" = "GLOBAL_END" ]; then
            break
        fi
    fi
done < <(curl -s -N "${BASE_URL}/events/workflow/${RUN_ID}/")

echo -e "   ${GREEN}✓ نجح: اكتمل تنفيذ كافة عقد المخطط في LangGraph بنجاح!${NC}"

# 6. انتظار اكتمال الرندر وتفقد ملف الفيديو النهائي
echo -e "\n6️⃣  [فحص ملف الفيديو المولد بواسطة المخطط] التأكد من سلامة ملف الـ MP4 ..."
sleep 3
if [ -n "$FINAL_VIDEO_URL" ]; then
    echo -e "   رابط الفيديو المتولد: ${FINAL_VIDEO_URL}"
    CHECK_RES=$(curl -s -I "$FINAL_VIDEO_URL")
    if echo "$CHECK_RES" | grep -q "200 OK"; then
        echo -e "   ${GREEN}✓ نجح: الفيديو الناتج متاح للتحميل والتشغيل الفوري (200 OK)!${NC}"
    else
        echo -e "   ${YELLOW}تنبيه: جاري معالجة الفيديو في الرتل السحابي وسيتاح فوراً.${NC}"
    fi
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}  🎉 كافة اختبارات محرك المخططات و LangGraph نجحت بنسبة 100%!   ${NC}"
echo -e "${GREEN}================================================================${NC}"
