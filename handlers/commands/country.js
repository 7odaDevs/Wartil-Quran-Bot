// ============================================================
// 📄 handlers/commands/country.js
// أمر /country (للأدمن فقط): بيختار الدولة اللي مواقيت الصلاة تتحسب على أساسها
// ============================================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const guildSettings = require('../../models/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('country')
    .setDescription('اختيار الدولة والمدينة لمواقيت الصلاة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    try {
      const guildId = interaction.guildId;
      
      const currentCity = guildSettings.getSetting(guildId, 'prayerCity');
      const currentCountry = guildSettings.getSetting(guildId, 'prayerCountry');
      
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

      const options = [
        { label: '🇪🇬 مصر (القاهرة)', value: JSON.stringify({ city: 'Cairo', country: 'Egypt', method: 5 }) },
        { label: '🇸🇦 السعودية (مكة)', value: JSON.stringify({ city: 'Mecca', country: 'Saudi Arabia', method: 5 }) },
        { label: '🇯🇴 الأردن (عمّان)', value: JSON.stringify({ city: 'Amman', country: 'Jordan', method: 5 }) },
        { label: '🇸🇾 سوريا (دمشق)', value: JSON.stringify({ city: 'Damascus', country: 'Syria', method: 5 }) },
        { label: '🇵🇸 فلسطين (القدس)', value: JSON.stringify({ city: 'Jerusalem', country: 'Palestine', method: 5 }) },
        { label: '🇩🇿 الجزائر (الجزائر)', value: JSON.stringify({ city: 'Algiers', country: 'Algeria', method: 5 }) },
        { label: '🇲🇦 المغرب (الرباط)', value: JSON.stringify({ city: 'Rabat', country: 'Morocco', method: 5 }) },
        { label: '🇦🇪 الإمارات (دبي)', value: JSON.stringify({ city: 'Dubai', country: 'UAE', method: 5 }) },
        { label: '🇰🇼 الكويت (الكويت)', value: JSON.stringify({ city: 'Kuwait City', country: 'Kuwait', method: 5 }) },
        { label: '🇶🇦 قطر (الدوحة)', value: JSON.stringify({ city: 'Doha', country: 'Qatar', method: 5 }) },
        { label: '🇧🇭 البحرين (المنامة)', value: JSON.stringify({ city: 'Manama', country: 'Bahrain', method: 5 }) },
        { label: '🇴🇲 عمان (مسقط)', value: JSON.stringify({ city: 'Muscat', country: 'Oman', method: 5 }) },
        { label: '🇱🇾 ليبيا (طرابلس)', value: JSON.stringify({ city: 'Tripoli', country: 'Libya', method: 5 }) },
        { label: '🇹🇳 تونس (تونس)', value: JSON.stringify({ city: 'Tunis', country: 'Tunisia', method: 5 }) },
        { label: '🇸🇩 السودان (الخرطوم)', value: JSON.stringify({ city: 'Khartoum', country: 'Sudan', method: 5 }) },
        { label: '🇮🇶 العراق (بغداد)', value: JSON.stringify({ city: 'Baghdad', country: 'Iraq', method: 5 }) },
        { label: '🇾🇪 اليمن (صنعاء)', value: JSON.stringify({ city: 'Sanaa', country: 'Yemen', method: 5 }) },
        { label: '🇹🇷 تركيا (إسطنبول)', value: JSON.stringify({ city: 'Istanbul', country: 'Turkey', method: 5 }) }
      ];

      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_country_${guildId}`)
            .setPlaceholder('🕌 اختر الدولة والمدينة لمواقيت الصلاة')
            .addOptions(options)
        );

      await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
      
    } catch (error) {
      logger.error('Error in country command:', error);
      await interaction.reply({ content: '❌ حدث خطأ في تنفيذ الأمر', flags: 64 });
    }
  }
};