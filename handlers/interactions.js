// ============================================================
// 📄 handlers/interactions.js
// بيستقبل كل ضغطات الأزرار وقوايم الاختيار: اختيار الشيخ، اختيار السورة، تخطي، إيقاف، استكمال...
// ============================================================

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const config = require('../config');
const { voiceService, prayerService, quranService, statsService } = require('../services');
const guildSettings = require('../models/GuildSettings');
const guildDataModel = require('../models/GuildData');
const { renderControlPanel, RECITERS_MAP } = require('../utils/controlPanelRenderer');

class InteractionHandler {
  constructor(client) {
    this.client = client;
    this.guildControlMessages = new Map();
    this.loadControlMessages();

    this.handleInteraction = this.handleInteraction.bind(this);
    this.handleSelectMenu = this.handleSelectMenu.bind(this);
    this.handleReciterSelect = this.handleReciterSelect.bind(this);
    this.handleSurahSelect = this.handleSurahSelect.bind(this);
    this.handleCountrySelect = this.handleCountrySelect.bind(this);
    this.handlePrayerSetupRoleSelect = this.handlePrayerSetupRoleSelect.bind(this);
    this.handlePrayerSetupToggle = this.handlePrayerSetupToggle.bind(this);
    this.handleButton = this.handleButton.bind(this);
    this.handleSkipSurah = this.handleSkipSurah.bind(this);
    this.handleRestartQuran = this.handleRestartQuran.bind(this);
    this.handlePause = this.handlePause.bind(this);
    this.handleResume = this.handleResume.bind(this);
    this.handleModal = this.handleModal.bind(this);
    this.playSurah = this.playSurah.bind(this);
    this.createSurahSelectMenus = this.createSurahSelectMenus.bind(this);
    this.getGuildSetting = this.getGuildSetting.bind(this);
    this.setGuildSetting = this.setGuildSetting.bind(this);
  }

  // بتحمّل أرقام رسايل لوحة التحكم المحفوظة (عشان تعدّلها بدل ما تبعت جديدة)
  loadControlMessages() {
    try {
      const filePath = './data/control_messages.json';
      if (fs.existsSync(filePath)) {
        const data = fs.readJsonSync(filePath);
        for (const [guildId, messageId] of Object.entries(data)) {
          this.guildControlMessages.set(guildId, messageId);
        }
      }
    } catch (error) {
      logger.error('Failed to load control messages:', error.message);
    }
  }

