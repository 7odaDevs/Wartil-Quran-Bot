// ============================================================
// 📄 services/index.js
// بيصدّر كل الخدمات من مكان واحد
// ============================================================

const voiceService = require('./voiceService');
const prayerService = require('./prayerService');
const quranService = require('./quranService');
const noticeService = require('./noticeService');
const statsService = require('./statsService');
const azkarService = require('./azkarService');

module.exports = {
  voiceService,
  prayerService,
  quranService,
  noticeService,
  statsService,
  azkarService
};