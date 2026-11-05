// ============================================================
// 📄 utils/validators.js
// دوال التحقق من القيم (ID ديسكورد، رقم سورة، وقت، لينك...)
// ============================================================

const logger = require('./logger');

/**
 * التحقق من صحة معرف Discord
 */
function isValidDiscordId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^\d{17,19}$/.test(id);
}

/**
 * التحقق من صحة اسم المستخدم
 */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  return username.length >= 2 && username.length <= 32;
}

/**
 * التحقق من صحة الرابط
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * التحقق من صحة البريد الإلكتروني
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * التحقق من صحة رقم الهاتف
 */
function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
}

/**
 * التحقق من صحة معرف القناة
 */
function isValidChannelId(id) {
  return isValidDiscordId(id);
}

/**
 * التحقق من صحة معرف السيرفر
 */
function isValidGuildId(id) {
  return isValidDiscordId(id);
}

/**
 * التحقق من صحة معرف الرسالة
 */
function isValidMessageId(id) {
  return isValidDiscordId(id);
}

/**
 * التحقق من صحة الساعة (صيغة HH:MM)
 */
function isValidTime(time) {
  if (!time || typeof time !== 'string') return false;
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * التحقق من صحة السورة (1-114)
 */
function isValidSurahNumber(number) {
  const num = Number(number);
  return Number.isInteger(num) && num >= 1 && num <= 114;
}

/**
 * التحقق من صحة رقم الإصدار
 */
function isValidVersion(version) {
  if (!version || typeof version !== 'string') return false;
  const versionRegex = /^\d+\.\d+\.\d+$/;
  return versionRegex.test(version);
}

/**
 * التحقق من صحة التاريخ
 */
function isValidDate(date) {
  if (!date) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
}

/**
 * التحقق من صحة المدة الزمنية (بالمللي ثانية)
 */
function isValidDuration(ms) {
  if (typeof ms !== 'number') return false;
  return ms > 0 && Number.isFinite(ms);
}

/**
 * التحقق من صحة الكائن
 */
function isValidObject(obj, requiredKeys = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  
  for (const key of requiredKeys) {
    if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
      return false;
    }
  }
  
  return true;
}

/**
 * التحقق من صحة المصفوفة
 */
function isValidArray(arr, minLength = 0, maxLength = Infinity) {
  if (!Array.isArray(arr)) return false;
  return arr.length >= minLength && arr.length <= maxLength;
}

/**
 * التحقق من صحة قيمة منطقية
 */
function isValidBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * التحقق من صحة الرقم
 */
function isValidNumber(value, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number') return false;
  if (isNaN(value) || !isFinite(value)) return false;
  return value >= min && value <= max;
}

/**
 * التحقق من صحة النص
 */
function isValidString(value, minLength = 0, maxLength = Infinity) {
  if (typeof value !== 'string') return false;
  return value.length >= minLength && value.length <= maxLength;
}

/**
 * التحقق من صحة الصلاحيات
 */
function isValidPermission(permission) {
  if (!permission) return false;
  const validPermissions = [
    'CreateInstantInvite', 'KickMembers', 'BanMembers', 'Administrator',
    'ManageChannels', 'ManageGuild', 'AddReactions', 'ViewAuditLog',
    'PrioritySpeaker', 'Stream', 'ViewChannel', 'SendMessages',
    'SendTTSMessages', 'ManageMessages', 'EmbedLinks', 'AttachFiles',
    'ReadMessageHistory', 'MentionEveryone', 'UseExternalEmojis',
    'ViewGuildInsights', 'Connect', 'Speak', 'MuteMembers', 'DeafenMembers',
    'MoveMembers', 'UseVAD', 'ChangeNickname', 'ManageNicknames',
    'ManageRoles', 'ManageWebhooks', 'ManageEmojisAndStickers',
    'UseApplicationCommands', 'RequestToSpeak', 'ManageEvents',
    'ManageThreads', 'CreatePublicThreads', 'CreatePrivateThreads',
    'UseExternalStickers', 'SendMessagesInThreads', 'UseEmbeddedActivities',
    'ModerateMembers'
  ];
  return validPermissions.includes(permission);
}

/**
 * التحقق من صحة لغة Discord
 */
function isValidDiscordLocale(locale) {
  const validLocales = [
    'en-US', 'en-GB', 'bg', 'zh-CN', 'zh-TW', 'hr', 'cs', 'da', 'nl',
    'fi', 'fr', 'de', 'el', 'hi', 'hu', 'it', 'ja', 'ko', 'lt', 'no',
    'pl', 'pt-BR', 'ro', 'ru', 'es-ES', 'sv-SE', 'th', 'tr', 'uk', 'vi'
  ];
  return validLocales.includes(locale);
}

/**
 * التحقق من صحة اللون (Hex)
 */
function isValidColor(color) {
  if (typeof color === 'number') {
    return color >= 0 && color <= 16777215;
  }
  if (typeof color === 'string') {
    return /^#?[0-9a-fA-F]{6}$/.test(color.replace('#', ''));
  }
  return false;
}

/**
 * إنشاء مُحقق مخصص
 */
function createValidator(schema) {
  return function validate(data) {
    const errors = [];
    
    for (const [key, rules] of Object.entries(schema)) {
      const value = data[key];
      
      // التحقق من وجود القيمة
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`الحقل "${key}" مطلوب`);
        continue;
      }
      
      if (value === undefined || value === null) continue;
      
      // التحقق من النوع
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          errors.push(`الحقل "${key}" يجب أن يكون من نوع ${rules.type}`);
          continue;
        }
      }
      
      // التحقق من القيم المسموحة
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`الحقل "${key}" يجب أن يكون واحداً من: ${rules.enum.join(', ')}`);
        continue;
      }
      
      // التحقق من الطول (للنصوص والمصفوفات)
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push(`الحقل "${key}" يجب أن يكون طوله على الأقل ${rules.minLength}`);
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push(`الحقل "${key}" يجب أن يكون طوله على الأكثر ${rules.maxLength}`);
      }
      
      // التحقق من النطاق (للأرقام)
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`الحقل "${key}" يجب أن يكون على الأقل ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`الحقل "${key}" يجب أن يكون على الأكثر ${rules.max}`);
      }
      
      // التحقق من النمط (للنصوص)
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`الحقل "${key}" لا يطابق النمط المطلوب`);
      }
      
      // التحقق المخصص
      if (rules.custom && !rules.custom(value)) {
        errors.push(`الحقل "${key}" غير صحيح`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  };
}

/**
 * مُحقق للكائنات الكبيرة
 */
function validateObject(obj, schema, options = {}) {
  const { strict = false, message = 'بيانات غير صالحة' } = options;
  const validator = createValidator(schema);
  const result = validator(obj);
  
  if (!result.valid) {
    logger.warn(`${message}:`, result.errors);
    if (strict) {
      throw new Error(`${message}: ${result.errors.join(', ')}`);
    }
  }
  
  return result;
}

module.exports = {
  isValidDiscordId,
  isValidUsername,
  isValidUrl,
  isValidEmail,
  isValidPhoneNumber,
  isValidChannelId,
  isValidGuildId,
  isValidMessageId,
  isValidTime,
  isValidSurahNumber,
  isValidVersion,
  isValidDate,
  isValidDuration,
  isValidObject,
  isValidArray,
  isValidBoolean,
  isValidNumber,
  isValidString,
  isValidPermission,
  isValidDiscordLocale,
  isValidColor,
  createValidator,
  validateObject
};