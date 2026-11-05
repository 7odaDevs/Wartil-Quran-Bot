// ============================================================
// 📄 utils/joinLogPanel.js
// لوج دخول السيرفرات (اختياري): لو حطيت JOIN_LOG_CHANNEL_ID في .env هيبعت رسالة بمعلومات أي سيرفر البوت يدخله. سيبه فاضي لو مش عايزه
// ============================================================

/**
 * utils/joinLogPanel.js
 *
 * لما البوت يدخل سيرفر جديد -> بيبعت embed في روم اللوج (config.JOIN_LOG_CHANNEL_ID)
 * فيه معلومات السيرفر + الشخص اللي ضاف البوت (لو قدرنا نجيبه من الـ Audit Log).
 *
 * لما حد يستخدم /setup في السيرفر ده -> بنرجع لنفس الرسالة (محفوظ الـ messageId/channelId
 * في ملف بيانات السيرفر عن طريق models/GuildData) ونعدّلها: نضيف "استخدم /setup؟ ✅"
 * ومين استخدمه وإمتى + قائمة الرومات اللي اتفعلت (ID + اسم + لنك مباشر للروم).
 *
 * الميزة دي "best effort": أي خطأ (مفيش صلاحية، الروم اتمسح، الرسالة اتمسحت... إلخ)
 * بيتسجل في اللوج بس ومبيوقفش تشغيل باقي البوت أبدًا.
 */

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const logger = require('./logger');
const config = require('../config');
const guildDataModel = require('../models/GuildData');

const LOG_CHANNEL_ID = config.JOIN_LOG_CHANNEL_ID;

// كل غرض وقناته + الاسم اللي بيتعرض بيه في الإمبيد
const CHANNEL_PURPOSES = [
  { key: 'control', emoji: '📝', label: 'لوحة التحكم' },
  { key: 'voice', emoji: '🎙', label: 'القناة الصوتية' },
  { key: 'azkar', emoji: '📿', label: 'الأذكار' },
  { key: 'prayer', emoji: '🕌', label: 'مواقيت الصلاة' },
  { key: 'notice', emoji: '☪️', label: 'التنبيهات' }
];

/**
 * يحاول يجيب مين ضاف البوت للسيرفر من الـ Audit Log.
 * محتاج صلاحية "View Audit Log" لعضو البوت في السيرفر، ولو مش متاحة أو حصل
 * أي خطأ بيرجع null من غير ما يوقف حاجة.
 */
async function fetchInviter(guild) {
  try {
    const me = guild.members.me;
    if (!me || !me.permissions.has('ViewAuditLog')) return null;

    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.BotAdd,
      limit: 10
    });

    const entry = logs.entries.find(e => e.target?.id === guild.client.user.id);
    return entry ? entry.executor : null;
  } catch (error) {
    logger.log('WARN', `Failed to fetch inviter from audit log for server ${guild.id}: ${error.message}`);
    return null;
  }
}

function buildBaseFields(guild, owner, inviter) {
  const fields = [
    { name: '🏷️ اسم السيرفر', value: guild.name, inline: true },
    { name: '🆔 آيدي السيرفر', value: `\`${guild.id}\``, inline: true },
    { name: '👥 عدد الأعضاء', value: `${guild.memberCount}`, inline: true },
    {
      name: '👑 صاحب السيرفر',
      value: owner ? `${owner.tag ? owner.tag : owner.user?.tag || 'غير معروف'} (\`${guild.ownerId}\`)\n<@${guild.ownerId}>` : `\`${guild.ownerId}\``,
      inline: true
    },
    {
      name: '📅 تاريخ إنشاء السيرفر',
      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
      inline: true
    },
    {
      name: '📥 وقت إضافة البوت',
      value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
      inline: true
    }
  ];

  fields.push({
    name: '➕ مين ضاف البوت',
    value: inviter
      ? `${inviter.tag} (\`${inviter.id}\`)\n<@${inviter.id}>`
      : '❔ غير معروف (البوت محتاج صلاحية "View Audit Log" في السيرفر ده عشان يعرف يجيبها)',
    inline: false
  });

  return fields;
}

function buildSetupStatusField(guildData) {
  const joinLog = guildData.joinLog || {};

  if (!joinLog.setupUsed) {
    return {
      name: '⚙️ حالة /setup',
      value: '❌ لسه محدش استخدم أمر /setup في السيرفر ده',
      inline: false
    };
  }

  const usedBy = joinLog.setupByUserTag
    ? `${joinLog.setupByUserTag} (\`${joinLog.setupByUserId}\`)\n<@${joinLog.setupByUserId}>`
    : (joinLog.setupByUserId ? `<@${joinLog.setupByUserId}>` : 'غير معروف');

  const usedAt = joinLog.setupAt
    ? `<t:${Math.floor(new Date(joinLog.setupAt).getTime() / 1000)}:R>`
    : 'غير معروف';

  return {
    name: '⚙️ حالة /setup',
    value: `✅ تم استخدام الأمر بواسطة: ${usedBy}\nآخر تحديث: ${usedAt}`,
    inline: false
  };
}

