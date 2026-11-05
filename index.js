// ============================================================
// 📄 index.js
// الملف الرئيسي للبوت (نقطة البداية) - بتشغله بـ: npm start
// بيعمل إيه؟ بيحمّل .env، يظبط الـ DNS، يعمل الـ client بتاع ديسكورد،
// يشغّل الخدمات (قرآن/صلاة/أذكار/تنبيهات)، يسجّل الأوامر، ويعمل login بالتوكن.
// ============================================================

const dns = require('dns');

// ============ إعدادات DNS المتقدمة ============
try {
    // تعيين DNS سريع وموثوق
    dns.setServers([
        '1.1.1.1',      // Cloudflare
        '8.8.8.8',      // Google
        '9.9.9.9',      // Quad9
        '208.67.222.222' // OpenDNS
    ]);

    // تفضيل IPv4 (لتجنب مشاكل IPv6)
    dns.setDefaultResultOrder('ipv4first');

    console.log('✅ DNS configured successfully');
} catch (error) {
    console.error('❌ Failed to configure DNS:', error.message);
}

require('dotenv').config();

// ============ إعداد ffmpeg-static كحل احتياطي للصوت (مهم للاستضافات المجانية) ============
try {
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) {
        process.env.FFMPEG_PATH = ffmpegPath;
        console.log('✅ FFmpeg-static configured successfully');
    }
} catch (e) {
    console.log('ℹ️ Falling back to system FFmpeg (if installed)');
}

const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActivityType, MessageFlags } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const guildSettings = require('./models/GuildSettings');
const guildDataModel = require('./models/GuildData');
const { updateControlPanel } = require('./utils/controlPanelRenderer');
const advancedLogger = require('./utils/advancedLogger');

// ✅ كان هنا معرّف سيرفر ثابت (على الأغلب من مرحلة اختبار قديمة) بيقفل خدمات
// البوت كلها (لوحة التحكم/القرآن/الأذكار/الصلاة) على سيرفر واحد بس. المشكلة إن
// السيرفر ده مش موجود أصلاً ضمن السيرفرات الـ22 الحالية، فكانت النتيجة إن ولا
// سيرفر واحد بياخد خدمة. دلوقتي القيمة بتتحدد من متغير بيئة اختياري فقط،
// ولو مش موجود البوت بيشتغل على كل السيرفرات بشكل طبيعي.
const ALLOWED_GUILD_ID = process.env.ALLOWED_GUILD_ID || null;

// بتشوف السيرفر ده مسموح له يستخدم البوت ولا لأ (لو حطيت ALLOWED_GUILD_ID في .env)
function isGuildAllowed(guildId) {
    if (!ALLOWED_GUILD_ID) return true;
    return guildId === ALLOWED_GUILD_ID;
}

advancedLogger.showWelcomeBanner();

// ============ إنشاء المجلدات ============
const dataDirs = ['./data', './data/reciters', './data/guilds', './data/locks'];
for (const dir of dataDirs) {
  if (!fs.existsSync(dir)) {
    fs.ensureDirSync(dir);
    logger.log('SUCCESS', `📁 Folder created: ${dir}`);
  }
}

// ============ إنشاء عميل Discord ============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message],
  rest: {
    timeout: 30000,    // زيادة المهلة للاستضافات المجانية
    retries: 5,        // زيادة محاولات إعادة الاتصال
    offset: 0
  }
});

// ============ تخزين الأوامر ============
client.commands = new Collection();
client.slashCommands = new Collection();

// ============ استيراد المعالجات ============
const InteractionHandler = require('./handlers/interactions');
const VoiceHandler = require('./handlers/VoiceHandler');
const MessageHandler = require('./handlers/messageHandler');
const { sendJoinLogEmbed } = require('./utils/joinLogPanel');

// ============ متغيرات الخدمات ============
let voiceService, prayerService, quranService, noticeService, statsService, azkarService;
let statusInterval = null;
let currentStatusIndex = 0;

