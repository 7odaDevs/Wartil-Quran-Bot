// ============================================================
// 📄 services/azkarService.js
// خدمة الأذكار: بتختار ذكر من data/azkar.json وبتركّبه على صورة assets/templates/azkar-template.png وتبعته كل فترة
// ============================================================

// azkarService.js - النسخة النهائية (صور فقط + حل مشاكل المهلة + دعم رمز ﷺ بخط Amiri)
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const guildSettings = require('../models/GuildSettings');
const guildDataModel = require('../models/GuildData');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// فاصل إرسال الأذكار: ثابت كل 30 دقيقة بالضبط
const AZKAR_INTERVAL_MS = 30 * 60 * 1000;

// رمز الصلاة على النبي ﷺ
const SALLAH_SYMBOL = '\uFDFA';

class AzkarService {
  constructor() {
    this.azkar = [];
    this.currentIndex = new Map();
    this.intervals = new Map();
    this.sendingLocks = new Set();
    this.lastSendTime = new Map();
    this.minInterval = AZKAR_INTERVAL_MS;
    this.initialized = false;
    this.fontRegistered = false;
    this.fontsDir = path.join(__dirname, 'fonts');
    this.fontName = 'Traditional Arabic';
    this.sallahFontName = 'Amiri';
    this.sallahFontRegistered = false;
    this.maxRetries = 2;
    this.retryCount = new Map();
    this.requestTimeouts = new Map();
  }

  /**
   * تهيئة الخدمة - تحميل الأذكار + تسجيل الخطوط مرة واحدة فقط
   */
  async initialize() {
    if (this.initialized) return true;
    try {
      this.loadAzkar();
      await this.registerFontOnce();
      await this.registerSallahFontOnce();
      this.initialized = true;
      console.log('✅ Azkar service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize azkar service:', error.message);
      this.loadDefaultAzkar();
      this.initialized = true;
      return false;
    }
  }

  /**
   * تسجيل الخط Traditional Arabic مرة واحدة فقط
   */
  async registerFontOnce() {
    if (this.fontRegistered) return;

    try {
      const possiblePaths = [
        path.join(this.fontsDir, 'Traditional-Arabic.ttf'),
        path.join(__dirname, '../assets/fonts/Traditional-Arabic.ttf'),
        path.join(__dirname, '../../assets/fonts/Traditional-Arabic.ttf'),
        path.join(process.cwd(), 'assets/fonts/Traditional-Arabic.ttf'),
        path.join(process.cwd(), 'bot/assets/fonts/Traditional-Arabic.ttf'),
        path.join(process.cwd(), 'fonts/Traditional-Arabic.ttf'),
        path.join(__dirname, '../fonts/Traditional-Arabic.ttf'),
        path.join(__dirname, '../../bot/assets/fonts/Traditional-Arabic.ttf'),
        path.join(process.cwd(), '../assets/fonts/Traditional-Arabic.ttf')
      ];

      let fontPath = null;

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          fontPath = p;
          logger.log('SUCCESS', `Font found at: ${fontPath}`);
          break;
        }
      }

      if (!fontPath) {
        console.warn('⚠️ Traditional Arabic font file not found');
        const systemFonts = ['Traditional Arabic'];
        for (const font of systemFonts) {
          try {
            const testCanvas = createCanvas(100, 100);
            const testCtx = testCanvas.getContext('2d');
            testCtx.font = `50px "${font}"`;
            testCtx.fillText('اختبار', 50, 50);
            logger.log('SUCCESS', `Falling back to system font: ${font}`);
            this.fontName = font;
            this.fontRegistered = true;
            return;
          } catch (e) {
            // تجاهل
          }
        }
        this.fontRegistered = false;
        return;
      }

