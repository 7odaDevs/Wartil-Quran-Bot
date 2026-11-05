// ============================================================
// 📄 handlers/commands/link-invite.js
// أمر /link-invite: بيبعت رابط دعوة البوت (الرابط بيتبني من CLIENT_ID في .env)
// ============================================================

const config = require('../../config');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-invite')
    .setDescription('الحصول على رابط دعوة السيرفر'),

  async execute(interaction) {
    // إذا لم يكن الأمر في سيرفر، اعمل رد مباشر
    if (!interaction.guild) {
      return interaction.reply({ 
        content: '❌ هذا الأمر يعمل فقط داخل السيرفرات.', 
        ephemeral: true 
      });
    }

    // 1. الخطوة الأهم: أرسل إشارة "البوت يفكر" فوراً!
    // هذا يمنع خطأ Unknown interaction
    await interaction.deferReply({ ephemeral: true });

    try {
      // التحقق من صلاحية البوت
      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        return interaction.editReply({
          content: '❌ أنا لا أملك صلاحية إنشاء روابط الدعوة (Create Instant Invite).'
        });
      }

      // إنشاء رابط دعوة السيرفر
      const invite = await interaction.channel.createInvite({
        maxAge: 0,   // لا ينتهي
        maxUses: 0   // لانهائي
      });

      // إنشاء الإمبيد
      const embed = new EmbedBuilder()
        .setColor('#9E7B4F')
        .setTitle('🤖 د عــوة الــبــوت')
        .setDescription(`
**اضــف الــبــوت ا لــى ســيــرفــرك**

ا ضــغــط عــلــى الــزر ادنــاه لــفــتــح رابــط الــدعــوة:

---

**📖 مــا هــو بــوت الــقــرآن الــكــريــم ؟**
بــوت مــتــخــصــص لــبــث تــلاوات الــقــرآن الــكــريــم بــأ صــوات ا شــهــر الــقــراء مــبــاشــرة فــي الــروم الــصــوتــي.

**🎙 الــقــراء الــمــتــوفــرون:**
يــضــم الــبــوت مــجــمــوعــة مــن ا شــهــر الــقــراء مــثــل:
• الــشــيــخ مــحــمــود خــلــيــل الــحــصــري
• الــشــيــخ عــبــد الــبــاســط عــبــد الــصــمــد
• الــشــيــخ مــحــمــد صــديــق الــمــنــشــاوي
• و آخــريــن...

**🛠 الأوامــر الــمــتــوفــرة:**

\`/setup\` - **لــلأدمنــة فــقــط** - لــتــهــيــئــة الــبــوت
\`/country\` - **لــلأدمنــة فــقــط** - ا خــتــيــار الــدولــة لــعــرض مــواعــيــد الــصــلاة
\`/link-invite\` - الــحــصــول عــلــى رابــط د عــوة الــبــوت
                `)
        .setFooter({ text: 'الــقــرآن الــكــريــم | ا ســتــمــع و تــدبــر' })
        .setTimestamp();

      // رابط دعوة البوت (ثابت)
      const botInviteLink = config.inviteLink || 'https://discord.com/developers/applications';

      // إنشاء الزر
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('🔗 فــتــح الــدعــوة')
            .setStyle(ButtonStyle.Link)
            .setURL(botInviteLink)
        );

      // ✅ Fix: كان الكود بيبني الإمبيد والزر وميبعتهمش خالص، فالأمر كان
      // فاضل "بيفكر..." لحد ما ديسكورد يعتبره فشل (Unknown interaction / failed).
      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });

    } catch (error) {
      console.error('❌ Error in link-invite command:', error);
      
      // في حالة حدوث خطأ، نستخدم editReply (لأننا استخدمنا deferReply)
      try {
        await interaction.editReply({
          content: '❌ حدث خطأ أثناء إنشاء الرابط. تأكد من صلاحيات البوت.'
        });
      } catch (replyError) {
        // إذا فشل حتى الرد، نسجل الخطأ فقط
        console.error('❌ Even sending the error message failed:', replyError.message);
      }
    }
  }
};