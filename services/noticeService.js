// ============================================================
// 📄 services/noticeService.js
// خدمة التنبيهات: بتبعت تذكير (صورة) كل فترة عشوائية بين حد أدنى وأقصى. الصورة من assets/templates/notice_template.png
// ============================================================

// noticeService.js - نسخة محسنة بالكامل
const fs = require('fs-extra');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const logger = require('../utils/logger');
const guildSettings = require('../models/GuildSettings');
const guildDataModel = require('../models/GuildData');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// ===== تسجيل الخط المخصص =====
const NOTICE_FONT_FAMILY = 'NoticeAmiriFont';

try {
  const fontPath = path.join(__dirname, 'PrayerFont', 'Traditional-Arabic.ttf');
  const fontExists = fs.existsSync(fontPath);

  if (fontExists) {
    GlobalFonts.registerFromPath(fontPath, NOTICE_FONT_FAMILY);
    logger.info('✅ Notice font registered successfully');
  } else {
    logger.warn(`Custom font not found: ${fontPath}`);
  }
} catch (error) {
  logger.warn('Failed to register custom font:', error.message);
}

let clientInstance = null;

// ============================================================
// الإعدادات المحسنة
// ============================================================
const NOTICE_MIN_HOURS = 6;
const NOTICE_MAX_HOURS = 14;
const NOTICE_SEND_TIMEOUT_MS = 30000; // زيادة إلى 30 ثانية
const IMAGE_GENERATION_TIMEOUT_MS = 15000; // 15 ثانية لتوليد الصورة
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 دقائق

class NoticeService {
  constructor() {
    this.noticeMessages = [];
    this.noticeTimers = new Map();
    this.isProcessing = new Map();
    this.lastSendTime = new Map();
    this.imageCache = new Map(); // ✅ تخزين مؤقت للصور
    this.minInterval = MIN_INTERVAL_MS;
    this.loadNotices();
  }

  setClient(client) {
    clientInstance = client;
    logger.info('✅ Client set in NoticeService');
  }

  // تحميل نصوص التنبيهات
  loadNotices() {
    try {
      const config = require('../config/constants');

      const prayerMessages = [
        'صلوا على النبي محمد صلى الله عليه وسلم',
        'اللهم صل وسلم على نبينا محمد',
        'اذكروا الصلاة على النبي محمد صلى الله عليه وسلم',
        'اللهم صل على محمد وعلى آل محمد',
        'صلوا على خير الخلق سيدنا محمد صلى الله عليه وسلم',
        'اللهم صلِّ على محمد تسليماً كثيراً',
        'صلاة الله وسلامه على نبينا محمد',
        'اللهم صل على محمد وعلى أزواجه وذريته',
        'اللهم صل على محمد كما صليت على إبراهيم',
        'اللهم بارك على محمد كما باركت على إبراهيم',
      ];

      const allMessages = [...prayerMessages];
      this.noticeMessages = config.NOTICE_MESSAGES || allMessages;

      if (this.noticeMessages.length === 0) {
        logger.warn('No notice messages found! Please add some messages');
      } else {
        logger.info(`✅ Loaded ${this.noticeMessages.length} notice message(s)`);
      }

    } catch (error) {
      logger.error('Failed to load notice messages:', error.message);
      this.noticeMessages = [
        'صلوا على النبي محمد صلى الله عليه وسلم',
        'اللهم صل وسلم على نبينا محمد',
        'اللهم صل على محمد وعلى آل محمد',
      ];
    }
  }

  // اختيار نص تنبيه عشوائي
  getRandomNotice() {
    if (!this.noticeMessages || this.noticeMessages.length === 0) {
      return 'صلوا على النبي محمد صلى الله عليه وسلم';
    }
    const randomIndex = Math.floor(Math.random() * this.noticeMessages.length);
    return this.noticeMessages[randomIndex];
  }

  // بتحسب الفترة العشوائية لحد التنبيه الجاي
  getDelay() {
    const hours = NOTICE_MIN_HOURS + Math.random() * (NOTICE_MAX_HOURS - NOTICE_MIN_HOURS);
    return Math.round(hours * 60 * 60 * 1000);
  }

