// ============================================================
// 📄 services/prayerService.js
// خدمة مواقيت الصلاة: بتجيب المواقيت من aladhan API، بتعمل صورة المواقيت، وبتبعت إشعار الأذان في وقته
// صورة المواقيت من assets/templates/prayer_template.png
// ============================================================

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const guildSettings = require('../models/GuildSettings');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const guildDataModel = require('../models/GuildData');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { requestWithRetry } = require('../utils/httpClient');

// ============================================================
// إعدادات الصورة
// ============================================================

const TEMPLATE_FILENAME = 'prayer_template.png';
const TEMPLATE_PATH = path.join(__dirname, '../assets/templates', TEMPLATE_FILENAME);

const FONT_FILENAME = 'Cairo-VariableFont_slnt,wght.ttf';
const FONT_PATH = path.join(__dirname, '../assets/fonts', FONT_FILENAME);
const FONT_FAMILY = 'PrayerSFSultanBlack';

// تسجيل الخط
try {
  if (fs.existsSync(FONT_PATH)) {
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    logger.info('✅ Loaded image font SF Sultan Black');
  } else {
    const altPaths = [
      path.join(__dirname, '../fonts/Cairo-VariableFont_slnt,wght.ttf'),
      path.join(process.cwd(), 'assets/fonts/Cairo-VariableFont_slnt,wght.ttf'),
      path.join(process.cwd(), 'bot/assets/fonts/Cairo-VariableFont_slnt,wght.ttf'),
      path.join(process.cwd(), 'fonts/Cairo-VariableFont_slnt,wght.ttf')
    ];

    let found = false;
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        GlobalFonts.registerFromPath(altPath, FONT_FAMILY);
        logger.info(`✅ Loaded SF Sultan Black font from: ${altPath}`);
        found = true;
        break;
      }
    }

    if (!found) {
      logger.warn(`SF Sultan Black font not found, using the default font`);
    }
  }
} catch (error) {
  logger.error('Failed to register image font:', error.message);
}

// ترتيب الأعمدة
const IMAGE_CONFIG = {
  columns: {
    Isha:    { xFraction: 0.142 },
    Maghrib: { xFraction: 0.328 },
    Asr:     { xFraction: 0.505 },
    Dhuhr:   { xFraction: 0.680 },
    Fajr:    { xFraction: 0.857 }
  },
  boxYFraction: 0.905,
  timeFontSize: 0.040,
  timeColor: '#caaf7a',
  timeStrokeColor: '#0c101c',
  timeStrokeWidth: 0,
  timeLetterSpacing: 1.5,
  timeShadowBlur: 0,
  timeShadowOffsetY: 0.003,
  countryXFraction: 0.570,
  countryYFraction: 0.30,
  countryFontSize: 0.034,
  countryColor: '#caaf7a',
  countryStrokeColor: '#0c101c',
  countryStrokeWidth: 0,
  countryShadowBlur: 0,
  countryShadowOffsetY: 0.002
};

// ============================================================
// إعدادات ثابتة
// ============================================================
// ملحوظة هامة: prayer_channel مخصصة فقط لرسالة مواقيت الصلاة + تنبيه الأذان.
// تنبيه الأذان بيتبعت كرسالة مستقلة (رد Reply على رسالة المواقيت الثابتة)،
// وبيتحفظ الـ id بتاعها في data/pending_adhan_messages.json + ملف الـ json
// الخاص بالسيرفر (data/guilds/<id>.json)، وبعد 20 دقيقة بتتحذف الرسالة نهائيًا
// ويتشال الـ id بتاعها من الملفين.
const ADHAN_ALERT_LIFETIME_MS = 20 * 60 * 1000; // 20 دقيقة - مدة بقاء رسالة تنبيه الأذان قبل حذفها نهائيًا
const ADHAN_CHECK_INTERVAL_MS = 20 * 1000; // 20 ثانية
const PRAYER_MESSAGES_FILE = './data/prayer_messages.json';
const NOTICE_STATE_FILE = './data/notice_state.json';
const PENDING_DELETIONS_FILE = './data/pending_adhan_messages.json';

class PrayerService {
  constructor() {
    this.configs = new Map();
    this.prayerTimes = new Map();
    this.prayerMessages = new Map();
    this.dailyUpdateTimers = new Map();
    this.adhanCheckers = new Map();
    this.notifiedPrayers = new Map();
    this.sendingLock = new Map(); // قفل لمنع إرسال رسالتين في نفس الوقت

    // ✅ تتبع الرسائل المؤقتة (تنبيه الأذان / التنبيهات) المُراد حذفها بعد 20 دقيقة
    // يتم حفظها في JSON عشان لو البوت اتقفل/ريستارت ونسي يحذفها، تتحذف فورًا لما يرجع يشتغل
    this.pendingDeletions = new Map(); // key: messageId -> { guildId, channelId, messageId, deleteAt }
    this.deletionTimers = new Map(); // key: messageId -> Timeout

    this.loadPrayerMessages();
    this.loadNoticeState();
    this.loadPendingDeletions();
    logger.info('🕌 Prayer service initialized');
  }

  // ============================================================
  // تحميل وحفظ بيانات الرسائل
  // ============================================================
  
  loadPrayerMessages() {
    try {
      if (fs.existsSync(PRAYER_MESSAGES_FILE)) {
        const data = fs.readJsonSync(PRAYER_MESSAGES_FILE);
        for (const [guildId, messageId] of Object.entries(data)) {
          this.prayerMessages.set(guildId, messageId);
        }
        logger.info(`✅ Loaded ${this.prayerMessages.size} prayer message(s)`);
      }
    } catch (error) {
      logger.error('Failed to load prayer messages:', error.message);
    }
  }

