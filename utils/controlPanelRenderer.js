// ============================================================
// 📄 utils/controlPanelRenderer.js
// بيعمل لوحة التحكم (الرسالة اللي فيها قايمة الشيوخ وأزرار التخطي/التوقف) وبيبعتها أو بيحدّثها
// قايمة الشيوخ بتتبني من ملفات data/reciters/*.json (الحد الأقصى 25 شيخ في القايمة الواحدة)
// ============================================================

const {
  ContainerBuilder,
  SeparatorSpacingSize,
  MediaGalleryItemBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const config = require('../config');
const { voiceService, quranService } = require('../services');
const guildDataModel = require('../models/GuildData');
const guildSettings = require('../models/GuildSettings');
const controlPanelLock = require('./controlPanelLock');

// ===== تحميل القراء من ملفات reciters =====
function loadReciters() {
  const recitersDir = path.join(__dirname, '..', 'data', 'reciters');
  const reciters = [];
  
  try {
    if (fs.existsSync(recitersDir)) {
      const files = fs.readdirSync(recitersDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = fs.readJsonSync(path.join(recitersDir, file));
          reciters.push({
            id: data.id,
            name: data.name,
            emoji: data.emoji,
            baseUrl: data.baseUrl
          });
        } catch (err) {
          logger.error(`Failed to load reciter ${file}:`, err.message);
        }
      }
    }
  } catch (err) {
    logger.error('Failed to load reciters:', err.message);
  }
  
  return reciters;
}

const RECITERS = loadReciters();
const RECITERS_MAP = new Map(RECITERS.map(r => [r.id, r]));

/**
 * دالة إنشاء رسالة القرآن باستخدام ContainerBuilder
 * هذه هي المصدر الوحيد لبناء لوحة التحكم
 */
