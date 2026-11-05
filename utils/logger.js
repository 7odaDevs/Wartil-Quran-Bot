// ============================================================
// 📄 utils/logger.js
// اللوجر الأساسي (winston) - بيطبع في الكونسول بس ومش بيكتب ملفات
// ============================================================

const winston = require('winston');

// تعطيل كتابة الملفات نهائياً - Console فقط
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'HH:mm:ss'
        }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      )
    })
  ]
});

// دالة مساعدة لتحويل أي باراميترات إضافية
function formatExtraArgs(args) {
  if (!args || args.length === 0) return '';

  const parts = args.map((arg) => {
    if (arg === undefined || arg === null) return '';
    if (arg instanceof Error) {
      return arg.stack || arg.message || String(arg);
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, Object.getOwnPropertyNames(arg));
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).filter(Boolean);

  return parts.length ? ' ' + parts.join(' ') : '';
}

// ✅ إضافة دوال مساعدة مع دعم متعدد الباراميترات
logger.quran = (message, ...args) => logger.info(`🎙️ ${message}${formatExtraArgs(args)}`);
logger.prayer = (message, ...args) => logger.info(`🕌 ${message}${formatExtraArgs(args)}`);
logger.notice = (message, ...args) => logger.info(`☪️ ${message}${formatExtraArgs(args)}`);
logger.voice = (message, ...args) => logger.info(`🎙️ ${message}${formatExtraArgs(args)}`);
logger.azkar = (message, ...args) => logger.info(`📿 ${message}${formatExtraArgs(args)}`);

// ✅ تعريف الدوال الأساسية مع دعم متعدد الباراميترات
logger.error = function(message, ...args) {
  const extra = formatExtraArgs(args);
  console.error(`❌ ${message}${extra}`);
};

logger.warn = function(message, ...args) {
  const extra = formatExtraArgs(args);
  console.warn(`⚠️ ${message}${extra}`);
};

logger.info = function(message, ...args) {
  const extra = formatExtraArgs(args);
  console.log(`ℹ️ ${message}${extra}`);
};

logger.debug = function(message, ...args) {
  const extra = formatExtraArgs(args);
  console.debug(`🐛 ${message}${extra}`);
};

// ✅ إضافة دالة success للتوافق مع VoiceService.js
logger.success = function(message, ...args) {
  const extra = formatExtraArgs(args);
  console.log(`✅ ${message}${extra}`);
};

// ✅ إضافة دالة log الرئيسية التي يحاول VoiceService.js استخدامها
logger.log = function(level, message, ...args) {
  const extra = formatExtraArgs(args);
  const fullMessage = `${message}${extra}`;
  
  // تحويل المستويات إلى الدوال المناسبة
  const levelMap = {
    'ERROR': 'error',
    'WARN': 'warn',
    'INFO': 'info',
    'SUCCESS': 'success',
    'VOICE': 'voice',
    'QURAN': 'quran',
    'PRAYER': 'prayer',
    'NOTICE': 'notice',
    'AZKAR': 'azkar'
  };
  
  const mappedLevel = levelMap[level.toUpperCase()] || 'info';
  
  // استدعاء الدالة المناسبة
  if (logger[mappedLevel]) {
    logger[mappedLevel](fullMessage);
  } else {
    // fallback
    console.log(`[${level}] ${fullMessage}`);
  }
};

// ✅ إضافة دالة logError (موجودة بالفعل لكن نحسنها)
logger.logError = function(message, ...args) {
  const extra = formatExtraArgs(args);
  const fullMessage = `❌ ${message}${extra}`;
  console.error(fullMessage);
};

module.exports = logger;