  savePrayerMessages() {
    try {
      const data = Object.fromEntries(this.prayerMessages);
      fs.ensureDirSync(path.dirname(PRAYER_MESSAGES_FILE));
      fs.writeJsonSync(PRAYER_MESSAGES_FILE, data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save prayer messages:', error.message);
    }
  }

  /**
   * ✅ يحفظ معرف رسالة المواقيت في مكانين:
   * 1) data/prayer_messages.json (خريطة سريعة داخلية للخدمة)
   * 2) ملف الـ json الخاص بالسيرفر نفسه (data/guilds/<id>.json) - وهو المصدر
   *    الرسمي المطلوب حسب سياسة "رسالة واحدة فقط لكل سيرفر تُحفظ في ملف السيرفر"
   */
  savePrayerMessageId(guildId, messageId, channelId) {
    this.prayerMessages.set(guildId, messageId);
    this.savePrayerMessages();
    try {
      guildDataModel.updatePrayerMessage(guildId, messageId, channelId);
    } catch (error) {
      logger.error(`Failed to sync prayer message to guild data for server ${guildId}:`, error.message);
    }
  }

  // ============================================================
  // حفظ واستعادة حالة التنبيهات (لمنع التكرار)
  // ============================================================
  
  loadNoticeState() {
    try {
      if (fs.existsSync(NOTICE_STATE_FILE)) {
        const data = fs.readJsonSync(NOTICE_STATE_FILE);
        for (const [guildId, state] of Object.entries(data)) {
          this.notifiedPrayers.set(guildId, state);
        }
        logger.info(`✅ Loaded notification state for ${this.notifiedPrayers.size} server(s)`);
      }
    } catch (error) {
      logger.error('Failed to load notification state:', error.message);
    }
  }

  saveNoticeState() {
    try {
      const data = Object.fromEntries(this.notifiedPrayers);
      fs.ensureDirSync(path.dirname(NOTICE_STATE_FILE));
      fs.writeJsonSync(NOTICE_STATE_FILE, data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save notification state:', error.message);
    }
  }

  // ============================================================
  // ✅ نظام موحّد لإرجاع رسالة المواقيت لوضعها الطبيعي بعد ظهور تنبيه الأذان بـ 20 دقيقة
  // (رسالة المواقيت تبقى رسالة واحدة دايمًا - بيتم تعديلها فقط، لا حذف ولا إرسال جديد)
  // ============================================================

  loadPendingDeletions() {
    try {
      if (fs.existsSync(PENDING_DELETIONS_FILE)) {
        const data = fs.readJsonSync(PENDING_DELETIONS_FILE);
        for (const [messageId, entry] of Object.entries(data)) {
          this.pendingDeletions.set(messageId, entry);
        }
        logger.info(`✅ Loaded ${this.pendingDeletions.size} pending adhan alert revert(s)`);
      }
    } catch (error) {
      logger.error('Failed to load pending adhan alert reverts:', error.message);
    }
  }

  savePendingDeletions() {
    try {
      const data = Object.fromEntries(this.pendingDeletions);
      fs.ensureDirSync(path.dirname(PENDING_DELETIONS_FILE));
      fs.writeJsonSync(PENDING_DELETIONS_FILE, data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save pending adhan alert reverts:', error.message);
    }
  }

  /**
   * يسجّل أن رسالة تنبيه الأذان (الرسالة الجديدة اللي اتبعتت كرد على رسالة المواقيت)
   * لازم تتحذف نهائيًا بعد 20 دقيقة، ويحفظ ده في JSON فورًا. لو البوت اتقفل قبل ما
   * يحذفها، هيحذفها تلقائيًا أول ما يشتغل (sweepPendingDeletions).
   */
  trackAndScheduleDeletion(client, { guildId, channelId, messageId, deleteAt }) {
    this.pendingDeletions.set(messageId, { guildId, channelId, messageId, deleteAt });
    this.savePendingDeletions();
    this.scheduleDeletion(client, messageId);
  }

  scheduleDeletion(client, messageId) {
    const entry = this.pendingDeletions.get(messageId);
    if (!entry) return;

    // امسح أي تايمر قديم لنفس الرسالة قبل ما نضيف واحد جديد
    const oldTimer = this.deletionTimers.get(messageId);
    if (oldTimer) clearTimeout(oldTimer);

    const remaining = Math.max(0, entry.deleteAt - Date.now());

    const timer = setTimeout(() => {
      this.deleteTrackedMessage(client, messageId);
    }, remaining);

    this.deletionTimers.set(messageId, timer);
  }

  /**
   * يحذف رسالة تنبيه الأذان نهائيًا من ديسكورد بعد مرور 20 دقيقة على إرسالها،
   * ويشيل الـ id بتاعها من data/pending_adhan_messages.json ومن ملف الـ json
   * الخاص بالسيرفر (data/guilds/<id>.json). رسالة مواقيت الصلاة نفسها لا تتأثر إطلاقًا.
   */
  async deleteTrackedMessage(client, messageId) {
    const entry = this.pendingDeletions.get(messageId);
    if (!entry) return;

    try {
      const channel = await client.channels.fetch(entry.channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
        if (msg && msg.author.id === client.user.id) {
          await msg.delete().catch(() => {});
          logger.info(`🗑️ Adhan alert message deleted (after 20 minutes) for server ${entry.guildId}`);
        }
      }
    } catch (error) {
      // تجاهل - الرسالة أو القناة ممكن تكون اتحذفت بالفعل
    } finally {
      try {
        guildDataModel.removePendingAdhanMessage(entry.guildId, messageId);
      } catch (error) {
        logger.error(`Failed to remove pending adhan message from guild data file for server ${entry.guildId}:`, error.message);
      }
      this.untrackDeletion(messageId);
    }
  }

  untrackDeletion(messageId) {
    this.pendingDeletions.delete(messageId);
    const timer = this.deletionTimers.get(messageId);
    if (timer) clearTimeout(timer);
    this.deletionTimers.delete(messageId);
    this.savePendingDeletions();
  }

  /**
   * ✅ تُستدعى مرة واحدة لما البوت يشتغل (بعد ما يبقى الـ client جاهز).
   * أي رسالة كان معادها فات (يعني البوت كان مقفول وقتها ونسي يرجّعها) هترجع فورًا،
   * وأي رسالة لسه معادها ما جاش هيتم جدولة رجوعها بالوقت المتبقي.
   */
  sweepPendingDeletions(client) {
    if (this.pendingDeletions.size === 0) return;

    logger.info(`🔎 Checking ${this.pendingDeletions.size} pending adhan alert revert(s) from before restart...`);
    for (const messageId of Array.from(this.pendingDeletions.keys())) {
      const entry = this.pendingDeletions.get(messageId);
      if (!entry) continue;

      if (entry.deleteAt <= Date.now()) {
        // فات معادها والبوت كان مقفول - رجّعها فورًا
        this.deleteTrackedMessage(client, messageId);
      } else {
        this.scheduleDeletion(client, messageId);
      }
    }
  }

  // ============================================================
  // جلب مواقيت الصلاة
  // ============================================================
  
  async fetchPrayerTimes(city, country, method = 5) {
    try {
      const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;

      const response = await requestWithRetry({
        method: 'GET',
        url: url,
        timeout: 10000,
        headers: { 'User-Agent': 'Wartil-Quran-Bot/1.0' }
      }, 1);

      if (response.data && response.data.data) {
        const timings = response.data.data.timings;
        const date = response.data.data.date;
        const meta = response.data.data.meta || {};

        // ✅ إصلاح جذري: نحفظ التوقيت الزمني (Timezone) الحقيقي الخاص بالمدينة/الدولة
        // المختارة زي ما رجعه الـ API نفسه. من غيره كان بيتم مقارنة أوقات الصلاة
        // (المحسوبة بتوقيت الدولة المختارة) بساعة السيرفر المستضيف للبوت مباشرة
        // بدون أي تحويل، فكانت النتيجة تنبيهات أذان في أوقات غلط تمامًا لكل الصلوات.
        if (!meta.timezone) {
          logger.warn(`No timezone returned by the API for ${city}, ${country} - adhan alert times may be inaccurate`);
        }

        return {
          Fajr: timings.Fajr,
          Dhuhr: timings.Dhuhr,
          Asr: timings.Asr,
          Maghrib: timings.Maghrib,
          Isha: timings.Isha,
          timezone: meta.timezone || null,
          date: date.readable,
          gregorian: date.gregorian.date,
          hijri: date.hijri.date,
          month: date.hijri.month.ar,
          year: date.hijri.year,
          day: date.hijri.day,
          weekday: date.hijri.weekday.ar
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to fetch prayer times:', error.message);
      return null;
    }
  }

  // ============================================================
  // دوال مساعدة
  // ============================================================
  
  formatTime12(timeStr) {
    if (!timeStr) return '--:--';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;

    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;

    let hours = parseInt(parts[0]);
    const minutes = parts[1].substring(0, 2);
    const ampm = hours >= 12 ? 'م' : 'ص';

    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes} ${ampm}`;
  }

  // بتنضّف صيغة الوقت
  cleanTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.split(' ')[0].substring(0, 5);
  }

  /**
   * ✅ يرجّع الوقت الحالي (ساعة:دقيقة) بتوقيت الدولة/المدينة المختارة فعليًا
   * (مثال: "Africa/Cairo"، "Asia/Riyadh") بدل ما كان بياخد وقت السيرفر المستضيف
   * للبوت مباشرة - وده كان هو السبب الرئيسي في إن تنبيهات الأذان كانت بتتبعت
   * في أوقات غلط تمامًا ومش متطابقة مع الدولة المختارة في /setup أو /country.
   *
   * لو الـ timezone مش متوفر لأي سبب (فشل الـ API في إرجاعه)، بيرجع لوقت
   * السيرفر كحل احتياطي أخير مع تسجيل تحذير، عشان الخدمة تفضل شغالة بدل ما تقف.
   */
  getCurrentTimeHHMM(timezone) {
    if (!timezone) {
      logger.warn('getCurrentTimeHHMM: no timezone provided, falling back to the host server clock (times may be wrong)');
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    try {
      const { hour, minute } = this.getZonedTimeParts(timezone);
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } catch (error) {
      logger.error(`getCurrentTimeHHMM: invalid timezone "${timezone}", falling back to the host server clock:`, error.message);
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
  }

  /**
   * ✅ يرجّع تاريخ ووقت اللحظة الحالية (سنة/شهر/يوم/ساعة/دقيقة/ثانية) بتوقيت
   * منطقة زمنية (IANA timezone) محددة، باستخدام Intl المدمجة في Node.js
   * (مفيش حاجة تتنصب زيادة).
   */
  getZonedTimeParts(timezone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const map = {};
    for (const part of dtf.formatToParts(new Date())) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }

    // بعض البيئات بترجع الساعة "24" عند منتصف الليل بالظبط مع hour12:false
    let hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0;

    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour,
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10)
    };
  }

  /**
   * ✅ يحسب عدد المللي ثانية المتبقية لغاية منتصف الليل التالي بتوقيت الدولة/المدينة
   * المختارة (مش بتوقيت السيرفر). ده يضمن إن تحديث مواقيت الصلاة اليومي بيحصل
   * فعليًا مع بداية اليوم الجديد بتوقيت الدولة المختارة.
   */
  getMsUntilNextMidnight(timezone) {
    if (!timezone) {
      logger.warn('getMsUntilNextMidnight: no timezone provided, falling back to the host server midnight');
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime() - now.getTime();
    }

    try {
      const { hour, minute, second } = this.getZonedTimeParts(timezone);
      const secondsSinceMidnight = (hour * 3600) + (minute * 60) + second;
      const secondsUntilMidnight = (24 * 3600) - secondsSinceMidnight;
      return secondsUntilMidnight * 1000;
    } catch (error) {
      logger.error(`getMsUntilNextMidnight: invalid timezone "${timezone}", falling back to the host server midnight:`, error.message);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime() - now.getTime();
    }
  }

  timeToMinutes(time) {
    if (!time) return 0;
    const parts = time.split(':');
    if (parts.length < 2) return 0;
    let hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    if (time.includes('PM') && hours < 12) hours += 12;
    if (time.includes('AM') && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // اسم الصلاة بالعربي
  getPrayerNameAr(prayer) {
    const names = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
    return names[prayer] || prayer;
  }

  /**
   * ✅ دالة كانت مفقودة (bug): كانت بتتنادى في sendPrayerMessage()
   * لكن مش متعرّفة في الكلاس أصلاً، وده كان بيسبب:
   * "❌ خطأ في إرسال تنبيه الصلاة: this.getNextPrayerTime is not a function"
   *
   * بتحسب الصلاة القادمة والوقت المتبقي ليها كنص عربي جاهز للعرض.
   */
  getNextPrayerTime(currentTimes) {
    const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    // ✅ لازم نستخدم توقيت الدولة/المدينة المختارة (المحفوظ جوه currentTimes.timezone)
    // مش وقت السيرفر، وإلا هتبقى "الصلاة القادمة" ووقتها المتبقي غلط.
    const currentHHMM = this.getCurrentTimeHHMM(currentTimes.timezone);
    const currentMinutes = parseInt(currentHHMM.split(':')[0]) * 60 + parseInt(currentHHMM.split(':')[1]);

    let nextPrayer = null;
    let nextPrayerTime = null;
    let nextMinutes = null;

    for (const prayer of prayerOrder) {
      const timeMinutes = this.timeToMinutes(this.cleanTime(currentTimes[prayer]));
      if (timeMinutes > currentMinutes) {
        nextPrayer = prayer;
        nextPrayerTime = currentTimes[prayer];
        nextMinutes = timeMinutes;
        break;
      }
    }

    // لو مفيش صلاة قادمة النهاردة، يبقى القادمة هي فجر بكرة
    let diffMinutes;
    if (!nextPrayer) {
      nextPrayer = 'Fajr';
      nextPrayerTime = currentTimes.Fajr;
      nextMinutes = this.timeToMinutes(this.cleanTime(currentTimes.Fajr));
      diffMinutes = (24 * 60 - currentMinutes) + nextMinutes;
    } else {
      diffMinutes = nextMinutes - currentMinutes;
    }

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    let remainingText;
    if (hours > 0 && minutes > 0) {
      remainingText = `${hours} ساعة و ${minutes} دقيقة`;
    } else if (hours > 0) {
      remainingText = `${hours} ساعة`;
    } else {
      remainingText = `${minutes} دقيقة`;
    }

    return {
      prayer: nextPrayer,
      time: nextPrayerTime,
      remainingMinutes: diffMinutes,
      remainingText
    };
  }

  // إيموجي كل صلاة
  getPrayerEmoji(prayer) {
    const emojis = { Fajr: '🌙', Dhuhr: '☀️', Asr: '🌅', Maghrib: '🌤️', Isha: '🌙' };
    return emojis[prayer] || '🕌';
  }

  /**
   * ✅ دعاء / حديث قصير مرتبط بكل صلاة - يُستخدم فقط في رسالة تنبيه الأذان
   * وفقط عند اختيار رتبة يتم منشنها (شوف sendAdhanNotification).
   */
  getPrayerDua(prayer) {
    const map = {
      Fajr: 'قال رسول الله ﷺ: «ركعتا الفجر خير من الدنيا وما فيها» (رواه مسلم).',
      Dhuhr: 'قال رسول الله ﷺ: «إذا اشتد الحر فأبردوا بالصلاة» (متفق عليه) - فبادر بأداء صلاة الظهر في وقتها.',
      Asr: 'قال رسول الله ﷺ: «من صلى البردين دخل الجنة» (متفق عليه) - والبردان هما الفجر والعصر.',
      Maghrib: 'قال الله تعالى: ﴿أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ﴾ - فبادر إلى صلاة المغرب في وقتها.',
      Isha: 'قال رسول الله ﷺ: «من صلى العشاء في جماعة فكأنما قام نصف الليل» (رواه مسلم).'
    };
    return map[prayer] || 'اللهم اجعلنا من المحافظين على الصلوات في أوقاتها.';
  }

  /**
   * ✅ رسالة تحفيزية عشوائية قصيرة - تُضاف فقط مع الدعاء/الحديث عند اختيار رتبة للمنشن.
   */
  getRandomMotivation() {
    const list = [
      '🌟 الصلاة نور، فسارع إلى الخير ولا تدع الدنيا تشغلك عنها.',
      '🕋 حيّ على الصلاة، حيّ على الفلاح - اجعلها أول أولوياتك الآن.',
      '💫 دقائق معدودة تفصلك عن الوقوف بين يدي ربك، فلا تفوّت هذا الشرف.',
      '🤍 قم وتوضأ وأدِّ الصلاة في وقتها، فهي عمود الدين.',
      '✨ اجعل هذه الصلاة سببًا في راحة قلبك وطمأنينة يومك.'
    ];
    return list[Math.floor(Math.random() * list.length)];
  }

  // ============================================================
  // تحديث مواقيت الصلاة
  // ============================================================
  
  async updateGuildPrayerTimes(guildId) {
    try {
      let config = this.configs.get(guildId);

      if (!config) {
        const city = guildSettings.getSetting(guildId, 'prayerCity');
        const country = guildSettings.getSetting(guildId, 'prayerCountry');
        const method = guildSettings.getSetting(guildId, 'prayerMethod') || 5;

        if (city && country) {
          config = { city, country, method };
          this.configs.set(guildId, config);
        } else {
          logger.warn(`No prayer settings for server ${guildId}`);
          return null;
        }
      }

      const { city, country, method = 5 } = config;
      const times = await this.fetchPrayerTimes(city, country, method);

      if (times) {
        this.prayerTimes.set(guildId, times);
        logger.info(`✅ Prayer times updated for server ${guildId}`);
        return times;
      }
      return null;
    } catch (error) {
      logger.error('Failed to update prayer times:', error);
      return null;
    }
  }

  // ============================================================
  // إنشاء صورة المواقيت
  // ============================================================
  
  async generatePrayerImage(guildId) {
    try {
      let times = this.prayerTimes.get(guildId);
      if (!times) {
        times = await this.updateGuildPrayerTimes(guildId);
      }
      if (!times) {
        logger.warn(`No prayer times for server ${guildId}`);
        return null;
      }

      if (!fs.existsSync(TEMPLATE_PATH)) {
        logger.error(`Image template not found: ${TEMPLATE_PATH}`);
        return null;
      }

      const config = this.configs.get(guildId) || {
        country: guildSettings.getSetting(guildId, 'prayerCountry') || 'غير محدد'
      };

      const template = await loadImage(TEMPLATE_PATH);
      const canvas = createCanvas(template.width, template.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(template, 0, 0, template.width, template.height);

      let fontFamily = FONT_FAMILY;
      try {
        const testCtx = createCanvas(100, 100).getContext('2d');
        testCtx.font = `20px "${FONT_FAMILY}"`;
        testCtx.fillText('اختبار', 50, 50);
      } catch (e) {
        fontFamily = 'Traditional Arabic';
      }

      // كتابة الأوقات
      const prayerFontSize = Math.round(canvas.height * IMAGE_CONFIG.timeFontSize);
      ctx.font = `${prayerFontSize}px "${fontFamily}"`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.direction = 'ltr';

      ctx.shadowColor = IMAGE_CONFIG.timeShadowColor;
      ctx.shadowBlur = canvas.height * IMAGE_CONFIG.timeShadowBlur;
      ctx.shadowOffsetY = canvas.height * IMAGE_CONFIG.timeShadowOffsetY;

      const prayerTimeMap = {
        Fajr: times.Fajr,
        Dhuhr: times.Dhuhr,
        Asr: times.Asr,
        Maghrib: times.Maghrib,
        Isha: times.Isha
      };

      for (const [prayer, col] of Object.entries(IMAGE_CONFIG.columns)) {
        const timeText = this.formatTime12(prayerTimeMap[prayer]);
        const boxCenterX = canvas.width * col.xFraction;
        const y = canvas.height * IMAGE_CONFIG.boxYFraction;

        const textWidth = ctx.measureText(timeText).width;
        const drawX = boxCenterX - (textWidth / 2);

        ctx.lineWidth = canvas.height * IMAGE_CONFIG.timeStrokeWidth;
        ctx.strokeStyle = IMAGE_CONFIG.timeStrokeColor;
        ctx.strokeText(timeText, drawX, y);

        ctx.fillStyle = IMAGE_CONFIG.timeColor;
        ctx.fillText(timeText, drawX, y);
      }

      // كتابة اسم الدولة
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';

      const countryFontSize = Math.round(canvas.height * IMAGE_CONFIG.countryFontSize);
      ctx.font = `${countryFontSize}px "${fontFamily}"`;

      ctx.shadowColor = IMAGE_CONFIG.countryShadowColor;
      ctx.shadowBlur = canvas.height * IMAGE_CONFIG.countryShadowBlur;
      ctx.shadowOffsetY = canvas.height * IMAGE_CONFIG.countryShadowOffsetY;

      const countryText = `مـواقيـت الـصلاه بتوقيت : ${config.country}`;
      const cx = canvas.width * IMAGE_CONFIG.countryXFraction;
      const cy = canvas.height * IMAGE_CONFIG.countryYFraction;

      ctx.lineWidth = canvas.height * IMAGE_CONFIG.countryStrokeWidth;
      ctx.strokeStyle = IMAGE_CONFIG.countryStrokeColor;
      ctx.strokeText(countryText, cx, cy);

      ctx.fillStyle = IMAGE_CONFIG.countryColor;
      ctx.fillText(countryText, cx, cy);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      return canvas.toBuffer('image/png');
    } catch (error) {
      logger.error('Failed to generate prayer times image:', error.message);
      return null;
    }
  }

  // ============================================================
  // إنشاء Embed الصلاة
  // ============================================================
  
  createPrayerEmbed(guildId) {
    const times = this.prayerTimes.get(guildId);
    if (!times) return null;

    return new EmbedBuilder()
      .setColor('#9E7B4F')
      .setImage('attachment://prayer_times.png');
  }

  // ============================================================
  // إرسال/تحديث رسالة المواقيت (مع منع التكرار)
  // ============================================================
  
  async sendPrayerMessage(guildId, channel, client) {
    // قفل لمنع الإرسال المزدوج
    if (this.sendingLock.get(guildId)) {
      logger.warn(`Duplicate send attempt for server ${guildId}, ignored`);
      return null;
    }
    this.sendingLock.set(guildId, true);

    try {
      if (!channel) {
        logger.warn(`Channel not found for server ${guildId}`);
        return null;
      }

      // محاولة جلب الرسالة القديمة من الذاكرة
      const savedMessageId = this.prayerMessages.get(guildId);
      let existingMessage = null;

      if (savedMessageId) {
        try {
          existingMessage = await channel.messages.fetch(savedMessageId);
          if (!existingMessage || existingMessage.author.id !== client.user.id) {
            existingMessage = null;
          }
        } catch (error) {
          if (error.code === 10008) {
            // الرسالة غير موجودة
            this.prayerMessages.delete(guildId);
            this.savePrayerMessages();
          } else {
            logger.error(`Failed to fetch prayer message:`, error.message);
          }
          existingMessage = null;
        }
      }

      // إذا لم نجد الرسالة في الذاكرة، نبحث في القناة عن آخر رسالة من البوت
      if (!existingMessage) {
        try {
          const fetchedMessages = await channel.messages.fetch({ limit: 10 });
          const botMessages = fetchedMessages.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].image);
          if (botMessages.first()) {
            existingMessage = botMessages.first();
            this.savePrayerMessageId(guildId, existingMessage.id, channel.id);
            logger.info(`🔄 Found the previous prayer message in the channel for server ${guildId}`);
          }
        } catch (e) {
          logger.error('Failed to search for the previous message:', e.message);
        }
      }

      // تحديث المواقيت
      await this.updateGuildPrayerTimes(guildId);
      const embed = this.createPrayerEmbed(guildId);
      if (!embed) {
        logger.warn(`Could not create prayer message for server ${guildId}`);
        return null;
      }

      const imageBuffer = await this.generatePrayerImage(guildId);
      const files = imageBuffer
        ? [new AttachmentBuilder(imageBuffer, { name: 'prayer_times.png' })]
        : [];

      try {
        if (existingMessage) {
          // ✅ تعديل الرسالة الموجودة (الحل الأمثل لمنع التكرار)
          await existingMessage.edit({ embeds: [embed], files });
          this.savePrayerMessageId(guildId, existingMessage.id, channel.id);
          logger.info(`🔄 Updated the existing prayer message for server ${guildId}`);
        } else {
          // 🟡 إرسال رسالة جديدة فقط إذا لم تكن موجودة
          const message = await channel.send({ embeds: [embed], files });
          this.savePrayerMessageId(guildId, message.id, channel.id);
          logger.info(`🕌 Prayer times message sent for server ${guildId}`);
        }

        // جدولة التحديثات والتنبيهات (المواقيت + الأذان فقط - لا يوجد أي جدول تنبيهات آخر هنا)
        this.scheduleDailyUpdate(guildId, channel, client);
        this.startAdhanChecker(guildId, channel, client);

        // إعادة الرسالة النهائية
        const finalMessage = existingMessage || await channel.messages.fetch(this.prayerMessages.get(guildId));
        return finalMessage;

      } catch (error) {
        logger.error('Failed to send/edit prayer message:', error.message);
        // خطة بديلة: إذا فشل التعديل، أرسل واحدة جديدة
        const message = await channel.send({ embeds: [embed], files });
        this.savePrayerMessageId(guildId, message.id, channel.id);
        this.scheduleDailyUpdate(guildId, channel, client);
        this.startAdhanChecker(guildId, channel, client);
        return message;
      }

    } catch (error) {
      logger.error('Failed to send prayer message:', error.message);
      return null;
    } finally {
      // فتح القفل بعد الانتهاء
      this.sendingLock.delete(guildId);
    }
  }

  // بتحدّث رسالة المواقيت الموجودة
  async updatePrayerMessage(guildId, channel, client) {
    try {
      const messageId = this.prayerMessages.get(guildId);
      if (!messageId || !channel) return;

      if (!this.prayerTimes.get(guildId)) {
        await this.updateGuildPrayerTimes(guildId);
      }

      const embed = this.createPrayerEmbed(guildId);
      if (!embed) return;

      try {
        const message = await channel.messages.fetch(messageId);
        if (message && message.author.id === client.user.id) {
          const imageBuffer = await this.generatePrayerImage(guildId);
          const files = imageBuffer
            ? [new AttachmentBuilder(imageBuffer, { name: 'prayer_times.png' })]
            : [];
          await message.edit({ embeds: [embed], files });
        } else {
          this.prayerMessages.delete(guildId);
          this.savePrayerMessages();
          await this.sendPrayerMessage(guildId, channel, client);
        }
      } catch (error) {
        if (error.code === 10008) {
          this.prayerMessages.delete(guildId);
          this.savePrayerMessages();
          await this.sendPrayerMessage(guildId, channel, client);
        } else {
          logger.error(`Failed to update prayer message:`, error.message);
        }
      }
    } catch (error) {
      logger.error(`Failed to update prayer message:`, error.message);
    }
  }

  // ============================================================
  // التحديث اليومي (مرة واحدة في اليوم)
  // ============================================================
  
  scheduleDailyUpdate(guildId, channel, client) {
    const existingTimer = this.dailyUpdateTimers.get(guildId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      clearInterval(existingTimer);
      this.dailyUpdateTimers.delete(guildId);
    }

    // ✅ الإصلاح: الجدولة كانت بتحسب "منتصف الليل" بتوقيت السيرفر، فكان تحديث
    // مواقيت اليوم الجديد بيحصل في توقيت غلط بالنسبة للدولة المختارة. دلوقتي بنحسب
    // منتصف الليل الفعلي بتوقيت الدولة/المدينة المختارة (times.timezone).
    const timezone = this.prayerTimes.get(guildId)?.timezone;
    const delay = this.getMsUntilNextMidnight(timezone);

    const timer = setTimeout(async () => {
      await this.updateGuildPrayerTimes(guildId);
      await this.updatePrayerMessage(guildId, channel, client);

      // بنعيد الجدولة كل يوم بنفس المنطق (بدل setInterval ثابت كل 24 ساعة) عشان
      // تفضل متزامنة مع منتصف الليل الفعلي بتوقيت الدولة المختارة حتى لو
      // فيه تغيير في التوقيت الصيفي/الشتوي (DST) في تلك الدولة.
      this.scheduleDailyUpdate(guildId, channel, client);
    }, delay);

    this.dailyUpdateTimers.set(guildId, timer);
    logger.info(`🕌 Daily prayer-times update scheduled for server ${guildId}`);
  }

  // ============================================================
  // ✅ نظام الأذان (فحص كل 20 ثانية)
  // ============================================================
  
  hasNotifiedToday(guildId, prayer) {
    const today = new Date().toISOString().split('T')[0];
    const record = this.notifiedPrayers.get(guildId);

    if (!record || record.date !== today) {
      this.notifiedPrayers.set(guildId, { date: today, prayers: {} });
      return false;
    }

    return record.prayers && record.prayers[prayer] === true;
  }

  markNotifiedToday(guildId, prayer) {
    const today = new Date().toISOString().split('T')[0];
    let record = this.notifiedPrayers.get(guildId);

    if (!record || record.date !== today) {
      record = { date: today, prayers: {} };
      this.notifiedPrayers.set(guildId, record);
    }

    if (!record.prayers) record.prayers = {};
    record.prayers[prayer] = true;
    this.saveNoticeState();
  }

  // بتشوف دخل وقت صلاة ولا لأ وتبعت الأذان
  async checkAndSendAdhan(guildId, channel, client) {
    try {
      const times = this.prayerTimes.get(guildId);
      if (!times) return;

      // ✅ الإصلاح الأساسي: نقارن بوقت الدولة/المدينة المختارة فعليًا (times.timezone)
      // بدل ما كنا بنقارن بوقت السيرفر المستضيف للبوت مباشرة - وده كان بيخلي تنبيه
      // الأذان يتبعت في وقت غلط تمامًا (بفارق التوقيت بين السيرفر والدولة المختارة)
      // لكل صلاة من الصلوات الخمس.
      const currentHHMM = this.getCurrentTimeHHMM(times.timezone);
      const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

      for (const prayer of prayerOrder) {
        const prayerHHMM = this.cleanTime(times[prayer]);
        if (!prayerHHMM) continue;

        if (prayerHHMM === currentHHMM) {
          if (this.hasNotifiedToday(guildId, prayer)) continue;

          this.markNotifiedToday(guildId, prayer);
          await this.sendAdhanNotification(guildId, channel, client, prayer);
        }
      }
    } catch (error) {
      logger.error('Failed to check adhan time:', error.message);
    }
  }

  /**
   * ✅ تنبيه الأذان: يتم إرساله كرسالة مستقلة جديدة (رد Reply على رسالة المواقيت
   * الثابتة)، مع منشن الرتبة المختارة في /setup (لو موجودة). رسالة المواقيت
   * نفسها لا تتغير إطلاقًا.
   *
   * - لو مفيش رتبة محددة: بتتبعت رسالة الأذان بس (اسم الصلاة + الوقت) بدون أي منشن خالص.
   * - لو فيه رتبة محددة: بيتم منشنها + رسالة "أذان صلاة <الاسم>" + إمبد فيه دعاء/حديث
   *   عن الصلاة + رسالة تحفيزية.
   *
   * بعد 20 دقيقة يتم حذف هذه الرسالة نهائيًا وحذف الـ id بتاعها من data/pending_adhan_messages.json
   * ومن ملف الـ json الخاص بالسيرفر (شوف trackAndScheduleDeletion / deleteTrackedMessage).
   */
  async sendAdhanNotification(guildId, channel, client, prayerName) {
    try {
      // ✅ أمر /setup أو /prayer -> Off: البوت متوقف عن إرسال تنبيهات الأذان لهذا السيرفر
      const adhanEnabled = guildSettings.getSetting(guildId, 'adhanEnabled');
      if (adhanEnabled === false) return;

      const times = this.prayerTimes.get(guildId);
      if (!times) return;

      const config = this.configs.get(guildId) || {};
      const countryName = config.country
        || guildSettings.getSetting(guildId, 'prayerCountry')
        || 'غير محدد';

      const arabicName = this.getPrayerNameAr(prayerName);
      const timeFormatted = this.formatTime12(times[prayerName]);

      // ✅ الرتبة التي يتم منشنها (تُحدَّد من /setup عند اختيار prayer_channel، أو من /prayer)
      const mentionRoleId = guildSettings.getSetting(guildId, 'adhanMentionRoleId');

      // نحاول جلب رسالة المواقيت الثابتة عشان نرسل تنبيه الأذان كرد عليها
      const savedMessageId = this.prayerMessages.get(guildId);
      let targetMessage = null;
      if (savedMessageId) {
        try {
          targetMessage = await channel.messages.fetch(savedMessageId);
          if (!targetMessage || targetMessage.author.id !== client.user.id) {
            targetMessage = null;
          }
        } catch (err) {
          logger.warn(`Could not fetch the prayer times message to reply to for server ${guildId}: ${err.message}`);
          targetMessage = null;
        }
      }

      // ✅ إمبد الأذان: اسم الصلاة والوقت
      const adhanEmbed = new EmbedBuilder()
        .setColor(0x2E7D32)
        .setTitle(`🔔 حان الآن أذان صلاة ${arabicName}`)
        .setDescription(
          `**⏰ الوقت:** ${timeFormatted}\n` +
          `**📍 بتوقيت:** ${countryName}`
        )
        .setTimestamp();

      const messagePayload = {
        embeds: [adhanEmbed]
      };

      if (targetMessage) {
        messagePayload.reply = { messageReference: targetMessage.id, failIfNotExists: false };
      }

      if (mentionRoleId) {
        // ✅ فيه رتبة محددة: منشن + عنوان الأذان + دعاء/حديث + رسالة تحفيزية
        const duaEmbed = new EmbedBuilder()
          .setColor(0xC9A66B)
          .setTitle('🤲 دعاء وحديث عن الصلاة')
          .setDescription(this.getPrayerDua(prayerName))
          .addFields({ name: '✨ رسالة تحفيزية', value: this.getRandomMotivation() })
          .setFooter({ text: 'اللهم تقبل منا صلاتنا' });

        messagePayload.content = `<@&${mentionRoleId}> - 🔔 أذان صلاة ${arabicName}`;
        messagePayload.embeds.push(duaEmbed);
        messagePayload.allowedMentions = { roles: [mentionRoleId] };
      } else {
        // ✅ مفيش رتبة محددة: تنبيه الأذان بس بدون أي منشن خالص
        messagePayload.content = '';
        messagePayload.allowedMentions = { parse: [] };
      }

      const sentMessage = await channel.send(messagePayload);

      logger.info(`🔔 Adhan alert for ${arabicName} sent (reply to the prayer-times message) in server ${guildId}`);

      // ✅ جدولة حذف رسالة تنبيه الأذان نهائيًا بعد 20 دقيقة (محفوظ في JSON عشان مايتنساش لو البوت اتقفل)
      this.trackAndScheduleDeletion(client, {
        guildId,
        channelId: channel.id,
        messageId: sentMessage.id,
        deleteAt: Date.now() + ADHAN_ALERT_LIFETIME_MS
      });

      // ✅ حفظ الـ id كمان في ملف الـ json الخاص بالسيرفر نفسه
      try {
        guildDataModel.addPendingAdhanMessage(guildId, sentMessage.id, channel.id);
      } catch (err) {
        logger.error(`Failed to persist pending adhan message in guild data file for server ${guildId}:`, err.message);
      }

    } catch (error) {
      logger.error('Failed to send adhan alert message:', error.message);
    }
  }

  // بتشغّل فحص الأذان كل دقيقة
  startAdhanChecker(guildId, channel, client) {
    this.stopAdhanChecker(guildId);

    const interval = setInterval(() => {
      this.checkAndSendAdhan(guildId, channel, client);
    }, ADHAN_CHECK_INTERVAL_MS);

    this.adhanCheckers.set(guildId, interval);
    logger.info(`🔔 Started monitoring adhan times for server ${guildId}`);
  }

  // بتوقف فحص الأذان
  stopAdhanChecker(guildId) {
    const interval = this.adhanCheckers.get(guildId);
    if (interval) {
      clearInterval(interval);
      this.adhanCheckers.delete(guildId);
    }
  }

  // ============================================================
  // إيقاف جميع الخدمات
  // ============================================================
  
  stopAll(guildId) {
    this.stopAdhanChecker(guildId);

    const dailyTimer = this.dailyUpdateTimers.get(guildId);
    if (dailyTimer) {
      clearTimeout(dailyTimer);
      clearInterval(dailyTimer);
      this.dailyUpdateTimers.delete(guildId);
    }

    this.prayerMessages.delete(guildId);
    this.savePrayerMessages();
    this.prayerTimes.delete(guildId);
    this.configs.delete(guildId);

    // إلغاء أي تايمرات إرجاع معلّقة تخص هذا السيرفر فقط (بدون التأثير على الرسالة نفسها في ديسكورد)
    for (const [messageId, entry] of Array.from(this.pendingDeletions.entries())) {
      if (entry.guildId === guildId) {
        const timer = this.deletionTimers.get(messageId);
        if (timer) clearTimeout(timer);
        this.deletionTimers.delete(messageId);
      }
    }

    logger.info(`⏹️ All prayer services stopped for server ${guildId}`);
  }
}

module.exports = new PrayerService();