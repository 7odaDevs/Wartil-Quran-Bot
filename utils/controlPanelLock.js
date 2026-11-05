// ============================================================
// 📄 utils/controlPanelLock.js
// قفل بسيط بيمنع إرسال لوحة التحكم مرتين في نفس الوقت لنفس السيرفر
// ============================================================

// 🔒 قفل مشترك لمنع تكرار إرسال لوحة التحكم
const locks = new Map();

module.exports = {
  isLocked(guildId) {
    return locks.get(guildId) === true;
  },
  
  lock(guildId) {
    locks.set(guildId, true);
  },
  
  unlock(guildId) {
    locks.delete(guildId);
  },
  
  clear() {
    locks.clear();
  }
};