// ============================================================
// 📄 utils/helpers.js
// دوال مساعدة عامة: تحويل وقت، انتظار، retry، تنسيق مدة... إلخ
// ============================================================

const logger = require('./logger');

/**
 * تحويل الوقت من صيغة 24 ساعة إلى صيغة 12 ساعة
 */
function convertTo12HourFormat(time24) {
  if (!time24 || !time24.includes(':')) return time24;
  
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'مساءً' : 'صباحاً';
  let hours12 = hours % 12;
  hours12 = hours12 === 0 ? 12 : hours12;
  
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * حساب الوقت المتبقي لصلاة معينة
 */
function getRemainingTimeForPrayer(prayerTime24) {
  const now = new Date();
  const [hours, minutes] = prayerTime24.split(':').map(Number);
  
  const prayerDate = new Date();
  prayerDate.setHours(hours, minutes, 0, 0);
  
  let diffMs = prayerDate - now;
  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  
  const totalMinutes = Math.floor(diffMs / 60000);
  
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMinutes,
    isNow: totalMinutes <= 1,
    diffMs
  };
}

/**
 * تأخير التنفيذ
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * اختيار عنصر عشوائي من مصفوفة
 */
function randomFrom(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * خلط مصفوفة (Fisher-Yates)
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * محاولة تنفيذ دالة مع إعادة المحاولة
 */
async function retry(fn, options = {}) {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    onRetry = null,
    shouldRetry = null
  } = options;

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // التحقق مما إذا كان يجب إعادة المحاولة
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      if (attempt === retries) {
        throw error;
      }

      if (onRetry) {
        await onRetry(attempt, error);
      }

      logger.debug(`🔄 Retry ${attempt}/${retries} after ${currentDelay}ms`);
      await sleep(currentDelay);
      currentDelay *= backoff;
    }
  }

  throw lastError;
}

/**
 * تنظيف النص من الرموز غير المرغوب فيها
 */
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .trim();
}

/**
 * التحقق من صحة رابط الصورة
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
  const hasValidExtension = validExtensions.some(ext => 
    url.toLowerCase().includes(ext)
  );
  
  const isDiscordCdn = url.startsWith('https://cdn.discordapp.com/') || 
                       url.startsWith('https://media.discordapp.net/');
  
  const isImageHost = url.includes('imgur.com') || 
                      url.includes('i.imgur.com') || 
                      url.includes('images-ext-');
  
  return hasValidExtension || isDiscordCdn || isImageHost;
}

/**
 * تنسيق رقم مع أصفار أمامية
 */
function padNumber(num, length = 3) {
  return num.toString().padStart(length, '0');
}

/**
 * التحقق من وجود قيمة وتطبيق دالة عليها
 */
function ifExists(value, fn, defaultValue = null) {
  if (value !== null && value !== undefined) {
    return fn(value);
  }
  return defaultValue;
}

/**
 * تجميع مصفوفة حسب مفتاح
 */
function groupBy(array, key) {
  return array.reduce((result, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

/**
 * الحصول على التاريخ بتنسيق عربي
 */
function getArabicDate(date = new Date()) {
  const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const months = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  
  return {
    weekday: weekdays[date.getDay()],
    day: date.getDate(),
    month: months[date.getMonth()],
    year: date.getFullYear(),
    formatted: `${weekdays[date.getDay()]}، ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
  };
}

/**
 * تنسيق المدة الزمنية
 */
function formatDuration(ms) {
  if (ms < 0) ms = -ms;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours % 24 > 0) parts.push(`${hours % 24} ساعة`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60} دقيقة`);
  if (seconds % 60 > 0) parts.push(`${seconds % 60} ثانية`);
  
  return parts.join(' و ') || '0 ثانية';
}

/**
 * إنشاء ID فريد
 */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * تحويل النص إلى Base64
 */
function toBase64(text) {
  return Buffer.from(text).toString('base64');
}

/**
 * فك تشفير Base64
 */
function fromBase64(base64) {
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * الحصول على اسم السورة
 */
function getSurahName(surahNumber, quranData) {
  if (!quranData || !quranData.surahs) return `سورة ${surahNumber}`;
  const surah = quranData.surahs.find(s => s.id === surahNumber);
  return surah ? surah.name_ar : `سورة ${surahNumber}`;
}

/**
 * التحقق من وجود صلاحيات
 */
function hasPermission(member, permissions) {
  if (!member) return false;
  return permissions.some(perm => member.permissions.has(perm));
}

/**
 * تصفية الكائن من القيم الفارغة
 */
function filterEmpty(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== '') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * دمج كائنات بعمق
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * تأخير مع إمكانية الإلغاء
 */
function createDelayedTask(fn, delay) {
  let timeout = null;
  let cancelled = false;
  
  const start = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!cancelled) {
        fn();
      }
      timeout = null;
    }, delay);
  };
  
  const cancel = () => {
    cancelled = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  const reset = () => {
    cancel();
    cancelled = false;
    start();
  };
  
  return { start, cancel, reset };
}

module.exports = {
  convertTo12HourFormat,
  getRemainingTimeForPrayer,
  sleep,
  randomFrom,
  shuffleArray,
  retry,
  sanitizeText,
  isValidImageUrl,
  padNumber,
  ifExists,
  groupBy,
  getArabicDate,
  formatDuration,
  generateId,
  toBase64,
  fromBase64,
  getSurahName,
  hasPermission,
  filterEmpty,
  deepMerge,
  createDelayedTask
};