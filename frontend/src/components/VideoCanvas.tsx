import React, { useEffect, useRef } from 'react';

interface VideoCanvasProps {
  currentFrame: number;
  totalFrames: number;
  title: string;
  subtitle: string;
  primaryColor: string;
  accentColor: string;
  uploadedImageUrl?: string;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({
  currentFrame,
  totalFrames,
  title,
  subtitle,
  primaryColor,
  accentColor,
  uploadedImageUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const progress = currentFrame / totalFrames;

    // Background gradient
    const bgGrad = ctx.createRadialGradient(
      width / 2, height / 2, 50,
      width / 2, height / 2, width * 0.7
    );
    bgGrad.addColorStop(0, '#151926');
    bgGrad.addColorStop(1, '#090a0f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Grid lines for studio feel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Animated rotating procedural star/circles (Revideo style)
    const centerX = width / 2;
    const centerY = height / 2 - 20;
    const angle = progress * Math.PI * 4;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    // Glowing orbital rings
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, 90 + Math.sin(progress * Math.PI * 6) * 15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 130 + Math.cos(progress * Math.PI * 6) * 15, 0, Math.PI * 2);
    ctx.stroke();

    // Geometric Starburst lines
    const points = 8;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < points; i++) {
      const a = (i * Math.PI * 2) / points;
      const rInner = 20;
      const rOuter = 70 + Math.sin(progress * 10 + i) * 10;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
      ctx.lineTo(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
      ctx.stroke();
    }

    ctx.restore();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Render Title Text with animated enter
    const titleScale = Math.min(1, Math.max(0.6, 0.6 + progress * 0.4));
    ctx.save();
    ctx.translate(centerX, centerY + 140);
    ctx.scale(titleScale, titleScale);

    ctx.font = 'bold 36px "Cairo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    ctx.fillText(title, 0, 0);

    // Subtitle Badge
    ctx.font = '600 18px "Cairo", sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(subtitle, 0, 42);

    ctx.restore();

    // Frame counter overlay in top corner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`FRAME: ${currentFrame.toString().padStart(3, '0')} / ${totalFrames}`, width - 24, 32);
    ctx.fillText(`TIME: ${(currentFrame / 30).toFixed(2)}s @ 30 FPS`, width - 24, 52);

  }, [currentFrame, totalFrames, title, subtitle, primaryColor, accentColor, uploadedImageUrl]);

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="preview-canvas"
      />
    </div>
  );
};
