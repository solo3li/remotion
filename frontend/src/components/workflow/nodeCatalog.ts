export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  categoryLabel: string;
  categoryColor: string;
  icon: string;
  description: string;
  defaultData: Record<string, any>;
  hasInput?: boolean;
  hasOutput?: boolean;
  handles?: {
    inputs?: { id: string; label: string; color: string }[];
    outputs?: { id: string; label: string; color: string }[];
  };
}

export type NodeCategory =
  | 'triggers'
  | 'ai_agents'
  | 'tools_code'
  | 'rag_knowledge'
  | 'cloud_media'
  | 'audio_voice'
  | 'flow_logic'
  | 'storage_data'
  | 'publishing'
  | 'revideo_nle';

export interface CategoryMeta {
  id: NodeCategory;
  name: string;
  icon: string;
  color: string;
  badge: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'triggers', name: 'المدخلات والمشغلات', icon: 'Zap', color: '#f59e0b', badge: 'Triggers' },
  { id: 'ai_agents', name: 'وكلاء الذكاء (LLMs)', icon: 'Bot', color: '#8b5cf6', badge: 'AI & Agents' },
  { id: 'tools_code', name: 'البحث والإنترنت والكود', icon: 'Terminal', color: '#06b6d4', badge: 'Tools & Code' },
  { id: 'rag_knowledge', name: 'المستندات والـ RAG', icon: 'BookOpen', color: '#10b981', badge: 'Knowledge & RAG' },
  { id: 'cloud_media', name: 'الميديا التوليدية السحابية', icon: 'Sparkles', color: '#ec4899', badge: 'Cloud Media' },
  { id: 'audio_voice', name: 'الصوتيات والكلام', icon: 'Mic', color: '#f97316', badge: 'Speech & Audio' },
  { id: 'flow_logic', name: 'المنطق والتحكم بالتدفق', icon: 'GitBranch', color: '#6366f1', badge: 'Logic & Flow' },
  { id: 'storage_data', name: 'قواعد البيانات والتخزين', icon: 'Database', color: '#14b8a6', badge: 'Data & Storage' },
  { id: 'publishing', name: 'النشر والتكامل الخارجي', icon: 'Share2', color: '#3b82f6', badge: 'Publishing' },
  { id: 'revideo_nle', name: 'استوديو المونتاج والتايم لاين', icon: 'Film', color: '#ef4444', badge: 'Revideo NLE' },
];

