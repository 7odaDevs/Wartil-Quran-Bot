// ============================================================
// 📄 utils/advancedLogger.js
// لوج شيك وملوّن في الكونسول (بانر البداية + رسايل النجاح والأخطاء)
// ============================================================

// utils/advancedLogger.js
// ═══════════════════════════════════════════════════════════════
// 🖥️  Professional logging system - Wartil Quran Bot
// ═══════════════════════════════════════════════════════════════

const chalk = require('chalk');

// ============================================================
// 📋  Log categories
// ============================================================

const LOG_TYPES = {
  INFO: { icon: 'ℹ️', color: chalk.cyan, label: 'INFO' },
  SUCCESS: { icon: '✅', color: chalk.green, label: 'SUCCESS' },
  WARN: { icon: '⚠️', color: chalk.yellow, label: 'WARN' },
  ERROR: { icon: '❌', color: chalk.red, label: 'ERROR' },
  DEBUG: { icon: '🔍', color: chalk.magenta, label: 'DEBUG' },
  VOICE: { icon: '🎙️', color: chalk.blue, label: 'VOICE' },
  QURAN: { icon: '📖', color: chalk.hex('#D4AF37'), label: 'QURAN' },
  PRAYER: { icon: '🕌', color: chalk.hex('#2E7D32'), label: 'PRAYER' },
  AZKAR: { icon: '📿', color: chalk.hex('#8B6914'), label: 'AZKAR' },
  NOTICE: { icon: '☪️', color: chalk.hex('#4A7C59'), label: 'NOTICE' },
  SYSTEM: { icon: '⚙️', color: chalk.hex('#7B68EE'), label: 'SYSTEM' },
  DATABASE: { icon: '🗄️', color: chalk.hex('#4682B4'), label: 'DATABASE' },
  COMMAND: { icon: '⌨️', color: chalk.hex('#FF6B6B'), label: 'COMMAND' },
  READY: { icon: '🚀', color: chalk.greenBright, label: 'READY' },
  CONNECTION: { icon: '🔗', color: chalk.hex('#FFA500'), label: 'CONNECTION' },
};

// ============================================================
// 📝  Main log function
// ============================================================

function log(type, message, details = null) {
  const config = LOG_TYPES[type] || LOG_TYPES.INFO;
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const header = `${chalk.gray('[')}${chalk.gray(timestamp)}${chalk.gray(']')} ${config.icon} ${config.color(config.label.padEnd(8))}`;
  
  const lines = String(message).split('\n');
  const firstLine = lines[0];
  const restLines = lines.slice(1);

  console.log(`${header} ${chalk.white(firstLine)}`);

  for (const line of restLines) {
    if (line.trim()) {
      console.log(`   ${chalk.gray('│')} ${chalk.white(line)}`);
    }
  }

  if (details) {
    const detailStr = typeof details === 'object' ? JSON.stringify(details, null, 2) : details;
    const detailLines = detailStr.split('\n');
    for (const line of detailLines) {
      if (line.trim()) {
        console.log(`   ${chalk.gray('│')} ${chalk.hex('#888888')(line)}`);
      }
    }
  }

  console.log(`   ${chalk.gray('└' + '─'.repeat(50))}`);
}

// ============================================================
// 🌟  Welcome banner
// ============================================================

function showWelcomeBanner() {
  console.clear();
  console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🕌  Holy Quran Discord Bot - Golden Edition  🕌            ║
║                                                              ║
║   📖  Quran recitations  │  🎙️  Reciter voices  │  🕌  Prayer times ║
║   📿  Azkar  │  ☪️  Notices  │  🔊  Continuous broadcast     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));
  console.log('\n');
  log('READY', '🔄  Initializing the bot...');
  console.log('\n');
}

// ============================================================
// 📊  Bot statistics
// ============================================================

function showBotStats(client) {
  const memoryUsage = process.memoryUsage();
  const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const totalMemory = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

  const separator = chalk.gray('─'.repeat(60));

  console.log(`\n${chalk.gray('┌' + separator + '┐')}`);
  console.log(`${chalk.gray('│')}  ${chalk.white.bold('📊  Bot Statistics')}                                        ${chalk.gray('│')}`);
  console.log(`${chalk.gray('├' + separator + '┤')}`);

  console.log(
    `${chalk.gray('│')}  ${chalk.hex('#D4AF37')('👤')}  User        : ${chalk.white.bold(client.user.tag)}${' '.repeat(30 - client.user.tag.length)}${chalk.gray('│')}`
  );
  console.log(
    `${chalk.gray('│')}  ${chalk.hex('#D4AF37')('🖥️')}  Servers     : ${chalk.white.bold(client.guilds.cache.size.toString())}${' '.repeat(35 - client.guilds.cache.size.toString().length)}${chalk.gray('│')}`
  );
  console.log(
    `${chalk.gray('│')}  ${chalk.hex('#D4AF37')('👥')}  Members     : ${chalk.white.bold(client.users.cache.size.toString())}${' '.repeat(35 - client.users.cache.size.toString().length)}${chalk.gray('│')}`
  );
  console.log(
    `${chalk.gray('│')}  ${chalk.hex('#D4AF37')('📊')}  Memory      : ${chalk.white.bold(`${usedMemory} / ${totalMemory} MB`)}${' '.repeat(30 - `${usedMemory} / ${totalMemory} MB`.length)}${chalk.gray('│')}`
  );

  console.log(`${chalk.gray('└' + separator + '┘')}\n`);
}

