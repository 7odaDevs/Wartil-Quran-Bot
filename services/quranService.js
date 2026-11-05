// ============================================================
// 📄 services/quranService.js
// خدمة القرآن: بتحمّل الشيوخ من data/reciters/*.json وبيانات السور من data/quran_data.json، وبتجيب الصوت من الإنترنت (mp3quran) وتجهّزه للتشغيل
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const logger = require('../utils/logger');
const config = require('../config');
// ✅ تعديل: استخدام العميل المشترك (IPv4 + Keep-Alive + Retry سريع)
// هذا يحل مشاكل: connect ETIMEDOUT / ENETUNREACH الظاهرة في اللوج عند تحميل الصوت
const { requestWithRetry } = require('../utils/httpClient');

class QuranService {
  constructor() {
    // بيانات القراء والقرآن
    this.reciters = new Map();
    this.quranData = { surahs: [] };
    
    // حالات السيرفرات
    this.guildReciters = new Map();
    this.guildSurahIndex = new Map();
    this.guildLastSurah = new Map();
    this.guildLastPosition = new Map();
    this.guildQuranComplete = new Map();

    // ✅ "تذكرة" تشغيل لكل سيرفر: كل محاولة تشغيل (تلقائية أو يدوية) بتاخد رقم
    // جديد. لو محاولة قديمة (كانت بتحمّل الصوت من الإنترنت وهو ده اللي بياخد وقت)
    // خلصت تحميلها بعد ما محاولة أحدث بدأت (مثلاً المستخدم اختار سورة تانية يدوي
    // أثناء ما البوت كان بينتقل تلقائياً)، لازم القديمة تعرف إنها "اتلغت" ومتشتغلش
    // فوق الجديدة (وده كان بيسبب تداخل صوت "بسم الله" فوق بعض ورجوع لسورة قديمة).
    this.guildPlayToken = new Map();
    
    // تحميل البيانات
    this.loadReciters();
    this.loadQuranData();
    
    // إحصائيات
    this.totalQuranComplete = 0;
    this.reciterListenCount = new Map();
  }

  /**
   * ✅ يبدأ محاولة تشغيل جديدة لهذا السيرفر ويرجع رقمها. أي محاولة سابقة
   * (لسه بتحمّل الصوت مثلاً) هتبقى "قديمة" تلقائياً بمجرد ما الرقم ده يتسجل.
   */
  nextPlayToken(guildId) {
    const token = (this.guildPlayToken.get(guildId) || 0) + 1;
    this.guildPlayToken.set(guildId, token);
    return token;
  }

  /**
   * ✅ هل الرقم ده لسه هو أحدث محاولة تشغيل مسجلة لهذا السيرفر؟ لو في محاولة
   * أحدث بدأت في الأثناء، الرقم القديم مايبقاش "حالي" ولازم المحاولة اللي معاها
   * تتلغي بدل ما تشغل صوت فوق المحاولة الجديدة.
   */
  isPlayTokenCurrent(guildId, token) {
    return this.guildPlayToken.get(guildId) === token;
  }

  /**
   * تحميل القراء من المجلد
   */
  loadReciters() {
    const recitersFolder = config.PATHS?.RECITERS || './data/reciters';
    
    logger.log('INFO', `📁 Loading reciters from: ${recitersFolder}`);
    
    if (!fs.existsSync(recitersFolder)) {
      logger.log('WARN', `Reciters folder not found: ${recitersFolder}`);
      this.addDefaultReciters();
      return;
    }

    try {
      const files = fs.readdirSync(recitersFolder);
      let loaded = 0;
      
      for (const file of files) {
        if (file === 'index.json') continue;
        
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(recitersFolder, file);
            const data = fs.readJsonSync(filePath);
            
            if (data.id && data.name && data.baseUrl && data.surahs) {
              this.reciters.set(data.id, data);
              loaded++;
              logger.log('INFO', `Loaded reciter ${data.name} (${data.id})`);
            }
          } catch (error) {
            logger.log('ERROR', `Failed to load reciter ${file}: ${error.message}`);
          }
        }
      }
      