function createQuranContainer(guildId, surahName, currentReciter, statusText, isPlaying, isPaused) {
  let statusEmoji = '📡';
  if (isPlaying) statusEmoji = '🔊';
  else if (isPaused) statusEmoji = '⏸️';
  else statusEmoji = '⏹️';

  const controlsDisabled = isPaused || !isPlaying;
  const reciters = RECITERS;

  // ===== نص الترويسة =====
  const headerText =
    `**الــســلام عــلــيــكــم و ر حــمــة الــلــه و بــركــاتــه**

**📖 مــرحــباً بــكــم فــي إذاعــة الــقــرآن الــكــريــم**

**يــمــكــنــك الاســتــمــاع إلــى الــقــرآن الــكــريــم بــأصــوات مــجــمــوعــة مــن أشــهــر الــقــرّاء بــكـل ســهـولـة.**

**🎙 طــريــقــة الاســتــخــدام:**
- اخــتــر الــقــارئ مــن الــقــائــمــة.
- اخــتــر الــســورة الــتــي تــريــد تــشــغــيــلــها.
- ســيــتــم تــشــغــيــل الــتــلاوة مــبــاشــرة داخــل الــروم الــصــوتــي.

**🤍 قــال الــلــه تــعــالــى :**
﴾ ألا بــذكــر الــلــه تــطــمــئــن الــقــلــوب ﴿

**📜 الــســورة الــحــالــيــة :** \`${surahName}\`

**🎙 الــقــارئ الــحــالــي :** \`${currentReciter ? currentReciter.name : 'لــم يــتــم الاخــتــيــار'}\`

**${statusEmoji} حــالــة الاذاعــة :** \`${statusText}\``;

  // ===== بنبني الكونتينر: لو فيه لوجو بنحطه صورة مصغرة، ولو مفيش بنكتفي بالنص =====
  const container = new ContainerBuilder().setAccentColor(0x9E7B4F);

  if (config.BOT_LOGO_URL) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(headerText))
        .setThumbnailAccessory((thumbnail) => thumbnail.setURL(config.BOT_LOGO_URL))
    );
  } else {
    container.addTextDisplayComponents((textDisplay) => textDisplay.setContent(headerText));
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    // ===== قائمة اختيار القارئ =====
    .addActionRowComponents((actionRow) => {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_reciter_${guildId}`)
        .setPlaceholder('🎙 اخــتــر الــقــارئ الــمــفــضــل')
        .addOptions(
          reciters.slice(0, 25).map((reciter) => ({
            label: reciter.name,
            value: reciter.id,
            description: `قرآن كامل بصوت ${reciter.name}`,
            // الإيموجي: لو أرقام بس = ID إيموجي مخصص من سيرفرك، ولو رمز عادي (زي 🎙) بيتحط زي ما هو
            // ولو الخانة فاضية (null) بيتحط 📖 تلقائي
            emoji: reciter.emoji
              ? (/^\d+$/.test(String(reciter.emoji))
                  ? { id: String(reciter.emoji), name: 'reciter', animated: false }
                  : { name: String(reciter.emoji) })
              : { name: '📖' }
          }))
        );

      return actionRow.setComponents(selectMenu);
    })
    // ===== الأزرار الأربعة =====
    .addActionRowComponents((actionRow) =>
      actionRow.setComponents(
        new ButtonBuilder()
          .setCustomId(`skip_surah_${guildId}`)
          .setLabel('الـتـخـطـي')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(controlsDisabled),

        new ButtonBuilder()
          .setCustomId(`restart_quran_${guildId}`)
          .setLabel('إعـادة الـقـرآن')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(controlsDisabled),

        new ButtonBuilder()
          .setCustomId(`pause_radio_${guildId}`)
          .setLabel('تـوقـف')
          .setEmoji('⏸️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(controlsDisabled),

        new ButtonBuilder()
          .setCustomId(`resume_radio_${guildId}`)
          .setLabel('اسـتـكـمـال')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!isPaused)
      )
    );

  // ===== الصورة الكبيرة (اختيارية من PANEL_BANNER_URL في .env) =====

  if (config.PANEL_BANNER_URL) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addMediaGalleryComponents((gallery) =>
        gallery.addItems(new MediaGalleryItemBuilder().setURL(config.PANEL_BANNER_URL))
      );
  }

  // ===== الفوتر =====
  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`-# الــقــرآن الــكــريــم | اســتــمــع و تــدبــر • ${new Date().toLocaleString('ar-EG')}`)
    );

  return container;
}

/**
 * الدالة الرئيسية لإرسال أو تحديث لوحة التحكم
 * هذه هي المصدر الوحيد للتحكم في لوحة التحكم
 */
async function renderControlPanel(client, guildId, channel) {
  // 🔒 القفل المشترك: منع التكرار
  if (controlPanelLock.isLocked(guildId)) {
    logger.warn(`Ignored a duplicate call to renderControlPanel for server ${guildId}`);
    return;
  }
  controlPanelLock.lock(guildId);

  try {
    const isPlaying = voiceService.isPlaying.get(guildId) || false;
    const isPaused = voiceService.isPaused.get(guildId) || false;
    const currentReciter = quranService.guildReciters.get(guildId);
    const currentSurah = quranService.guildSurahIndex.get(guildId);

    let statusText = '🔴 مـتـوقـف';
    if (isPlaying && !isPaused) {
      statusText = '🟢 يـعـمـل';
    } else if (isPlaying && isPaused) {
      statusText = '🟡 مـتـوقـف مـؤقـتاً';
    }

    let surahName = 'لا يوجد';
    if (currentSurah && currentSurah > 0) {
      surahName = quranService.getSurahName(currentReciter?.id, currentSurah);
    }

    // إنشاء الـ Container
    const container = createQuranContainer(
      guildId,
      surahName,
      currentReciter,
      statusText,
      isPlaying,
      isPaused
    );

    // المصدر الوحيد للحقيقة: guildDataModel
    let guildData = guildDataModel.load(guildId);
    const savedMessageId = guildData?.channels?.control?.messageId;

    let existingMessage = null;

    // محاولة جلب الرسالة المخزنة
    if (savedMessageId) {
      try {
        const fetched = await channel.messages.fetch(savedMessageId);
        if (fetched && fetched.author.id === client.user.id) {
          existingMessage = fetched;
        } else {
          logger.warn(`Saved message (${savedMessageId}) is not from the bot, searching for a replacement`);
          // ✅ إصلاح: نمسح الـ ID الغلط من قاعدة البيانات فوراً
          guildData = guildDataModel.load(guildId);
          if (guildData?.channels?.control) {
            guildData.channels.control.messageId = null;
            guildDataModel.save(guildId, guildData);
          }
        }
      } catch (error) {
        logger.warn(`Could not fetch the saved message (${savedMessageId}): ${error.message}`);
        // ✅ إصلاح: لو الرسالة اتمسحت من Discord (Unknown Message)، نمسح الـ ID
        // من قاعدة البيانات عشان ما نحاولش نجيبها تاني في كل مرة بيتحدث فيها
        // الـ control panel — ده كان بيطلع warning في اللوج بشكل مستمر بدون داعي.
        if (error.code === 10008 || error.message?.includes('Unknown Message')) {
          const cleanData = guildDataModel.load(guildId);
          if (cleanData?.channels?.control) {
            cleanData.channels.control.messageId = null;
            guildDataModel.save(guildId, cleanData);
            logger.info(`🗑️ Cleared stale message ID (${savedMessageId}) from DB for guild ${guildId}`);
          }
        }
      }
    }

    // البحث عن رسالة لوحة تحكم موجودة في القناة إذا لم نجد الرسالة المخزنة
    if (!existingMessage) {
      try {
        const recentMessages = await channel.messages.fetch({ limit: 50 });
        const botPanelMessages = recentMessages
          .filter((m) => m.author.id === client.user.id && m.components?.length > 0)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        if (botPanelMessages.size > 0) {
          existingMessage = botPanelMessages.first();
          logger.info(`ℹ️ Found an existing control panel (${existingMessage.id}), updating it`);

          // حذف النسخ المكررة إن وجدت
          if (botPanelMessages.size > 1) {
            const duplicates = [...botPanelMessages.values()].slice(1);
            for (const dup of duplicates) {
              try {
                await dup.delete();
                logger.info(`🗑️ Deleted duplicate message (${dup.id})`);
              } catch (delError) {
                logger.warn(`Could not delete duplicate message: ${delError.message}`);
              }
            }
          }
        }
      } catch (scanError) {
        logger.warn(`Could not search for an existing control panel: ${scanError.message}`);
      }
    }

    if (existingMessage) {
      // ✅ تحديث الرسالة الموجودة
      await existingMessage.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      // تحديث الـ ID المحفوظ
      guildData = guildDataModel.load(guildId);
      if (!guildData.channels) guildData.channels = {};
      if (!guildData.channels.control) guildData.channels.control = {};
      guildData.channels.control.messageId = existingMessage.id;
      guildData.channels.control.channelId = channel.id;
      guildDataModel.save(guildId, guildData);

      logger.info(`✅ Control panel updated in channel ${channel.id} (message: ${existingMessage.id})`);
    } else {
      // ❌ لا توجد رسالة صالحة → إرسال جديدة
      const newMessage = await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      guildData = guildDataModel.load(guildId);
      if (!guildData.channels) guildData.channels = {};
      if (!guildData.channels.control) guildData.channels.control = {};
      guildData.channels.control.messageId = newMessage.id;
      guildData.channels.control.channelId = channel.id;
      guildDataModel.save(guildId, guildData);

      logger.info(`✅ New control panel sent in channel ${channel.id} (ID: ${newMessage.id})`);
    }

  } catch (error) {
    logger.error(`Error in renderControlPanel:`, error.message);
  } finally {
    controlPanelLock.unlock(guildId);
  }
}

/**
 * دالة مساعدة لتحديث لوحة التحكم باستخدام معرف القناة المخزن
 */
async function updateControlPanel(client, guildId) {
  const controlChannelId = guildSettings.getSetting(guildId, 'controlPanelChannelId');
  if (!controlChannelId) return;

  try {
    const channel = await client.channels.fetch(controlChannelId).catch(() => null);
    if (!channel) return;
    await renderControlPanel(client, guildId, channel);
  } catch (error) {
    logger.error(`Failed to update control panel:`, error.message);
  }
}

module.exports = {
  createQuranContainer,
  renderControlPanel,
  updateControlPanel,
  RECITERS,
  RECITERS_MAP
};