  // بتحفظ أرقام رسايل لوحة التحكم
  saveControlMessages() {
    try {
      const data = Object.fromEntries(this.guildControlMessages);
      fs.writeJsonSync('./data/control_messages.json', data, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save control messages:', error.message);
    }
  }

  // بتقرا إعداد للسيرفر
  getGuildSetting(guildId, key) {
    return guildSettings.getSetting(guildId, key);
  }

  // بتحفظ إعداد للسيرفر
  setGuildSetting(guildId, key, value) {
    return guildSettings.set(guildId, key, value);
  }

  // handlers/interactions.js
  // ✅ هذه هي نقطة الدخول الوحيدة لمعالجة تفاعلات القوائم/الأزرار/النماذج،
  // ويجب أن تُستدعى من مكان واحد فقط في index.js (مش أكتر من مرة) وإلا
  // هيحصل تعارض في deferReply ويظهر خطأ "Interaction has already been acknowledged".
  async handleInteraction(interaction) {
    try {
        // ✅ التحقق من صحة التفاعل
        if (!interaction || !interaction.isRepliable()) {
            logger.warn('Interaction is not repliable');
            return;
        }

        // ✅ محاولة تأجيل الرد مع معالجة الخطأ
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            } catch (error) {
                // ✅ معالجة خاصة لخطأ Unknown interaction
                if (error.code === 10062) {
                    logger.warn('Ignoring expired interaction (Unknown interaction)');
                    return;
                }
                if (error.code === 40060) {
                    logger.warn('Interaction was already replied to, ignoring');
                    return;
                }
                throw error;
            }
        }

        // معالجة حسب نوع التفاعل
        if (interaction.isStringSelectMenu()) {
            await this.handleSelectMenu(interaction);
        } else if (interaction.isButton()) {
            await this.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
            await this.handleModal(interaction);
        }
    } catch (error) {
        // ✅ معالجة خاصة لخطأ Unknown interaction في المستوى الأعلى
        if (error.code === 10062) {
            logger.warn('Ignoring expired interaction at the top level');
            return;
        }
        if (error.code === 40060) {
            logger.warn('Interaction already replied to at the top level, ignoring');
            return;
        }

        logger.error('Error in interaction handler:', error);
        try {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.editReply({
                    content: '❌ حدث خطأ أثناء معالجة التفاعل'
                }).catch(() => {});
            }
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }
    }
  }

  // handlers/interactions.js
  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    try {
        // ✅ التحقق من صلاحية التفاعل قبل المعالجة
        if (!interaction.isRepliable()) {
            logger.warn('Interaction is not repliable in handleSelectMenu');
            return;
        }

        if (customId.startsWith('select_reciter_')) {
            await this.handleReciterSelect(interaction);
        } else if (customId.startsWith('select_surah_')) {
            await this.handleSurahSelect(interaction);
        } else if (customId.startsWith('select_country_')) {
            await this.handleCountrySelect(interaction);
        } else if (customId.startsWith('prayer_setup_role_')) {
            await this.handlePrayerSetupRoleSelect(interaction);
        }
    } catch (error) {
        // ✅ معالجة خاصة
        if (error.code === 10062) {
            logger.warn('Ignoring expired interaction in menus');
            return;
        }
        logger.error('Error in menu handler:', error);

        try {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.editReply({
                    content: '❌ حدث خطأ أثناء معالجة القائمة'
                }).catch(() => {});
            }
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }
    }
  }

  // لما المستخدم يختار شيخ من القايمة
  async handleReciterSelect(interaction) {
    const guildId = interaction.guildId;
    const reciterId = interaction.values[0];

    const reciter = RECITERS_MAP.get(reciterId);
    if (!reciter) {
      return interaction.editReply({
        content: '❌ القارئ غير موجود'
      });
    }

    quranService.guildReciters.set(guildId, reciter);
    this.setGuildSetting(guildId, 'defaultReciter', reciterId);

    const guildData = guildDataModel.load(guildId);
    guildData.quran.currentReciter = reciterId;
    guildDataModel.save(guildId, guildData);

    await renderControlPanel(this.client, guildId, interaction.channel);

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🎙 تم اختيار القارئ ${reciter.name}`)
      .setDescription('📖 اختر السورة التي تريد تشغيلها من القوائم أدناه:')
      .addFields(
        { name: '📚 عدد السور', value: '114 سورة', inline: true },
        { name: '🎙 القارئ', value: reciter.name, inline: true }
      )
      .setFooter({ text: '📖 اختر السورة وابدأ الاستماع' })
      .setTimestamp();

    // اللوجو اختياري (من BOT_LOGO_URL في .env)
    if (config.BOT_LOGO_URL) embed.setThumbnail(config.BOT_LOGO_URL);

    const surahMenus = this.createSurahSelectMenus(guildId);

    await interaction.editReply({
      embeds: [embed],
      components: surahMenus
    });
  }

  // handlers/interactions.js
  async handleSurahSelect(interaction) {
    const parts = interaction.customId.split('_');
    const guildId = parts[2];
    const surahNumber = parseInt(interaction.values[0]);

    // ✅ التحقق من صلاحية التفاعل
    if (!interaction.isRepliable()) {
        logger.warn('Interaction is not repliable in handleSurahSelect');
        return;
    }

    const currentReciter = quranService.guildReciters.get(guildId);
    if (!currentReciter) {
        try {
            await interaction.editReply({
                content: '❌ الرجاء اختيار قارئ أولاً'
            }).catch(() => {});
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }
        return;
    }

    if (!voiceService.lockGuildAction(guildId)) {
        try {
            await interaction.editReply({
                content: '⏳ فيه عملية تشغيل شغالة حالياً، انتظر لحظة وحاول تاني'
            }).catch(() => {});
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send lock message:', replyError.message);
            }
        }
        return;
    }

    try {
        const surahName = quranService.getSurahName(currentReciter.id, surahNumber);

        // ✅ تأكيد أن التفاعل لا يزال صالحاً بعد القفل
        if (!interaction.isRepliable()) {
            logger.warn(`Interaction became invalid after locking in server ${guildId}`);
            return;
        }

        voiceService.stop(guildId, true);

        // ✅ إرسال رسالة قبل البدء بالتحميل الطويل
        try {
            await interaction.editReply({
                content: `⏳ جاري تحميل سورة **${surahName}**...`
            }).catch(() => {});
        } catch (replyError) {
            if (replyError.code === 10062) {
                logger.warn(`Interaction expired while loading surah ${surahNumber}`);
                return;
            }
            throw replyError;
        }

        // ✅ تشغيل السورة (عملية قد تستغرق وقتاً)
        const success = await this.playSurah(guildId, surahNumber, interaction);

        if (success) {
            statsService.incrementSurahPlayed(guildId, surahNumber, currentReciter.id);
            await renderControlPanel(this.client, guildId, interaction.channel);

            // ✅ تحديث الرد بنجاح التشغيل
            try {
                await interaction.editReply({
                    content: `✅ تم تشغيل سورة **${surahName}**`
                }).catch(() => {});
            } catch (replyError) {
                if (replyError.code !== 10062) {
                    logger.error('Failed to send success message:', replyError.message);
                }
            }
        }
    } catch (error) {
        if (error.code === 10062) {
            logger.warn(`Ignoring expired interaction while selecting surah ${surahNumber}`);
            return;
        }
        logger.error('Error selecting surah:', error);

        try {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.editReply({
                    content: '❌ حدث خطأ في تشغيل السورة'
                }).catch(() => {});
            }
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }
    } finally {
        voiceService.unlockGuildAction(guildId);
    }
  }

  // لما الأدمن يختار الدولة لمواقيت الصلاة
  async handleCountrySelect(interaction) {
    try {
      const guildId = interaction.guildId;
      const configData = JSON.parse(interaction.values[0]);

      this.setGuildSetting(guildId, 'prayerCity', configData.city);
      this.setGuildSetting(guildId, 'prayerCountry', configData.country);
      this.setGuildSetting(guildId, 'prayerMethod', configData.method);

      if (prayerService && prayerService.configs) {
        prayerService.configs.set(guildId, {
          city: configData.city,
          country: configData.country,
          method: configData.method
        });
      }

      const guildData = guildDataModel.load(guildId);
      guildData.prayer.city = configData.city;
      guildData.prayer.country = configData.country;
      guildData.prayer.method = configData.method;
      guildData.prayer.enabled = true;
      guildDataModel.save(guildId, guildData);

      const prayerChannelId = this.getGuildSetting(guildId, 'prayerChannelId');

      if (prayerChannelId) {
        try {
          await prayerService.updateGuildPrayerTimes(guildId);
          const channel = await this.client.channels.fetch(prayerChannelId);
          if (channel) {
            // ✅ استخدام sendPrayerMessage بدل updatePrayerMessage: لو دي أول مرة (مفيش
            // رسالة مواقيت مُرسلة قبل كده) فبيبعتها لأول مرة، ولو موجودة بيعدّلها فقط - رسالة واحدة دايمًا
            await prayerService.sendPrayerMessage(guildId, channel, this.client);
          }

          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ تم اختيار المكان بنجاح')
            .setDescription(`
**🕌 المكان المختار:** ${configData.city}, ${configData.country}

**📅 تم تحديث مواقيت الصلاة في القناة <#${prayerChannelId}>**
            `)
            .setFooter({ text: '🕌 سيتم تحديث المواقيت يومياً' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });

        } catch (error) {
          logger.error('Failed to update prayer times:', error);
          await interaction.editReply({
            content: '❌ فشل في تحديث مواقيت الصلاة، يرجى المحاولة مرة أخرى'
          }).catch(() => {});
        }
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('✅ تم اختيار المكان بنجاح')
          .setDescription(`
**🕌 المكان المختار:** ${configData.city}, ${configData.country}

**⚠️ لم يتم تعيين قناة لمواقيت الصلاة**

استخدم الأمر \`/setup\` لتعيين قناة الصلاة.
          `)
          .setFooter({ text: '🕌 سيتم تفعيل الإرسال عند تعيين قناة الصلاة' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      logger.error('Error in country-select handler:', error);
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.editReply({
            content: '❌ حدث خطأ في اختيار الدولة'
          }).catch(() => {});
        }
      } catch (replyError) {
        if (replyError.code !== 10062) {
          logger.error('Failed to send error message:', replyError.message);
        }
      }
    }
  }

  /**
   * ✅ خطوة 1 من إعداد تنبيهات الأذان عبر /setup: بعد ما الأدمن يختار prayer_channel،
   * بيظهر له هنا قائمة بكل رتب السيرفر (Role_Mention) عشان يختار واحدة، أو "بدون منشن" للتخطي.
   * customId المستخدم: prayer_setup_role_<prayerChannelId>
   */
  async handlePrayerSetupRoleSelect(interaction) {
    try {
      const prayerChannelId = interaction.customId.replace('prayer_setup_role_', '');
      const selected = interaction.values[0]; // roleId أو 'none'

      const roleLine = selected === 'none' ? '🔕 بدون منشن' : `<@&${selected}>`;

      // ✅ خطوة 2: Turn تشغيل/إيقاف - نمرر الرتبة المختارة وقناة الصلاة داخل customId الأزرار
      const toggleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`prayer_setup_toggle_on_${prayerChannelId}_${selected}`)
          .setLabel('تشغيل')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`prayer_setup_toggle_off_${prayerChannelId}_${selected}`)
          .setLabel('إيقاف')
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setColor(0x9E7B4F)
        .setTitle('🕌 إعداد تنبيهات الأذان')
        .setDescription(
          `**الرتبة المختارة:** ${roleLine}\n\n` +
          `**الخطوة 2️⃣ (الأخيرة):** اختر تشغيل أو إيقاف تنبيهات الأذان في قناة الصلاة.`
        );

      await interaction.editReply({ embeds: [embed], components: [toggleRow] });
    } catch (error) {
      if (error.code === 10062) return;
      logger.error('Error in prayer setup role select:', error);
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.editReply({ content: '❌ حدث خطأ أثناء اختيار الرتبة' }).catch(() => {});
        }
      } catch (_) {}
    }
  }

  /**
   * ✅ خطوة 2 (الأخيرة) من إعداد تنبيهات الأذان عبر /setup: يحفظ الرتبة المختارة
   * وحالة التشغيل/الإيقاف، ثم يرسل/يحدّث رسالة مواقيت الصلاة في القناة المحددة مباشرة.
   * customId المستخدم: prayer_setup_toggle_<on|off>_<prayerChannelId>_<roleId|none>
   */
  async handlePrayerSetupToggle(interaction) {
    try {
      const guildId = interaction.guildId;
      const customId = interaction.customId;
      const isOn = customId.startsWith('prayer_setup_toggle_on_');
      const prefix = isOn ? 'prayer_setup_toggle_on_' : 'prayer_setup_toggle_off_';
      const rest = customId.slice(prefix.length);
      const [prayerChannelId, roleValue] = rest.split('_');

      const enabled = isOn;
      const mentionRoleId = roleValue && roleValue !== 'none' ? roleValue : null;

      this.setGuildSetting(guildId, 'adhanEnabled', enabled);
      this.setGuildSetting(guildId, 'adhanMentionRoleId', mentionRoleId);
      this.setGuildSetting(guildId, 'prayerChannelId', prayerChannelId);

      let statusText;

      const city = this.getGuildSetting(guildId, 'prayerCity');
      const country = this.getGuildSetting(guildId, 'prayerCountry');
      const method = this.getGuildSetting(guildId, 'prayerMethod') || 5;

      if (city && country) {
        prayerService.configs.set(guildId, { city, country, method });
        try {
          const channel = await this.client.channels.fetch(prayerChannelId);
          if (channel) {
            await prayerService.sendPrayerMessage(guildId, channel, this.client);
            statusText = `✅ تم إرسال/تحديث رسالة مواقيت الصلاة في <#${prayerChannelId}>`;
          } else {
            statusText = '⚠️ تم حفظ الإعدادات، لكن تعذر الوصول إلى قناة الصلاة.';
          }
        } catch (err) {
          logger.error('Failed to send prayer message after setup toggle:', err.message);
          statusText = '⚠️ تم حفظ الإعدادات، لكن تعذر إرسال رسالة المواقيت الآن.';
        }
      } else {
        statusText = '⚠️ لم يتم تحديد الدولة بعد. استخدم الأمر `/country` أولاً، وسيتم إرسال رسالة المواقيت تلقائيًا في قناة الصلاة بعد ذلك.';
      }

      const embed = new EmbedBuilder()
        .setColor(enabled ? 0x2E7D32 : 0xB71C1C)
        .setTitle('✅ تم حفظ إعدادات تنبيهات الأذان')
        .setDescription(
          `**قناة الصلاة:** <#${prayerChannelId}>\n` +
          `**الحالة:** ${enabled ? '✅ مُفعّلة (On)' : '⛔ متوقفة (Off)'}\n` +
          `**الرتبة التي يتم منشنها:** ${mentionRoleId ? `<@&${mentionRoleId}>` : 'بدون منشن'}\n\n` +
          `${statusText}`
        )
        .setFooter({ text: 'يمكنك تعديل هذه الإعدادات لاحقًا بإعادة استخدام /setup أو /prayer' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], components: [] });
    } catch (error) {
      if (error.code === 10062) return;
      logger.error('Error in prayer setup toggle:', error);
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.editReply({ content: '❌ حدث خطأ أثناء حفظ إعدادات تنبيهات الأذان' }).catch(() => {});
        }
      } catch (_) {}
    }
  }

  // handlers/interactions.js
  async handleButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const guildId = parts[parts.length - 1];

    // ✅ التحقق من صلاحية التفاعل
    if (!interaction.isRepliable()) {
        logger.warn('Interaction is not repliable in handleButton');
        return;
    }

    // أزرار التوقف/الاستكمال وأزرار إعداد تنبيهات الأذان مفيش داعي تاخد القفل
    // (قفل voiceService.lockGuildAction مخصص لعمليات تشغيل/تخطي القرآن فقط)
    const isPlaybackSwitchButton =
        customId.startsWith('pause_radio_') || customId.startsWith('resume_radio_');
    const isPrayerSetupButton = customId.startsWith('prayer_setup_toggle_');
    const skipLock = isPlaybackSwitchButton || isPrayerSetupButton;

    let locked = true;
    if (!skipLock) {
        locked = voiceService.lockGuildAction(guildId);
        if (!locked) {
            try {
                await interaction.editReply({
                    content: '⏳ فيه عملية تشغيل شغالة حالياً، انتظر لحظة وحاول تاني'
                }).catch(() => {});
            } catch (replyError) {
                if (replyError.code !== 10062) {
                    logger.error('Failed to send lock message:', replyError.message);
                }
            }
            return;
        }
    }

    try {
        if (customId.startsWith('skip_surah_')) {
            await this.handleSkipSurah(interaction, guildId);
        } else if (customId.startsWith('restart_quran_')) {
            await this.handleRestartQuran(interaction, guildId);
        } else if (customId.startsWith('pause_radio_')) {
            await this.handlePause(interaction, guildId);
        } else if (customId.startsWith('resume_radio_')) {
            await this.handleResume(interaction, guildId);
        } else if (customId.startsWith('prayer_setup_toggle_')) {
            await this.handlePrayerSetupToggle(interaction);
        }
    } catch (error) {
        if (error.code === 10062) {
            logger.warn('Ignoring expired interaction in buttons');
            return;
        }
        logger.error('Error in button handler:', error);

        try {
            if (interaction.isRepliable() && !interaction.replied) {
                await interaction.editReply({
                    content: '❌ حدث خطأ في معالجة الزر'
                }).catch(() => {});
            }
        } catch (replyError) {
            if (replyError.code !== 10062) {
                logger.error('Failed to send error message:', replyError.message);
            }
        }
    } finally {
        if (!skipLock) {
            voiceService.unlockGuildAction(guildId);
        }
    }
  }

  // زرار التخطي: بينقل للسورة اللي بعدها
  async handleSkipSurah(interaction, guildId) {
    try {
      const currentSurah = quranService.guildSurahIndex.get(guildId) || 0;

      if (currentSurah >= 114) {
        return interaction.editReply({
          content: '⚠️ هذا آخر سورة في القرآن'
        });
      }

      if (voiceService.isPaused.get(guildId)) {
        return interaction.editReply({
          content: '⚠️ الإذاعة متوقفة حالياً'
        });
      }

      const currentReciter = quranService.guildReciters.get(guildId);
      if (!currentReciter) {
        return interaction.editReply({
          content: '❌ الرجاء اختيار قارئ أولاً'
        });
      }

      const nextSurah = currentSurah + 1;
      const surahName = quranService.getSurahName(currentReciter.id, nextSurah);

      await interaction.editReply({
        content: `⏭ يتم التخطي إلى سورة **${surahName}**...`
      });

      // ✅ suppressAutoAdvance = true: نمنع auto-advance من إنه يشتغل بالتوازي
      // مع إننا هنا هنشغل السورة التالية بنفسنا يدوياً
      voiceService.stop(guildId, true);
      const success = await this.playSurah(guildId, nextSurah, interaction);

      if (success) {
        await renderControlPanel(this.client, guildId, interaction.channel);
      }

    } catch (error) {
      logger.error('Error skipping:', error);
      await interaction.editReply({
        content: '❌ حدث خطأ في التخطي'
      }).catch(() => {});
    }
  }

  // زرار إعادة القرآن: بيبدأ من الفاتحة
  async handleRestartQuran(interaction, guildId) {
    try {
      if (voiceService.isPaused.get(guildId)) {
        return interaction.editReply({
          content: '⚠️ الإذاعة متوقفة حالياً'
        });
      }

      const currentReciter = quranService.guildReciters.get(guildId);
      if (!currentReciter) {
        return interaction.editReply({
          content: '❌ الرجاء اختيار قارئ أولاً'
        });
      }

      await interaction.editReply({
        content: '🔁 يتم إعادة تشغيل القرآن من البداية (سورة الفاتحة)...'
      });

      // ✅ suppressAutoAdvance = true لنفس سبب التخطي
      voiceService.stop(guildId, true);
      quranService.guildSurahIndex.set(guildId, 0);

      const success = await this.playSurah(guildId, 1, interaction);

      if (success) {
        await renderControlPanel(this.client, guildId, interaction.channel);
      }

    } catch (error) {
      logger.error('Error restarting Quran:', error);
      await interaction.editReply({
        content: '❌ حدث خطأ في إعادة القرآن'
      }).catch(() => {});
    }
  }

  // زرار التوقف المؤقت
  async handlePause(interaction, guildId) {
    if (!voiceService.isPlaying.get(guildId)) {
      return interaction.editReply({
        content: '⚠️ لا توجد إذاعة تعمل حالياً'
      });
    }

    if (voiceService.isPaused.get(guildId)) {
      return interaction.editReply({
        content: '⚠️ الإذاعة متوقفة بالفعل'
      });
    }

    await interaction.editReply({
      content: '⏸ تم إيقاف الإذاعة مؤقتاً'
    });

    voiceService.pause(guildId);

    const guildData = guildDataModel.load(guildId);
    guildData.quran.isPaused = true;
    guildDataModel.save(guildId, guildData);

    await renderControlPanel(this.client, guildId, interaction.channel);
  }

  // زرار الاستكمال
  async handleResume(interaction, guildId) {
    if (!voiceService.isPaused.get(guildId)) {
      return interaction.editReply({
        content: '⚠️ لا توجد إذاعة متوقفة'
      });
    }

    await interaction.editReply({
      content: '▶ يتم استكمال الإذاعة'
    });

    voiceService.resume(guildId);

    const guildData = guildDataModel.load(guildId);
    guildData.quran.isPaused = false;
    guildDataModel.save(guildId, guildData);

    await renderControlPanel(this.client, guildId, interaction.channel);
  }

  // للنوافذ المنبثقة (مش مستخدمة دلوقتي)
  async handleModal(interaction) {
    logger.debug('Modal received:', interaction.customId);
  }

  // بتشغّل سورة وبتحدّث لوحة التحكم
  async playSurah(guildId, surahNumber, interaction = null) {
    // ✅ نسجّل محاولة التشغيل دي كـ"الأحدث" لهذا السيرفر. لو حصل وحد اختار
    // سورة تانية بعد كده وإحنا لسه بنحمّل الصوت (اللي بياخد وقت)، هنكتشف
    // إننا بقينا "قديمين" ونلغي نفسنا بدل ما نشغل صوت فوق الاختيار الجديد.
    const playToken = quranService.nextPlayToken(guildId);

    try {
      const reciter = quranService.guildReciters.get(guildId);
      if (!reciter) {
        if (interaction && interaction.isRepliable()) {
          await interaction.editReply({
            content: '❌ الرجاء اختيار قارئ أولاً'
          }).catch(() => {});
        }
        return false;
      }

      if (surahNumber < 1 || surahNumber > 114) {
        if (interaction && interaction.isRepliable()) {
          await interaction.editReply({
            content: '❌ رقم سورة غير صحيح'
          }).catch(() => {});
        }
        return false;
      }

      const audioUrl = quranService.getAudioUrl(reciter.id, surahNumber);
      if (!audioUrl) {
        if (interaction && interaction.isRepliable()) {
          await interaction.editReply({
            content: '❌ فشل الحصول على رابط السورة'
          }).catch(() => {});
        }
        return false;
      }

      const stream = await quranService.fetchAudio(audioUrl);
      if (!stream) {
        if (interaction && interaction.isRepliable()) {
          await interaction.editReply({
            content: '❌ فشل تحميل السورة'
          }).catch(() => {});
        }
        return false;
      }

      // ✅ لو حصل وفيه محاولة تشغيل أحدث بدأت وإحنا لسه بنحمّل، نلغي نفسنا هنا
      // من غير ما نلمس الاتصال الصوتي أو نشغّل حاجة فوق الاختيار الجديد.
      if (!quranService.isPlayTokenCurrent(guildId, playToken)) {
        logger.info(`↩️ Cancelled attempt to play surah ${surahNumber} in server ${guildId} (a newer attempt started)`);
        try { stream.destroy(); } catch (_) {}
        return false;
      }

      let connection = voiceService.connections.get(guildId);
      if (!connection) {
        const voiceChannelId = this.getGuildSetting(guildId, 'voiceChannelId');
        if (!voiceChannelId) {
          if (interaction && interaction.isRepliable()) {
            await interaction.editReply({
              content: '❌ لم يتم تعيين قناة صوتية'
            }).catch(() => {});
          }
          return false;
        }

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          if (interaction && interaction.isRepliable()) {
            await interaction.editReply({
              content: '❌ السيرفر غير موجود'
            }).catch(() => {});
          }
          return false;
        }

        connection = await voiceService.joinVoiceChannel(
          guildId,
          voiceChannelId,
          guild.voiceAdapterCreator,
          true
        );

        if (!connection) {
          if (interaction && interaction.isRepliable()) {
            await interaction.editReply({
              content: '❌ فشل الاتصال بالروم الصوتي'
            }).catch(() => {});
          }
          return false;
        }
      }

      try {
        const guild = this.client.guilds.cache.get(guildId);
        const voiceState = guild?.members?.me?.voice;
        if (voiceState) {
          await voiceState.setDeaf(false);
          await voiceState.setMute(false);
        }
      } catch (error) {
        logger.log('ERROR', `Failed to unmute: ${error.message}`);
      }

      // ✅ فحص أخير قبل التشغيل الفعلي، لو الاتصال بالروم الصوتي أخد وقت
      if (!quranService.isPlayTokenCurrent(guildId, playToken)) {
        logger.info(`↩️ Cancelled attempt to play surah ${surahNumber} in server ${guildId} (a newer attempt started)`);
        try { stream.destroy(); } catch (_) {}
        return false;
      }

      const success = await voiceService.playAudio(guildId, stream, { volume: 1 });

      if (!success) {
        if (interaction && interaction.isRepliable()) {
          await interaction.editReply({
            content: '❌ فشل تشغيل الصوت'
          }).catch(() => {});
        }
        return false;
      }

      quranService.guildSurahIndex.set(guildId, surahNumber);
      quranService.guildLastSurah.set(guildId, surahNumber);
      this.setGuildSetting(guildId, 'currentSurah', surahNumber);

      const guildData = guildDataModel.load(guildId);
      guildData.quran.currentSurah = surahNumber;
      guildData.quran.currentReciter = reciter.id;
      guildData.quran.isPlaying = true;
      guildData.quran.isPaused = false;
      guildDataModel.save(guildId, guildData);

      const surahName = quranService.getSurahName(reciter.id, surahNumber);
      logger.info(`▶️ Started playing surah ${surahName} in server ${guildId}`);

      return true;

    } catch (error) {
      logger.error(`Failed to play surah ${surahNumber}:`, error);
      if (interaction && interaction.isRepliable()) {
        await interaction.editReply({
          content: `❌ حدث خطأ في تشغيل السورة: ${error.message}`
        }).catch(() => {});
      }
      return false;
    }
  }

  // بتعمل قوايم اختيار السور (114 سورة متقسمة على أكتر من قايمة)
  createSurahSelectMenus(guildId) {
    const menus = [];
    const surahsList = [];

    for (let i = 1; i <= 114; i++) {
      const name = quranService.getSurahName(null, i);
      surahsList.push({ id: i, name });
    }

    const chunkSize = 25;
    const totalMenus = Math.ceil(surahsList.length / chunkSize);

    for (let i = 0; i < surahsList.length; i += chunkSize) {
      const chunk = surahsList.slice(i, i + chunkSize);
      const options = chunk.map(surah => ({
        label: `${surah.id} - ${surah.name}`,
        value: surah.id.toString(),
        description: `سورة ${surah.name}`
      }));

      const menuNumber = Math.floor(i / chunkSize) + 1;

      const menu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_surah_${guildId}_${menuNumber}`)
            .setPlaceholder(`📖 قائمة السور ${menuNumber} من ${totalMenus}`)
            .addOptions(options)
        );

      menus.push(menu);
    }

    return menus;
  }
}

module.exports = InteractionHandler;