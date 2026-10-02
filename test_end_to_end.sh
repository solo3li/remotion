#!/usr/bin/env bash
set -e

DOMAIN="169.58.32.179.nip.io"
BASE_URL="http://${DOMAIN}"
COOKIE_JAR="/tmp/saas_cookies.txt"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}       اختبار المنظومة المتكاملة برمجياً (End-to-End CLI Tests)     ${NC}"
echo -e "${BLUE}================================================================${NC}"
echo -e "الهدف: ${YELLOW}${BASE_URL}${NC}\n"

# 1. اختبار توجيه Traefik للموقع التسويقي (Django MVT)
echo -e "1️⃣  [اختبار Traefik] فحص مسار الموقع التسويقي (Django MVT) على '/' ..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/")
if [ "$STATUS_CODE" -eq 200 ]; then
    echo -e "   ${GREEN}✓ نجح: المسار '/' يعيد 200 OK${NC}"
else
    echo -e "   ${RED}✗ فشل: المسار '/' أعاد ${STATUS_CODE}${NC}"
    exit 1
fi

# 2. اختبار توجيه Traefik لمحرر الفيديو (React Vite)
echo -e "\n2️⃣  [اختبار Traefik] فحص مسار المحرر (React + Vite) على '/app/' ..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/app/")
if [ "$STATUS_CODE" -eq 200 ]; then
    echo -e "   ${GREEN}✓ نجح: المسار '/app/' يعيد 200 OK${NC}"
else
    echo -e "   ${RED}✗ فشل: المسار '/app/' أعاد ${STATUS_CODE}${NC}"
    exit 1
fi

# 3. اختبار تسجيل الدخول والـ Session Cookie المشتركة
echo -e "\n3️⃣  [اختبار المصادقة] تجربة تسجيل الدخول وتخزين الـ Session Cookie ..."
LOGIN_RES=$(curl -s -c "${COOKIE_JAR}" -X POST "${BASE_URL}/api/auth/login/")
echo "   الرد: ${LOGIN_RES}"

USER_CHECK=$(curl -s -b "${COOKIE_JAR}" "${BASE_URL}/api/auth/user/")
if echo "$USER_CHECK" | grep -q '"authenticated": *true'; then
    echo -e "   ${GREEN}✓ نجح: الـ Session Cookie تعمل وتم التعرف على المستخدم بنجاح!${NC}"
else
    echo -e "   ${RED}✗ فشل: لم يتم التعرف على الجلسة: ${USER_CHECK}${NC}"
    exit 1
fi

# 4. اختبار رفع الملفات المباشر إلى MinIO عبر Presigned URL
echo -e "\n4️⃣  [اختبار MinIO S3] توليد Presigned URL ورفع ملف مباشر دون إجهاد دجانجو ..."
PRESIGNED_DATA=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/s3/presigned-url/" \
    -H "Content-Type: application/json" \
    -d '{"filename": "automated_cli_test.txt", "content_type": "text/plain"}')

PRESIGNED_URL=$(echo "$PRESIGNED_DATA" | grep -o '"presigned_url": *"[^"]*"' | cut -d'"' -f4)
FILE_URL=$(echo "$PRESIGNED_DATA" | grep -o '"file_url": *"[^"]*"' | cut -d'"' -f4)

if [ -n "$PRESIGNED_URL" ]; then
    echo -e "   تم استلام رابط الرفع المؤقت."
    UPLOAD_RES=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Content-Type: text/plain" -d "End-to-End Automated Test File Content" "$PRESIGNED_URL")
    if [ "$UPLOAD_RES" -eq 200 ]; then
        echo -e "   ${GREEN}✓ نجح: تم الرفع المباشر إلى MinIO بنجاح (HTTP 200)${NC}"
        echo -e "   رابط الملف: ${FILE_URL}"
    else
        echo -e "   ${RED}✗ فشل الرفع إلى MinIO: أعاد ${UPLOAD_RES}${NC}"
        exit 1
    fi
