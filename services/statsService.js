// ============================================================
// 📄 services/statsService.js
// الإحصائيات: كام سورة اتشغّلت، أكتر شيخ اتسمع... بتتحفظ في data/stats.json كل 5 دقايق
// ============================================================

const fs = require('fs-extra');
const logger = require('../utils/logger');

class StatsService {
  constructor() {
    this.stats = {
      totalQuranComplete: 0,
      totalSurahsPlayed: 0,
      totalPrayers: 0,
      totalNotices: 0,
      totalAzkar: 0,
      guilds: {},
      reciters: {},
      daily: {
        quranComplete: 0,
        surahsPlayed: 0,
        prayers: 0,
        notices: 0,
        azkar: 0,
        date: new Date().toDateString()
      }
    };
    this.loadStats();
    this.startAutoSave();
  }

  /**
   * تحميل الإحصائيات من الملف
   */
  loadStats() {
    try {
      const filePath = './data/stats.json';
      if (fs.existsSync(filePath)) {
        const data = fs.readJsonSync(filePath);
        
        this.stats.totalQuranComplete = data.totalQuranComplete || 0;
        this.stats.totalSurahsPlayed = data.totalSurahsPlayed || 0;
        this.stats.totalPrayers = data.totalPrayers || 0;
        this.stats.totalNotices = data.totalNotices || 0;
        this.stats.totalAzkar = data.totalAzkar || 0;
        this.stats.guilds = data.guilds || {};
        this.stats.reciters = data.reciters || {};
        
        if (data.daily) {
          this.stats.daily = data.daily;
          if (this.stats.daily.date !== new Date().toDateString()) {
            this.resetDailyStats();
          }
        }
        
        logger.info(`📊 Stats loaded: ${this.stats.totalQuranComplete} full Quran completion(s)`);
      } else {
        this.saveStats();
      }
    } catch (error) {
      logger.error('Failed to load stats:', error.message);
      this.saveStats();
    }
  }

  /**
   * حفظ الإحصائيات إلى الملف
   */
  saveStats() {
    try {
      const data = {
        totalQuranComplete: this.stats.totalQuranComplete,
        totalSurahsPlayed: this.stats.totalSurahsPlayed,
        totalPrayers: this.stats.totalPrayers,
        totalNotices: this.stats.totalNotices,
        totalAzkar: this.stats.totalAzkar,
        guilds: this.stats.guilds,
        reciters: this.stats.reciters,
        daily: this.stats.daily
      };
      fs.writeJsonSync('./data/stats.json', data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save stats:', error.message);
    }
  }

  /**
   * بدء الحفظ التلقائي
   */
  startAutoSave() {
    setInterval(() => {
      this.saveStats();
    }, 5 * 60 * 1000);
    logger.info('📊 Auto-save for stats started (every 5 minutes)');
  }

  /**
   * إعادة تعيين الإحصائيات اليومية
   */
  resetDailyStats() {
    this.stats.daily = {
      quranComplete: 0,
      surahsPlayed: 0,
      prayers: 0,
      notices: 0,
      azkar: 0,
      date: new Date().toDateString()
    };
  }

  /**
   * زيادة عدد السور المشغلة
   */
  incrementSurahPlayed(guildId, surahNumber, reciterId) {
    this.stats.totalSurahsPlayed++;
    this.stats.daily.surahsPlayed++;
    
    if (!this.stats.guilds[guildId]) {
      this.stats.guilds[guildId] = { surahsPlayed: 0, quranComplete: 0 };
    }
    this.stats.guilds[guildId].surahsPlayed++;
    
    if (reciterId) {
      if (!this.stats.reciters[reciterId]) {
        this.stats.reciters[reciterId] = 0;
      }
      this.stats.reciters[reciterId]++;
    }
    
    this.saveStats();
  }

  /**
   * زيادة عدد اكتمال القرآن
   */
  incrementQuranComplete(guildId) {
    this.stats.totalQuranComplete++;
    this.stats.daily.quranComplete++;
    
    if (!this.stats.guilds[guildId]) {
      this.stats.guilds[guildId] = { surahsPlayed: 0, quranComplete: 0 };
    }
    this.stats.guilds[guildId].quranComplete++;
    
    this.saveStats();
  }

  /**
   * الحصول على الإحصائيات العامة
   */
  getGeneralStats() {
    return {
      totalQuranComplete: this.stats.totalQuranComplete || 0,
      totalSurahsPlayed: this.stats.totalSurahsPlayed || 0,
      totalPrayers: this.stats.totalPrayers || 0,
      totalNotices: this.stats.totalNotices || 0,
      totalAzkar: this.stats.totalAzkar || 0,
      totalGuilds: Object.keys(this.stats.guilds).length,
      totalReciters: Object.keys(this.stats.reciters).length,
      uptime: process.uptime()
    };
  }

  /**
   * الحصول على الإحصائيات اليومية
   */
  getDailyStats() {
    return {
      quranComplete: this.stats.daily?.quranComplete || 0,
      surahsPlayed: this.stats.daily?.surahsPlayed || 0,
      prayers: this.stats.daily?.prayers || 0,
      notices: this.stats.daily?.notices || 0,
      azkar: this.stats.daily?.azkar || 0,
      date: this.stats.daily?.date || new Date().toDateString()
    };
  }

  /**
   * الحصول على أفضل القراء
   */
  getTopReciters(limit = 5) {
    const reciters = Object.entries(this.stats.reciters || {})
      .map(([reciterId, count]) => ({ reciterId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return reciters;
  }

  /**
   * الحصول على أفضل السيرفرات
   */
  getTopGuilds(limit = 5) {
    const guilds = Object.entries(this.stats.guilds || {})
      .map(([guildId, data]) => ({
        guildId,
        surahsPlayed: data.surahsPlayed || 0,
        quranComplete: data.quranComplete || 0
      }))
      .sort((a, b) => b.quranComplete - a.quranComplete)
      .slice(0, limit);
    
    return guilds;
  }
}

module.exports = new StatsService();