// ============ قائمة النصوص المتناوبة ============
const statusMessages = [
    'صـلـي عـلـي الـنـبـي  🤍',
    '{وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا} 🤍 '
];

// لو حطيت SUPPORT_SERVER_URL في .env هيظهر لينك سيرفر الدعم في حالة البوت (اختياري)
if (process.env.SUPPORT_SERVER_URL) {
    statusMessages.push('للدعم الفني في سيرفر الديسكورد');
    statusMessages.push(`Dis : ${process.env.SUPPORT_SERVER_URL}`);
}

// ============ وظيفة تحديث حالة البوت ============
function updateBotStatus() {
    try {
        const currentMessage = statusMessages[currentStatusIndex];
        client.user.setPresence({
            activities: [{
                name: currentMessage,
                type: ActivityType.Custom,
                state: ` ${currentMessage}`
            }],
            status: 'idle'
        });
        logger.log('SUCCESS', `Bot status updated to: ${currentMessage}`);
        currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
    } catch (error) {
        console.error('❌ Failed to update bot status:', error.message);
    }
}

// ============ بدء تناوب النصوص ============
function startStatusRotation() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
    updateBotStatus();
    statusInterval = setInterval(() => {
        updateBotStatus();
    }, 10000);
    console.log('⏰ Status text rotation started (every 10 seconds)');
}

// ============ إيقاف تناوب النصوص ============
function stopStatusRotation() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
        console.log('⏹️ Status text rotation stopped');
    }
}

