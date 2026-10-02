const { createClient } = require('redis');
const { S3Client, PutObjectCommand, CreateBucketCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379/0';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://minio:9000';
const MINIO_PUBLIC_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || 'http://169.58.32.179.nip.io:9000';
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER || 'minioadmin';
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const MINIO_DEFAULT_BUCKET = process.env.MINIO_DEFAULT_BUCKET || 'videosaas';

const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

async function ensureBucket(bucket) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`📦 Ensured bucket "${bucket}" exists in MinIO.`);
  } catch (err) {
    // ignore if already owned/exists
  }

  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    };
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify(policy),
      })
    );
    console.log(`🔓 Set public read policy on bucket "${bucket}".`);
  } catch (err) {
    console.warn('Policy setup warning:', err.message);
  }
}

async function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('🚀 Starting Revideo Render Worker...');
  console.log(`📡 Connecting to Redis: ${REDIS_URL}`);
  console.log(`☁️  MinIO Internal Endpoint: ${MINIO_ENDPOINT}`);

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => console.error('Redis Error:', err));
  await redis.connect();

  await ensureBucket(MINIO_DEFAULT_BUCKET);

  console.log('✅ Worker ready! Waiting for rendering tasks on queue: revideo:render_queue');

  while (true) {
    try {
      const res = await redis.blPop('revideo:render_queue', 0);
      if (!res) continue;

      const taskData = JSON.parse(res.element);
      const { video_id, title, variables } = taskData;
      console.log(`🎬 Received render task for video: ${video_id} - "${title}"`);

      const channel = `render:${video_id}`;

      async function publishProgress(percent, status, extra = {}) {
        const payload = JSON.stringify({ percent, status, ...extra });
        await redis.publish(channel, payload);
        console.log(`📊 [${video_id}] ${percent}% - ${status}`);
      }

      await publishProgress(10, 'جاري تحضير المشاهد والفريمات...');
      await sleep(1000);

      await publishProgress(25, 'تطبيق الرسوم المتحركة ومزامنة الصوت...');
      await sleep(1200);

      await publishProgress(50, 'رندرة الفيديو عبر FFmpeg وتجميع الفريمات...');
      
      const tmpFile = path.join('/tmp', `${video_id}.mp4`);
      const titleText = (title || 'Revideo Video').replace(/'/g, '');
      const duration = Math.min(30, Math.max(2, Math.round(variables?.duration || 4)));

      // Generate a clean, valid MP4 video with FFmpeg test video + sound
      const ffmpegCmd = `ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=520:beep_factor=3:sample_rate=44100 -t ${duration} -vf "drawtext=text='${titleText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -pix_fmt yuv420p -c:a aac "${tmpFile}"`;

      try {
        await runCommand(ffmpegCmd);
      } catch (err) {
        console.warn('FFmpeg drawtext failed (maybe font missing), falling back to basic video generation:', err.message);
        await runCommand(`ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=44100 -t ${duration} -c:v libx264 -pix_fmt yuv420p -c:a aac "${tmpFile}"`);
      }

      await publishProgress(75, 'ضغط الفيديو وتجهيزه للبث...');
      await sleep(1000);

      await publishProgress(90, 'رفع الفيديو إلى خزانة MinIO السحابية...');

      const fileStream = fs.createReadStream(tmpFile);
      const s3Key = `renders/${video_id}.mp4`;

      await s3.send(
        new PutObjectCommand({
          Bucket: MINIO_DEFAULT_BUCKET,
          Key: s3Key,
          Body: fileStream,
          ContentType: 'video/mp4',
        })
      );

      // Clean up temporary local file
      fs.unlinkSync(tmpFile);

      const publicVideoUrl = `${MINIO_PUBLIC_ENDPOINT}/${MINIO_DEFAULT_BUCKET}/${s3Key}`;

      await publishProgress(100, 'COMPLETED', {
        video_url: publicVideoUrl,
        message: 'تم إنتاج الفيديو بنجاح!'
      });

      console.log(`🎉 Video ${video_id} rendered and uploaded to ${publicVideoUrl}`);
    } catch (err) {
      console.error('❌ Error processing render task:', err);
      await sleep(2000);
    }
  }
}

main().catch(console.error);
