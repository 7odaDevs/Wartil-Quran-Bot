// ============================================================
// 📄 handlers/messageHandler.js
// بيعدّ الرسايل في الرومات عشان الإحصائيات (من غير ما يخزّن محتواها)
// ============================================================

const logger = require('../utils/logger');
const guildDataModel = require('../models/GuildData');

class MessageHandler {
  constructor(client) {
    this.client = client;
    this.setupListeners();
  }

  setupListeners() {
    // الاستماع للرسائل الجديدة
    this.client.on('messageCreate', async (message) => {
      // تجاهل الرسائل من البوتات الأخرى
      if (message.author.bot) return;
      // تجاهل الرسائل الخاصة
      if (!message.guild) return;
      
      const guildId = message.guild.id;
      const channelId = message.channel.id;
      
      try {
        // تحميل بيانات السيرفر
        const data = guildDataModel.load(guildId);
        const isBot = message.author.id === this.client.user.id;
        
        // تحديد نوع القناة وزيادة عدد الرسائل
        let channelType = null;
        
        if (data.channels.control.channelId === channelId) {
          channelType = 'control';
        } else if (data.channels.prayer.channelId === channelId) {
          channelType = 'prayer';
        } else if (data.channels.azkar.channelId === channelId) {
          channelType = 'azkar';
        } else if (data.channels.notice.channelId === channelId) {
          channelType = 'notice';
        }
        
        if (channelType) {
          guildDataModel.incrementMessages(guildId, channelType, isBot);
        }
        
        // تحديث عدد أعضاء السيرفر كل 10 رسائل
        if (data.stats.totalMessages % 10 === 0) {
          const memberCount = message.guild.memberCount;
          guildDataModel.updateMembersCount(guildId, memberCount);
        }
        
      } catch (error) {
        logger.error('Error in message handler:', error.message);
      }
    });
  }
}

module.exports = MessageHandler;