// ============ تحميل الخدمات ============
async function loadServices() {
  try {
    const servicesModule = require('./services/index.js');
    voiceService = servicesModule.voiceService;
    prayerService = servicesModule.prayerService;
    quranService = servicesModule.quranService;
    noticeService = servicesModule.noticeService;
    statsService = servicesModule.statsService;
    azkarService = servicesModule.azkarService;

    if (voiceService && typeof voiceService.setClient === 'function') {
      voiceService.setClient(client);
      logger.info('✅ Client set in VoiceService (auto-reconnect watchdog enabled)');
    }

    if (noticeService) {
      noticeService.setClient(client);
      logger.info('✅ Client set in NoticeService');
    }

    if (azkarService) {
      await azkarService.initialize();
      logger.info('✅ Azkar service initialized');
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to load services:', error.message);
    return false;
  }
}

// ============ إعداد المعالجات ============
const interactionHandler = new InteractionHandler(client);
const voiceHandler = new VoiceHandler(client);
const messageHandler = new MessageHandler(client);

// ============ تحميل الأوامر ============
function loadCommands() {
  try {
    const commandsPath = path.join(__dirname, 'handlers', 'commands');
    if (!fs.existsSync(commandsPath)) {
      console.log('⚠️ Commands folder not found');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
      try {
        const command = require(`./handlers/commands/${file}`);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          logger.log('SUCCESS', `Command loaded: ${command.data.name}`);
        } else {
          logger.log('WARN', `Command ${file} is incomplete`);
        }
      } catch (error) {
        logger.log('ERROR', `Failed to load command ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to load commands:', error.message);
  }
}

// ============ تسجيل الأوامر ============
async function registerCommands() {
  try {
    if (!config.token) {
      console.error('❌ Bot token not found');
      return;
    }

    const commands = [];
    for (const command of client.commands.values()) {
      commands.push(command.data.toJSON());
    }

    if (commands.length === 0) {
      console.log('⚠️ No commands to register');
      return;
    }

    logger.log('INFO', `Registering ${commands.length} command(s)...`);

    const rest = new REST({ version: '10', timeout: 30000, retries: 5 }).setToken(config.token);

    const result = await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    logger.log('SUCCESS', `${result.length} command(s) registered`);

  } catch (error) {
    console.error('❌ Failed to register commands:', error.message);
  }
}

// ============ استعادة القنوات الصوتية ============
// ✅ إصلاح: الكود القديم كان بيمسح القناة المحفوظة نهائياً (removeChannel) لو حصل أي
// فشل مؤقت وقت التشغيل (السيرفر لسه مش في الكاش، صلاحيات، ...) ولو فشلت إعادة
// الاتصال 5 مرات. دلوقتي القناة المحفوظة بتفضل محفوظة دايماً، والبوت بيحاول يرجع
// لها بدون توقف (مع backoff) لحد ما يدخل.
async function restoreVoiceChannels() {
  try {
    if (!voiceService) {
      console.log('⚠️ Voice service unavailable');
      return;
    }

    const savedChannels = await voiceService.getSavedChannels();

    if (savedChannels.length === 0) {
      console.log('📭 No saved voice channels');
      return;
    }

    const filteredChannels = savedChannels.filter(channel => isGuildAllowed(channel.guild_id));

    if (filteredChannels.length === 0) {
      console.log('📭 No saved voice channels for allowed servers');
      return;
    }

    logger.log('INFO', `Restoring ${filteredChannels.length} voice channel(s)...`);

    for (const channel of filteredChannels) {
      try {
        // restoreDesired بيسجّل القناة كمطلوبة ويبدأ الاتصال؛ لو فشل بيعيد المحاولة تلقائياً
        // (متوازي بين السيرفرات ومش بيستنى نجاح كل سيرفر عشان ما يبطّأش الباقي)
        voiceService.restoreDesired(channel.guild_id, channel.channel_id, channel.self_deaf === 1)
          .catch(error => logger.log('ERROR', `Restore error for server ${channel.guild_id}: ${error.message}`));
      } catch (error) {
        logger.log('ERROR', `Failed to restore channel: ${error.message}`);
      }

      // مهلة صغيرة بين السيرفرات عشان ما نضغطش على Discord
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.log('INFO', `📊 Voice restore started for ${filteredChannels.length} server(s) (failed ones keep retrying automatically)`);

  } catch (error) {
    console.error('❌ Failed to restore channels:', error.message);
  }
}

// ============ بدء خدمات السيرفرات ============
async function startGuildServices() {
  try {
    const guilds = guildSettings.getAllGuilds();

    const allowedGuilds = guilds.filter(guildId => isGuildAllowed(guildId));

    logger.info(`Starting services for ${allowedGuilds.length} server(s) (out of ${guilds.length})`);

    for (const guildId of allowedGuilds) {
      try {
        const settings = guildSettings.get(guildId);
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
          logger.warn(`Server ${guildId} not found`);
          continue;
        }

        if (settings.azkarChannelId && settings.azkarEnabled !== false) {
          try {
            const channel = await client.channels.fetch(settings.azkarChannelId);
            if (channel) {
              await azkarService.startScheduler(guildId, channel);
              logger.info(`✅ Azkar started for server ${guildId}`);
            }
          } catch (error) {
            logger.error(`Failed to start azkar for server ${guildId}:`, error.message);
          }
        }

        if (settings.noticeChannelId && settings.noticeEnabled !== false) {
          try {
            const channel = await client.channels.fetch(settings.noticeChannelId);
            if (channel) {
              noticeService.resumeSchedule(guildId, channel);
              logger.info(`✅ Notices started for server ${guildId}`);
            }
          } catch (error) {
            logger.error(`Failed to start notices for server ${guildId}:`, error.message);
          }
        }

        if (settings.prayerChannelId && settings.prayerCity) {
          try {
            const channel = await client.channels.fetch(settings.prayerChannelId);
            if (channel) {
              const prayerConfig = {
                city: settings.prayerCity,
                country: settings.prayerCountry || 'EG',
                method: settings.prayerMethod || 5
              };
              prayerService.configs.set(guildId, prayerConfig);
              await prayerService.sendPrayerMessage(guildId, channel, client);
              logger.info(`✅ Prayer service started for server ${guildId}`);
            }
          } catch (error) {
            logger.error(`Failed to start prayer service for server ${guildId}:`, error.message);
          }
        }

        await updateControlPanel(client, guildId);

      } catch (error) {
        logger.error(`Failed to process server ${guildId}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Failed to start server services:', error.message);
  }
}

// ============ أحداث البوت ============

client.once('ready', async () => {
  logger.log('SUCCESS', `Logged in as ${client.user.tag}`);

  startStatusRotation();

  if (ALLOWED_GUILD_ID) {
    logger.log('INFO', `🔒 Bot restricted to server: ${ALLOWED_GUILD_ID}`);
    const allowedGuild = client.guilds.cache.get(ALLOWED_GUILD_ID);
    if (allowedGuild) {
      logger.log('INFO', `📊 Allowed server: ${allowedGuild.name} (${allowedGuild.id})`);
    } else {
      logger.log('WARN', `Allowed server (${ALLOWED_GUILD_ID}) not found in the server list`);
    }
  } else {
    logger.log('INFO', `🌍 Bot is running on all servers (unrestricted)`);
  }

  logger.log('INFO', `📊 Bot is in ${client.guilds.cache.size} server(s)`);

  if (ALLOWED_GUILD_ID) {
    const guildsToRemove = [];
    client.guilds.cache.forEach(guild => {
      if (!isGuildAllowed(guild.id)) {
        guildsToRemove.push(guild.id);
      }
    });

    if (guildsToRemove.length > 0) {
      logger.log('INFO', `🗑️ Removing ${guildsToRemove.length} disallowed server(s) from cache`);
      for (const guildId of guildsToRemove) {
        client.guilds.cache.delete(guildId);
      }
    }
  }

  const servicesLoaded = await loadServices();
  if (!servicesLoaded) {
    console.error('❌ Failed to load services');
  }

  if (prayerService) {
    prayerService.sweepPendingDeletions(client);
  }

  loadCommands();

  guildSettings.loadSettings();
  logger.log('SUCCESS', `📋 Loaded settings for ${guildSettings.getAllGuilds().length} server(s)`);

  for (const guild of client.guilds.cache.values()) {
    if (!isGuildAllowed(guild.id)) continue;

    try {
      const guildData = guildDataModel.load(guild.id, guild.name, guild.ownerId);
      guildData.membersCount = guild.memberCount;
      guildDataModel.save(guild.id, guildData);
    } catch (error) {
      logger.log('ERROR', `Failed to update data for server ${guild.id}: ${error.message}`);
    }
  }

  await registerCommands();
  await restoreVoiceChannels();

  if (azkarService && prayerService && noticeService) {
    await startGuildServices();
  }

  console.log('✅ Bot is ready!');
});

// ============ معالجة التفاعلات ============
// ✅ ملحوظة مهمة: خلّي عندك listener واحد بس لـ interactionCreate.
// كان في السابق اتنين listener مسجّلين، وده كان بيسبب استدعاء
// interactionHandler.handleInteraction مرتين على نفس التفاعل، ينتج عنه
// خطأ Discord: "Interaction has already been acknowledged" (كود 40060)،
// لأن الاتنين كانوا بيحاولوا يعملوا deferReply في نفس الوقت تقريباً.
client.on('interactionCreate', async (interaction) => {
  try {
    if (!isGuildAllowed(interaction.guildId)) {
      if (interaction.isCommand()) {
        await interaction.reply({
          content: 'البوت تحت الصيانه حاليا لا يمكن استخدامه حاليا',
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
      return;
    }

    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        return interaction.reply({
          content: '❌ الامر غير موجود',
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        logger.log('ERROR', `Failed to execute command ${interaction.commandName}: ${error}`);
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ حدث خطأ أثناء تنفيذ الامر',
              flags: MessageFlags.Ephemeral
            });
          } else {
            await interaction.editReply({ content: '❌ حدث خطأ أثناء تنفيذ الامر' });
          }
        } catch (_) {
          // تجاهل
        }
      }
    } else if (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
      // ✅ الـ deferReply لكل أنواع القوائم/الأزرار/النماذج بيتم داخل
      // interactionHandler.handleInteraction نفسها، فمينفعش نعمل deferReply
      // تاني هنا وإلا هيحصل تعارض 40060.
      await interactionHandler.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('❌ Failed to handle interaction:', error.message);
  }
});

// ============ Join Log: البوت اتضاف لسيرفر جديد ============
// بيبعت embed في روم اللوج (config.JOIN_LOG_CHANNEL_ID) فيه معلومات السيرفر
// + مين ضاف البوت. الرسالة دي بتتعدل بعدين أول ما حد يستخدم /setup
// (شوف handlers/commands/setup.js + utils/joinLogPanel.js).
client.on('guildCreate', async (guild) => {
  if (!isGuildAllowed(guild.id)) return;
  await sendJoinLogEmbed(client, guild);
});

// ============ مراقبة حالة القنوات الصوتية ============
client.once('ready', () => {
  if (voiceService) {
    voiceService.on('reconnected', ({ guildId, attempts }) => {
      if (!isGuildAllowed(guildId)) return;
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        logger.log('VOICE', `Reconnected in server ${guild.name} after ${attempts} attempt(s)`);
      }
    });

    voiceService.on('reconnectFailed', ({ guildId, attempts }) => {
      if (!isGuildAllowed(guildId)) return;
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        logger.log('WARN', `Still can't reconnect in server ${guild.name} after ${attempts} attempt(s) - will keep trying`);
      }
    });

    voiceService.on('error', ({ guildId, error }) => {
      if (!isGuildAllowed(guildId)) return;
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        logger.log('ERROR', `Voice service error for server ${guild.name}: ${error.message}`);
      }
    });
  }
});

