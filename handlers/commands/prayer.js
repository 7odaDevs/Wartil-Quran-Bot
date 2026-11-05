// ============================================================
// 📄 handlers/commands/prayer.js
// أمر عرض مواقيت الصلاة
// ============================================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const guildSettings = require('../../models/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prayer')
    .setDescription('التحكم في تنبيهات الأذان (تشغيل/إيقاف واختيار الرتبة التي يتم منشنها)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('تشغيل أو إيقاف تنبيهات الأذان')
        .setRequired(true)
        .addChoices(
          { name: 'On - تشغيل', value: 'on' },
          { name: 'Off - إيقاف', value: 'off' }
        )
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('الرتبة التي يتم منشنها في رسالة الأذان (اختياري)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const guildId = interaction.guildId;
      const status = interaction.options.getString('status');
      const role = interaction.options.getRole('role');

      const enabled = status === 'on';
      guildSettings.set(guildId, 'adhanEnabled', enabled);

      if (role) {
        guildSettings.set(guildId, 'adhanMentionRoleId', role.id);
      }

      const mentionRoleId = guildSettings.getSetting(guildId, 'adhanMentionRoleId');

      const embed = new EmbedBuilder()
        .setColor(enabled ? 0x2E7D32 : 0xB71C1C)
        .setTitle('🕌 إعدادات تنبيهات الأذان')
        .setDescription(
          `**الحالة:** ${enabled ? '✅ مُفعّلة (On)' : '⛔ متوقفة (Off)'}\n` +
          `**الرتبة التي يتم منشنها:** ${mentionRoleId ? `<@&${mentionRoleId}>` : 'لم يتم تحديد رتبة (بدون منشن)'}`
        )
        .setFooter({ text: 'يمكنك تعديل هذه الإعدادات في أي وقت بإعادة استخدام /prayer' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });

    } catch (error) {
      logger.error('Error in prayer command:', error);
      await interaction.reply({ content: '❌ حدث خطأ في تنفيذ الأمر', flags: 64 }).catch(() => {});
    }
  }
};