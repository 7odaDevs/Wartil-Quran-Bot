// ============================================================
// 📄 handlers/CommandHandler.js
// بيستقبل أوامر السلاش (/setup /country /link-invite) وبينفّذها
// ============================================================

const {
  ContainerBuilder,
  SeparatorSpacingSize,
  MediaGalleryItemBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const logger = require('../utils/logger');
const config = require('../config');
const { voiceService, prayerService, quranService, noticeService, statsService } = require('../services');
const azkarService = require('../services/azkarService');
const guildSettings = require('../models/GuildSettings');
const guildDataModel = require('../models/GuildData');
const { renderControlPanel, RECITERS_MAP } = require('../utils/controlPanelRenderer');

// قائمة الدول جاهزة
const COUNTRY_OPTIONS = [
  { label: '🇪🇬 مصر (القاهرة)', value: JSON.stringify({ city: 'Cairo', country: 'Egypt', method: 5 }), emoji: { name: '🇪🇬' } },
  { label: '🇸🇦 السعودية (مكة)', value: JSON.stringify({ city: 'Mecca', country: 'Saudi Arabia', method: 5 }), emoji: { name: '🇸🇦' } },
  { label: '🇯🇴 الأردن (عمّان)', value: JSON.stringify({ city: 'Amman', country: 'Jordan', method: 5 }), emoji: { name: '🇯🇴' } },
  { label: '🇸🇾 سوريا (دمشق)', value: JSON.stringify({ city: 'Damascus', country: 'Syria', method: 5 }), emoji: { name: '🇸🇾' } },
  { label: '🇵🇸 فلسطين (القدس)', value: JSON.stringify({ city: 'Jerusalem', country: 'Palestine', method: 5 }), emoji: { name: '🇵🇸' } },
  { label: '🇩🇿 الجزائر (الجزائر)', value: JSON.stringify({ city: 'Algiers', country: 'Algeria', method: 5 }), emoji: { name: '🇩🇿' } },
  { label: '🇲🇦 المغرب (الرباط)', value: JSON.stringify({ city: 'Rabat', country: 'Morocco', method: 5 }), emoji: { name: '🇲🇦' } },
  { label: '🇦🇪 الإمارات (دبي)', value: JSON.stringify({ city: 'Dubai', country: 'UAE', method: 5 }), emoji: { name: '🇦🇪' } },
  { label: '🇰🇼 الكويت (الكويت)', value: JSON.stringify({ city: 'Kuwait City', country: 'Kuwait', method: 5 }), emoji: { name: '🇰🇼' } },
  { label: '🇶🇦 قطر (الدوحة)', value: JSON.stringify({ city: 'Doha', country: 'Qatar', method: 5 }), emoji: { name: '🇶🇦' } },
  { label: '🇧🇭 البحرين (المنامة)', value: JSON.stringify({ city: 'Manama', country: 'Bahrain', method: 5 }), emoji: { name: '🇧🇭' } },
  { label: '🇴🇲 عمان (مسقط)', value: JSON.stringify({ city: 'Muscat', country: 'Oman', method: 5 }), emoji: { name: '🇴🇲' } },
  { label: '🇱🇾 ليبيا (طرابلس)', value: JSON.stringify({ city: 'Tripoli', country: 'Libya', method: 5 }), emoji: { name: '🇱🇾' } },
  { label: '🇹🇳 تونس (تونس)', value: JSON.stringify({ city: 'Tunis', country: 'Tunisia', method: 5 }), emoji: { name: '🇹🇳' } },
  { label: '🇸🇩 السودان (الخرطوم)', value: JSON.stringify({ city: 'Khartoum', country: 'Sudan', method: 5 }), emoji: { name: '🇸🇩' } },
  { label: '🇮🇶 العراق (بغداد)', value: JSON.stringify({ city: 'Baghdad', country: 'Iraq', method: 5 }), emoji: { name: '🇮🇶' } },
  { label: '🇾🇪 اليمن (صنعاء)', value: JSON.stringify({ city: 'Sanaa', country: 'Yemen', method: 5 }), emoji: { name: '🇾🇪' } },
  { label: '🇹🇷 تركيا (إسطنبول)', value: JSON.stringify({ city: 'Istanbul', country: 'Turkey', method: 5 }), emoji: { name: '🇹🇷' } }
];

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Map();
    this.setupCommands();
  }

  // رد آمن على المستخدم (مش بيضرب خطأ لو التفاعل خلص أو اتردّ عليه قبل كده)
  async safeReply(interaction, content, options = {}) {
    try {
      if (!interaction) return false;

      if (options.ephemeral !== undefined) {
        options.flags = options.ephemeral ? 64 : 0;
        delete options.ephemeral;
      }

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content, ...options });
      } else {
        await interaction.reply({ content, ...options });
      }
      return true;
    } catch (error) {
      if (error.code === 40060 || error.code === 10062) {
        logger.warn(`Reply error: ${error.message}`);
        return false;
      }
      logger.error('Error in safeReply:', error.message);
      return false;
    }
  }

  // بتجيب الروم بسرعة (من الكاش الأول ولو مش موجود من ديسكورد)
  async fetchChannelFast(channelId) {
    if (!channelId) return null;
    return this.client.channels.cache.get(channelId) || await this.client.channels.fetch(channelId).catch(() => null);
  }

  // بتقرا إعداد معيّن للسيرفر
  getGuildSetting(guildId, key) {
    return guildSettings.getSetting(guildId, key);
  }

  // بتحفظ إعداد معيّن للسيرفر
  setGuildSetting(guildId, key, value) {
    return guildSettings.set(guildId, key, value);
  }

  // بتجهّز الأوامر
  setupCommands() {
    this.commands.set('setup', {
      execute: this.handleSetup.bind(this),
      permissions: [PermissionFlagsBits.Administrator]
    });

    this.commands.set('country', {
      execute: this.handleCountry.bind(this),
      permissions: [PermissionFlagsBits.Administrator]
    });

    this.commands.set('link-invite', {
      execute: this.handleInvite.bind(this),
      permissions: []
    });

    logger.info('✅ Bot commands set up');
  }

  // بتوزّع الأمر على الدالة المناسبة حسب اسمه
  async handleCommand(interaction) {
    const { commandName, guildId, member } = interaction;

    try {
      if (!interaction.replied && !interaction.deferred) {
        interaction.deferReply({ flags: 64 }).catch(() => {});
      }

      const command = this.commands.get(commandName);
      if (!command) {
        return this.safeReply(interaction, '❌ الأمر غير موجود');
      }

      if (command.permissions && command.permissions.length > 0) {
        const hasPermission = command.permissions.some(perm =>
          member.permissions.has(perm)
        );

        if (!hasPermission) {
          return this.safeReply(interaction, '❌ عذراً، ليس لديك الصلاحية لاستخدام هذا الأمر');
        }
      }

      await command.execute(interaction);

    } catch (error) {
      logger.error(`Failed to execute command ${commandName}:`, error);
      await this.safeReply(interaction, '❌ حدث خطأ أثناء تنفيذ الأمر');
    }
  }

  // أمر /setup: بيجهّز البوت في السيرفر (روم لوحة التحكم، الروم الصوتي، الأذكار، الصلاة)
  async handleSetup(interaction) {
    try {
      const guildId = interaction.guildId;
      const guild = interaction.guild;
      const options = interaction.options;

      let guildData = guildDataModel.load(guildId, guild.name, guild.ownerId);
      guildData.membersCount = guild.memberCount;

      const controlChannel = options.getChannel('control_channel');
      const voiceChannel = options.getChannel('voice_channel');
      const azkarChannel = options.getChannel('azkar_channel');
      const prayerChannel = options.getChannel('prayer_channel');
      const noticeChannel = options.getChannel('notice_channel');

      // تحقق من الأنواع
      if (controlChannel && controlChannel.type !== 0) {
        return this.safeReply(interaction, '❌ control_channel يجب أن تكون قناة نصية');
      }
      if (voiceChannel && voiceChannel.type !== 2) {
        return this.safeReply(interaction, '❌ voice_channel يجب أن تكون قناة صوتية');
      }
      if (azkarChannel && azkarChannel.type !== 0) {
        return this.safeReply(interaction, '❌ azkar_channel يجب أن تكون قناة نصية');
      }
      if (prayerChannel && prayerChannel.type !== 0) {
        return this.safeReply(interaction, '❌ prayer_channel يجب أن تكون قناة نصية');
      }
      if (noticeChannel && noticeChannel.type !== 0) {
        return this.safeReply(interaction, '❌ notice_channel يجب أن تكون قناة نصية');
      }

      let responseMessage = '';
      const settings = {};

      if (controlChannel) {
        guildData.channels.control.channelId = controlChannel.id;
        settings.controlPanelChannelId = controlChannel.id;
        responseMessage += `✅ تم تعيين قناة التحكم: ${controlChannel}\n`;
      }

      if (azkarChannel) {
        guildData.channels.azkar.channelId = azkarChannel.id;
        settings.azkarChannelId = azkarChannel.id;
        responseMessage += `✅ تم تعيين قناة الأذكار: ${azkarChannel}\n`;
      }

      if (prayerChannel) {
        guildData.channels.prayer.channelId = prayerChannel.id;
        settings.prayerChannelId = prayerChannel.id;
        responseMessage += `✅ تم تعيين قناة الصلاة: ${prayerChannel}\n`;
      }

      if (noticeChannel) {
        guildData.channels.notice.channelId = noticeChannel.id;
        settings.noticeChannelId = noticeChannel.id;
        responseMessage += `✅ تم تعيين قناة التنبيهات: ${noticeChannel}\n`;
      }

      if (voiceChannel) {
        guildData.channels.voice.channelId = voiceChannel.id;
        settings.voiceChannelId = voiceChannel.id;

        const adapterCreator = interaction.guild.voiceAdapterCreator;
        const connection = await voiceService.joinVoiceChannel(
          guildId,
          voiceChannel.id,
          adapterCreator,
          true
        );

        if (connection) {
          guildData.channels.voice.isConnected = true;
          guildData.channels.voice.isDeafened = true;
          guildData.channels.voice.isMuted = true;
          responseMessage += `✅ تم تعيين القناة الصوتية: ${voiceChannel} (البوت متصل ومكتوم)\n`;
        } else {
          responseMessage += `❌ فشل الاتصال بالقناة الصوتية: ${voiceChannel}\n`;
        }
      }

      // حفظ البيانات
      guildDataModel.save(guildId, guildData);
      for (const [key, value] of Object.entries(settings)) {
        this.setGuildSetting(guildId, key, value);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ تم إعداد البوت بنجاح')
        .setDescription(responseMessage)
        .addFields(
          { name: '📝 قناة التحكم', value: controlChannel ? `<#${controlChannel.id}>` : '❌ غير محدد', inline: true },
          { name: '🎙 القناة الصوتية', value: voiceChannel ? `<#${voiceChannel.id}>` : '❌ غير محدد', inline: true },
          { name: '📿 قناة الأذكار', value: azkarChannel ? `<#${azkarChannel.id}>` : '❌ غير محدد', inline: true },
          { name: '🕌 قناة الصلاة', value: prayerChannel ? `<#${prayerChannel.id}>` : '❌ غير محدد', inline: true },
          { name: '☪️ قناة التنبيهات', value: noticeChannel ? `<#${noticeChannel.id}>` : '❌ غير محدد', inline: true }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed], flags: 64 });

      // ===== تشغيل الخدمات في الخلفية =====
      const backgroundTasks = [];

      if (azkarChannel) {
        backgroundTasks.push(
          azkarService.startScheduler(guildId, azkarChannel)
            .catch(error => logger.error(`Failed to start azkar:`, error.message))
        );
      }

      if (noticeChannel) {
        try {
          noticeService.scheduleNotice(guildId, noticeChannel);
        } catch (error) {
          logger.error(`Failed to schedule notices:`, error.message);
        }
      }

      if (prayerChannel) {
        const prayerConfig = prayerService.configs.get(guildId);
        if (prayerConfig) {
          backgroundTasks.push(
            prayerService.sendPrayerMessage(guildId, prayerChannel, this.client)
              .catch(error => logger.error(`Failed to send prayer message:`, error.message))
          );
        } else {
          const warnEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ لم يتم تحديد الدولة')
            .setDescription('يرجى استخدام الأمر `/country` لتحديد الدولة والمدينة أولاً')
            .setFooter({ text: '🕌 سيتم تفعيل مواقيت الصلاة بعد تحديد الدولة' })
            .setTimestamp();

          backgroundTasks.push(prayerChannel.send({ embeds: [warnEmbed] }).catch(() => {}));
        }
      }

      // ===== إرسال لوحة التحكم =====
      if (controlChannel) {
        backgroundTasks.push(
          (async () => {
            try {
              const channel = await this.fetchChannelFast(controlChannel.id);
              if (channel) {
                await renderControlPanel(this.client, guildId, channel);
                logger.info(`✅ Control panel sent in server ${guildId}`);
              }
            } catch (error) {
              logger.error(`Failed to send control panel:`, error.message);
            }
          })()
        );
      }

      // تشغيل المهام الخلفية
      Promise.all(backgroundTasks).catch(() => {});

    } catch (error) {
      logger.error('Error in setup command:', error);
      await this.safeReply(interaction, '❌ حدث خطأ في الإعداد');
    }
  }

  // أمر /country: اختيار الدولة/المدينة لمواقيت الصلاة
  async handleCountry(interaction) {
    try {
      const guildId = interaction.guildId;

      const currentCity = this.getGuildSetting(guildId, 'prayerCity');
      const currentCountry = this.getGuildSetting(guildId, 'prayerCountry');

      const currentConfig = (currentCity && currentCountry) ?
        { city: currentCity, country: currentCountry } : null;

      const embed = new EmbedBuilder()
        .setColor(0x2E7D32)
        .setTitle('🕌 اختيار الدولة والمدينة لمواقيت الصلاة')
        .setDescription(`
من فضلك اختر الدولة والمدينة من القائمة أدناه:

${currentConfig ? `🗺️ **المكان الحالي:** ${currentConfig.city}, ${currentConfig.country}` : '⚠️ **لم يتم اختيار أي مكان بعد**'}
        `)
        .setFooter({ text: '🕌 سيتم إرسال مواقيت الصلاة يومياً' })
        .setTimestamp();

      const row = this.createCountrySelectMenu(guildId);
      await this.safeReply(interaction, { embeds: [embed], components: [row], flags: 64 });

    } catch (error) {
      logger.error('Error in country command:', error);
      await this.safeReply(interaction, '❌ حدث خطأ في تنفيذ الأمر');
    }
  }

  // أمر /link-invite: بيبعت رابط دعوة البوت
  async handleInvite(interaction) {
    // رابط الدعوة بيتبني من CLIENT_ID اللي في .env
    const inviteLink = config.inviteLink;
    if (!inviteLink) {
      return this.safeReply(interaction, '❌ رابط الدعوة مش متظبط، لازم صاحب البوت يحط CLIENT_ID في ملف .env');
    }

    const embed = new EmbedBuilder()
      .setColor('#9E7B4F')
      .setTitle('🤖 دعوة البوت')
      .setDescription(`
**أضف البوت إلى سيرفرك**

اضغط على الزر أدناه لفتح رابط الدعوة:

---

**📖 ما هو بوت القرآن الكريم؟**
بوت متخصص لبث تلاوات القرآن الكريم بأصوات أشهر القراء مباشرة في الروم الصوتي.

**🎙 القراء المتوفرون:**
يضم البوت مجموعة من أشهر القراء

**🛠 الأوامر المتوفرة:**
\`/setup\` - **للأدمنة فقط** - لتهيئة البوت
\`/country\` - **للأدمنة فقط** - اختيار الدولة لعرض مواقيت الصلاة
\`/link-invite\` - الحصول على رابط دعوة البوت
      `)
      .setThumbnail(this.client.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'القرآن الكريم | استمع وتدبر' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🔗 فتح الدعوة')
          .setStyle(ButtonStyle.Link)
          .setURL(inviteLink)
      );

    await this.safeReply(interaction, { embeds: [embed], components: [row], flags: 64 });
  }

  // بتعمل قايمة اختيار الدولة
  createCountrySelectMenu(guildId) {
    return new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`select_country_${guildId}`)
          .setPlaceholder('🕌 اختر الدولة والمدينة لمواقيت الصلاة')
          .addOptions(COUNTRY_OPTIONS)
      );
  }
}

module.exports = CommandHandler;