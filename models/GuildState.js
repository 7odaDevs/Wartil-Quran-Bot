// ============================================================
// 📄 models/GuildState.js
// بيحفظ حالة كل سيرفر (بيشغّل إيه، وقف فين، حالة الاتصال) عشان البوت يكمّل بعد إعادة التشغيل
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { validateObject, isValidDiscordId } = require('../utils/validators');
const config = require('../config');

/**
 * نموذج حالة السيرفر
 * يدير حالة كل سيرفر بشكل منفصل (البث، الصلاة، إلخ)
 */
class GuildState {
  constructor() {
    this.states = new Map();
    this.statesFile = config.PATHS?.STATES || './data/guild_states.json';
    this.loadStates();
  }

  /**
   * تحميل الحالات من الملف
   */
  loadStates() {
    if (!fs.existsSync(this.statesFile)) {
      logger.info('📝 No saved states found, creating a new file');
      this.saveStates();
      return;
    }

    try {
      const data = fs.readJsonSync(this.statesFile);
      
      for (const [guildId, state] of Object.entries(data)) {
        if (isValidDiscordId(guildId)) {
          const validated = this.validateState(state);
          if (validated.valid) {
            this.states.set(guildId, validated.data);
          } else {
            logger.warn(`Invalid state data for server ${guildId}:`, validated.errors);
          }
        }
      }
      
      logger.info(`✅ Loaded state for ${this.states.size} server(s)`);
    } catch (error) {
      logger.error('Failed to load states:', error.message);
      this.states = new Map();
    }
  }

  /**
   * حفظ الحالات في الملف
   */
  saveStates() {
    try {
      const data = {};
      for (const [guildId, state] of this.states) {
        data[guildId] = this.sanitizeState(state);
      }
      
      fs.writeJsonSync(this.statesFile, data, { spaces: 2 });
      return true;
    } catch (error) {
      logger.error('Failed to save states:', error.message);
      return false;
    }
  }

  /**
   * التحقق من صحة الحالة
   */
  validateState(state) {
    const schema = {
      // حالة البث
      isPlaying: { type: 'boolean', required: false },
      isPaused: { type: 'boolean', required: false },
      currentSurah: { type: 'number', min: 0, max: 114, required: false },
      currentReciter: { type: 'string', required: false },
      lastSurah: { type: 'number', min: 0, max: 114, required: false },
      lastPosition: { type: 'number', min: 0, required: false },
      autoPlay: { type: 'boolean', required: false },
      
      // حالة الصلاة
      prayerConfig: {
        type: 'object',
        required: false,
        custom: (value) => {
          if (!value) return true;
          return value.city && value.country;
        }
      },
      prayerTimes: {
        type: 'object',
        required: false,
        custom: (value) => {
          if (!value) return true;
          return value.Fajr && value.Dhuhr && value.Asr && value.Maghrib && value.Isha;
        }
      },
      prayerMessageId: { type: 'string', required: false },
      selectedCountry: { type: 'string', required: false },
      
      // حالة الرسائل
      controlPanelMessageId: { type: 'string', required: false },
      controlMessages: { type: 'object', required: false },
      adhanMessages: { type: 'object', required: false },
      
      // حالة الأذكار
      azkarIndex: { type: 'number', min: 0, required: false },
      lastAzkarIndex: { type: 'number', min: 0, required: false },
      
      // حالة القرآن
      quranCompleteSent: { type: 'number', min: 0, required: false },
      quranCompleteCount: { type: 'number', min: 0, required: false },
      
      // حالة إعادة الاتصال
      reconnectAttempts: { type: 'number', min: 0, required: false },
      isReconnecting: { type: 'boolean', required: false },
      rejoinAttempts: { type: 'number', min: 0, required: false },
      
      // إحصائيات
      stats: {
        type: 'object',
        required: false,
        custom: (value) => {
          if (!value) return true;
          return typeof value.surahsPlayed === 'number' &&
                 typeof value.listenTime === 'number';
        }
      },
      
      // بيانات عامة
      createdAt: { type: 'number', required: false },
      updatedAt: { type: 'number', required: false }
    };

    return validateObject(state, schema, { strict: false });
  }