  /**
   * ✅ توليد صورة التنبيه مع تحسين الأداء والتخزين المؤقت
   */
  async generateNoticeImage(text) {
    try {
      // ✅ التحقق من الكاش أولاً
      const cacheKey = text.substring(0, 50);
      if (this.imageCache.has(cacheKey)) {
        const cached = this.imageCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 3600000) { // ساعة واحدة
          logger.info(`📦 Using cached image: "${text}"`);
          return cached.buffer;
        }
        this.imageCache.delete(cacheKey);
      }

      const templatePath = path.join(__dirname, '../assets/templates/notice_template.png');

      const exists = await fs.pathExists(templatePath);
      if (!exists) {
        logger.error(`Image template not found: ${templatePath}`);
        return null;
      }

      // ✅ تحميل الصورة مع مهلة
      const image = await Promise.race([
        loadImage(templatePath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout loading image')), 10000)
        )
      ]);

      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      // رسم القالب
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // ===== كتابة النص على القالب =====
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // تحديد حجم الخط حسب طول النص
      let fontSize = 100;
      if (text.length > 30) fontSize = 100;
      if (text.length > 50) fontSize = 100;
      if (text.length > 70) fontSize = 70;

      // استخدام الخط المخصص
      try {
        const fontPath = path.join(__dirname, 'PrayerFont', 'Traditional-Arabic.ttf');
        const fontExists = fs.existsSync(fontPath);

        if (fontExists) {
          ctx.font = `bold ${fontSize}px "${NOTICE_FONT_FAMILY}", "Arial", "Tahoma", sans-serif`;
        } else {
          ctx.font = `bold ${fontSize}px "Arial", "Tahoma", sans-serif`;
        }
      } catch (error) {
        ctx.font = `bold ${fontSize}px "Arial", "Tahoma", sans-serif`;
      }

      ctx.fillStyle = '#c4a131';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const x = canvas.width / 2;
      const y = (canvas.height / 2) - 40;

      // تقسيم النص الطويل لسطور
      if (text.length > 40) {
        const words = text.split(' ');
        let lines = [];
        let currentLine = '';

        for (const word of words) {
          if ((currentLine + ' ' + word).length < 35) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);

        const lineHeight = fontSize + 15;
        const startY = (canvas.height / 2) - ((lines.length - 1) * lineHeight / 2) - 40;

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], x, startY + (i * lineHeight));
        }
      } else {
        ctx.fillText(text, x, y);
      }

      ctx.shadowBlur = 0;

      const buffer = canvas.toBuffer('image/png');
      
      // ✅ تخزين في الكاش
      this.imageCache.set(cacheKey, {
        buffer: buffer,
        timestamp: Date.now()
      });

      return buffer;
    } catch (error) {
      logger.error('Failed to render image:', error.message);
      return null;
    }
  }

  // بتتأكد إن البوت معاه صلاحيات الإرسال في الروم
  async checkBotPermissions(guildId, channel) {
    try {
      if (!channel) {
        logger.warn(`Channel not found for server ${guildId}`);
        return false;
      }

      if (!channel.guild) {
        logger.warn(`Channel has no guild for server ${guildId}`);
        return false;
      }

      const me = channel.guild.members?.me;
      if (!me) {
        logger.warn(`Could not find the bot in server ${guildId}`);
        return false;
      }

      const permissions = channel.permissionsFor(me);
      if (!permissions) {
        logger.warn(`Could not retrieve permissions for server ${guildId}`);
        return false;
      }

      const requiredPermissions = ['SendMessages', 'AttachFiles', 'EmbedLinks', 'ViewChannel'];
      const missingPermissions = requiredPermissions.filter(p => !permissions.has(p));

      if (missingPermissions.length > 0) {
        logger.warn(`Insufficient permissions in server ${guildId}: ${missingPermissions.join(', ')}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to verify permissions:', error.message);
      return false;
    }
  }

  getDefaultChannel(guild) {
    try {
      if (!guild) return null;

      const guildId = guild.id;
      // ✅ ممنوع استخدام روم لأكثر من غرض: نستبعد أي قناة معينة بالفعل
      // لقناة التحكم/الصوت/الأذكار/الصلاة، حتى لو دورنا على قناة بديلة للتنبيهات
      const reservedChannelIds = new Set(
        [
          guildSettings.getSetting(guildId, 'controlPanelChannelId'),
          guildSettings.getSetting(guildId, 'voiceChannelId'),
          guildSettings.getSetting(guildId, 'azkarChannelId'),
          guildSettings.getSetting(guildId, 'prayerChannelId')
        ].filter(Boolean)
      );

      const channels = guild.channels.cache;

      // البحث عن قناة عامة
      const generalChannel = channels.find(c =>
        c.type === 0 &&
        !reservedChannelIds.has(c.id) &&
        c.name.toLowerCase().includes('general') &&
        c.permissionsFor(guild.members.me).has(['SendMessages', 'AttachFiles', 'EmbedLinks', 'ViewChannel'])
      );
      if (generalChannel) return generalChannel;

      // البحث عن أي قناة نصية غير مستخدمة لغرض آخر
      const textChannel = channels.find(c =>
        c.type === 0 &&
        !reservedChannelIds.has(c.id) &&
        c.permissionsFor(guild.members.me).has(['SendMessages', 'AttachFiles', 'EmbedLinks', 'ViewChannel'])
      );
      if (textChannel) return textChannel;

      return null;
    } catch (error) {
      logger.error('Failed to find channel:', error.message);
      return null;
    }
  }

  canSend(guildId) {
    const last = this.lastSendTime.get(guildId) || 0;
    const now = Date.now();
    return (now - last) >= this.minInterval;
  }

  /**
   * ✅ إرسال التنبيه - نسخة محسنة مع معالجة أفضل للأخطاء
   */
  async sendNotice(guildId, channel) {
    // ✅ منع التكرار المتزامن
    if (this.isProcessing.get(guildId)) {
      logger.info(`⏳ Already processing a notice for server ${guildId}, ignoring this request`);
      return;
    }

    // ✅ التحقق من الحد الأدنى للفاصل الزمني
    if (!this.canSend(guildId)) {
      const waitTime = this.minInterval - (Date.now() - (this.lastSendTime.get(guildId) || 0));
      logger.info(`⏳ Delaying notice for server ${guildId} by ${Math.ceil(waitTime / 1000)} second(s)`);

      setTimeout(() => {
        this.sendNotice(guildId, channel);
      }, waitTime);
      return;
    }

    // ✅ قفل المعالجة
    this.isProcessing.set(guildId, true);

    let targetChannel = channel;

    try {
      // ✅ البحث عن قناة إذا لم يتم توفيرها
      if (!targetChannel && clientInstance) {
        const guild = clientInstance.guilds.cache.get(guildId);
        if (guild) {
          targetChannel = this.getDefaultChannel(guild);
        }
      }

      if (!targetChannel) {
        logger.warn(`No channel available for server ${guildId}`);
        this.scheduleNextNotice(guildId, null);
        return;
      }

      // ✅ التحقق من تمكين التنبيهات
      const enabled = guildSettings.getSetting(guildId, 'noticeEnabled');
      if (enabled === false) {
        logger.info(`⏹️ Notices stopped in server ${guildId}`);
        return;
      }

      // ✅ التحقق من الصلاحيات
      const hasPermissions = await this.checkBotPermissions(guildId, targetChannel);
      if (!hasPermissions) {
        logger.warn(`Insufficient permissions in server ${guildId}`);
        this.scheduleNextNotice(guildId, targetChannel);
        return;
      }

      const messageText = this.getRandomNotice();
      logger.info(`📝 Generating image for text: "${messageText}" in server ${guildId}`);

      // ✅ توليد الصورة باستخدام القالب (مع مهلة)
      const imageBuffer = await Promise.race([
        this.generateNoticeImage(messageText),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout generating image')), IMAGE_GENERATION_TIMEOUT_MS)
        )
      ]);

      // ❌ إذا فشل توليد الصورة -> لا نرسل أي شيء
      if (!imageBuffer) {
        logger.error(`Failed to generate image for server ${guildId}`);
        this.scheduleNextNotice(guildId, targetChannel);
        return;
      }

      // ✅ إعداد المرفقات
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'notice.png' });
      const embed = new EmbedBuilder()
        .setColor(0xD4AF37)
        .setImage('attachment://notice.png');

      logger.info(`📤 Sending notice (image only) for server ${guildId}`);

      // ✅ إرسال الصورة مع مهلة زمنية أطول (30 ثانية)
      await Promise.race([
        targetChannel.send({
          embeds: [embed],
          files: [attachment],
          allowedMentions: { parse: [] }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout sending notice (${NOTICE_SEND_TIMEOUT_MS / 1000}s)`)), NOTICE_SEND_TIMEOUT_MS)
        )
      ]);

      logger.info(`✅ Notice (image) sent in server ${guildId}`);

      // ✅ تحديث وقت الإرسال (في الذاكرة + في ملف الـ json الخاص بالسيرفر)
      const sentAt = Date.now();
      this.lastSendTime.set(guildId, sentAt);
      guildDataModel.updateNoticeState(guildId, { lastSentAt: sentAt });

      // ✅ جدولة التنبيه القادم
      this.scheduleNextNotice(guildId, targetChannel);

    } catch (error) {
      const errorMsg = error?.message || error?.toString() || 'خطأ غير معروف';
      
      // ✅ تمييز أنواع الأخطاء
      if (errorMsg.includes('Timeout generating image')) {
        logger.error(`Image generation timed out for server ${guildId}`);
      } else if (errorMsg.includes('Timeout sending notice')) {
        logger.error(`Notice send timed out for server ${guildId} - Discord may be slow`);
      } else {
        logger.error(`Failed to send notice for server ${guildId}:`, errorMsg);
      }

      // ✅ إعادة المحاولة بعد فترة أطول في حالة فشل الشبكة
      const retryDelay = 60000; // دقيقة واحدة
      logger.info(`🔄 Will retry the notice for server ${guildId} in ${retryDelay / 1000} second(s)`);
      
      setTimeout(() => {
        this.sendNotice(guildId, targetChannel || null);
      }, retryDelay);

    } finally {
      // ✅ فتح القفل بعد انتهاء المعالجة
      setTimeout(() => {
        this.isProcessing.delete(guildId);
      }, 1000);
    }
  }

  // بتجدول التنبيه الجاي
  scheduleNextNotice(guildId, channel) {
    try {
      this.cancelNotice(guildId);

      const enabled = guildSettings.getSetting(guildId, 'noticeEnabled');
      if (enabled === false) {
        logger.info(`⏹️ Notices stopped in server ${guildId}`);
        return;
      }

      const delay = this.getDelay();
      const hours = (delay / (60 * 60 * 1000)).toFixed(2);
      logger.info(`⏰ Next notice scheduled for server ${guildId} in ${hours} hour(s)`);

      // ✅ حفظ ميعاد الإرسال القادم في ملف الـ json الخاص بالسيرفر
      // عشان لو البوت اترستارت، يعرف يكمل من نفس الميعاد بدل ما يبعت تنبيه فورًا بالغلط
      guildDataModel.updateNoticeState(guildId, { nextSendAt: Date.now() + delay });

      const timer = setTimeout(async () => {
        try {
          await this.sendNotice(guildId, channel);
        } catch (error) {
          logger.error(`Failed to run scheduled notice for server ${guildId}:`, error.message);
        }
      }, delay);

      this.noticeTimers.set(guildId, timer);
    } catch (error) {
      logger.error(`Failed to schedule notice for server ${guildId}:`, error.message);
    }
  }

  // بتلغي التنبيه المجدول
  cancelNotice(guildId) {
    try {
      const timer = this.noticeTimers.get(guildId);
      if (timer) {
        clearTimeout(timer);
        this.noticeTimers.delete(guildId);
        logger.info(`⏹️ Notice schedule cancelled in server ${guildId}`);
      }
    } catch (error) {
      logger.error(`Failed to cancel notice for server ${guildId}:`, error.message);
    }
  }

  /**
   * ✅ استئناف جدولة التنبيهات بعد إعادة تشغيل البوت اعتمادًا على الميعاد
   * المحفوظ في ملف الـ json الخاص بالسيرفر (channels.notice.nextSendAt).
   * - لو الميعاد لسه ما جاش: نجدول الإرسال في نفس الوقت المتبقي بالظبط (بدون تكرار مبكر).
   * - لو الميعاد فات (البوت كان مقفول) أو مفيش ميعاد محفوظ أصلاً: نرسل أول تنبيه الآن.
   */
  resumeSchedule(guildId, channel) {
    try {
      this.cancelNotice(guildId);

      const enabled = guildSettings.getSetting(guildId, 'noticeEnabled');
      if (enabled === false) {
        logger.info(`⏹️ Notices stopped in server ${guildId}`);
        return;
      }

      const state = guildDataModel.getNoticeState(guildId);

      if (state.nextSendAt && state.nextSendAt > Date.now()) {
        const remaining = state.nextSendAt - Date.now();
        const hours = (remaining / (60 * 60 * 1000)).toFixed(2);
        logger.info(`⏰ Resuming notice schedule for server ${guildId}, next notice in ${hours} hour(s) (from saved state)`);

        if (state.lastSentAt) this.lastSendTime.set(guildId, state.lastSentAt);

        const timer = setTimeout(async () => {
          try {
            await this.sendNotice(guildId, channel);
          } catch (error) {
            logger.error(`Failed to run scheduled notice for server ${guildId}:`, error.message);
          }
        }, remaining);

        this.noticeTimers.set(guildId, timer);
      } else {
        logger.info(`🚀 No valid saved schedule for server ${guildId}, sending the first notice now`);
        this.triggerImmediateNotice(guildId, channel);
      }
    } catch (error) {
      logger.error(`Failed to resume notice schedule for server ${guildId}:`, error.message);
      this.triggerImmediateNotice(guildId, channel);
    }
  }

  async triggerImmediateNotice(guildId, channel) {
    try {
      logger.info(`🚀 Sending the first notice immediately on bot startup in server ${guildId}`);

      let targetChannel = channel;
      if (!targetChannel && clientInstance) {
        const guild = clientInstance.guilds.cache.get(guildId);
        if (guild) {
          targetChannel = this.getDefaultChannel(guild);
        }
      }

      if (!targetChannel) {
        logger.warn(`No channel to send the first notice in server ${guildId}`);
        return;
      }

      await this.sendNotice(guildId, targetChannel);
    } catch (error) {
      logger.error(`Failed to send the first notice for server ${guildId}:`, error.message);
    }
  }

  // بتشغّل التنبيهات لكل السيرفرات
  async startAllNotices() {
    try {
      if (!clientInstance) {
        logger.error('Client is not set! Call setClient first');
        return;
      }

      const guilds = clientInstance.guilds.cache;
      logger.info(`🔄 Starting notices for ${guilds.size} server(s)`);

      let delay = 0;
      for (const [guildId, guild] of guilds) {
        try {
          const enabled = guildSettings.getSetting(guildId, 'noticeEnabled');
          if (enabled === false) continue;

          const channel = this.getDefaultChannel(guild);
          if (channel) {
            const randomDelay = 5000 + Math.random() * 25000;
            delay += randomDelay;

            setTimeout(() => {
              this.resumeSchedule(guildId, channel);
            }, delay);

            logger.info(`⏳ Notice scheduled for server ${guildId} in ${Math.ceil(delay / 1000)} second(s)`);
          } else {
            logger.warn(`No valid channel for server ${guildId}`);
          }
        } catch (error) {
          logger.error(`Failed to start notices for server ${guildId}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('Failed to start all notices:', error.message);
    }
  }

  updateSettings(guildId, settings) {
    try {
      this.cancelNotice(guildId);

      if (settings.noticeEnabled !== undefined) {
        guildSettings.set(guildId, 'noticeEnabled', settings.noticeEnabled);
      }

      if (settings.noticeInterval !== undefined) {
        guildSettings.set(guildId, 'noticeInterval', settings.noticeInterval);
      }

      if (settings.noticeEnabled === true && clientInstance) {
        const guild = clientInstance.guilds.cache.get(guildId);
        if (guild) {
          const channel = this.getDefaultChannel(guild);
          if (channel) {
            this.scheduleNextNotice(guildId, channel);
            logger.info(`✅ Notices enabled for server ${guildId}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to update settings for server ${guildId}:`, error.message);
    }
  }
}

const noticeService = new NoticeService();
module.exports = noticeService;