      try {
        GlobalFonts.registerFromPath(fontPath, this.fontName);

        this.fontRegistered = true;
        logger.log('SUCCESS', `Traditional Arabic font registered successfully`);

        try {
          const testCanvas = createCanvas(300, 150);
          const testCtx = testCanvas.getContext('2d');
          testCtx.font = `bold 50px "${this.fontName}"`;
          testCtx.fillStyle = '#6B4423';
          testCtx.textAlign = 'center';
          testCtx.textBaseline = 'middle';
          testCtx.fillText('اختبار الخط', 150, 75);
        } catch (testError) {
          console.warn('⚠️ Warning: font is registered but may not render correctly');
          this.fontRegistered = false;
        }
      } catch (registerError) {
        console.error('❌ Failed to register font:', registerError);
        this.fontRegistered = false;
      }
    } catch (error) {
      console.error('❌ Failed to register font:', error);
      this.fontRegistered = false;
    }
  }

  /**
   * ✅ تسجيل خط Amiri المستقل لدعم رمز ﷺ
   * لا يتم ربطه بـ Traditional Arabic إطلاقاً
   */
  async registerSallahFontOnce() {
    if (this.sallahFontRegistered) return;

    try {
      const possiblePaths = [
        path.join(this.fontsDir, 'Amiri-Regular.ttf'),
        path.join(__dirname, '../assets/fonts/Amiri-Regular.ttf'),
        path.join(__dirname, '../../assets/fonts/Amiri-Regular.ttf'),
        path.join(process.cwd(), 'assets/fonts/Amiri-Regular.ttf'),
        path.join(process.cwd(), 'bot/assets/fonts/Amiri-Regular.ttf'),
        path.join(process.cwd(), 'fonts/Amiri-Regular.ttf'),
        path.join(__dirname, '../fonts/Amiri-Regular.ttf'),
        path.join(__dirname, '../../bot/assets/fonts/Amiri-Regular.ttf'),
        path.join(process.cwd(), '../assets/fonts/Amiri-Regular.ttf')
      ];

      let fontPath = null;

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          fontPath = p;
          logger.log('SUCCESS', `Amiri font found at: ${fontPath}`);
          break;
        }
      }

      if (!fontPath) {
        console.warn('⚠️ Amiri-Regular.ttf not found - ﷺ will fall back to default font');
        this.sallahFontRegistered = false;
        return;
      }

      // ✅ تسجيل حقيقي لملف Amiri-Regular.ttf المستقل
      GlobalFonts.registerFromPath(fontPath, this.sallahFontName);
      this.sallahFontRegistered = true;
      logger.log('SUCCESS', `Amiri font registered successfully for ﷺ symbol`);
    } catch (error) {
      console.error('❌ Failed to register Amiri font:', error);
      this.sallahFontRegistered = false;
    }
  }

  /**
   * تحميل الأذكار من الملف
   */
  loadAzkar() {
    try {
      const filePath = path.join(__dirname, '../data/azkar.json');
      logger.log('INFO', `📁 Loading azkar from: ${filePath}`);

      if (fs.existsSync(filePath)) {
        const data = fs.readJsonSync(filePath);
        this.azkar = data.adhkar || [];
        if (this.azkar.length === 0) {
          console.warn('⚠️ Azkar file is empty, using default azkar');
          this.loadDefaultAzkar();
        } else {
          logger.log('SUCCESS', `Loaded ${this.azkar.length} azkar`);
        }
      } else {
        console.warn('⚠️ Azkar file not found, using default azkar');
        this.loadDefaultAzkar();
      }
    } catch (error) {
      console.error('❌ Failed to load azkar:', error.message);
      this.loadDefaultAzkar();
    }
  }

  /**
   * تحميل أذكار افتراضية
   */
  loadDefaultAzkar() {
    this.azkar = [
      { id: 1, text: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ", source: "متفق عليه", category: "تسبيح" },
      { id: 2, text: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", source: "متفق عليه", category: "تهليل" },
      { id: 3, text: "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ", source: "متفق عليه", category: "استغفار" },
      { id: 4, text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ", source: "متفق عليه", category: "الصلاة على النبي" },
    ];
    logger.log('SUCCESS', `Loaded ${this.azkar.length} default azkar`);
  }

  /**
   * الحصول على ذكر عشوائي
   */
  getRandomAzkar() {
    if (!this.initialized) this.initialize();
    if (this.azkar.length === 0) {
      this.loadDefaultAzkar();
      if (this.azkar.length === 0) return null;
    }
    const randomIndex = Math.floor(Math.random() * this.azkar.length);
    return this.azkar[randomIndex];
  }

  /**
   * التحقق من إمكانية الإرسال (حماية ضد التكرار)
   */
  canSend(guildId) {
    const last = this.lastSendTime.get(guildId) || 0;
    const now = Date.now();
    return (now - last) >= this.minInterval - 5000;
  }

  /**
   * بدء جدولة الأذكار لسيرفر
   */
  startScheduler(guildId, channel) {
    this.stopScheduler(guildId);

    if (!this.initialized) this.initialize();

    const enabled = guildSettings.getSetting(guildId, 'azkarEnabled') !== false;
    if (!enabled) {
      logger.info(`⏹️ Azkar stopped in server ${guildId}`);
      return;
    }

    logger.info(`🔄 Starting azkar schedule for server ${guildId} (one azkar every 30 minutes)`);

    const persistedLastSent = guildDataModel.getAzkarLastSent(guildId);
    if (persistedLastSent) {
      this.lastSendTime.set(guildId, persistedLastSent);
    }

    const lastSent = this.lastSendTime.get(guildId) || 0;
    const elapsed = Date.now() - lastSent;

    let initialDelay;
    if (lastSent && elapsed < AZKAR_INTERVAL_MS) {
      initialDelay = AZKAR_INTERVAL_MS - elapsed;
      logger.info(`⏳ Last azkar for server ${guildId} was sent ${Math.round(elapsed / 1000)}s ago, waiting ${Math.round(initialDelay / 1000)}s before the next one`);
    } else {
      initialDelay = 10000 + Math.random() * 30000;
    }

    setTimeout(() => {
      this.sendAzkar(guildId, channel);
    }, initialDelay);

    const intervalId = setInterval(() => {
      this.sendAzkar(guildId, channel);
    }, AZKAR_INTERVAL_MS);

    this.intervals.set(guildId, intervalId);
  }

  /**
   * إيقاف جدولة الأذكار لسيرفر
   */
  stopScheduler(guildId) {
    const intervalId = this.intervals.get(guildId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(guildId);
      logger.info(`⏹️ Azkar schedule stopped for server ${guildId}`);
    }
  }

  /**
   * ألوان حبر داكنة تناسب خلفية الرق البيج
   */
  getRandomInkColor() {
    return '#5A3A1A';
  }

  getSubTextColor() {
    return '#5A3A1A';
  }

  /**
   * ✅ تقسيم النص إلى وحدات (tokens) مع عزل رمز ﷺ كوحدة مستقلة
   * نحافظ على المسافات والكلمات كما هي
   */
  tokenizeText(text) {
    if (!text) return [];
    const tokens = [];
    const regex = new RegExp(`(${SALLAH_SYMBOL})`, 'g');
    const parts = text.split(regex);

    for (const part of parts) {
      if (part === '') continue;
      if (part === SALLAH_SYMBOL) {
        tokens.push({ type: 'sallah', text: SALLAH_SYMBOL });
      } else {
        // تقسيم الجزء العادي إلى كلمات مع الحفاظ على المسافات
        const words = part.split(/(\s+)/).filter(w => w !== '');
        for (const w of words) {
          if (/^\s+$/.test(w)) {
            tokens.push({ type: 'space', text: w });
          } else {
            tokens.push({ type: 'word', text: w });
          }
        }
      }
    }
    return tokens;
  }

  /**
   * ✅ Fix: استخراج حجم الخط (px) الحالي من ctx.font عشان نعيد استخدامه
   * لما نبدّل الـ font-family بس (بدل الاعتماد على كلمة "inherit" اللي
   * مش صيغة صحيحة جوه ctx.font وكانت بتسبب:
   * "[`bold inherit "Traditional Arabic"`] is not valid font style"
   */
  getFontSizePart(ctx) {
    const match = ctx.font.match(/(\d+(?:\.\d+)?px)/);
    return match ? match[1] : '32px';
  }

  /**
   * ✅ قياس عرض token وفق الخط المناسب
   */
  measureToken(ctx, token, mainFont, sallahFont, isBold) {
    const boldPrefix = isBold ? 'bold ' : '';
    const sizePart = this.getFontSizePart(ctx);
    if (token.type === 'sallah') {
      const fontToUse = this.sallahFontRegistered ? sallahFont : mainFont;
      ctx.font = `${boldPrefix}${sizePart} "${fontToUse}"`;
      return ctx.measureText(token.text).width;
    }
    ctx.font = `${boldPrefix}${sizePart} "${mainFont}"`;
    return ctx.measureText(token.text).width;
  }

  /**
   * ✅ قياس عرض سطر كامل (مختلط بين Traditional Arabic و Amiri)
   * يجب أن يكون ctx.font محدّداً بحجم افتراضي قبل الاستدعاء (نستخرج الحجم منه)
   */
  measureMixedLine(ctx, line, mainFont, sallahFont, isBold) {
    const boldPrefix = isBold ? 'bold ' : '';
    const sizePart = this.getFontSizePart(ctx);
    let totalWidth = 0;
    const tokens = this.tokenizeText(line);
    for (const token of tokens) {
      if (token.type === 'sallah') {
        const fontToUse = this.sallahFontRegistered ? sallahFont : mainFont;
        ctx.font = `${boldPrefix}${sizePart} "${fontToUse}"`;
      } else {
        ctx.font = `${boldPrefix}${sizePart} "${mainFont}"`;
      }
      totalWidth += ctx.measureText(token.text).width;
    }
    return totalWidth;
  }

  /**
   * ✅ تقسيم النص إلى أسطر مع دعم العربية ورمز ﷺ بخطه الخاص
   * ctx.font يجب أن يكون مضبوطاً قبل الاستدعاء (بنستخرج الحجم منه)
   */
  wrapTextToLines(ctx, text, maxWidth, mainFont, sallahFont, isBold) {
    if (!text) return [''];

    const tokens = this.tokenizeText(text);
    if (tokens.length === 0) return [''];

    const boldPrefix = isBold ? 'bold ' : '';
    const sizePart = this.getFontSizePart(ctx);

    const lines = [];
    let currentTokens = [];
    let currentWidth = 0;

    const measure = (tok) => {
      if (tok.type === 'sallah') {
        const fontToUse = this.sallahFontRegistered ? sallahFont : mainFont;
        ctx.font = `${boldPrefix}${sizePart} "${fontToUse}"`;
      } else {
        ctx.font = `${boldPrefix}${sizePart} "${mainFont}"`;
      }
      return ctx.measureText(tok.text).width;
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tokenWidth = measure(token);

      // تجنّب بدء السطر بمسافة
      if (token.type === 'space' && currentTokens.length === 0) {
        continue;
      }

      if (currentWidth + tokenWidth <= maxWidth || currentTokens.length === 0) {
        currentTokens.push(token);
        currentWidth += tokenWidth;
      } else {
        // إزالة المسافات في نهاية السطر
        while (currentTokens.length > 0 && currentTokens[currentTokens.length - 1].type === 'space') {
          const removed = currentTokens.pop();
          currentWidth -= measure(removed);
        }
        lines.push(currentTokens.map(t => t.text).join(''));
        currentTokens = [token];
        currentWidth = tokenWidth;
      }
    }

    if (currentTokens.length > 0) {
      while (currentTokens.length > 0 && currentTokens[currentTokens.length - 1].type === 'space') {
        currentTokens.pop();
      }
      if (currentTokens.length > 0) {
        lines.push(currentTokens.map(t => t.text).join(''));
      }
    }

    if (lines.length === 0) lines.push('');
    return lines;
  }

  /**
   * ✅ إيجاد أفضل حجم خط (يدعم النص المختلط)
   */
  fitTextInBox(ctx, text, fontName, maxWidth, maxHeight, options = {}) {
    const maxFontSize = options.maxFontSize || 52;
    const minFontSize = options.minFontSize || 20;
    const lineHeightRatio = options.lineHeightRatio || 1.6;
    const bold = options.bold ? true : false;
    const sallahFontName = options.sallahFontName || this.sallahFontName;

    let fontSize = maxFontSize;
    let lines = [text];

    const boldPrefix = bold ? 'bold ' : '';

    while (fontSize >= minFontSize) {
      // ضبط ctx.font ليُستخدم كـ inherit في القياسات المختلطة
      ctx.font = `${boldPrefix}${fontSize}px "${fontName}"`;
      lines = this.wrapTextToLines(ctx, text, maxWidth, fontName, sallahFontName, bold);
      const totalHeight = lines.length * fontSize * lineHeightRatio;
      if (totalHeight <= maxHeight) {
        return { fontSize, lines, lineHeight: fontSize * lineHeightRatio };
      }
      fontSize -= 1.5;
    }

    ctx.font = `${boldPrefix}${minFontSize}px "${fontName}"`;
    lines = this.wrapTextToLines(ctx, text, maxWidth, fontName, sallahFontName, bold);
    return { fontSize: minFontSize, lines, lineHeight: minFontSize * lineHeightRatio };
  }

  /**
   * ✅ رسم سطر مختلط من اليمين إلى اليسار
   * - نحسب عرض السطر الكامل أولاً (بعد دمج Traditional Arabic + Amiri)
   * - نبدأ من يمين السطر ونتحرك يساراً
   * - نرسم كل token بخطه المناسب
   */
  drawMixedLine(ctx, line, centerX, y, fontSize, mainFont, sallahFont, isBold) {
    if (!line) return;

    const boldPrefix = isBold ? 'bold ' : '';
    const tokens = this.tokenizeText(line);
    if (tokens.length === 0) return;

    // قياس عرض كل token
    const tokenWidths = tokens.map(tok => {
      if (tok.type === 'sallah') {
        const fontToUse = this.sallahFontRegistered ? sallahFont : mainFont;
        ctx.font = `${boldPrefix}${fontSize}px "${fontToUse}"`;
      } else {
        ctx.font = `${boldPrefix}${fontSize}px "${mainFont}"`;
      }
      return ctx.measureText(tok.text).width;
    });

    const totalWidth = tokenWidths.reduce((a, b) => a + b, 0);

    // ✅ حساب نقطة البداية من اليمين لتحقيق RTL
    // textAlign = 'right' يجعل x هو الحد الأيمن للنص
    ctx.textAlign = 'right';
    let x = centerX + totalWidth / 2;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const w = tokenWidths[i];

      if (token.type === 'sallah') {
        const fontToUse = this.sallahFontRegistered ? sallahFont : mainFont;
        ctx.font = `${boldPrefix}${fontSize}px "${fontToUse}"`;
      } else {
        ctx.font = `${boldPrefix}${fontSize}px "${mainFont}"`;
      }

      ctx.fillText(token.text, x, y);
      x -= w;
    }

    // إعادة textAlign للحالة الافتراضية
    ctx.textAlign = 'center';
  }

  /**
   * تحميل الصورة مع مهلة زمنية
   */
  loadImageWithTimeout(imagePath, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Image loading timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      loadImage(imagePath)
        .then(image => {
          clearTimeout(timeout);
          resolve(image);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * ✅ إرسال ذكر - صورة فقط (ممنوع النص البديل)
   * تم دعم رمز ﷺ بخط Amiri مع الحفاظ على Traditional Arabic لباقي النص
   */
  async sendAzkar(guildId, channel) {
    if (this.sendingLocks.has(guildId)) {
      logger.warn(`⏸️ Azkar send already in progress for server ${guildId}, skipping duplicate call`);
      return;
    }

    if (!this.canSend(guildId)) {
      logger.info(`⏳ Skipped an azkar send call that fired too early for server ${guildId}`);
      return;
    }

    this.sendingLocks.add(guildId);

    let azkar = null;
    let retryAttempt = this.retryCount.get(guildId) || 0;

    try {
      if (!this.initialized) await this.initialize();
      await this.registerFontOnce();
      await this.registerSallahFontOnce();

      azkar = this.getRandomAzkar();
      if (!azkar) {
        logger.warn(`No azkar available for server ${guildId}`);
        return;
      }

      let templatePath = path.join(__dirname, '../assets/templates/azkar-template.png');
      if (!fs.existsSync(templatePath)) {
        templatePath = path.join(__dirname, '../assets/images/azkar-template.png');
      }

      if (!fs.existsSync(templatePath)) {
        const altPaths = [
          path.join(process.cwd(), 'assets/templates/azkar-template.png'),
          path.join(process.cwd(), 'bot/assets/templates/azkar-template.png'),
          path.join(__dirname, '../../assets/templates/azkar-template.png')
        ];

        for (const altPath of altPaths) {
          if (fs.existsSync(altPath)) {
            templatePath = altPath;
            break;
          }
        }
      }

      if (!fs.existsSync(templatePath)) {
        logger.error(`Image template not found: ${templatePath}`);
        this.lastSendTime.set(guildId, Date.now());
        this.retryCount.delete(guildId);
        return;
      }

      logger.log('INFO', `🖼️ Loading template from: ${templatePath}`);

      const templateImage = await this.loadImageWithTimeout(templatePath, 8000);

      const maxWidth = 800;
      const maxHeight = 600;
      let width = templateImage.width;
      let height = templateImage.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
        logger.log('INFO', `📐 Resizing image from ${templateImage.width}x${templateImage.height} to ${width}x${height}`);
      } else {
        width = templateImage.width;
        height = templateImage.height;
      }

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(templateImage, 0, 0, width, height);

      let usableFont = this.fontRegistered ? this.fontName : 'Arial';

      if (!this.fontRegistered) {
        const systemFonts = ['Traditional Arabic'];
        for (const font of systemFonts) {
          try {
            const testCanvas = createCanvas(100, 100);
            const testCtx = testCanvas.getContext('2d');
            testCtx.font = `bold 50px "${font}"`;
            testCtx.fillText('اختبار', 50, 50);
            usableFont = font;
            logger.log('INFO', `Using system font: ${font}`);
            break;
          } catch (e) {
            // تجاهل
          }
        }
      }

      logger.log('INFO', `🔤 Using font: ${usableFont} (registered: ${this.fontRegistered}) | Sallah font: ${this.sallahFontName} (registered: ${this.sallahFontRegistered})`);

      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';

      const centerX = width / 2;

      const boxLeft = width * 0.10;
      const boxRight = width * 0.90;
      const maxTextWidth = boxRight - boxLeft;
      const boxTop = height * 0.28;
      const boxBottom = height * 0.84;
      const footerReserve = height * 0.11;
      const mainAreaTop = boxTop;
      const mainAreaBottom = boxBottom - footerReserve;
      const mainAreaHeight = mainAreaBottom - mainAreaTop;

      // ✅ حساب حجم الخط بناءً على النص المختلط
      const { fontSize, lines, lineHeight } = this.fitTextInBox(
        ctx,
        azkar.text,
        usableFont,
        maxTextWidth,
        mainAreaHeight,
        {
          maxFontSize: 44,
          minFontSize: 20,
          lineHeightRatio: 1.6,
          bold: true,
          sallahFontName: this.sallahFontName
        }
      );

      ctx.fillStyle = this.getRandomInkColor();

      const totalTextHeight = lines.length * lineHeight;
      let startY = mainAreaTop + (mainAreaHeight - totalTextHeight) / 2 + lineHeight / 2;

      // ✅ رسم كل سطر بالنظام المختلط RTL
      for (let i = 0; i < lines.length; i++) {
        this.drawMixedLine(
          ctx,
          lines[i],
          centerX,
          startY + i * lineHeight,
          fontSize,
          usableFont,
          this.sallahFontName,
          true
        );
      }

      const footerText = `المصدر: ${azkar.source || 'غير معروف'}      -      التصنيف: ${azkar.category || 'عام'}`;
      const footerCenterY = boxBottom - footerReserve / 2;

      const { fontSize: footerFontSize, lines: footerLines, lineHeight: footerLineHeight } = this.fitTextInBox(
        ctx,
        footerText,
        usableFont,
        maxTextWidth,
        footerReserve,
        {
          maxFontSize: 24,
          minFontSize: 14,
          lineHeightRatio: 1.5,
          bold: true,
          sallahFontName: this.sallahFontName
        }
      );

      ctx.fillStyle = this.getSubTextColor();

      const footerTotalHeight = footerLines.length * footerLineHeight;
      let footerStartY = footerCenterY - footerTotalHeight / 2 + footerLineHeight / 2;

      // ✅ Footer يدعم أيضاً النص المختلط (لو احتوى ﷺ)
      for (let i = 0; i < footerLines.length; i++) {
        this.drawMixedLine(
          ctx,
          footerLines[i],
          centerX,
          footerStartY + i * footerLineHeight,
          footerFontSize,
          usableFont,
          this.sallahFontName,
          true
        );
      }

      console.log('📦 Converting image to buffer...');
      let buffer = canvas.toBuffer('image/png');

      logger.log('INFO', `📊 Image size: ${(buffer.length / 1024).toFixed(2)} KB`);

      let attachmentName = 'azkar.png';
      if (buffer.length > 2 * 1024 * 1024) {
        console.log('📦 Image is large, applying JPEG compression...');
        buffer = canvas.toBuffer('image/jpeg', 70);
        logger.log('INFO', `📊 Image size after compression: ${(buffer.length / 1024).toFixed(2)} KB`);
        attachmentName = 'azkar.jpg';
      }

      const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
      const embed = new EmbedBuilder()
        .setImage(`attachment://${attachmentName}`);

      const sendPromise = channel.send({
        embeds: [embed],
        files: [attachment]
      });

      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('REQUEST_TIMEOUT: Send operation exceeded 60 seconds'));
        }, 60000);
        this.requestTimeouts.set(guildId, timeoutId);
      });

      await Promise.race([sendPromise, timeoutPromise]);

      const timeoutId = this.requestTimeouts.get(guildId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.requestTimeouts.delete(guildId);
      }

      logger.info(`📿 Azkar (image) sent in server ${guildId}`);

      const sentAt = Date.now();
      this.lastSendTime.set(guildId, sentAt);
      guildDataModel.updateAzkarLastSent(guildId, sentAt);
      this.retryCount.delete(guildId);

    } catch (error) {
      const timeoutId = this.requestTimeouts.get(guildId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.requestTimeouts.delete(guildId);
      }

      const errorMsg = error?.message || error?.toString() || 'خطأ غير معروف';

      if (errorMsg.includes('TIMEOUT') ||
          errorMsg.includes('AbortError') ||
          errorMsg.includes('aborted') ||
          errorMsg.includes('UND_ERR_CONNECT_TIMEOUT')) {
        logger.warn(`⏱️ Azkar send timed out or was aborted for server ${guildId}: ${errorMsg}`);
        this.lastSendTime.set(guildId, Date.now());
        this.retryCount.delete(guildId);
        return;
      }

      console.error('❌ [AzkarService] Failed to send azkar (image) - server:', guildId);
      console.error('❌ Error details:', errorMsg);

      logger.error(`Failed to send azkar (image): ${errorMsg}`);

      this.lastSendTime.set(guildId, Date.now());
      this.retryCount.delete(guildId);

    } finally {
      this.sendingLocks.delete(guildId);
    }
  }

  /**
   * تحديث إعدادات الأذكار لسيرفر
   */
  updateSettings(guildId, settings) {
    this.stopScheduler(guildId);

    if (settings.azkarInterval !== undefined) {
      guildSettings.set(guildId, 'azkarInterval', settings.azkarInterval);
    }
    if (settings.azkarEnabled !== undefined) {
      guildSettings.set(guildId, 'azkarEnabled', settings.azkarEnabled);
    }
  }

  /**
   * الحصول على عدد الأذكار
   */
  getCount() {
    if (!this.initialized) this.initialize();
    return this.azkar.length;
  }

  /**
   * الحصول على جميع الأذكار
   */
  getAllAzkar() {
    if (!this.initialized) this.initialize();
    return this.azkar;
  }

  /**
   * الحصول على أذكار حسب التصنيف
   */
  getAzkarByCategory(category) {
    if (!this.initialized) this.initialize();
    return this.azkar.filter(a => a.category === category);
  }
}

module.exports = new AzkarService();