export const ALL_NODES: NodeDefinition[] = [
  // 1. TRIGGERS
  {
    type: 'triggerNode',
    label: '1. المدخلات والفكرة (Prompt Trigger)',
    category: 'triggers',
    categoryLabel: 'مشغلات',
    categoryColor: '#f59e0b',
    icon: 'Zap',
    description: 'نقطة الانطلاق اليدوية: استقبال فكرة الفيديو، الموضوع، والإعدادات.',
    hasInput: false,
    hasOutput: true,
    defaultData: {
      label: 'المدخلات والفكرة',
      prompt: 'إعلان ترويجي لمنتج ذكي مع خصم حصري',
      duration: 5,
      bgColor: '#080a0f',
    },
  },
  {
    type: 'webhookTrigger',
    label: 'مشغل الويب هوك (Webhook Trigger)',
    category: 'triggers',
    categoryLabel: 'مشغلات',
    categoryColor: '#f59e0b',
    icon: 'Globe',
    description: 'تشغيل المخطط فوراً عند استقبال طلب POST من أي نظام خارجي (Stripe, Shopify).',
    hasInput: false,
    hasOutput: true,
    defaultData: {
      label: 'Webhook Trigger',
      endpoint: '/api/v1/webhook/incoming',
      authRequired: true,
    },
  },
  {
    type: 'scheduleTrigger',
    label: 'مشغل الجدولة الزمنية (Cron Schedule)',
    category: 'triggers',
    categoryLabel: 'مشغلات',
    categoryColor: '#f59e0b',
    icon: 'Clock',
    description: 'تشغيل المخطط في أوقات مجدولة تلقائياً (يومياً، أسبوعياً، أو كل ساعة).',
    hasInput: false,
    hasOutput: true,
    defaultData: {
      label: 'جدولة يومية 9:00 ص',
      cronExpression: '0 9 * * *',
    },
  },
  {
    type: 'fileUploadNode',
    label: 'رفع المستندات والوسائط (File Upload)',
    category: 'triggers',
    categoryLabel: 'مشغلات',
    categoryColor: '#f59e0b',
    icon: 'UploadCloud',
    description: 'استقبال ملفات PDF أو مقاطع صوتية أو صور لمعالجتها في المخطط.',
    hasInput: false,
    hasOutput: true,
    defaultData: {
      label: 'رفع ملفات المشروع',
      allowedTypes: 'pdf,docx,mp4,mp3,jpg',
    },
  },

  // 2. AI AGENTS & LLMs
  {
    type: 'llmAgentNode',
    label: 'وكيل تأليف السكريبت (Gemini Script Agent)',
    category: 'ai_agents',
    categoryLabel: 'ذكاء اصطناعي',
    categoryColor: '#8b5cf6',
    icon: 'Bot',
    description: 'وكيل ذكي مخصص لتحليل الفكرة وكتابة سكريبت إعلاني مقسم لمشاهد بصرية.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'وكيل السكريبت (Gemini)',
      model: 'gemini-1.5-flash',
      role: 'مؤلف إعلاني محترف',
    },
  },
  {
    type: 'universalLlmNode',
    label: 'نموذج لغوي شامل (Universal LLM)',
    category: 'ai_agents',
    categoryLabel: 'ذكاء اصطناعي',
    categoryColor: '#8b5cf6',
    icon: 'Brain',
    description: 'استدعاء سحابي لأي نموذج ذكاء اصطناعي (Gemini 1.5 Pro, GPT-4o, Claude 3.5 Sonnet).',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'Universal LLM',
      model: 'gemini-1.5-pro',
      temperature: 0.7,
      systemPrompt: 'أنت مساعد ذكاء اصطناعي خبير ومحلل نصوص متقدم.',
    },
  },
  {
    type: 'multiAgentSwarmNode',
    label: 'فريق وكلاء متعاون (Multi-Agent Swarm)',
    category: 'ai_agents',
    categoryLabel: 'ذكاء اصطناعي',
    categoryColor: '#8b5cf6',
    icon: 'Users',
    description: 'تنسيق العمل بين وكيل باحث، وكيل كاتب، ووكيل مراجع ومصحح في LangGraph.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'فريق الوكلاء الذكي',
      agents: ['Researcher', 'Copywriter', 'Critic'],
    },
  },
  {
    type: 'structuredJsonNode',
    label: 'مستخرج البيانات المهيكلة (Structured JSON)',
    category: 'ai_agents',
    categoryLabel: 'ذكاء اصطناعي',
    categoryColor: '#8b5cf6',
    icon: 'FileJson',
    description: 'إجبار النموذج على إنتاج بيانات JSON خاضعة لمخطط محدد (Schema) بدقة 100%.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'مستخرج الـ JSON',
      schemaFormat: 'title, scenes, callToAction',
    },
  },

  // 3. TOOLS, WEB & CODE
  {
    type: 'webSearchNode',
    label: 'البحث المباشر في الويب (Web Search)',
    category: 'tools_code',
    categoryLabel: 'أدوات وإنترنت',
    categoryColor: '#06b6d4',
    icon: 'Search',
    description: 'جلب أحدث الأخبار والمعلومات الحية من Google Search للإثراء المعرفي.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'محرك بحث الويب',
      maxResults: 3,
      searchEngine: 'Google Search API',
    },
  },
  {
    type: 'webScraperNode',
    label: 'استخراج محتوى المواقع (Web Scraper)',
    category: 'tools_code',
    categoryLabel: 'أدوات وإنترنت',
    categoryColor: '#06b6d4',
    icon: 'Globe',
    description: 'سحب النصوص المقالية من أي رابط إنترنت وتنظيفها وتلخيصها.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'قارئ ومحلل الروابط',
      targetUrl: 'https://example.com',
    },
  },
  {
    type: 'codeSandboxNode',
    label: 'تشغيل كود بايثون آمن (Python Sandbox)',
    category: 'tools_code',
    categoryLabel: 'أدوات وإنترنت',
    categoryColor: '#06b6d4',
    icon: 'Code2',
    description: 'تنفيذ كود Python أو JS مخصص لمعالجة البيانات أو العمليات الحسابية بأمان.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'بيئة بايثون السحابية',
      codeSnippet: '# معالجة أو فرز البيانات الممرة\noutput = input_text.strip().title()',
    },
  },
  {
    type: 'httpRequestNode',
    label: 'استدعاء API خارجي (HTTP Request)',
    category: 'tools_code',
    categoryLabel: 'أدوات وإنترنت',
    categoryColor: '#06b6d4',
    icon: 'Send',
    description: 'إرسال واستقبال طلبات RESTful (GET / POST) لأي خادم أو خدمة سحابية.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'HTTP Request API',
      method: 'POST',
      url: 'https://api.example.com/data',
    },
  },

  // 4. RAG & KNOWLEDGE
  {
    type: 'docParserNode',
    label: 'تقطيع وفهرسة المستندات (Doc Parser)',
    category: 'rag_knowledge',
    categoryLabel: 'مستندات و RAG',
    categoryColor: '#10b981',
    icon: 'FileText',
    description: 'تجزئة المستندات الطويلة إلى مقاطع ذكية (Chunks) لحفظها في قواعد المتجهات.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'محلل المستندات والفقرات',
      chunkSize: 500,
      chunkOverlap: 50,
    },
  },
  {
    type: 'vectorSearchNode',
    label: 'البحث الدلالي الذكي (Vector Retriever)',
    category: 'rag_knowledge',
    categoryLabel: 'مستندات و RAG',
    categoryColor: '#10b981',
    icon: 'Database',
    description: 'استرجاع الفقرات الأكثر صلة بسؤال المستخدم من قاعدة بيانات المتجهات.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'مسترجع المعرفة الدلالي',
      collection: 'knowledge_base',
      topK: 4,
    },
  },

  // 5. CLOUD GENERATIVE MEDIA (ComfyUI Cloud Style)
  {
    type: 'textToImageNode',
    label: 'توليد الصور السحابي (Cloud Text-to-Image)',
    category: 'cloud_media',
    categoryLabel: 'ميديا سحابية',
    categoryColor: '#ec4899',
    icon: 'Sparkles',
    description: 'توليد صور واقعية وفنية فائقة الدقة عبر Google Imagen 3 أو Flux Cloud API.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'توليد الصور (Imagen 3)',
      aspectRatio: '16:9',
      stylePreset: 'cinematic',
    },
  },
  {
    type: 'imageToVideoNode',
    label: 'تحريك الصور لفيديو (Cloud Image-to-Video)',
    category: 'cloud_media',
    categoryLabel: 'ميديا سحابية',
    categoryColor: '#ec4899',
    icon: 'Video',
    description: 'تحويل الصورة الثابتة إلى مقطع فيديو سينمائي متحرك (Wan 2.1 / Kling عبر السحاب).',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'تحريك الصورة لفيديو سينمائي',
      motionStrength: 'medium',
      durationSeconds: 4,
    },
  },
  {
    type: 'visionAnalysisNode',
    label: 'تحليل الصور والميديا (Gemini Vision OCR)',
    category: 'cloud_media',
    categoryLabel: 'ميديا سحابية',
    categoryColor: '#ec4899',
    icon: 'Eye',
    description: 'قراءة النصوص واستخراج تفاصيل الألوان والعناصر البصرية من أي صورة.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'محلل الرؤية البصرية',
      task: 'وصف بصري واستخراج نصوص',
    },
  },
  {
    type: 'backgroundRemoverNode',
    label: 'عزل وتفريغ الخلفية (Cloud RemBG)',
    category: 'cloud_media',
    categoryLabel: 'ميديا سحابية',
    categoryColor: '#ec4899',
    icon: 'Scissors',
    description: 'إزالة خلفية صور المنتجات والأشخاص لدمجها كطبقة شفافة فوق الفيديو.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'عازل الخلفيات التلقائي',
      outputFormat: 'png_transparent',
    },
  },

  // 6. AUDIO & SPEECH
  {
    type: 'ttsVoiceNode',
    label: 'التعليق الصوتي البشري (ElevenLabs / Gemini TTS)',
    category: 'audio_voice',
    categoryLabel: 'صوتيات',
    categoryColor: '#f97316',
    icon: 'Mic',
    description: 'تحويل نص السكريبت إلى تعليق صوتي واقعي بنبرة احترافية وطبيعية.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'توليد الصوت البشري',
      voiceStyle: 'حماسي إعلاني',
      engine: 'ElevenLabs / Gemini Audio',
    },
  },
  {
    type: 'speechToTextNode',
    label: 'تفريغ الصوت لنص (Whisper Cloud STT)',
    category: 'audio_voice',
    categoryLabel: 'صوتيات',
    categoryColor: '#f97316',
    icon: 'AudioWaveform',
    description: 'تحويل التسجيلات الصوتية ومقاطع الفيديو إلى نصوص دقيقة مع طوابع زمنية.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'مفرغ الصوتيات (Whisper)',
      language: 'ar',
    },
  },
  {
    type: 'bgmSelectorNode',
    label: 'موسيقى الخلفية الذكية (Smart BGM)',
    category: 'audio_voice',
    categoryLabel: 'صوتيات',
    categoryColor: '#f97316',
    icon: 'Music',
    description: 'اختيار مقطوعة موسيقية مرخصة متناغمة مع المشاعر والرسالة الإعلانية.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'موسيقى الخلفية التصويرية',
      mood: 'inspiring_upbeat',
      volume: 0.35,
    },
  },

  // 7. FLOW LOGIC & CONTROL
  {
    type: 'conditionIfElseNode',
    label: 'الشرط والتوجيه (Condition If/Else)',
    category: 'flow_logic',
    categoryLabel: 'منطق وتحكم',
    categoryColor: '#6366f1',
    icon: 'GitBranch',
    description: 'توجيه مسار التنفيذ بناءً على تحقق شرط معين (مثل نوع المنصة أو لغة المحتوى).',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'شرط توجيه التدفق',
      conditionKey: 'platform',
      conditionValue: 'tiktok',
    },
  },
  {
    type: 'mergeJoinNode',
    label: 'دمج المسارات المتوازية (Merge & Join)',
    category: 'flow_logic',
    categoryLabel: 'منطق وتحكم',
    categoryColor: '#6366f1',
    icon: 'Merge',
    description: 'انتظار اكتمال عدة مسارات متفرعة وتجميع مخرجاتها في حزمة واحدة.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'جامع المخرجات المتوازية',
    },
  },

  // 8. STORAGE & DATA
  {
    type: 's3StorageNode',
    label: 'التخزين السحابي (MinIO S3 Bucket)',
    category: 'storage_data',
    categoryLabel: 'تخزين وقواعد بيانات',
    categoryColor: '#14b8a6',
    icon: 'HardDrive',
    description: 'حفظ وتخزين المقاطع الناتجة والملفات في باكتات MinIO S3 السحابية بأمان.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'تخزين MinIO S3',
      bucketName: 'videosaas',
    },
  },
  {
    type: 'sqlDatabaseNode',
    label: 'استعلام قاعدة البيانات (SQL Database)',
    category: 'storage_data',
    categoryLabel: 'تخزين وقواعد بيانات',
    categoryColor: '#14b8a6',
    icon: 'Database',
    description: 'حفظ سجلات العمليات أو جلب بيانات المنتجات والعملاء من قاعدة البيانات.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'سجلات قاعدة البيانات',
      table: 'campaign_results',
    },
  },

  // 9. PUBLISHING & INTEGRATIONS
  {
    type: 'notificationAlertNode',
    label: 'إشعار تليجرام / ديسكورد (Telegram/Discord Alert)',
    category: 'publishing',
    categoryLabel: 'نشر وتكامل',
    categoryColor: '#3b82f6',
    icon: 'Bell',
    description: 'إرسال تنبيه أو رابط الفيديو النهائي تلقائياً إلى بوت تليجرام أو روم ديسكورد.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'إشعار تليجرام اللحظي',
      channelType: 'telegram',
      channelId: '@my_alerts_channel',
    },
  },
  {
    type: 'socialPublisherNode',
    label: 'ناشر السوشيال ميديا (Social Auto-Publisher)',
    category: 'publishing',
    categoryLabel: 'نشر وتكامل',
    categoryColor: '#3b82f6',
    icon: 'Share2',
    description: 'تجهيز المنشور، الوصف والهاشتاجات وجدولة نشره على YouTube أو TikTok.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'ناشر السوشيال ميديا',
      targetPlatform: 'youtube_shorts',
    },
  },

  // 10. REVIDEO NLE STUDIO NODES
  {
    type: 'revideoTimelineNode',
    label: 'تشكيل التايم لاين (Revideo Timeline)',
    category: 'revideo_nle',
    categoryLabel: 'مونتاج Revideo',
    categoryColor: '#ef4444',
    icon: 'Layers',
    description: 'تجميع مشاهد الفيديو، النصوص، الأشكال والصوتيات في مسارات تايم لاين متزامنة.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'تشكيل التايم لاين (Revideo)',
    },
  },
  {
    type: 'autoSubtitlesNode',
    label: 'الترجمة التلقائية المتحركة (Auto Animated Captions)',
    category: 'revideo_nle',
    categoryLabel: 'مونتاج Revideo',
    categoryColor: '#ef4444',
    icon: 'Subtitles',
    description: 'توليد خطوط ترجمة متحركة كلمة بكلمة بستايل هورموزي / تيك توك تلقائياً.',
    hasInput: true,
    hasOutput: true,
    defaultData: {
      label: 'ترجمة متحركة (TikTok Style)',
      stylePreset: 'glow_yellow',
      highlightColor: '#facc15',
    },
  },
  {
    type: 'renderExportNode',
    label: 'تصدير ورندر MP4 (FFmpeg Render Queue)',
    category: 'revideo_nle',
    categoryLabel: 'مونتاج Revideo',
    categoryColor: '#ef4444',
    icon: 'PlayCircle',
    description: 'إرسال مشروع التايم لاين إلى رتل معالجة FFmpeg السحابي لإنتاج ملف MP4 نهائي.',
    hasInput: true,
    hasOutput: false,
    defaultData: {
      label: 'تصدير ورندر MP4 (MinIO)',
    },
  },
];
