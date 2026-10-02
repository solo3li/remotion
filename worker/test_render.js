const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testRender() {
  const duration = 5;
  const bgColor = '#0b0e17';
  const outW = 1280;
  const outH = 720;
  const sx = outW / 960;
  const sy = outH / 540;

  const fontFile = '/usr/share/fonts/truetype/kacst-one/KacstOne-Bold.ttf';

  // Text 1
  fs.writeFileSync('/tmp/test_t1.txt', 'عرض ترويجي لمنتجنا الجديد', 'utf8');
  // Text 2
  fs.writeFileSync('/tmp/test_t2.txt', '🔥 أقوى العروض والتخفيضات الحصرية لهذا الموسم', 'utf8');

  // Filter chain
  const filters = [];
  filters.push(`color=c=${bgColor}:s=${outW}x${outH}:d=${duration}:r=30[v0]`);

  // Shape: x:200, y:150, w:560, h:230, color:#10b981@0.25
  const sxPos = Math.round(200 * sx);
  const syPos = Math.round(150 * sy);
  const sw = Math.round(560 * sx);
  const sh = Math.round(230 * sy);
  filters.push(`[v0]drawbox=x=${sxPos}:y=${syPos}:w=${sw}:h=${sh}:color=#10b981@0.25:t=fill:enable='between(t,0,5)'[v1]`);

  // Text 1
  const t1x = Math.round(240 * sx);
  const t1y = Math.round(190 * sy);
  const t1w = Math.round(480 * sx);
  const t1h = Math.round(80 * sy);
  filters.push(`[v1]drawtext=fontfile=${fontFile}:textfile=/tmp/test_t1.txt:fontsize=48:fontcolor=white:x=${t1x}+(${t1w}-text_w)/2:y=${t1y}+(${t1h}-text_h)/2:enable='between(t,0,5)'[v2]`);

  // Text 2
  const t2x = Math.round(250 * sx);
  const t2y = Math.round(290 * sy);
  const t2w = Math.round(460 * sx);
  const t2h = Math.round(60 * sy);
  filters.push(`[v2]drawtext=fontfile=${fontFile}:textfile=/tmp/test_t2.txt:fontsize=28:fontcolor=#06b6d4:x=${t2x}+(${t2w}-text_w)/2:y=${t2y}+(${t2h}-text_h)/2:enable='between(t,0.8,5)'[vout]`);

  const filterStr = filters.join(';');
  const cmd = `ffmpeg -y -f lavfi -i "${filterStr}" -f lavfi -i sine=frequency=330:sample_rate=44100 -map "[vout]" -map 1:a -t ${duration} -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/test_timeline_render.mp4`;

  console.log('Running test render command...');
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Render failed:', err);
      console.error(stderr);
      process.exit(1);
    }
    console.log('Success! Output generated at /tmp/test_timeline_render.mp4');
    const stats = fs.statSync('/tmp/test_timeline_render.mp4');
    console.log(`Size: ${stats.size} bytes`);
  });
}

testRender();