/**
 * يبني فيلد واحد لكل روم اتفعّل فعليًا (channelId موجود) من guildData.channels،
 * يحتوي على: الاسم اللي محفوظ في ديسكورد + الآيدي + لنك مباشر للروم.
 * لو الروم اتفعّل بس مبقاش موجود في ديسكورد (اتمسح) بيوضح كده بدل ما يفشل.
 */
function buildChannelsFields(guild, guildData) {
  const fields = [];

  for (const { key, emoji, label } of CHANNEL_PURPOSES) {
    const channelInfo = guildData.channels?.[key];
    const channelId = channelInfo?.channelId;
    if (!channelId) continue;

    const channel = guild.channels.cache.get(channelId);
    const channelName = channel ? `#${channel.name}` : '⚠️ الروم غير موجود حاليًا';
    const link = `https://discord.com/channels/${guild.id}/${channelId}`;

    fields.push({
      name: `${emoji} روم ${label}`,
      value: `${channelName}\nID: \`${channelId}\`\n<#${channelId}>\n[فتح الروم](${link})`,
      inline: true
    });
  }

  if (fields.length === 0) {
    fields.push({
      name: '📂 الرومات المفعّلة',
      value: 'لسه مفيش أي روم اتحدد',
      inline: false
    });
  }

  return fields;
}

async function buildEmbed(guild, guildData, inviter, owner) {
  const embed = new EmbedBuilder()
    .setColor(0x9E7B4F)
    .setTitle('📥 البوت اتضاف لسيرفر جديد')
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .addFields(buildBaseFields(guild, owner, inviter))
    .addFields(buildSetupStatusField(guildData))
    .addFields(buildChannelsFields(guild, guildData))
    .setFooter({ text: `Guild ID: ${guild.id}` })
    .setTimestamp();

  return embed;
}

/**
 * بتتنادى مرة واحدة من client.on('guildCreate', ...) في index.js.
 */
async function sendJoinLogEmbed(client, guild) {
  try {
    if (!LOG_CHANNEL_ID) return;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
      logger.log('WARN', `Join-log channel (${LOG_CHANNEL_ID}) not found or bot has no access to it`);
      return;
    }

    const [inviter, owner] = await Promise.all([
      fetchInviter(guild),
      guild.fetchOwner().catch(() => null)
    ]);

    // نتأكد إن ملف بيانات السيرفر موجود (بيتعمله create لو مش موجود)
    const guildData = guildDataModel.load(guild.id, guild.name, guild.ownerId);
    guildData.membersCount = guild.memberCount;
    guildDataModel.save(guild.id, guildData);

    const embed = await buildEmbed(guild, guildData, inviter, owner);
    const message = await logChannel.send({ embeds: [embed] });

    guildDataModel.updateJoinLogMessage(guild.id, message.id, logChannel.id, inviter);

    logger.log('SUCCESS', `📥 Join-log embed sent for server ${guild.name} (${guild.id})`);
  } catch (error) {
    logger.log('ERROR', `Failed to send join-log embed for server ${guild.id}: ${error.message}`);
  }
}

/**
 * بتتنادى بعد نجاح تنفيذ /setup (شوف handlers/commands/setup.js) عشان تعدّل
 * نفس رسالة الـ Join Log القديمة وتضيف حالة الاستخدام + الرومات المفعّلة الحالية.
 */
async function updateJoinLogPanel(client, guildId, setupUser = null) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    if (setupUser) {
      guildDataModel.markSetupUsed(guildId, setupUser.id, setupUser.tag);
    }

    const guildData = guildDataModel.load(guildId, guild.name, guild.ownerId);
    const joinLog = guildData.joinLog || {};

    // لو مفيش رسالة محفوظة أصلاً (مثلاً البوت كان في السيرفر ده قبل إضافة
    // الميزة دي) نبعت واحدة جديدة دلوقتي بدل ما نتجاهل التحديث بالكامل.
    if (!joinLog.channelId || !joinLog.messageId) {
      await sendJoinLogEmbed(client, guild);
      return;
    }

    const logChannel = await client.channels.fetch(joinLog.channelId).catch(() => null);
    if (!logChannel) {
      logger.log('WARN', `Join-log channel (${joinLog.channelId}) is not accessible anymore for server ${guildId}`);
      return;
    }

    const oldMessage = await logChannel.messages.fetch(joinLog.messageId).catch(() => null);

    const inviter = joinLog.inviterId
      ? { id: joinLog.inviterId, tag: joinLog.inviterTag }
      : null;
    const owner = await guild.fetchOwner().catch(() => null);

    const embed = await buildEmbed(guild, guildDataModel.load(guildId), inviter, owner);

    if (oldMessage) {
      await oldMessage.edit({ embeds: [embed] });
    } else {
      // الرسالة القديمة اتمسحت -> نبعت واحدة جديدة ونحدّث المرجع المحفوظ
      const newMessage = await logChannel.send({ embeds: [embed] });
      guildDataModel.updateJoinLogMessage(guildId, newMessage.id, logChannel.id);
    }

    logger.log('SUCCESS', `📥 Join-log embed updated for server ${guildId}`);
  } catch (error) {
    logger.log('ERROR', `Failed to update join-log embed for server ${guildId}: ${error.message}`);
  }
}

module.exports = {
  sendJoinLogEmbed,
  updateJoinLogPanel
};
