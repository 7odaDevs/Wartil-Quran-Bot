// ============================================================
// 📄 config/index.js
// الإعدادات الجاهزة للبوت (التوكن + الـ intents + المسارات...) بتتجمع هنا من constants و .env
// ============================================================

/**
 * config/index.js - الإعدادات العامة للبوت
 */

const constants = require('./constants');
const logger = require('../utils/logger');

const path = require('path');
const fs = require('fs-extra');

// ============ البيئة ============
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// ============ إنشاء المجلدات المطلوبة ============
function ensureDirectories() {
  const dirs = [
    './data',
    './data/reciters',
    './data/guilds'
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.ensureDirSync(dir);
      logger.log('SUCCESS', `📁 Folder created: ${dir}`);
    }
  }
}

// ============ تحميل ملف التوكن ============
function loadToken() {
  try {
    // 1. محاولة من config.json
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
      const configFile = fs.readJsonSync(configPath);
      if (configFile.token) {
        console.log('✅ Token loaded from config.json');
        return configFile.token;
      }
    }
    
    // 2. محاولة من .env (BOT_TOKEN هو الاسم المستخدم فعليًا في مشروعك)
    if (process.env.BOT_TOKEN) {
      console.log('✅ Token loaded from .env (BOT_TOKEN)');
      return process.env.BOT_TOKEN;
    }

    if (process.env.DISCORD_TOKEN) {
      console.log('✅ Token loaded from .env (DISCORD_TOKEN)');
      return process.env.DISCORD_TOKEN;
    }
    
    // 3. محاولة من process.env
    if (process.env.TOKEN) {
      console.log('✅ Token loaded from process.env');
      return process.env.TOKEN;
    }
    
    throw new Error('❌ لم يتم العثور على توكن البوت');
  } catch (error) {
    console.error('❌ Failed to load token:', error.message);
    process.exit(1);
  }
}

// ============ إعدادات Discord Intents ============
const INTENTS = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildEmojisAndStickers: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16
};

// ============ تحميل التوكن ============
const token = loadToken();

// ============ الإعدادات النهائية ============
const config = {
  ...constants,
  isProduction,
  isDevelopment,
  token: token,
  
  intents: [
    INTENTS.Guilds,
    INTENTS.GuildVoiceStates,
    INTENTS.GuildMessages,
    INTENTS.MessageContent
  ],
  
  rest: {
    timeout: 30000,
    retries: 5,
    version: '10'
  },
  
  voice: {
    maxReconnectionAttempts: constants.MAX_RECONNECTION_ATTEMPTS || 5,
    reconnectionDelays: constants.RECONNECTION_DELAYS || [2000, 3000, 5000, 8000, 10000],
    keepAliveInterval: constants.VOICE_KEEP_ALIVE_INTERVAL || 30000,
    connectionTimeout: constants.VOICE_CONNECTION_TIMEOUT || 15000
  },
  
  cache: {
    maxSize: constants.CACHE_MAX_SIZE || 1000,
    cleanupInterval: constants.CACHE_CLEANUP_INTERVAL || 60000
  },
  
  prayer: {
    cacheDuration: constants.PRAYER_CACHE_DURATION || 24 * 60 * 60 * 1000,
    fetchTimeout: constants.PRAYER_FETCH_TIMEOUT || 10000,
    maxRetries: constants.PRAYER_MAX_RETRIES || 3,
    fortyMinutes: constants.FORTY_MINUTES || 40 * 60 * 1000,
    methods: constants.PRAYER_METHODS || {},
    countries: constants.COUNTRIES || [],
    names: constants.PRAYER_NAMES || {}
  },
  
  notice: {
    minDelay: constants.NOTICE_MIN_DELAY || 3 * 60 * 60 * 1000,
    maxDelay: constants.NOTICE_MAX_DELAY || 13 * 60 * 60 * 1000,
    messages: constants.NOTICE_MESSAGES || [],
    emojis: constants.NOTICE_EMOJIS || []
  },
  
  quran: {
    totalSurahs: constants.TOTAL_SURAH_COUNT || 114,
    audioTimeout: constants.AUDIO_DOWNLOAD_TIMEOUT || 45000,
    maxRetries: constants.AUDIO_MAX_RETRIES || 3,
    surahNames: constants.SURAH_NAMES || {}
  },
  
  azkar: {
    interval: constants.AZKAR_INTERVAL || 30 * 60 * 1000
  },
  
  bot: {
    statuses: constants.STATUSES || [],
    colors: constants.COLORS || {},
    errors: constants.ERRORS || {},
    success: constants.SUCCESS || {},
    buttons: constants.BUTTONS || {},
    placeholders: constants.PLACEHOLDERS || {}
  },
  
  reciters: {
    ids: constants.RECITER_IDS || {},
    emojis: constants.RECITER_EMOJIS || {},
    info: constants.RECITERS_INFO || {}
  },
  
  // رابط دعوة البوت بيتبني أوتوماتيك من CLIENT_ID اللي في .env
  inviteLink: constants.CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${constants.CLIENT_ID}&permissions=8&integration_type=0&scope=bot+applications.commands`
    : null,

  api: {
    port: constants.API_PORT || 9456,
    host: constants.API_HOST || '0.0.0.0',
    enabled: false
  },
  
  paths: {
    reciters: './data/reciters',
    guilds: './data/guilds'
  }
};

// ============ إنشاء المجلدات ============
ensureDirectories();

module.exports = config;