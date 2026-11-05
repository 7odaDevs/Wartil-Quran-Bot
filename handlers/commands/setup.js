// ============================================================
// 📄 handlers/commands/setup.js
// أمر /setup (للأدمن فقط): بيجهّز البوت بالكامل في السيرفر ويبعت لوحة التحكم
// ============================================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger');
const guildSettings = require('../../models/GuildSettings');
const guildDataModel = require('../../models/GuildData');
const { voiceService, prayerService, noticeService, azkarService } = require('../../services');
const { renderControlPanel } = require('../../utils/controlPanelRenderer');
const { updateJoinLogPanel } = require('../../utils/joinLogPanel');

// قائمة الدول
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('تهيئة البوت في السيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('control_channel')
        .setDescription('قناة لوحة التحكم')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('voice_channel')
        .setDescription('القناة الصوتية')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('azkar_channel')
        .setDescription('قناة الأذكار')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('prayer_channel')
        .setDescription('قناة الصلاة')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('notice_channel')
        .setDescription('قناة التنبيهات')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const guildId = interaction.guildId;
      const guild = interaction.guild;
      const options = interaction.options;

      let guildData = guildDataModel.load(guildId, guild.name, guild.ownerId);
      guildData.membersCount = guild.memberCount;
      guildDataModel.save(guildId, guildData);

      const controlChannel = options.getChannel('control_channel');
      const voiceChannel = options.getChannel('voice_channel');
      const azkarChannel = options.getChannel('azkar_channel');
      const prayerChannel = options.getChannel('prayer_channel');
      const noticeChannel = options.getChannel('notice_channel');

      // ✅ ممنوع استخدام روم لأكثر من غرض أبدًا - كل روم لغرض واحد فقط.
      // نتحقق من التعارض بين القنوات الجديدة المُرسلة في نفس الأمر،
      // وأيضًا بين أي قناة جديدة وأي قناة تانية محفوظة بالفعل لغرض مختلف.
      const currentSettings = guildSettings.get(guildId) || {};
      const purposeLabels = {
        control: 'قناة التحكم (control_channel)',
        voice: 'القناة الصوتية (voice_channel)',
        azkar: 'قناة الأذكار (azkar_channel)',
        prayer: 'قناة الصلاة (prayer_channel)',
        notice: 'قناة التنبيهات (notice_channel)'
      };

      // كل غرض وقناته الحالية (سواء جاية من الأمر الحالي أو محفوظة من قبل)
      const effectiveChannelId = {
        control: controlChannel ? controlChannel.id : currentSettings.controlPanelChannelId || null,
        voice: voiceChannel ? voiceChannel.id : currentSettings.voiceChannelId || null,
        azkar: azkarChannel ? azkarChannel.id : currentSettings.azkarChannelId || null,
        prayer: prayerChannel ? prayerChannel.id : currentSettings.prayerChannelId || null,
        notice: noticeChannel ? noticeChannel.id : currentSettings.noticeChannelId || null
      };

      // الأغراض اللي بيتم تغييرها فعليًا في هذا الأمر (عشان نعرف نبلّغ عن التعارض بوضوح)
      const changedPurposes = {
        control: !!controlChannel,
        voice: !!voiceChannel,
        azkar: !!azkarChannel,
        prayer: !!prayerChannel,
        notice: !!noticeChannel
      };

      const seenChannels = new Map(); // channelId -> purpose key
      for (const [purpose, channelId] of Object.entries(effectiveChannelId)) {
        if (!channelId) continue;

        const existingPurpose = seenChannels.get(channelId);
        if (existingPurpose && existingPurpose !== purpose) {
          // نبلّغ فقط لو واحد على الأقل من الغرضين اتغيّر في هذا الأمر
          if (changedPurposes[purpose] || changedPurposes[existingPurpose]) {
            return interaction.editReply({
              content:
                `❌ ممنوع استخدام نفس الروم لأكثر من غرض.\n` +
                `الروم <#${channelId}> متعارض بين: **${purposeLabels[existingPurpose]}** و **${purposeLabels[purpose]}**.\n` +
                `من فضلك اختر روم مختلف لكل غرض.`
            });
          }
        }
        seenChannels.set(channelId, purpose);
      }

      let responseMessage = '';
      const settings = {};

      // إعداد قناة التحكم
      if (controlChannel) {
        if (controlChannel.type !== 0) {
          return interaction.editReply({ content: '❌ control_channel يجب أن تكون قناة نصية' });
        }
        guildData.channels.control.channelId = controlChannel.id;
        guildDataModel.save(guildId, guildData);
        settings.controlPanelChannelId = controlChannel.id;
        responseMessage += `✅ تم تعيين قناة التحكم: ${controlChannel}\n`;
      }

      // إعداد القناة الصوتية
      if (voiceChannel) {
        if (voiceChannel.type !== 2) {
          return interaction.editReply({ content: '❌ voice_channel يجب أن تكون قناة صوتية' });
        }

        guildData.channels.voice.channelId = voiceChannel.id;

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
          guildDataModel.save(guildId, guildData);
          responseMessage += `✅ تم تعيين القناة الصوتية: ${voiceChannel} (البوت متصل ومكتوم)\n`;
        } else {
          responseMessage += `❌ فشل الاتصال بالقناة الصوتية: ${voiceChannel}\n`;
        }
        settings.voiceChannelId = voiceChannel.id;
      }

      // إعداد قناة الأذكار
      if (azkarChannel) {
        if (azkarChannel.type !== 0) {
          return interaction.editReply({ content: '❌ azkar_channel يجب أن تكون قناة نصية' });
        }
        guildData.channels.azkar.channelId = azkarChannel.id;
        guildDataModel.save(guildId, guildData);
        settings.azkarChannelId = azkarChannel.id;
        responseMessage += `✅ تم تعيين قناة الأذكار: ${azkarChannel}\n`;
      }

      // إعداد قناة الصلاة
      if (prayerChannel) {
        if (prayerChannel.type !== 0) {
          return interaction.editReply({ content: '❌ prayer_channel يجب أن تكون قناة نصية' });
        }
        guildData.channels.prayer.channelId = prayerChannel.id;
        guildDataModel.save(guildId, guildData);
        settings.prayerChannelId = prayerChannel.id;
        responseMessage += `✅ تم تعيين قناة الصلاة: ${prayerChannel}\n`;
      }

      // إعداد قناة التنبيهات
      if (noticeChannel) {
        if (noticeChannel.type !== 0) {
          return interaction.editReply({ content: '❌ notice_channel يجب أن تكون قناة نصية' });
        }
        guildData.channels.notice.channelId = noticeChannel.id;
        guildDataModel.save(guildId, guildData);
        settings.noticeChannelId = noticeChannel.id;
        responseMessage += `✅ تم تعيين قناة التنبيهات: ${noticeChannel}\n`;
      }

      // حفظ الإعدادات
      for (const [key, value] of Object.entries(settings)) {
        guildSettings.set(guildId, key, value);
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

      await interaction.editReply({ embeds: [embed] });

      // ✅ تحديث إمبيد الـ Join Log (روم اللوج): نسجل إن الشخص ده استخدم /setup،
      // ونعرض الرومات المفعّلة حاليًا (ID + اسم + لنك). لو حصل فيها أي خطأ
      // (مفيش صلاحية، الروم اتمسح...) بيتسجل في اللوج بس ومش هيوقف باقي الأمر.
      updateJoinLogPanel(interaction.client, guildId, interaction.user).catch(err => {
        logger.error('Failed to update join-log panel after /setup:', err.message);
      });

      // تشغيل الخدمات فوراً
      if (azkarChannel) {
        try {
          await azkarService.startScheduler(guildId, azkarChannel);
        } catch (error) {
          logger.error(`Failed to start azkar:`, error.message);
        }
      }

      if (noticeChannel) {
        noticeService.scheduleNextNotice(guildId, noticeChannel);
      }

      // ✅ عند تحديد prayer_channel: نبدأ خطوة تفاعلية جديدة (Role_Mention ثم Turn تشغيل/إيقاف)
      // بدل ما نبعت رسالة المواقيت فورًا. الإرسال الفعلي بيحصل بعد اختيار On/Off في الخطوة الأخيرة
      // (شوف handlePrayerSetupRoleSelect و handlePrayerSetupToggle في handlers/interactions.js)
      if (prayerChannel) {
        try {
          const roles = guild.roles.cache
            .filter(r => r.id !== guild.id) // استبعاد @everyone
            .sort((a, b) => b.position - a.position)
            .first(24);

          const options = [
            {
              label: '🔕 بدون منشن (تخطي)',
              value: 'none',
              description: 'إرسال تنبيه الأذان بدون منشن أي رتبة'
            },
            ...roles.map(r => ({
              label: r.name.length > 90 ? `${r.name.slice(0, 87)}...` : r.name,
              value: r.id,
              description: `منشن رتبة ${r.name}`.slice(0, 100)
            }))
          ];

          const roleSelectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`prayer_setup_role_${prayerChannel.id}`)
              .setPlaceholder('اختر الرتبة التي يتم منشنها عند الأذان (اختياري)')
              .addOptions(options)
          );

          const stepEmbed = new EmbedBuilder()
            .setColor(0x9E7B4F)
            .setTitle('🕌 إعداد تنبيهات الأذان')
            .setDescription(
              `تم تعيين قناة الصلاة: ${prayerChannel}\n\n` +
              `**الخطوة 1️⃣:** اختر الرتبة التي سيتم منشنها عند دخول وقت كل صلاة، ` +
              `أو اختر "بدون منشن" لتخطي هذه الخطوة.`
            )
            .setFooter({ text: 'إذا لم تكن الدولة محددة بعد، استخدم /country بعد إتمام هذه الخطوات' });

          await interaction.followUp({
            embeds: [stepEmbed],
            components: [roleSelectRow],
            flags: 64
          });
        } catch (flowError) {
          logger.error('Failed to start the prayer setup flow:', flowError.message);
          try {
            await interaction.followUp({
              content: '❌ حدث خطأ أثناء بدء إعداد تنبيهات الأذان، حاول استخدام `/setup` مرة أخرى.',
              flags: 64
            });
          } catch (_) {}
        }
      }

      // ========== إرسال لوحة التحكم ==========
      if (controlChannel) {
        try {
          const channel = await interaction.client.channels.fetch(controlChannel.id);
          if (channel) {
            await renderControlPanel(interaction.client, guildId, channel);
            logger.info(`✅ Control panel sent in server ${guildId}`);
          }
        } catch (error) {
          logger.error(`Failed to send control panel:`, error.message);
        }
      }

    } catch (error) {
      logger.error('Error in setup command:', error);
      await interaction.editReply({ content: '❌ حدث خطأ في الإعداد' });
    }
  }
};