      if (loaded === 0) {
        this.addDefaultReciters();
      }
      
      logger.log('INFO', `Loaded ${this.reciters.size} reciter(s)`);
      
    } catch (error) {
      console.error('❌ Failed to load reciters:', error.message);
      this.addDefaultReciters();
    }
  }

  /**
   * إضافة قراء افتراضيين
   */
  addDefaultReciters() {
    const defaultReciters = [
      {
        id: 'sudais',
        name: 'عبد الرحمن السديس',
        baseUrl: 'https://server11.mp3quran.net/sds',
        surahs: this.generateSurahMap()
      },
      {
        id: 'hussary',
        name: 'محمود خليل الحصري',
        baseUrl: 'https://server8.mp3quran.net/husr',
        surahs: this.generateSurahMap()
      },
      {
        id: 's_gmd',
        name: 'سعد الغامدي',
        baseUrl: 'https://server7.mp3quran.net/s_gmd',
        surahs: this.generateSurahMap()
      },
      {
        id: 'minshawi',
        name: 'محمد صديق المنشاوي',
        baseUrl: 'https://server8.mp3quran.net/mns',
        surahs: this.generateSurahMap()
      },
      {
        id: 'maher',
        name: 'ماهر المعيقلي',
        baseUrl: 'https://server12.mp3quran.net/maher',
        surahs: this.generateSurahMap()
      }
    ];

    for (const reciter of defaultReciters) {
      this.reciters.set(reciter.id, reciter);
      logger.log('INFO', `Loaded reciter ${reciter.name} (default)`);
    }
  }

  /**
   * توليد خريطة السور
   */
  generateSurahMap() {
    const surahs = {};
    const surahNames = {
      1: 'الفاتحة', 2: 'البقرة', 3: 'آل عمران', 4: 'النساء', 5: 'المائدة',
      6: 'الأنعام', 7: 'الأعراف', 8: 'الأنفال', 9: 'التوبة', 10: 'يونس',
      11: 'هود', 12: 'يوسف', 13: 'الرعد', 14: 'إبراهيم', 15: 'الحجر',
      16: 'النحل', 17: 'الإسراء', 18: 'الكهف', 19: 'مريم', 20: 'طه',
      21: 'الأنبياء', 22: 'الحج', 23: 'المؤمنون', 24: 'النور', 25: 'الفرقان',
      26: 'الشعراء', 27: 'النمل', 28: 'القصص', 29: 'العنكبوت', 30: 'الروم',
      31: 'لقمان', 32: 'السجدة', 33: 'الأحزاب', 34: 'سبأ', 35: 'فاطر',
      36: 'يس', 37: 'الصافات', 38: 'ص', 39: 'الزمر', 40: 'غافر',
      41: 'فصلت', 42: 'الشورى', 43: 'الزخرف', 44: 'الدخان', 45: 'الجاثية',
      46: 'الأحقاف', 47: 'محمد', 48: 'الفتح', 49: 'الحجرات', 50: 'ق',
      51: 'الذاريات', 52: 'الطور', 53: 'النجم', 54: 'القمر', 55: 'الرحمن',
      56: 'الواقعة', 57: 'الحديد', 58: 'المجادلة', 59: 'الحشر', 60: 'الممتحنة',
      61: 'الصف', 62: 'الجمعة', 63: 'المنافقون', 64: 'التغابن', 65: 'الطلاق',
      66: 'التحريم', 67: 'الملك', 68: 'القلم', 69: 'الحاقة', 70: 'المعارج',
      71: 'نوح', 72: 'الجن', 73: 'المزمل', 74: 'المدثر', 75: 'القيامة',
      76: 'الإنسان', 77: 'المرسلات', 78: 'النبأ', 79: 'النازعات', 80: 'عبس',
      81: 'التكوير', 82: 'الانفطار', 83: 'المطففين', 84: 'الانشقاق', 85: 'البروج',
      86: 'الطارق', 87: 'الأعلى', 88: 'الغاشية', 89: 'الفجر', 90: 'البلد',
      91: 'الشمس', 92: 'الليل', 93: 'الضحى', 94: 'الشرح', 95: 'التين',
      96: 'العلق', 97: 'القدر', 98: 'البينة', 99: 'الزلزلة', 100: 'العاديات',
      101: 'القارعة', 102: 'التكاثر', 103: 'العصر', 104: 'الهمزة', 105: 'الفيل',
      106: 'قريش', 107: 'الماعون', 108: 'الكوثر', 109: 'الكافرون', 110: 'النصر',
      111: 'المسد', 112: 'الإخلاص', 113: 'الفلق', 114: 'الناس'
    };
    for (let i = 1; i <= 114; i++) {
      const formattedId = i.toString().padStart(3, '0');
      surahs[formattedId] = surahNames[i] || `سورة ${i}`;
    }
    return surahs;
  }

  /**
   * تحميل بيانات القرآن
   */
  loadQuranData() {
    const quranFile = config.PATHS?.QURAN_DATA || './data/quran_data.json';
    
    if (!fs.existsSync(quranFile)) {
      logger.log('WARN', `Quran data file not found: ${quranFile}`);
      
      // توليد أسماء السور افتراضياً
      this.quranData.surahs = [];
      const surahNames = {
        1: 'الفاتحة', 2: 'البقرة', 3: 'آل عمران', 4: 'النساء', 5: 'المائدة',
        6: 'الأنعام', 7: 'الأعراف', 8: 'الأنفال', 9: 'التوبة', 10: 'يونس',
        11: 'هود', 12: 'يوسف', 13: 'الرعد', 14: 'إبراهيم', 15: 'الحجر',
        16: 'النحل', 17: 'الإسراء', 18: 'الكهف', 19: 'مريم', 20: 'طه',
        21: 'الأنبياء', 22: 'الحج', 23: 'المؤمنون', 24: 'النور', 25: 'الفرقان',
        26: 'الشعراء', 27: 'النمل', 28: 'القصص', 29: 'العنكبوت', 30: 'الروم',
        31: 'لقمان', 32: 'السجدة', 33: 'الأحزاب', 34: 'سبأ', 35: 'فاطر',
        36: 'يس', 37: 'الصافات', 38: 'ص', 39: 'الزمر', 40: 'غافر',
        41: 'فصلت', 42: 'الشورى', 43: 'الزخرف', 44: 'الدخان', 45: 'الجاثية',
        46: 'الأحقاف', 47: 'محمد', 48: 'الفتح', 49: 'الحجرات', 50: 'ق',
        51: 'الذاريات', 52: 'الطور', 53: 'النجم', 54: 'القمر', 55: 'الرحمن',
        56: 'الواقعة', 57: 'الحديد', 58: 'المجادلة', 59: 'الحشر', 60: 'الممتحنة',
        61: 'الصف', 62: 'الجمعة', 63: 'المنافقون', 64: 'التغابن', 65: 'الطلاق',
        66: 'التحريم', 67: 'الملك', 68: 'القلم', 69: 'الحاقة', 70: 'المعارج',
        71: 'نوح', 72: 'الجن', 73: 'المزمل', 74: 'المدثر', 75: 'القيامة',
        76: 'الإنسان', 77: 'المرسلات', 78: 'النبأ', 79: 'النازعات', 80: 'عبس',
        81: 'التكوير', 82: 'الانفطار', 83: 'المطففين', 84: 'الانشقاق', 85: 'البروج',
        86: 'الطارق', 87: 'الأعلى', 88: 'الغاشية', 89: 'الفجر', 90: 'البلد',
        91: 'الشمس', 92: 'الليل', 93: 'الضحى', 94: 'الشرح', 95: 'التين',
        96: 'العلق', 97: 'القدر', 98: 'البينة', 99: 'الزلزلة', 100: 'العاديات',
        101: 'القارعة', 102: 'التكاثر', 103: 'العصر', 104: 'الهمزة', 105: 'الفيل',
        106: 'قريش', 107: 'الماعون', 108: 'الكوثر', 109: 'الكافرون', 110: 'النصر',
        111: 'المسد', 112: 'الإخلاص', 113: 'الفلق', 114: 'الناس'
      };
      for (let i = 1; i <= 114; i++) {
        this.quranData.surahs.push({
          id: i,
          name_ar: surahNames[i] || `سورة ${i}`,
          ayahCount: this.getAyahCount(i)
        });
      }
      logger.log('SUCCESS', `Generated ${this.quranData.surahs.length} default surah(s)`);
      return;
    }

    try {
      this.quranData = fs.readJsonSync(quranFile);
      logger.log('INFO', `Loaded ${this.quranData.surahs.length} surah(s)`);
    } catch (error) {
      console.error('❌ Failed to load Quran data:', error.message);
    }
  }

  /**
   * الحصول على عدد آيات السورة
   */
  getAyahCount(surahNumber) {
    const ayahCounts = {
      1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129,
      10: 109, 11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111,
      18: 110, 19: 98, 20: 135, 21: 112, 22: 78, 23: 118, 24: 64, 25: 77,
      26: 227, 27: 93, 28: 88, 29: 69, 30: 60, 31: 34, 32: 30, 33: 73,
      34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85, 41: 54,
      42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18,
      50: 45, 51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29,
      58: 22, 59: 24, 60: 13, 61: 14, 62: 11, 63: 11, 64: 18, 65: 12,
      66: 12, 67: 30, 68: 52, 69: 52, 70: 44, 71: 28, 72: 28, 73: 20,
      74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42, 81: 29,
      82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30,
      90: 20, 91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5,
      98: 8, 99: 8, 100: 11, 101: 11, 102: 8, 103: 3, 104: 9, 105: 5,
      106: 4, 107: 7, 108: 3, 109: 6, 110: 3, 111: 5, 112: 4, 113: 5,
      114: 6
    };
    return ayahCounts[surahNumber] || 7;
  }

  /**
   * الحصول على اسم السورة
   */
  getSurahName(reciterId, surahNumber) {
    const reciter = this.reciters.get(reciterId);
    const formattedNumber = surahNumber.toString().padStart(3, '0');
    
    if (reciter?.surahs?.[formattedNumber]) {
      return reciter.surahs[formattedNumber];
    }
    
    const surah = this.quranData.surahs.find(s => s.id === surahNumber);
    if (surah) return surah.name_ar;
    
    return `الــســورة ${surahNumber}`;
  }

  /**
   * الحصول على قارئ
   */
  getReciter(id) {
    return this.reciters.get(id);
  }

  /**
   * الحصول على جميع القراء
   */
  getAllReciters() {
    return Array.from(this.reciters.values());
  }

  /**
   * الحصول على قائمة القراء للعرض
   */
  getReciterSelectOptions() {
    const options = [];
    for (const [id, reciter] of this.reciters) {
      options.push({
        label: reciter.name,
        value: id,
        description: `قرآن كامل بصوت ${reciter.name}`
      });
    }
    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  }

  /**
   * الحصول على قائمة سور القارئ
   */
  getReciterSurahs(reciterId) {
    const reciter = this.reciters.get(reciterId);
    if (!reciter) return null;
    
    const surahs = [];
    for (const [id, name] of Object.entries(reciter.surahs)) {
      surahs.push({
        id: parseInt(id),
        name: name
      });
    }
    return surahs.sort((a, b) => a.id - b.id);
  }

  // ========== الدوال الأساسية للتشغيل ==========

  /**
   * الحصول على رابط صوت السورة للقارئ
   */
  getAudioUrl(reciterId, surahNumber, ayahNumber = null) {
    const reciter = this.reciters.get(reciterId);
    if (!reciter) {
      logger.log('ERROR', `Reciter not found: ${reciterId}`);
      return null;
    }
    
    const formattedSurah = surahNumber.toString().padStart(3, '0');
    const cleanBaseUrl = reciter.baseUrl.replace(/\/+$/, '');
    
    if (ayahNumber) {
      const formattedAyah = ayahNumber.toString().padStart(3, '0');
      return `${cleanBaseUrl}/${formattedSurah}${formattedAyah}.mp3`;
    }
    
    return `${cleanBaseUrl}/${formattedSurah}.mp3`;
  }

  /**
   * ✅ تحميل الصوت من رابط - إرجاع ReadableStream مباشرة
   * تعديل: استخدام العميل المشترك (Keep-Alive + IPv4 + إعادة محاولة سريعة)
   * ده بيحل مشكلة "connect ETIMEDOUT" الظاهرة في اللوج، وبيسرّع بداية التشغيل
   * لأن الاتصال بيتعاد استخدامه بدل ما يتفتح TLS جديد كل مرة.
   */
  async fetchAudio(url) {
    try {
      const response = await requestWithRetry({
        method: 'GET',
        url: url,
        responseType: 'stream',
        // ⚠️ ملاحظة: 12 ثانية كانت مناسبة لطلبات صغيرة (زي مواقيت الصلاة) لكن قصيرة جداً
        // لتحميل سورة كاملة (بعض السور كبيرة الحجم وتاخد دقايق للتحميل الكامل على نت عادي).
        // كانت بتتقطع في نص التحميل (Error: aborted) قبل ما تخلص، فيبدو للمستخدم إن السورة
        // "خلصت" أو "وقفت" بينما هي فعلياً اتقطعت. رفعناها لمهلة أكبر تناسب حجم ملفات القرآن.
        timeout: 60000,
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      }, 2); // إعادة محاولتين عند فشل الشبكة (بدل محاولة واحدة)

      return response.data;
    } catch (error) {
      logger.log('ERROR', `Failed to load audio: ${error.message}`);
      return null;
    }
  }

  /**
   * إنشاء مصدر صوت من رابط - تم إصلاح مشكلة inputType
   * استخدام StreamType.Arbitrary بدلاً من 'mp3'
   */
  async createAudioResourceFromUrl(url) {
    try {
      const stream = await this.fetchAudio(url);
      if (!stream) {
        logger.log('ERROR', `Failed to load audio from: ${url}`);
        return null;
      }
      
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
      
      return resource;
    } catch (error) {
      logger.log('ERROR', `Failed to create audio source: ${error.message}`);
      return null;
    }
  }

  /**
   * التحقق من اكتمال القرآن
   */
  isQuranComplete(surahNumber) {
    return surahNumber >= (config.TOTAL_SURAH_COUNT || 114);
  }

  /**
   * الحصول على السورة التالية
   */
  getNextSurah(currentSurah) {
    return currentSurah + 1;
  }

  /**
   * تنظيف موارد السيرفر
   */
  cleanup(guildId) {
    this.guildReciters.delete(guildId);
    this.guildSurahIndex.delete(guildId);
    this.guildLastSurah.delete(guildId);
    this.guildLastPosition.delete(guildId);
    this.guildQuranComplete.delete(guildId);
  }

  /**
   * الحصول على إحصائيات الخدمة
   */
  getStats() {
    return {
      totalReciters: this.reciters.size,
      totalSurahs: this.quranData.surahs.length || 114,
      totalQuranComplete: this.totalQuranComplete,
      activeGuilds: this.guildReciters.size
    };
  }
}

module.exports = new QuranService();