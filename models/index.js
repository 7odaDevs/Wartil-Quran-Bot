// ============================================================
// 📄 models/index.js
// بيصدّر كل الـ models من مكان واحد
// ============================================================

/**
 * تصدير جميع النماذج من ملف واحد
 */

const GuildSettings = require('./GuildSettings');
const GuildState = require('./GuildState');

module.exports = {
  GuildSettings,
  GuildState,
  
  // تصدير النماذج بشكل منفصل للاستخدام المباشر
  settings: GuildSettings,
  state: GuildState
};