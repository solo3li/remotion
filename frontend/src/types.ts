export type ClipType = 'text' | 'video' | 'audio' | 'shape';

export interface TimelineClip {
  id: string;
  trackId: string;
  type: ClipType;
  title: string;
  start: number;      // وقت البداية بالثواني
  duration: number;   // مدة المقطع بالثواني
  // الخصائص المرئية للكانفاس
  x: number;          // الموضع الأفقي بالنسبة للكانفاس (0 - 960)
  y: number;          // الموضع الرأسي بالنسبة للكانفاس (0 - 540)
  width: number;
  height: number;
  rotation: number;   // درجة الدوران
  opacity: number;    // الشفافية من 0 إلى 1
  // خصائص إضافية بحسب النوع
  text?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  src?: string;       // رابط الملف من MinIO
  volume?: number;    // مستوى الصوت من 0 إلى 1
  filter?: string;    // فلتر لوني (none, cinematic, vintage, grayscale)
  animation?: string; // حركة دخول (none, fadeIn, zoomIn, slideUp)
  borderRadius?: number;
  zIndex?: number;
  textAlign?: 'right' | 'center' | 'left';
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: ClipType;
  icon: string;
  isMuted?: boolean;
  isLocked?: boolean;
  volume?: number;
}

export interface ProjectSettings {
  title: string;
  duration: number;  // المدة الكلية بالثواني
  fps: number;
  width: number;
  height: number;
  bgColor: string;
}