  /**
   * تنظيف الحالة
   */
  sanitizeState(state) {
    const sanitized = {};

    // حالة البث
    if (typeof state.isPlaying === 'boolean') sanitized.isPlaying = state.isPlaying;
    if (typeof state.isPaused === 'boolean') sanitized.isPaused = state.isPaused;
    if (typeof state.currentSurah === 'number' && state.currentSurah >= 0 && state.currentSurah <= 114) {
      sanitized.currentSurah = state.currentSurah;
    }
    if (state.currentReciter) sanitized.currentReciter = String(state.currentReciter);
    if (typeof state.lastSurah === 'number' && state.lastSurah >= 0 && state.lastSurah <= 114) {
      sanitized.lastSurah = state.lastSurah;
    }
    if (typeof state.lastPosition === 'number' && state.lastPosition >= 0) {
      sanitized.lastPosition = state.lastPosition;
    }
    if (typeof state.autoPlay === 'boolean') sanitized.autoPlay = state.autoPlay;

    // حالة الصلاة
    if (state.prayerConfig) {
      const { city, country, method } = state.prayerConfig;
      if (city && country) {
        sanitized.prayerConfig = {
          city: String(city).trim(),
          country: String(country).trim(),
          method: method || 5
        };
      }
    }
    if (state.prayerTimes) {
      const { Fajr, Dhuhr, Asr, Maghrib, Isha } = state.prayerTimes;
      if (Fajr && Dhuhr && Asr && Maghrib && Isha) {
        sanitized.prayerTimes = { Fajr, Dhuhr, Asr, Maghrib, Isha };
      }
    }
    if (state.prayerMessageId) sanitized.prayerMessageId = String(state.prayerMessageId);
    if (state.selectedCountry) sanitized.selectedCountry = String(state.selectedCountry);

    // حالة الرسائل
    if (state.controlPanelMessageId) sanitized.controlPanelMessageId = String(state.controlPanelMessageId);
    if (state.controlMessages && typeof state.controlMessages === 'object') {
      sanitized.controlMessages = state.controlMessages;
    }
    if (state.adhanMessages && typeof state.adhanMessages === 'object') {
      sanitized.adhanMessages = state.adhanMessages;
    }

    // حالة الأذكار
    if (typeof state.azkarIndex === 'number' && state.azkarIndex >= 0) {
      sanitized.azkarIndex = state.azkarIndex;
    }
    if (typeof state.lastAzkarIndex === 'number' && state.lastAzkarIndex >= 0) {
      sanitized.lastAzkarIndex = state.lastAzkarIndex;
    }

    // حالة القرآن
    if (typeof state.quranCompleteSent === 'number' && state.quranCompleteSent >= 0) {
      sanitized.quranCompleteSent = state.quranCompleteSent;
    }
    if (typeof state.quranCompleteCount === 'number' && state.quranCompleteCount >= 0) {
      sanitized.quranCompleteCount = state.quranCompleteCount;
    }

    // حالة إعادة الاتصال
    if (typeof state.reconnectAttempts === 'number' && state.reconnectAttempts >= 0) {
      sanitized.reconnectAttempts = state.reconnectAttempts;
    }
    if (typeof state.isReconnecting === 'boolean') sanitized.isReconnecting = state.isReconnecting;
    if (typeof state.rejoinAttempts === 'number' && state.rejoinAttempts >= 0) {
      sanitized.rejoinAttempts = state.rejoinAttempts;
    }

    // إحصائيات
    if (state.stats) {
      sanitized.stats = {
        surahsPlayed: state.stats.surahsPlayed || 0,
        listenTime: state.stats.listenTime || 0,
        quranComplete: state.stats.quranComplete || 0
      };
    }

    // التواريخ
    sanitized.createdAt = state.createdAt || Date.now();
    sanitized.updatedAt = Date.now();

    return sanitized;
  }

  /**
   * الحصول على حالة السيرفر
   */
  get(guildId) {
    if (!isValidDiscordId(guildId)) {
      logger.warn(`Invalid server ID: ${guildId}`);
      return null;
    }

    if (!this.states.has(guildId)) {
      // إنشاء حالة افتراضية
      this.states.set(guildId, this.getDefaultState());
    }

    return this.states.get(guildId);
  }

