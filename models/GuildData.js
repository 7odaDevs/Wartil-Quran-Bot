// ============================================================
// 📄 models/GuildData.js
// بيحفظ بيانات كل سيرفر في ملف JSON جوه data/guilds/ (اسم الملف: ID السيرفر + اسمه)
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class GuildData {
  constructor() {
    this.dataPath = './data/guilds';
    this.ensureDirectory();
  }

  // بتتأكد إن فولدر data/guilds موجود
  ensureDirectory() {
    if (!fs.existsSync(this.dataPath)) {
      fs.ensureDirSync(this.dataPath);
      logger.info(`📁 Created guild data folder: ${this.dataPath}`);
    }
  }

  // بتنضّف اسم السيرفر عشان يبقى اسم ملف سليم
  sanitizeFileName(name) {
    if (!name) return 'unknown';
    return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'unknown';
  }

  safeReadDir() {
    try {
      return fs.readdirSync(this.dataPath);
    } catch (error) {
      logger.error('Failed to read guild data folder:', error.message);
      return [];
    }
  }

  // بترجّع مكان ملف السيرفر
  getFilePath(guildId, guildName = null) {
    let fileName = guildId;

    if (guildName) {
      fileName = `${guildId}_${this.sanitizeFileName(guildName)}`;
    } else {
      const files = this.safeReadDir();
      for (const file of files) {
        if (file.startsWith(`${guildId}_`)) {
          fileName = file.replace('.json', '');
          break;
        }
      }
    }

    return path.join(this.dataPath, `${fileName}.json`);
  }

  // الشكل الافتراضي لبيانات سيرفر جديد
  getDefaultData(guildId, guildName = 'غير معروف', ownerId = null) {
    return {
      guildId,
      guildName,
      ownerId,
      membersCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // === هنا بيتحفظ id القناة و id الرسالة لكل قناة بيستخدمها البوت ===
      // ده هو مصدر الحقيقة الوحيد اللي بيستخدمه utils/controlPanel.js
      // عشان يعرف يعدّل الرسالة القديمة بدل ما يبعت واحدة جديدة كل مرة
      channels: {
        control: {
          channelId: null,
          messageId: null,
          messagesCount: 0,
          botMessages: 0,
          userMessages: 0
        },
        voice: {
          channelId: null,
          isConnected: false,
          isDeafened: false,
          isMuted: false
        },
        azkar: {
          channelId: null,
          messageId: null,
          messagesCount: 0,
          botMessages: 0,
          lastSentAt: null
        },
        prayer: {
          channelId: null,
          messageId: null,
          messagesCount: 0,
          botMessages: 0,
          userMessages: 0,
          isSent: false,
          // ✅ رسائل تنبيه الأذان المؤقتة المُرسلة (رد على رسالة المواقيت) واللي لسه
          // منتظرة الحذف بعد مرور 20 دقيقة - بتتحفظ هنا عشان لو البوت اتقفل يقدر
          // يكمل حذفها في معادها الصح لما يرجع يشتغل (شوف prayerService.sweepPendingDeletions)
          pendingAdhanMessageIds: []
        },
        notice: {
          channelId: null,
          messageId: null,
          messagesCount: 0,
          botMessages: 0,
          lastSentAt: null,
          nextSendAt: null
        }
      },

      // === بيانات رسالة الـ Join Log (الإمبيد اللي بيتبعت في روم اللوج لما البوت
      // يدخل السيرفر، وبيتعدل بعدين لما حد يستخدم /setup) ===
      joinLog: {
        channelId: null,
        messageId: null,
        inviterId: null,
        inviterTag: null,
        joinedAt: null,
        setupUsed: false,
        setupByUserId: null,
        setupByUserTag: null,
        setupAt: null
      },

      quran: {
        currentReciter: null,
        currentSurah: 0,
        isPlaying: false,
        isPaused: false
      },

      prayer: {
        city: null,
        country: null,
        method: 5,
        enabled: false
      },

      azkar: {
        enabled: true,
        interval: 30 * 60 * 1000
      },

      notice: {
        enabled: true,
        lastSentAt: null,
        nextSendAt: null
      },

      stats: {
        totalMessages: 0,
        totalBotMessages: 0,
        totalUserMessages: 0,
        totalSurahsPlayed: 0,
        quranCompleteCount: 0,
        lastActivityAt: new Date().toISOString()
      }
    };
  }

  // لو اسم السيرفر اتغيّر بتغيّر اسم الملف
  renameFile(oldGuildId, oldName, newName) {
    try {
      const files = this.safeReadDir();
      let oldFilePath = null;

      for (const file of files) {
        if (file.startsWith(`${oldGuildId}_`)) {
          oldFilePath = path.join(this.dataPath, file);
          break;
        }
      }

      if (!oldFilePath) {
        const idFilePath = path.join(this.dataPath, `${oldGuildId}.json`);
        if (fs.existsSync(idFilePath)) oldFilePath = idFilePath;
      }

      if (oldFilePath && fs.existsSync(oldFilePath)) {
        const sanitized = this.sanitizeFileName(newName);
        const newFilePath = path.join(this.dataPath, `${oldGuildId}_${sanitized}.json`);

        if (oldFilePath !== newFilePath) {
          fs.moveSync(oldFilePath, newFilePath, { overwrite: true });
          logger.info(`📝 Renamed guild file to: ${path.basename(newFilePath)}`);
          return newFilePath;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Failed to rename guild file:`, error.message);
      return null;
    }
  }

  getExistingData(guildId) {
    try {
      const files = this.safeReadDir();
      for (const file of files) {
        if (file.startsWith(`${guildId}_`) || file === `${guildId}.json`) {
          return fs.readJsonSync(path.join(this.dataPath, file));
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // بتحمّل بيانات السيرفر (ولو مفيش بتعمل جديدة)
  load(guildId, guildName = null, ownerId = null) {
    try {
      if (guildName) {
        const oldData = this.getExistingData(guildId);
        if (oldData && oldData.guildName && oldData.guildName !== guildName) {
          this.renameFile(guildId, oldData.guildName, guildName);
        }
      }

      const filePath = this.getFilePath(guildId, guildName);

      if (fs.existsSync(filePath)) {
        const data = fs.readJsonSync(filePath);
        // دمج آمن مع القيم الافتراضية عشان أي حقل جديد اتضاف بالكود
        // (زي الأمثلة الجديدة فوق) ميبقاش undefined لبيانات قديمة محفوظة
        const merged = this.mergeWithDefaults(data, guildId, guildName, ownerId);

        let changed = false;
        if (guildName && merged.guildName !== guildName) {
          merged.guildName = guildName;
          changed = true;
        }
        if (ownerId && merged.ownerId !== ownerId) {
          merged.ownerId = ownerId;
          changed = true;
        }
        if (changed) this.save(guildId, merged, guildName);

        merged.updatedAt = new Date().toISOString();
        return merged;
      }

      const defaultData = this.getDefaultData(guildId, guildName || 'غير معروف', ownerId);
      this.save(guildId, defaultData, guildName);
      logger.info(`📄 Created new data file for server: ${guildId}${guildName ? ` (${guildName})` : ''}`);
      return defaultData;
    } catch (error) {
      logger.error(`Failed to load data for server ${guildId}:`, error.message);
      return this.getDefaultData(guildId, guildName, ownerId);
    }
  }

  mergeWithDefaults(data, guildId, guildName, ownerId) {
    const defaults = this.getDefaultData(guildId, guildName || data.guildName, ownerId || data.ownerId);
    return {
      ...defaults,
      ...data,
      channels: {
        ...defaults.channels,
        ...(data.channels || {}),
        control: { ...defaults.channels.control, ...(data.channels?.control || {}) },
        voice: { ...defaults.channels.voice, ...(data.channels?.voice || {}) },
        azkar: { ...defaults.channels.azkar, ...(data.channels?.azkar || {}) },
        prayer: { ...defaults.channels.prayer, ...(data.channels?.prayer || {}) },
        notice: { ...defaults.channels.notice, ...(data.channels?.notice || {}) }
      },
      joinLog: { ...defaults.joinLog, ...(data.joinLog || {}) },
      quran: { ...defaults.quran, ...(data.quran || {}) },
      prayer: { ...defaults.prayer, ...(data.prayer || {}) },
      azkar: { ...defaults.azkar, ...(data.azkar || {}) },
      notice: { ...defaults.notice, ...(data.notice || {}) },
      stats: { ...defaults.stats, ...(data.stats || {}) }
    };
  }

  // بتحفظ بيانات السيرفر
  save(guildId, data, guildName = null) {
    try {
      data.updatedAt = new Date().toISOString();
      if (guildName) data.guildName = guildName;
      const filePath = this.getFilePath(guildId, data.guildName || guildName);
      fs.writeJsonSync(filePath, data, { spaces: 2 });
      return true;
    } catch (error) {
      logger.error(`Failed to save data for server ${guildId}:`, error.message);
      return false;
    }
  }

  // بتعدّل خانة واحدة في بيانات السيرفر
  update(guildId, key, value, guildName = null) {
    try {
      const data = this.load(guildId, guildName);
      const keys = key.split('.');
      let current = data;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;
      return this.save(guildId, data, guildName);
    } catch (error) {
      logger.error(`Failed to update data for server ${guildId}:`, error.message);
      return false;
    }
  }

  incrementMessages(guildId, channelType, isBot = false) {
    try {
      const data = this.load(guildId);
      const channelMap = {
        control: data.channels.control,
        prayer: data.channels.prayer,
        azkar: data.channels.azkar,
        notice: data.channels.notice
      };

      if (channelMap[channelType]) {
        channelMap[channelType].messagesCount = (channelMap[channelType].messagesCount || 0) + 1;
        if (isBot) {
          channelMap[channelType].botMessages = (channelMap[channelType].botMessages || 0) + 1;
          data.stats.totalBotMessages = (data.stats.totalBotMessages || 0) + 1;
        } else {
          channelMap[channelType].userMessages = (channelMap[channelType].userMessages || 0) + 1;
          data.stats.totalUserMessages = (data.stats.totalUserMessages || 0) + 1;
        }
        data.stats.totalMessages = (data.stats.totalMessages || 0) + 1;
        return this.save(guildId, data);
      }
      return false;
    } catch (error) {
      logger.error(`Failed to increment message count:`, error.message);
      return false;
    }
  }

  /**
   * تحديث id رسالة و id قناة لوحة التحكم - بتتنادى مرة واحدة بس بعد
   * إرسال رسالة جديدة فعليًا (شوف utils/controlPanel.js)
   */
  updateControlMessage(guildId, messageId, channelId) {
    const data = this.load(guildId);
    data.channels.control.messageId = messageId;
    data.channels.control.channelId = channelId;
    return this.save(guildId, data);
  }

  updatePrayerMessage(guildId, messageId, channelId) {
    const data = this.load(guildId);
    data.channels.prayer.messageId = messageId;
    data.channels.prayer.channelId = channelId;
    data.channels.prayer.isSent = true;
    return this.save(guildId, data);
  }

  isPrayerMessageSent(guildId) {
    const data = this.load(guildId);
    return data.channels.prayer.isSent || false;
  }

  resetPrayerMessage(guildId) {
    const data = this.load(guildId);
    data.channels.prayer.isSent = false;
    data.channels.prayer.messageId = null;
    return this.save(guildId, data);
  }

  getPrayerMessageId(guildId) {
    const data = this.load(guildId);
    return data.channels.prayer.messageId;
  }

  /**
   * ✅ يحفظ معرف رسالة تنبيه الأذان (الرسالة الجديدة اللي بترد على رسالة المواقيت)
   * داخل ملف الـ json الخاص بالسيرفر، عشان تبقى موثّقة رسميًا هناك زي ما هو مطلوب،
   * بالإضافة لملف data/pending_adhan_messages.json العام اللي بيستخدمه prayerService
   * كخريطة سريعة لجدولة الحذف.
   */
  addPendingAdhanMessage(guildId, messageId, channelId) {
    const data = this.load(guildId);
    if (!Array.isArray(data.channels.prayer.pendingAdhanMessageIds)) {
      data.channels.prayer.pendingAdhanMessageIds = [];
    }
    data.channels.prayer.pendingAdhanMessageIds.push({
      messageId,
      channelId,
      createdAt: Date.now()
    });
    return this.save(guildId, data);
  }

  /**
   * ✅ يشيل معرف رسالة تنبيه الأذان من ملف الـ json الخاص بالسيرفر بعد ما يتم
   * حذفها فعليًا من ديسكورد (بعد مرور 20 دقيقة من إرسالها).
   */
  removePendingAdhanMessage(guildId, messageId) {
    const data = this.load(guildId);
    if (Array.isArray(data.channels.prayer.pendingAdhanMessageIds)) {
      data.channels.prayer.pendingAdhanMessageIds =
        data.channels.prayer.pendingAdhanMessageIds.filter(entry => entry.messageId !== messageId);
    }
    return this.save(guildId, data);
  }

  /**
   * ✅ يحفظ وقت آخر ذكر تم إرساله في ملف الـ json الخاص بالسيرفر
   * (عشان لو البوت اتقفل ورجع يشتغل، يعرف الفاصل الحقيقي بين الأذكار
   * ومايبعتش ذكر جديد قبل ما تعدي 30 دقيقة كاملة من آخر ذكر مُرسل فعليًا)
   */
  updateAzkarLastSent(guildId, timestamp = Date.now()) {
    const data = this.load(guildId);
    data.channels.azkar.lastSentAt = timestamp;
    return this.save(guildId, data);
  }

  getAzkarLastSent(guildId) {
    const data = this.load(guildId);
    return data.channels.azkar.lastSentAt || null;
  }

  /**
   * ✅ يحفظ حالة التنبيه (notice) في ملف الـ json الخاص بالسيرفر:
   * وقت آخر إرسال ووقت الإرسال القادم، عشان الجدولة تكون صامدة بعد إعادة تشغيل البوت
   * ولا يتم إرسال تنبيه جديد قبل ميعاده الحقيقي (6 - 14 ساعة).
   */
  updateNoticeState(guildId, { messageId, lastSentAt, nextSendAt } = {}) {
    const data = this.load(guildId);
    if (messageId !== undefined) data.channels.notice.messageId = messageId;
    if (lastSentAt !== undefined) {
      data.channels.notice.lastSentAt = lastSentAt;
      data.notice.lastSentAt = lastSentAt;
    }
    if (nextSendAt !== undefined) {
      data.channels.notice.nextSendAt = nextSendAt;
      data.notice.nextSendAt = nextSendAt;
    }
    return this.save(guildId, data);
  }

  getNoticeState(guildId) {
    const data = this.load(guildId);
    return {
      messageId: data.channels.notice.messageId || null,
      lastSentAt: data.channels.notice.lastSentAt || null,
      nextSendAt: data.channels.notice.nextSendAt || null
    };
  }

  updateVoiceStatus(guildId, isConnected, isDeafened = false, isMuted = true) {
    const data = this.load(guildId);
    data.channels.voice.isConnected = isConnected;
    data.channels.voice.isDeafened = isDeafened;
    data.channels.voice.isMuted = isMuted;
    return this.save(guildId, data);
  }

  updateMembersCount(guildId, count) {
    return this.update(guildId, 'membersCount', count);
  }

  /**
   * ✅ يحفظ id الرسالة و id الروم بتاع إمبيد الـ Join Log بعد إرساله لأول مرة
   * (شوف utils/joinLogPanel.js -> sendJoinLogEmbed)
   */
  updateJoinLogMessage(guildId, messageId, channelId, inviter = null) {
    const data = this.load(guildId);
    data.joinLog.messageId = messageId;
    data.joinLog.channelId = channelId;
    data.joinLog.joinedAt = data.joinLog.joinedAt || new Date().toISOString();
    if (inviter) {
      data.joinLog.inviterId = inviter.id || null;
      data.joinLog.inviterTag = inviter.tag || inviter.username || null;
    }
    return this.save(guildId, data);
  }

  getJoinLog(guildId) {
    const data = this.load(guildId);
    return data.joinLog;
  }

  /**
   * ✅ بيتنادى بعد نجاح تنفيذ /setup عشان نعرف نعدّل إمبيد الـ Join Log
   * ونسجل مين استخدم الأمر وإمتى (شوف utils/joinLogPanel.js -> updateJoinLogPanel)
   */
  markSetupUsed(guildId, userId, userTag) {
    const data = this.load(guildId);
    data.joinLog.setupUsed = true;
    data.joinLog.setupByUserId = userId || data.joinLog.setupByUserId;
    data.joinLog.setupByUserTag = userTag || data.joinLog.setupByUserTag;
    data.joinLog.setupAt = new Date().toISOString();
    return this.save(guildId, data);
  }

  // بتمسح ملف بيانات السيرفر
  delete(guildId) {
    try {
      const files = this.safeReadDir();
      for (const file of files) {
        if (file.startsWith(`${guildId}_`) || file === `${guildId}.json`) {
          fs.removeSync(path.join(this.dataPath, file));
          logger.info(`🗑️ Deleted data for server ${guildId}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error(`Failed to delete data for server ${guildId}:`, error.message);
      return false;
    }
  }
}

module.exports = new GuildData();