else
    echo -e "   ${RED}✗ فشل في توليد Presigned URL: ${PRESIGNED_DATA}${NC}"
    exit 1
fi

# 5. اختبار إطلاق رندر فيديو ومتابعة تقدم الـ SSE المباشر
echo -e "\n5️⃣  [اختبار رندر Revideo & SSE] إنشاء مهمة رندر واستقبال بث التقدم اللحظي ..."
CREATE_RES=$(curl -s -b "${COOKIE_JAR}" -X POST "${BASE_URL}/api/videos/create/" \
    -H "Content-Type: application/json" \
    -d '{"title": "فيديو الاختبار المؤتمت", "template": "cli_runner", "variables": {"brand": "AutoTest"}}')

VIDEO_ID=$(echo "$CREATE_RES" | grep -o '"video_id": *"[^"]*"' | cut -d'"' -f4)
echo -e "   معرف الفيديو المنشأ: ${YELLOW}${VIDEO_ID}${NC}"

echo -e "   بدء الاستماع للبث الحي (Server-Sent Events) عبر /events/render/${VIDEO_ID}/ ..."

# استماع للبث الحي وتتبع الخطوات
FINAL_VIDEO_URL=""
while read -r line; do
    if [[ "$line" =~ ^data: ]]; then
        DATA_JSON="${line#data: }"
        PERCENT=$(echo "$DATA_JSON" | grep -o '"percent": *[0-9]*' | grep -o '[0-9]*' || echo "")
        STATUS_MSG=$(echo "$DATA_JSON" | grep -o '"status": *"[^"]*"' | cut -d'"' -f4 || echo "")
        
        if [ -n "$PERCENT" ]; then
            echo -e "   📊 نسبة التقدم: ${YELLOW}${PERCENT}%${NC} - ${STATUS_MSG}"
        fi
        
        if [[ "$DATA_JSON" =~ \"video_url\" ]]; then
            FINAL_VIDEO_URL=$(echo "$DATA_JSON" | grep -o '"video_url": *"[^"]*"' | cut -d'"' -f4)
        fi
        
        if [ "$PERCENT" = "100" ] || [ "$STATUS_MSG" = "COMPLETED" ]; then
            break
        fi
    fi
done < <(curl -s -N "${BASE_URL}/events/render/${VIDEO_ID}/")

if [ -n "$FINAL_VIDEO_URL" ]; then
    echo -e "   ${GREEN}✓ نجح: اكتمل الرندر وتم استلام رابط الـ MP4 بنجاح!${NC}"
    echo -e "   رابط الفيديو: ${FINAL_VIDEO_URL}"
else
    echo -e "   ${RED}✗ فشل: لم يكتمل الرندر بالشكل المتوقع${NC}"
    exit 1
fi

# 6. فحص ملف الـ MP4 الحقيقي على MinIO
echo -e "\n6️⃣  [فحص ملف الفيديو النهائي] التأكد من سلامة ملف الـ MP4 على MinIO S3 ..."
VIDEO_CHECK=$(curl -s -I "$FINAL_VIDEO_URL")
if echo "$VIDEO_CHECK" | grep -q "200 OK"; then
    CONTENT_TYPE=$(echo "$VIDEO_CHECK" | grep -i "content-type" | tr -d '\r')
    CONTENT_LENGTH=$(echo "$VIDEO_CHECK" | grep -i "content-length" | tr -d '\r')
    echo -e "   ${GREEN}✓ نجح: ملف الفيديو سليم ومتاح للتحميل الفوري!${NC}"
    echo -e "   - ${CONTENT_TYPE}"
    echo -e "   - ${CONTENT_LENGTH} بايت"
else
    echo -e "   ${RED}✗ فشل: رابط الفيديو لا يعيد 200 OK${NC}"
    echo "$VIDEO_CHECK"
    exit 1
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}  🎉 كافة الاختبارات البرمجية نجحت بنسبة 100% دون أي أخطاء!     ${NC}"
echo -e "${GREEN}================================================================${NC}"