  /**
   * الحصول على حالة افتراضية
   */
  getDefaultState() {
    return {
      isPlaying: false,
      isPaused: false,
      currentSurah: 0,
      lastSurah: 0,
      lastPosition: 0,
      autoPlay: true,
      stats: {
        surahsPlayed: 0,
        listenTime: 0,
        quranComplete: 0
      },
      reconnectAttempts: 0,
      isReconnecting: false,
      rejoinAttempts: 0,
      quranCompleteSent: 0,
      quranCompleteCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * تحديث حالة السيرفر
   */
  set(guildId, state) {
    if (!isValidDiscordId(guildId)) {
      logger.warn(`Invalid server ID: ${guildId}`);
      return false;
    }

    // التحقق من صحة الحالة
    const validated = this.validateState(state);
    if (!validated.valid) {
      logger.warn(`Invalid state for server ${guildId}:`, validated.errors);
      return false;
    }

    // الحصول على الحالة الحالية ودمجها
    const current = this.get(guildId) || this.getDefaultState();
    const merged = { ...current, ...validated.data };
    
    // تنظيف الحالة
    const sanitized = this.sanitizeState(merged);
    
    // حفظ الحالة
    this.states.set(guildId, sanitized);
    this.saveStates();
    
    return true;
  }

  /**
   * تحديث قيمة محددة في الحالة
   */
  update(guildId, key, value) {
    const state = this.get(guildId);
    if (!state) return false;

    const updated = { ...state, [key]: value };
    return this.set(guildId, updated);
  }

  /**
   * حذف حالة السيرفر
   */
  delete(guildId) {
    if (!isValidDiscordId(guildId)) {
      return false;
    }

    const result = this.states.delete(guildId);
    if (result) {
      this.saveStates();
      logger.info(`🗑️ Deleted state for server ${guildId}`);
    }
    return result;
  }

  /**
   * الحصول على جميع حالات السيرفرات
   */
  getAll() {
    const all = {};
    for (const [guildId, state] of this.states) {
      all[guildId] = state;
    }
    return all;
  }

  /**
   * الحصول على قيمة محددة من الحالة
   */
  getState(guildId, key, defaultValue = null) {
    const state = this.get(guildId);
    if (!state) return defaultValue;
    return state[key] !== undefined ? state[key] : defaultValue;
  }

  /**
   * الحصول على حالة البث
   */
  getBroadcastState(guildId) {
    return {
      isPlaying: this.getState(guildId, 'isPlaying', false),
      isPaused: this.getState(guildId, 'isPaused', false),
      currentSurah: this.getState(guildId, 'currentSurah', 0),
      lastSurah: this.getState(guildId, 'lastSurah', 0),
      lastPosition: this.getState(guildId, 'lastPosition', 0),
      autoPlay: this.getState(guildId, 'autoPlay', true),
      currentReciter: this.getState(guildId, 'currentReciter', null)
    };
  }

  /**
   * بدء البث
   */
  startBroadcast(guildId, surah, reciter) {
    return this.set(guildId, {
      isPlaying: true,
      isPaused: false,
      currentSurah: surah,
      lastSurah: surah,
      currentReciter: reciter,
      lastPosition: 0
    });
  }

  /**
   * إيقاف البث
   */
  stopBroadcast(guildId) {
    return this.set(guildId, {
      isPlaying: false,
      isPaused: false
    });
  }

  /**
   * إيقاف البث مؤقتاً
   */
  pauseBroadcast(guildId) {
    return this.set(guildId, {
      isPlaying: false,
      isPaused: true
    });
  }

  /**
   * استئناف البث
   */
  resumeBroadcast(guildId) {
    return this.set(guildId, {
      isPlaying: true,
      isPaused: false
    });
  }

  /**
   * تحديث السورة الحالية
   */
  setCurrentSurah(guildId, surah) {
    if (surah < 0 || surah > 114) {
      logger.warn(`Invalid surah number: ${surah}`);
      return false;
    }
    return this.update(guildId, 'currentSurah', surah);
  }

  /**
   * تحديث الموضع الحالي
   */
  setLastPosition(guildId, position) {
    if (position < 0) {
      logger.warn(`Invalid position: ${position}`);
      return false;
    }
    return this.update(guildId, 'lastPosition', position);
  }

  /**
   * الحصول على حالة الصلاة
   */
  getPrayerState(guildId) {
    return {
      prayerConfig: this.getState(guildId, 'prayerConfig', null),
      prayerTimes: this.getState(guildId, 'prayerTimes', null),
      prayerMessageId: this.getState(guildId, 'prayerMessageId', null),
      selectedCountry: this.getState(guildId, 'selectedCountry', null)
    };
  }

  /**
   * تحديث مواقيت الصلاة
   */
  setPrayerTimes(guildId, times) {
    if (!times.Fajr || !times.Dhuhr || !times.Asr || !times.Maghrib || !times.Isha) {
      logger.warn(`Incomplete prayer times`);
      return false;
    }
    return this.update(guildId, 'prayerTimes', times);
  }

  /**
   * تحديث رسالة الصلاة
   */
  setPrayerMessage(guildId, messageId) {
    return this.update(guildId, 'prayerMessageId', messageId);
  }

  /**
   * الحصول على إحصائيات السيرفر
   */
  getStats(guildId) {
    return this.getState(guildId, 'stats', {
      surahsPlayed: 0,
      listenTime: 0,
      quranComplete: 0
    });
  }

  /**
   * زيادة عدد السور المشغلة
   */
  incrementSurahsPlayed(guildId) {
    const stats = this.getStats(guildId);
    stats.surahsPlayed = (stats.surahsPlayed || 0) + 1;
    return this.update(guildId, 'stats', stats);
  }

  /**
   * إضافة وقت استماع
   */
  addListenTime(guildId, seconds) {
    const stats = this.getStats(guildId);
    stats.listenTime = (stats.listenTime || 0) + seconds;
    return this.update(guildId, 'stats', stats);
  }

  /**
   * زيادة عدد اكتمال القرآن
   */
  incrementQuranComplete(guildId) {
    const stats = this.getStats(guildId);
    stats.quranComplete = (stats.quranComplete || 0) + 1;
    return this.update(guildId, 'stats', stats);
  }

  /**
   * الحصول على حالة إعادة الاتصال
   */
  getReconnectState(guildId) {
    return {
      reconnectAttempts: this.getState(guildId, 'reconnectAttempts', 0),
      isReconnecting: this.getState(guildId, 'isReconnecting', false),
      rejoinAttempts: this.getState(guildId, 'rejoinAttempts', 0)
    };
  }

  /**
   * إعادة تعيين محاولات إعادة الاتصال
   */
  resetReconnectAttempts(guildId) {
    return this.set(guildId, {
      reconnectAttempts: 0,
      rejoinAttempts: 0,
      isReconnecting: false
    });
  }

  /**
   * زيادة محاولات إعادة الاتصال
   */
  incrementReconnectAttempts(guildId) {
    const attempts = this.getState(guildId, 'reconnectAttempts', 0) + 1;
    return this.update(guildId, 'reconnectAttempts', attempts);
  }

  /**
   * الحصول على حالة الأذكار
   */
  getAzkarState(guildId) {
    return {
      azkarIndex: this.getState(guildId, 'azkarIndex', 0),
      lastAzkarIndex: this.getState(guildId, 'lastAzkarIndex', -1)
    };
  }

  /**
   * تحديث مؤشر الأذكار
   */
  setAzkarIndex(guildId, index) {
    if (index < 0) {
      logger.warn(`Invalid azkar index: ${index}`);
      return false;
    }
    const lastIndex = this.getState(guildId, 'azkarIndex', 0);
    return this.set(guildId, {
      azkarIndex: index,
      lastAzkarIndex: lastIndex
    });
  }

  /**
   * الحصول على إحصائيات الحالات
   */
  getStats() {
    let playing = 0;
    let paused = 0;
    let withPrayer = 0;
    let totalComplete = 0;

    for (const [_, state] of this.states) {
      if (state.isPlaying) playing++;
      if (state.isPaused) paused++;
      if (state.prayerConfig) withPrayer++;
      if (state.stats?.quranComplete) {
        totalComplete += state.stats.quranComplete;
      }
    }

    return {
      total: this.states.size,
      playing,
      paused,
      withPrayer,
      totalQuranComplete: totalComplete
    };
  }

  /**
   * تصدير الحالات (نسخة احتياطية)
   */
  exportStates() {
    return this.getAll();
  }

  /**
   * استيراد الحالات (استعادة نسخة احتياطية)
   */
  importStates(data) {
    if (!data || typeof data !== 'object') {
      logger.warn('Invalid data for import');
      return false;
    }

    let imported = 0;
    for (const [guildId, state] of Object.entries(data)) {
      if (isValidDiscordId(guildId)) {
        const validated = this.validateState(state);
        if (validated.valid) {
          this.states.set(guildId, this.sanitizeState(validated.data));
          imported++;
        }
      }
    }

    this.saveStates();
    logger.info(`✅ Imported state for ${imported} server(s)`);
    return imported;
  }

  /**
   * إعادة تعيين الحالة
   */
  resetState(guildId) {
    if (!isValidDiscordId(guildId)) {
      return false;
    }

    const defaultState = this.getDefaultState();
    this.states.set(guildId, defaultState);
    this.saveStates();
    
    logger.info(`🔄 Reset state for server ${guildId}`);
    return true;
  }

  /**
   * تنظيف الحالات القديمة (غير النشطة)
   */
  cleanupOldStates(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    let removed = 0;

    for (const [guildId, state] of this.states) {
      if (state.updatedAt && state.updatedAt < cutoff) {
        this.states.delete(guildId);
        removed++;
      }
    }

    if (removed > 0) {
      this.saveStates();
      logger.info(`🧹 Cleaned up ${removed} old state(s)`);
    }

    return removed;
  }

  /**
   * تحديث وقت التعديل
   */
  touch(guildId) {
    return this.update(guildId, 'updatedAt', Date.now());
  }
}

// تصدير نموذج مفرد (Singleton)
module.exports = new GuildState();