// ============================================================
// 🎯  Helper functions
// ============================================================

function logVoice(guildId, action, details = '') {
  const actions = {
    join: '🔊  Joined voice channel',
    leave: '🔇  Left voice channel',
    play: '▶️  Started playback',
    stop: '⏹️  Stopped playback',
    pause: '⏸️  Paused',
    resume: '▶️  Resumed playback',
    error: '❌  Audio error',
    reconnect: '🔄  Reconnecting',
  };
  const actionText = actions[action] || action;
  log('VOICE', `🎙️  ${chalk.white(guildId)}  ${chalk.gray('→')}  ${chalk.cyan(actionText)}  ${details}`);
}

function logQuran(guildId, surahName, reciterName, action = 'play') {
  const actions = {
    play: '▶️  Playing',
    complete: '🏁  Completed',
    skip: '⏭️  Skipped',
  };
  const actionText = actions[action] || action;
  log('QURAN', `📖  ${chalk.white(guildId)}  ${chalk.gray('→')}  ${chalk.hex('#D4AF37')(actionText)}  ${chalk.white.bold(surahName)}  ${chalk.gray('by')}  ${chalk.hex('#D4AF37')(reciterName)}`);
}

function logPrayer(guildId, prayerName, time, action = 'adhan') {
  const actions = {
    adhan: '🔔  Adhan',
    update: '🔄  Update',
    send: '📤  Send',
  };
  const actionText = actions[action] || action;
  log('PRAYER', `🕌  ${chalk.white(guildId)}  ${chalk.gray('→')}  ${chalk.green(actionText)}  ${chalk.white.bold(prayerName)}  ${chalk.gray('at')}  ${chalk.hex('#D4AF37')(time)}`);
}

function logAzkar(guildId, text, action = 'send') {
  const actions = {
    send: '📤  Send azkar',
    schedule: '⏰  Schedule',
    stop: '⏹️  Stop',
  };
  const actionText = actions[action] || action;
  const shortText = String(text).length > 40 ? String(text).substring(0, 40) + '...' : text;
  log('AZKAR', `📿  ${chalk.white(guildId)}  ${chalk.gray('→')}  ${chalk.hex('#8B6914')(actionText)}  ${chalk.white(shortText)}`);
}

function logNotice(guildId, action = 'send') {
  const actions = {
    send: '📤  Send notice',
    schedule: '⏰  Schedule',
    stop: '⏹️  Stop',
    image: '🖼️  Generate image',
  };
  const actionText = actions[action] || action;
  log('NOTICE', `☪️  ${chalk.white(guildId)}  ${chalk.gray('→')}  ${chalk.hex('#4A7C59')(actionText)}`);
}

function logDatabase(action, collection, count = null) {
  const actions = {
    save: '💾  Save',
    load: '📂  Load',
    delete: '🗑️  Delete',
    update: '🔄  Update',
    init: '⚙️  Init',
  };
  const actionText = actions[action] || action;
  let message = `${actionText}  ${chalk.hex('#4682B4')(collection)}`;
  if (count !== null) {
    message += `  ${chalk.gray('→')}  ${chalk.white.bold(count)}`;
  }
  log('DATABASE', message);
}

function logCommand(user, command, guild = null) {
  const userTag = user?.tag || user?.username || 'User';
  const guildName = guild?.name || 'DM';
  log('COMMAND', `⌨️  ${chalk.white(userTag)}  ${chalk.gray('→')}  /${chalk.cyan(command)}  ${chalk.gray('in')}  ${chalk.hex('#D4AF37')(guildName)}`);
}

function logSystem(message, type = 'info') {
  const types = {
    info: chalk.cyan('ℹ️'),
    warn: chalk.yellow('⚠️'),
    error: chalk.red('❌'),
    success: chalk.green('✅'),
  };
  const icon = types[type] || types.info;
  log('SYSTEM', `${icon}  ${chalk.white(message)}`);
}

function logResult(success, message, details = null) {
  const icon = success ? '✅' : '❌';
  const color = success ? chalk.green : chalk.red;
  log('SYSTEM', `${icon}  ${color(message)}`, details);
}

function logConnection(status, details = '') {
  const statuses = {
    connecting: '🔄  Connecting...',
    connected: '✅  Connected',
    disconnected: '❌  Disconnected',
    reconnecting: '🔄  Reconnecting...',
    failed: '⚠️  Connection failed',
    ready: '🚀  Ready',
  };
  const statusText = statuses[status] || status;
  log('CONNECTION', `🔗  ${chalk.hex('#FFA500')(statusText)}  ${details}`);
}

// ============================================================
// 🚀  Exports
// ============================================================

module.exports = {
  log,
  showWelcomeBanner,
  showBotStats,
  logVoice,
  logQuran,
  logPrayer,
  logAzkar,
  logNotice,
  logDatabase,
  logCommand,
  logSystem,
  logResult,
  logConnection,
  LOG_TYPES,
};
