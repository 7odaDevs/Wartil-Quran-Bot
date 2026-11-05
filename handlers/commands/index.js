// ============================================================
// 📄 handlers/commands/index.js
// بيحمّل كل ملفات الأوامر اللي في الفولدر ده أوتوماتيك. عايز تضيف أمر؟ حط ملف جديد هنا بنفس شكل الباقي
// ============================================================

const fs = require('fs');
const logger = require('../../utils/logger');

const path = require('path');

module.exports = (client) => {
  const commands = [];
  const commandsPath = path.join(__dirname);

  // قراءة جميع ملفات الأوامر (باستثناء index.js)
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // التأكد من أن الأمر يحتوي على data و execute
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
      logger.log('SUCCESS', `Command loaded: ${command.data.name}`);
    } else {
      logger.log('WARN', `Command ${file} is incomplete (missing data or execute)`);
    }
  }

  return commands;
};