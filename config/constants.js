// ============================================================
// 📄 config/constants.js
// الثوابت العامة: أسماء السور، ألوان، رسائل، الشيوخ، الحالات... إلخ
// القيم الحساسة (CLIENT_ID وغيره) بتيجي من ملف .env مش من هنا.
// ============================================================

/**
 * constants.js - الثوابت العامة للبوت
 * جميع القيم الثابتة التي تستخدم في جميع أنحاء البوت
 */

module.exports = {
  // ============ Discord ============
  // دي كلها بتيجي من ملف .env بتاعك (شوف .env.example)
  CLIENT_ID: process.env.CLIENT_ID || '',              // الـ Application ID بتاع البوت (بيتستخدم في رابط الدعوة)
  ALLOWED_GUILD_ID: process.env.ALLOWED_GUILD_ID || null, // لو عايز البوت يشتغل على سيرفر واحد بس
  BOT_LOGO_URL: process.env.BOT_LOGO_URL || '',        // لينك لوجو البوت (اختياري)
  PANEL_BANNER_URL: process.env.PANEL_BANNER_URL || '', // لينك صورة كبيرة تحت لوحة التحكم (اختياري)

  // ============ Join Log ============
  // الروم اللي بيتبعتله embed لما البوت يدخل سيرفر جديد، وبيتعدل بعدين
  // لما حد يستخدم /setup (شوف utils/joinLogPanel.js)
  JOIN_LOG_CHANNEL_ID: process.env.JOIN_LOG_CHANNEL_ID || null, // اختياري: سيبه فاضي لو مش عايز لوج
  
  // ============ API (للموقع فقط - اختياري) ============
  API_PORT: 9456,
  API_HOST: '0.0.0.0',
  
  // ============ Voice ============
  MAX_RECONNECTION_ATTEMPTS: 5,
  RECONNECTION_DELAYS: [2000, 3000, 5000, 8000, 10000],
  VOICE_KEEP_ALIVE_INTERVAL: 30000,
  VOICE_CONNECTION_TIMEOUT: 15000,
  
  // ============ Prayer ============
  FORTY_MINUTES: 40 * 60 * 1000,
  PRAYER_CACHE_DURATION: 24 * 60 * 60 * 1000,
  PRAYER_FETCH_TIMEOUT: 10000,
  PRAYER_MAX_RETRIES: 3,
  
  // ============ Notice ============
  NOTICE_MIN_DELAY: 3 * 60 * 60 * 1000,  // 3 ساعات
  NOTICE_MAX_DELAY: 13 * 60 * 60 * 1000, // 13 ساعة
  
  // ============ Quran ============
  TOTAL_SURAH_COUNT: 114,
  AUDIO_DOWNLOAD_TIMEOUT: 45000,
  AUDIO_MAX_RETRIES: 3,
  
  // ============ Azkar ============
  AZKAR_INTERVAL: 30 * 60 * 1000, // 30 دقيقة
  
  // ============ Cache ============
  CACHE_MAX_SIZE: 1000,
  CACHE_CLEANUP_INTERVAL: 60000, // 1 دقيقة
  
  // ============ Paths ============
  PATHS: {
    RECITERS: './data/reciters',
    QURAN_DATA: './data/quran_data.json',
    AZKAR: './data/azkar.json',
    SETTINGS: './data/guild_settings.json',
    STATES: './data/guild_states.json',
    STATS: './data/stats.json',
    QUESTIONS: './data/questions.json',
    CONTROL_MESSAGES: './data/control_messages.json',
    PRAYER_MESSAGES: './data/prayer_messages.json',
    NOTICE_MESSAGES: './data/notice_messages.json',
    LOGS: './logs'
  },
  
  // ============ Embed Colors ============
  COLORS: {
    PRIMARY: '#9E7B4F',
    SUCCESS: '#00FF00',
    ERROR: '#FF0000',
    WARNING: '#FFA500',
    INFO: '#2E7D32',
    GOLD: '#D4AF37',
    DARK: '#0a0e1a',
    PRAYER: '#9E7B4F',
    QURAN: '#C9A46A',
    NOTICE: '#D4AF37'
  },
  
  // ============ Status Messages ============
  STATUSES: [
    { name: '📖 القرآن الكريم | استمع وتدبر', type: 2 },
    { name: '🕌 مواقيت الصلاة', type: 2 },
    { name: '🎙 إذاعة القرآن', type: 2 },
    { name: '📿 أذكار وأدعية', type: 2 }
  ],
  
  // ============ Reciters IDs ============
  RECITER_IDS: {
    s_gmd: 's_gmd',
    AFS: 'afs',
    AHMAD_NU: 'ahmad_nu',
    HUSARY: 'husary',
    MINSHAWI: 'minshawi',
    basit: 'basit',
    BUKHEET: 'bukheet',
    HAMZA: 'hamza',
    MAHER: 'maher',
    MUSTAFA: 'mustafa',
    QTM: 'qtm',
    SUDAIS: 'sudais',
    TAREQ: 'tareq',
    DOSRY: 'dosry'
  },

  // ============ Reciter Emojis (Discord Custom Emoji IDs) ============
  RECITER_EMOJIS: {
    // سيبها فاضية. إيموجي كل شيخ بيتحط في ملف الشيخ نفسه (data/reciters/<الشيخ>.json) في خانة "emoji"
  },

  // ============ Reciters Info ============
  RECITERS_INFO: {
    's_gmd': {
      name: 'سعد الغامدي',
      fullName: 'الشيخ سعد الغامدي',
      country: 'مصر',
      style: 'مرتل ومجود',
      baseUrl: 'https://server7.mp3quran.net/basit/'
    },
    'afs': {
      name: 'مشاري العفاسي',
      fullName: 'الشيخ مشاري راشد العفاسي',
      country: 'الكويت',
      style: 'مرتل',
      baseUrl: 'https://server8.mp3quran.net/afs/'
    },
    'ahmad_nu': {
      name: 'أحمد نعينع',
      fullName: 'الشيخ أحمد نعينع',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server11.mp3quran.net/ahmad_nu/'
    },
    'husary': {
      name: 'محمود الحصري',
      fullName: 'الشيخ محمود خليل الحصري',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server13.mp3quran.net/husr/'
    },
    'minshawi': {
      name: 'محمد صديق المنشاوي',
      fullName: 'الشيخ محمد صديق المنشاوي',
      country: 'مصر',
      style: 'مرتل ومجود',
      baseUrl: 'https://server10.mp3quran.net/minsh/'
    },
    'basit': {
      name: 'عبد الباسط عبد الصمد',
      fullName: 'الشيخ عبد الباسط عبد الصمد',
      country: 'مصر',
      style: 'مرتل ومجود',
      baseUrl: 'https://server7.mp3quran.net/basit/'
    },
    'bukheet': {
      name: 'محمد البخيت',
      fullName: 'الشيخ محمد البخيت',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server14.mp3quran.net/bukheet/'
    },
    'hamza': {
      name: 'داود حمزة',
      fullName: 'الشيخ داود حمزة',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server9.mp3quran.net/hamza/'
    },
    'maher': {
      name: 'ماهر المعيقلي',
      fullName: 'الشيخ ماهر بن حمد المعيقلي',
      country: 'السعودية',
      style: 'مرتل',
      baseUrl: 'https://server12.mp3quran.net/maher/'
    },
    'mustafa': {
      name: 'مصطفى إسماعيل',
      fullName: 'الشيخ مصطفى إسماعيل',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server8.mp3quran.net/mustafa/'
    },
    'qtm': {
      name: 'ناصر القطامي',
      fullName: 'الشيخ ناصر بن علي القطامي',
      country: 'الكويت',
      style: 'مرتل',
      baseUrl: 'https://server6.mp3quran.net/qtm/'
    },
    'sudais': {
      name: 'عبد الرحمن السديس',
      fullName: 'الشيخ عبد الرحمن بن عبد العزيز السديس',
      country: 'السعودية',
      style: 'مرتل',
      baseUrl: 'https://server11.mp3quran.net/sds/'
    },
    'tareq': {
      name: 'طارق عبدالغني دعوب',
      fullName: 'الشيخ طارق عبدالغني دعوب',
      country: 'مصر',
      style: 'مرتل',
      baseUrl: 'https://server10.mp3quran.net/tareq/'
    },
    'dosry': {
      name: 'ياسر الدوسري',
      fullName: 'الشيخ ياسر بن راشد الدوسري',
      country: 'السعودية',
      style: 'مرتل',
      baseUrl: 'https://server11.mp3quran.net/yasser/'
    }
  },

  // ============ Countries List ============
  COUNTRIES: [
    { label: '🇪🇬 مصر (القاهرة)', city: 'Cairo', country: 'Egypt', method: 5 },
    { label: '🇸🇦 السعودية (مكة)', city: 'Mecca', country: 'Saudi Arabia', method: 5 },
    { label: '🇯🇴 الأردن (عمّان)', city: 'Amman', country: 'Jordan', method: 5 },
    { label: '🇸🇾 سوريا (دمشق)', city: 'Damascus', country: 'Syria', method: 5 },
    { label: '🇵🇸 فلسطين (القدس)', city: 'Jerusalem', country: 'Palestine', method: 5 },
    { label: '🇩🇿 الجزائر (الجزائر)', city: 'Algiers', country: 'Algeria', method: 5 },
    { label: '🇲🇦 المغرب (الرباط)', city: 'Rabat', country: 'Morocco', method: 5 },
    { label: '🇦🇪 الإمارات (دبي)', city: 'Dubai', country: 'UAE', method: 5 },
    { label: '🇰🇼 الكويت (الكويت)', city: 'Kuwait City', country: 'Kuwait', method: 5 },
    { label: '🇶🇦 قطر (الدوحة)', city: 'Doha', country: 'Qatar', method: 5 },
    { label: '🇧🇭 البحرين (المنامة)', city: 'Manama', country: 'Bahrain', method: 5 },
    { label: '🇴🇲 عمان (مسقط)', city: 'Muscat', country: 'Oman', method: 5 },
    { label: '🇱🇾 ليبيا (طرابلس)', city: 'Tripoli', country: 'Libya', method: 5 },
    { label: '🇹🇳 تونس (تونس)', city: 'Tunis', country: 'Tunisia', method: 5 },
    { label: '🇸🇩 السودان (الخرطوم)', city: 'Khartoum', country: 'Sudan', method: 5 },
    { label: '🇮🇶 العراق (بغداد)', city: 'Baghdad', country: 'Iraq', method: 5 },
    { label: '🇾🇪 اليمن (صنعاء)', city: 'Sanaa', country: 'Yemen', method: 5 },
    { label: '🇹🇷 تركيا (إسطنبول)', city: 'Istanbul', country: 'Turkey', method: 5 },
    { label: '🇮🇷 إيران (طهران)', city: 'Tehran', country: 'Iran', method: 5 },
    { label: '🇵🇰 باكستان (إسلام آباد)', city: 'Islamabad', country: 'Pakistan', method: 5 },
    { label: '🇮🇳 الهند (نيودلهي)', city: 'New Delhi', country: 'India', method: 5 },
    { label: '🇧🇩 بنغلاديش (دكا)', city: 'Dhaka', country: 'Bangladesh', method: 5 },
    { label: '🇲🇾 ماليزيا (كوالالمبور)', city: 'Kuala Lumpur', country: 'Malaysia', method: 5 },
    { label: '🇮🇩 إندونيسيا (جاكرتا)', city: 'Jakarta', country: 'Indonesia', method: 5 }
  ],
  
  // ============ Prayer Methods ============
  PRAYER_METHODS: {
    DEFAULT: 5,
    EGYPT: 5,
    SAUDI: 5,
    UAE: 5,
    QATAR: 5,
    KUWAIT: 5,
    BAHRAIN: 5,
    OMAN: 5,
    JORDAN: 5,
    SYRIA: 5,
    PALESTINE: 5,
    IRAQ: 5,
    YEMEN: 5,
    TURKEY: 5,
    IRAN: 5,
    PAKISTAN: 5,
    INDIA: 5,
    BANGLADESH: 5,
    MALAYSIA: 5,
    INDONESIA: 5,
    ALGERIA: 5,
    MOROCCO: 5,
    TUNISIA: 5,
    LIBYA: 5,
    SUDAN: 5
  },
  
  // ============ Prayer Names ============
  PRAYER_NAMES: {
    Fajr: { ar: 'الفجر', emoji: '🌙', name: 'Fajr' },
    Dhuhr: { ar: 'الظهر', emoji: '☀️', name: 'Dhuhr' },
    Asr: { ar: 'العصر', emoji: '🌅', name: 'Asr' },
    Maghrib: { ar: 'المغرب', emoji: '🌤️', name: 'Maghrib' },
    Isha: { ar: 'العشاء', emoji: '🌙', name: 'Isha' }
  },
  
  // ============ Notice Messages ============
  NOTICE_MESSAGES: [
    'صلوا على النبي محمد صلى الله عليه وسلم',
    'اللهم صل وسلم على نبينا محمد',
    'اذكروا الصلاة على النبي محمد صلى الله عليه وسلم',
    'اللهم صل على محمد وعلى آل محمد',
    'صلوا على خير الخلق سيدنا محمد صلى الله عليه وسلم',
    'اللهم صل وسلم وبارك على سيدنا محمد',
    'لا تنسوا الصلاة على النبي محمد صلى الله عليه وسلم',
    'اللهم صل على سيدنا محمد النبي الأمي',
    'صلوا على الحبيب المصطفى محمد صلى الله عليه وسلم',
    'اللهم صل على محمد كما صليت على إبراهيم وعلى آل إبراهيم',
    'صلى الله وسلم على نبينا محمد',
    'أكثروا من الصلاة على النبي محمد صلى الله عليه وسلم',
    'اللهم صل وسلم على سيدنا محمد وعلى آله وصحبه',
    'الصلاة على النبي نور وبركة',
    'صلوا وسلموا على رسول الله محمد صلى الله عليه وسلم',
    'اللهم ارزقنا شفاعة نبينا محمد صلى الله عليه وسلم',
    'اللهم صل على محمد صلاة تشرح بها الصدور',
    'اللهم صل وسلم وبارك على خير البرية محمد',
    'صلوا على من أرسله الله رحمة للعالمين',
    'اللهم صل وسلم على نبينا محمد عدد ما ذكره الذاكرون'
  ],
  
  NOTICE_EMOJIS: ['🌙', '🕌', '☪️', '🤲', '📿', '🕋', '💚', '⭐', '🕊️', '🌹'],
  
  // ============ Error Messages ============
  ERRORS: {
    NOT_ADMIN: '❌ عذراً، هذا الأمر يتطلب صلاحية **Administrator**',
    NOT_IN_GUILD: '❌ أنت لست عضواً في السيرفر الرسمي',
    NO_PERMISSION: '❌ لا تملك الرتبة المطلوبة للوصول',
    NO_VOICE_CHANNEL: '❌ لم يتم تعيين قناة صوتية',
    NO_CONTROL_CHANNEL: '❌ لم يتم تعيين قناة تحكم',
    NO_RECITER: '❌ الرجاء اختيار قارئ أولاً',
    NO_SURAH: '❌ لا توجد سورة حالية',
    NOT_PLAYING: '⚠️ لا توجد إذاعة تعمل حالياً',
    ALREADY_PLAYING: '⚠️ الإذاعة تعمل بالفعل',
    ALREADY_PAUSED: '⚠️ الإذاعة متوقفة بالفعل',
    NOT_PAUSED: '⚠️ لا توجد إذاعة متوقفة',
    FETCH_FAILED: '❌ فشل في جلب البيانات',
    CONNECTION_FAILED: '❌ فشل الاتصال بالروم الصوتي',
    AUDIO_FAILED: '❌ فشل تحميل الصوت',
    RECITER_NOT_FOUND: '❌ القارئ غير موجود',
    SURAH_NOT_FOUND: '❌ السورة غير موجودة',
    GUILD_NOT_FOUND: '❌ السيرفر غير موجود',
    CHANNEL_NOT_FOUND: '❌ القناة غير موجودة'
  },

  // ============ Success Messages ============
  SUCCESS: {
    RECITER_SELECTED: '✅ تم اختيار القارئ بنجاح',
    SURAH_PLAYING: '✅ يتم تشغيل السورة',
    PAUSED: '⏸ تم إيقاف الإذاعة مؤقتاً',
    RESUMED: '▶ تم استئناف الإذاعة',
    STOPPED: '⏹ تم إيقاف الإذاعة',
    SETUP_COMPLETE: '✅ تم إعداد البوت بنجاح',
    COUNTRY_SELECTED: '✅ تم اختيار الدولة بنجاح'
  },

  // ============ Button Labels ============
  BUTTONS: {
    SKIP: '⏭ التخطي',
    RESTART_SURAH: '🔄 إعادة السورة',
    RESTART_QURAN: '🔄 إعادة القرآن',
    PAUSE: '⏸ توقف',
    RESUME: '▶ استكمال',
    INVITE: '🔗 فتح الدعوة'
  },

  // ============ Select Placeholders ============
  PLACEHOLDERS: {
    RECITER: '🎙 اختر القارئ المفضل',
    SURAH: '📖 اختر السورة',
    COUNTRY: '🕌 اختر الدولة والمدينة لمواقيت الصلاة'
  },

  // ============ Surah Names (بدون ملف quran_data.json) ============
  SURAH_NAMES: {
    '001': 'الفاتحة',
    '002': 'البقرة',
    '003': 'آل عمران',
    '004': 'النساء',
    '005': 'المائدة',
    '006': 'الأنعام',
    '007': 'الأعراف',
    '008': 'الأنفال',
    '009': 'التوبة',
    '010': 'يونس',
    '011': 'هود',
    '012': 'يوسف',
    '013': 'الرعد',
    '014': 'إبراهيم',
    '015': 'الحجر',
    '016': 'النحل',
    '017': 'الإسراء',
    '018': 'الكهف',
    '019': 'مريم',
    '020': 'طه',
    '021': 'الأنبياء',
    '022': 'الحج',
    '023': 'المؤمنون',
    '024': 'النور',
    '025': 'الفرقان',
    '026': 'الشعراء',
    '027': 'النمل',
    '028': 'القصص',
    '029': 'العنكبوت',
    '030': 'الروم',
    '031': 'لقمان',
    '032': 'السجدة',
    '033': 'الأحزاب',
    '034': 'سبأ',
    '035': 'فاطر',
    '036': 'يس',
    '037': 'الصافات',
    '038': 'ص',
    '039': 'الزمر',
    '040': 'غافر',
    '041': 'فصلت',
    '042': 'الشورى',
    '043': 'الزخرف',
    '044': 'الدخان',
    '045': 'الجاثية',
    '046': 'الأحقاف',
    '047': 'محمد',
    '048': 'الفتح',
    '049': 'الحجرات',
    '050': 'ق',
    '051': 'الذاريات',
    '052': 'الطور',
    '053': 'النجم',
    '054': 'القمر',
    '055': 'الرحمن',
    '056': 'الواقعة',
    '057': 'الحديد',
    '058': 'المجادلة',
    '059': 'الحشر',
    '060': 'الممتحنة',
    '061': 'الصف',
    '062': 'الجمعة',
    '063': 'المنافقون',
    '064': 'التغابن',
    '065': 'الطلاق',
    '066': 'التحريم',
    '067': 'الملك',
    '068': 'القلم',
    '069': 'الحاقة',
    '070': 'المعارج',
    '071': 'نوح',
    '072': 'الجن',
    '073': 'المزمل',
    '074': 'المدثر',
    '075': 'القيامة',
    '076': 'الإنسان',
    '077': 'المرسلات',
    '078': 'النبأ',
    '079': 'النازعات',
    '080': 'عبس',
    '081': 'التكوير',
    '082': 'الانفطار',
    '083': 'المطففين',
    '084': 'الانشقاق',
    '085': 'البروج',
    '086': 'الطارق',
    '087': 'الأعلى',
    '088': 'الغاشية',
    '089': 'الفجر',
    '090': 'البلد',
    '091': 'الشمس',
    '092': 'الليل',
    '093': 'الضحى',
    '094': 'الشرح',
    '095': 'التين',
    '096': 'العلق',
    '097': 'القدر',
    '098': 'البينة',
    '099': 'الزلزلة',
    '100': 'العاديات',
    '101': 'القارعة',
    '102': 'التكاثر',
    '103': 'العصر',
    '104': 'الهمزة',
    '105': 'الفيل',
    '106': 'قريش',
    '107': 'الماعون',
    '108': 'الكوثر',
    '109': 'الكافرون',
    '110': 'النصر',
    '111': 'المسد',
    '112': 'الإخلاص',
    '113': 'الفلق',
    '114': 'الناس'
  }
};