// ============ معالجة الأخطاء ============
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// ============ إيقاف التشغيل الآمن ============
let isShuttingDown = false;

// بتقفل البوت بشكل نضيف (تخرج من الرومات وتحفظ البيانات) لما توقفه
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.log('INFO', `🛑 Shutting down bot... (${signal})`);

  try {
    stopStatusRotation();
  } catch (error) {
    console.error('❌ Error while stopping status text rotation:', error.message);
  }

  try {
    if (azkarService && azkarService.intervals && typeof azkarService.intervals.keys === 'function') {
      for (const guildId of azkarService.intervals.keys()) {
        if (!isGuildAllowed(guildId)) continue;
        try {
          azkarService.stopScheduler(guildId);
        } catch (error) {
          logger.log('ERROR', `Failed to stop azkar scheduler for server ${guildId}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error while stopping azkar service:', error.message);
  }

  try {
    if (voiceService && voiceService.connections && typeof voiceService.connections[Symbol.iterator] === 'function') {
      for (const [guildId] of voiceService.connections) {
        if (!isGuildAllowed(guildId)) continue;
        try {
          const channelInfo = voiceService.pendingChannels && voiceService.pendingChannels.get
            ? voiceService.pendingChannels.get(guildId)
            : null;
          if (channelInfo) {
            voiceService.saveChannel(
              guildId,
              channelInfo.channelId,
              channelInfo.adapterCreator,
              channelInfo.selfDeaf
            );
          }
        } catch (error) {
          logger.log('ERROR', `Failed to save voice channel for server ${guildId}: ${error.message}`);
        }
      }

      for (const [guildId] of voiceService.connections) {
        if (!isGuildAllowed(guildId)) continue;
        try {
          voiceService.leaveVoiceChannel(guildId);
        } catch (error) {
          logger.log('ERROR', `Failed to leave voice channel for server ${guildId}: ${error.message}`);
        }
      }
    }

    if (voiceService && typeof voiceService.cleanup === 'function') {
      voiceService.cleanup();
    }
  } catch (error) {
    console.error('❌ Error while stopping voice service:', error.message);
  }

  console.log('✅ Bot stopped successfully');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ============ تسجيل الدخول ============
if (!config.token) {
  console.error('❌ Bot token not found');
  console.log('📝 Please add the token in config.json or .env');
  process.exit(1);
}

client.login(config.token).catch(error => {
  console.error('❌ Login failed:', error.message);
  process.exit(1);
});

module.exports = client;