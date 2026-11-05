// ============================================================
// 📄 services/voiceService.js
// خدمة الصوت: بتدخل الروم الصوتي وتفضل فيه، وتعمل reconnect أوتوماتيك لو الاتصال وقع، وتشغّل الصوت
// القاعدة: البوت لازم يرجع لروم الصوت دايماً حتى لو حصل مشكلة. الرومات المحفوظة في data/voice_channels.json
// ============================================================

const logger = require('../utils/logger');

// VoiceService.js
// ---------------------------------------------------------------------------
// Design rules (so the bot always comes back to its voice channel):
//
//  1. "Desired state" (pendingChannels + voice_channels.json) says WHERE the bot
//     must be. It is only ever cleared by an explicit permanent action
//     (leaveVoiceChannelPermanent / forget) or when the guild/channel really
//     no longer exists. Failures, timeouts and permission errors NEVER clear it.
//  2. The reconnect loop never gives up. It backs off (3s → 60s → 120s) but keeps
//     trying forever until the bot is back in the channel.
//  3. Every connection is tracked. Events coming from an old / intentionally
//     destroyed connection are ignored ("retired"), so tearing a connection down
//     on purpose can't start a reconnect storm.
//  4. A watchdog checks every 30s that each desired channel really has a live
//     connection (also catches silent desyncs after gateway/shard reconnects).
// ---------------------------------------------------------------------------
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  getVoiceConnection
} = require('@discordjs/voice');
const { EventEmitter } = require('events');
const fs = require('fs-extra');
const path = require('path');
require('../utils/httpClient');

class VoiceService extends EventEmitter {
  constructor() {
    super();
    this.client = null;

    this.connections = new Map();
    this.players = new Map();
    this.isPlaying = new Map();
    this.isPaused = new Map();
    this.currentStreams = new Map();
    this.volume = new Map();

    // Prevents a manual stop from being treated as a "natural end" (auto-advance trigger)
    this.suppressIdleEmit = new Map();

    // Shared per-guild action lock
    this.actionLocks = new Map();

    // Desired state: guildId -> { channelId, adapterCreator, selfDeaf }
    this.pendingChannels = new Map();

    // Reconnect state
    this.reconnectAttempts = new Map();
    this.reconnectTimeouts = new Map();
    this.connectingGuilds = new Set();
    this.joinGeneration = new Map();
    this.desyncCount = new Map();
    this.retired = new WeakSet(); // connections we destroyed on purpose / that were replaced
    this.shuttingDown = false;

    this.maxReconnectAttempts = 5;   // only used to emit a single "still failing" notification
    this.reconnectDelay = 3000;
    this.reconnectDelayMultiplier = 1.5;
    this.maxReconnectDelay = 60000;
    this.slowReconnectDelay = 120000; // after many failed attempts
    this.slowAfterAttempts = 10;
    this.immediateReconnectDelay = 1000; // first retry after an unexpected drop
    this.joinTimeout = 15000;
    this.watchdogIntervalMs = 30000;
    this.watchdog = null;

    // Simple JSON store (no native modules needed)
    this.storePath = path.join(__dirname, '../data/voice_channels.json');
    this.voiceChannelsStore = new Map();
    this.loadStore();
  }

  // ===================== Client / watchdog =====================
  /**
   * Gives the service access to the Discord client so it can always use a fresh
   * voiceAdapterCreator when reconnecting, detect desyncs and react to
   * deleted guilds/channels. Call once after the client is created.
   */
  setClient(client) {
    if (this.client === client) return;
    this.client = client;

    client.on('guildDelete', (guild) => {
      if (this.pendingChannels.has(guild.id)) {
        logger.log('WARN', `Bot removed from guild ${guild.id}, forgetting its voice channel`);
        this.forget(guild.id);
      }
    });

    client.on('channelDelete', (channel) => {
      const info = channel.guild && this.pendingChannels.get(channel.guild.id);
      if (info && info.channelId === channel.id) {
        logger.log('WARN', `Voice channel ${channel.id} was deleted in guild ${channel.guild.id}, forgetting it`);
        this.forget(channel.guild.id);
      }
    });

    // After the gateway reconnects/resumes, verify all voice connections shortly after.
    const recheck = () => {
      const t = setTimeout(() => this.checkHealth(), 5000);
      if (t.unref) t.unref();
    };
    client.on('shardResume', recheck);
    client.on('shardReady', recheck);

    this.startWatchdog();
  }

  // بتشغّل مراقب بيفحص الاتصالات كل فترة
  startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      try {
        this.checkHealth();
      } catch (err) {
        logger.log('ERROR', `Voice watchdog error: ${err.message}`);
      }
    }, this.watchdogIntervalMs);
    if (this.watchdog.unref) this.watchdog.unref();
  }

  // بتوقف المراقب
  stopWatchdog() {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  // بتفحص إن البوت لسه موجود في الرومات المفروض يبقى فيها
  checkHealth() {
    if (this.shuttingDown) return;

    for (const [guildId] of this.pendingChannels) {
      if (this.reconnectTimeouts.has(guildId) || this.connectingGuilds.has(guildId)) continue;

      const conn = this.connections.get(guildId);
      const status = conn && conn.state && conn.state.status;
      const live = conn && !this.retired.has(conn) &&
        status !== VoiceConnectionStatus.Destroyed &&
        status !== VoiceConnectionStatus.Disconnected;

      if (!live) {
        logger.log('WARN', `🩺 Watchdog: no live voice connection in guild ${guildId}, reconnecting`);
        this.dropConnection(guildId);
        this.scheduleReconnect(guildId, { immediate: true });
        continue;
      }

      // Connection looks Ready but Discord says the bot is not in any voice channel
      // (e.g. disconnected by a moderator while we missed the event).
      if (status === VoiceConnectionStatus.Ready && this.client) {
        const guild = this.client.guilds.cache.get(guildId);
        const me = guild && guild.members && guild.members.me;
        if (me && me.voice && !me.voice.channelId) {
          const n = (this.desyncCount.get(guildId) || 0) + 1;
          this.desyncCount.set(guildId, n);
          if (n >= 2) {
            logger.log('WARN', `🩺 Watchdog: bot is not in a voice channel in guild ${guildId} (desync), reconnecting`);
            this.desyncCount.delete(guildId);
            this.dropConnection(guildId);
            this.scheduleReconnect(guildId, { immediate: true });
          }
        } else {
          this.desyncCount.delete(guildId);
        }
      }
    }
  }

  // ===================== Lock helpers =====================
  lockGuildAction(guildId) {
    if (this.actionLocks.get(guildId)) return false;
    this.actionLocks.set(guildId, true);
    return true;
  }

  unlockGuildAction(guildId) {
    this.actionLocks.delete(guildId);
  }

  isGuildActionLocked(guildId) {
    return !!this.actionLocks.get(guildId);
  }

  // ===================== Storage (JSON file) =====================
  loadStore() {
    try {
      fs.ensureDirSync(path.dirname(this.storePath));

      if (!fs.existsSync(this.storePath)) {
        fs.writeJsonSync(this.storePath, {}, { spaces: 2 });
        console.log('✅ Voice channels store created');
      } else {
        let data = {};
        try {
          data = fs.readJsonSync(this.storePath);
        } catch (parseErr) {
          // Keep the broken file for inspection instead of silently losing the data
          const backup = `${this.storePath}.corrupted-${Date.now()}.bak`;
          try { fs.copySync(this.storePath, backup); } catch (_) {}
          console.error(`❌ voice_channels.json is corrupted (${parseErr.message}). Backup: ${backup}`);
        }
        for (const [guildId, entry] of Object.entries(data)) {
          this.voiceChannelsStore.set(guildId, entry);
        }
      }

      console.log('✅ Voice channels store loaded successfully');
    } catch (err) {
      console.error('❌ Error loading voice channels store:', err.message);
      this.voiceChannelsStore = new Map();
    }
  }

  // بتحفظ الرومات الصوتية
  persistStore() {
    try {
      // Atomic write: write to a temp file then rename, so a crash mid-write
      // can never leave a half-written (corrupted) JSON file.
      const tmp = `${this.storePath}.tmp`;
      fs.writeJsonSync(tmp, Object.fromEntries(this.voiceChannelsStore), { spaces: 2 });
      fs.renameSync(tmp, this.storePath);
      return true;
    } catch (err) {
      logger.log('ERROR', `Failed to save voice channels store: ${err.message}`);
      return false;
    }
  }

  // بتحفظ الروم اللي البوت دخله
  saveChannel(guildId, channelId, adapterCreator, selfDeaf = true) {
    try {
      this.voiceChannelsStore.set(guildId, {
        channelId,
        selfDeaf: selfDeaf ? 1 : 0,
        joinedAt: new Date().toISOString()
      });
      this.persistStore();
      logger.log('SUCCESS', `Saved voice channel for guild ${guildId}`);
    } catch (err) {
      logger.log('ERROR', `Failed to save channel for guild ${guildId}: ${err.message}`);
    }
  }

  // بتمسح الروم المحفوظ
  removeChannel(guildId) {
    try {
      if (this.voiceChannelsStore.has(guildId)) {
        this.voiceChannelsStore.delete(guildId);
        this.persistStore();
      }
      logger.log('SUCCESS', `Removed saved voice channel for guild ${guildId}`);
    } catch (err) {
      logger.log('ERROR', `Failed to remove channel for guild ${guildId}: ${err.message}`);
    }
  }

  /**
   * Permanently forget a guild's voice channel (guild/channel deleted, or an
   * explicit "leave for good"). The ONLY way the desired state is cleared.
   */
  forget(guildId) {
    this.clearReconnectTimeout(guildId);
    this.pendingChannels.delete(guildId);
    this.reconnectAttempts.delete(guildId);
    this.desyncCount.delete(guildId);
    this.joinGeneration.set(guildId, (this.joinGeneration.get(guildId) || 0) + 1); // abort in-flight joins
    this.removeChannel(guildId);
    this.dropConnection(guildId);
  }

  // بترجّع البوت للرومات المحفوظة بعد إعادة التشغيل
  async restoreSavedChannels() {
    const rows = this.getSavedChannels();
    if (rows.length === 0) {
      console.log('📭 No saved voice channels to restore');
    } else {
      logger.log('INFO', `🔄 ${rows.length} saved voice channel(s) found`);
    }
    return rows;
  }

  /**
   * Register a saved channel as "desired" and connect (with unlimited retries).
   * Used on startup. Never removes the saved entry, whatever happens.
   */
  restoreDesired(guildId, channelId, selfDeaf = true) {
    this.pendingChannels.set(guildId, { channelId, adapterCreator: null, selfDeaf: !!selfDeaf });
    this.clearReconnectTimeout(guildId);
    return this._connect(guildId, { resume: true });
  }

  // ===================== Voice connection =====================
  async joinVoiceChannel(guildId, channelId, adapterCreator, selfDeaf = true) {
    if (!guildId || !channelId || !adapterCreator) {
      logger.log('ERROR', `Invalid data for joining voice channel:`, { guildId, channelId, hasAdapter: !!adapterCreator });
      return null;
    }

    this.clearReconnectTimeout(guildId);
    this.reconnectAttempts.set(guildId, 0);
    this.pendingChannels.set(guildId, { channelId, adapterCreator, selfDeaf });
    this.saveChannel(guildId, channelId, adapterCreator, selfDeaf);

    return this._connect(guildId, { resume: false });
  }

  resolveAdapter(guildId, info) {
    // Always prefer the live guild adapter (the stored one can go stale after a gateway reconnect)
    const guild = this.client && this.client.guilds && this.client.guilds.cache.get(guildId);
    return (guild && guild.voiceAdapterCreator) || info.adapterCreator || null;
  }

  async _connect(guildId, { resume = false } = {}) {
    const info = this.pendingChannels.get(guildId);
    if (!info) return null;

    const generation = (this.joinGeneration.get(guildId) || 0) + 1;
    this.joinGeneration.set(guildId, generation);
    this.connectingGuilds.add(guildId);
    const wasRetrying = (this.reconnectAttempts.get(guildId) || 0) > 0;
    const superseded = () =>
      this.joinGeneration.get(guildId) !== generation || !this.pendingChannels.has(guildId);

    // Replace any previous connection quietly (its events must not trigger a reconnect)
    this.dropConnection(guildId);

    let connection = null;

    try {
      // Guild/channel really gone? -> nothing to come back to.
      const guild = this.client && this.client.guilds && this.client.guilds.cache.get(guildId);
      if (guild && guild.available !== false && guild.channels.cache.size > 0 &&
          !guild.channels.cache.has(info.channelId)) {
        logger.log('WARN', `Voice channel ${info.channelId} no longer exists in guild ${guildId}, forgetting it`);
        this.forget(guildId);
        return null;
      }

      const adapterCreator = this.resolveAdapter(guildId, info);
      if (!adapterCreator) {
        throw new Error('Guild not available yet (no voice adapter)');
      }

      logger.log('VOICE', `Attempting to join channel ${info.channelId} in guild ${guildId}`);

      connection = joinVoiceChannel({
        channelId: info.channelId,
        guildId,
        adapterCreator,
        selfDeaf: info.selfDeaf,
        selfMute: false
      });

      connection.on('error', (error) => {
        if (this.retired.has(connection)) return;
        logger.log('ERROR', `Voice connection error in guild ${guildId}:`, error);
        this.emit('connectionError', { guildId, error });
        // HTTP/stream errors ("aborted") are handled by the player/VoiceHandler.
        // The connection's own Disconnected/Destroyed events drive reconnects.
      });

      connection.on('stateChange', (oldState, newState) => {
        logger.log('INFO', `🔍 [voice diagnostics] Guild ${guildId}: ${oldState.status} → ${newState.status}`);
      });

      await entersState(connection, VoiceConnectionStatus.Ready, this.joinTimeout);

      if (superseded()) {
        // A newer join / a permanent leave happened while we were connecting
        this.retired.add(connection);
        try { connection.destroy(); } catch (_) {}
        return null;
      }

      const player = createAudioPlayer();

      player.on('error', (error) => {
        logger.log('ERROR', `Audio player error in guild ${guildId}:`, error);
        this.isPlaying.set(guildId, false);
        this.isPaused.set(guildId, false);
        this.emit('error', { guildId, error });
        // The player is the single source of streamError (stream/HTTP failures)
        this.emit('streamError', { guildId, error });
      });

      player.on(AudioPlayerStatus.Idle, () => {
        this.isPlaying.set(guildId, false);
        this.isPaused.set(guildId, false);

        if (this.suppressIdleEmit.get(guildId)) {
          this.suppressIdleEmit.set(guildId, false);
          return;
        }

        this.emit('idle', guildId);
      });

      player.on(AudioPlayerStatus.Playing, () => {
        this.isPlaying.set(guildId, true);
        this.isPaused.set(guildId, false);
        this.emit('playing', guildId);
      });

      player.on(AudioPlayerStatus.Paused, () => {
        this.isPaused.set(guildId, true);
        this.emit('paused', guildId);
      });

      connection.subscribe(player);

      this.connections.set(guildId, connection);
      this.players.set(guildId, player);
      this.isPlaying.set(guildId, false);
      this.isPaused.set(guildId, false);
      this.suppressIdleEmit.set(guildId, false);

      // Discord says we lost the connection: give it 5s to recover by itself
      // (e.g. moved between channels / voice server change), otherwise rebuild it.
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        if (this.retired.has(connection) || this.connections.get(guildId) !== connection) return;
        logger.log('WARN', `Lost connection in guild ${guildId}, checking if it recovers...`);

        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
          logger.log('SUCCESS', `Connection recovered in guild ${guildId}`);
        } catch (_) {
          if (this.retired.has(connection) || this.connections.get(guildId) !== connection) return;
          logger.log('INFO', `🔄 Rebuilding voice connection for guild ${guildId}`);
          this.dropConnection(guildId);
          this.scheduleReconnect(guildId, { immediate: true });
        }
      });

      // Destroyed by something other than us (library, kick, etc.) -> come back.
      connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (this.retired.has(connection) || this.connections.get(guildId) !== connection) return;
        logger.log('WARN', `💥 Connection destroyed unexpectedly in guild ${guildId}`);
        this.retired.add(connection);
        this.dropConnection(guildId);
        this.scheduleReconnect(guildId, { immediate: true });
      });

      this.reconnectAttempts.set(guildId, 0);
      this.desyncCount.delete(guildId);

      logger.log('SUCCESS', `✅ Connected to voice channel in guild ${guildId}`);
      this.emit('connected', { guildId, channelId: info.channelId });
      if (resume || wasRetrying) {
        this.emit('reconnected', { guildId, attempts: wasRetrying ? 1 : 0 });
      }
      return connection;

    } catch (error) {
      const errorMsg = (error && (error.message || error.toString())) || 'Unknown error';

      if (connection) {
        this.retired.add(connection);
        try { connection.destroy(); } catch (_) {}
      }

      if (superseded()) return null;

      logger.log('WARN', `Failed to join voice channel in guild ${guildId}: ${errorMsg}`);
      this.emit('joinAborted', { guildId, channelId: info.channelId, error: errorMsg });
      this.scheduleReconnect(guildId);
      return null;

    } finally {
      if (this.joinGeneration.get(guildId) === generation) {
        this.connectingGuilds.delete(guildId);
      }
    }
  }

  // ===================== Reconnect loop (never gives up) =====================
  getReconnectDelay(attempts) {
    if (attempts >= this.slowAfterAttempts) return this.slowReconnectDelay;
    return Math.min(
      this.reconnectDelay * Math.pow(this.reconnectDelayMultiplier, attempts),
      this.maxReconnectDelay
    );
  }

  // بتجدول إعادة اتصال بعد تأخير بيزيد كل مرة
  scheduleReconnect(guildId, { immediate = false } = {}) {
    if (this.shuttingDown) return;
    if (!this.pendingChannels.has(guildId)) return;      // nothing to come back to
    if (this.reconnectTimeouts.has(guildId)) return;      // a retry is already scheduled

    const attempts = this.reconnectAttempts.get(guildId) || 0;
    const delay = immediate && attempts === 0 ? this.immediateReconnectDelay : this.getReconnectDelay(attempts);
    this.reconnectAttempts.set(guildId, attempts + 1);

    if (attempts + 1 === this.maxReconnectAttempts) {
      // Informational only: we keep retrying forever.
      logger.log('WARN', `Still unable to reconnect in guild ${guildId} after ${attempts + 1} attempts - will keep trying`);
      this.emit('reconnectFailed', { guildId, attempts: attempts + 1, willKeepTrying: true });
    }

    logger.log('INFO', `🔄 Reconnect attempt ${attempts + 1} for guild ${guildId} in ${Math.round(delay / 1000)}s...`);

    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(guildId);
      if (this.shuttingDown || !this.pendingChannels.has(guildId)) return;
      try {
        await this._connect(guildId, { resume: true });
      } catch (error) {
        logger.log('ERROR', `Error while reconnecting for guild ${guildId}:`, error);
        this.scheduleReconnect(guildId);
      }
    }, delay);

    this.reconnectTimeouts.set(guildId, timeout);
  }

  /** Backwards-compatible alias. */
  async attemptReconnect(guildId) {
    this.scheduleReconnect(guildId, { immediate: true });
  }

  async resetConnection(guildId) {
    logger.log('WARN', `🔄 Resetting connection for guild ${guildId}`);
    this.dropConnection(guildId);
    this.actionLocks.delete(guildId);
  }

  clearReconnectTimeout(guildId) {
    const timeout = this.reconnectTimeouts.get(guildId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(guildId);
    }
  }

  /**
   * Tear down the current connection + player WITHOUT touching the desired
   * state and WITHOUT triggering a reconnect from the old connection's events.
   */
  dropConnection(guildId) {
    const connection = this.connections.get(guildId) || getVoiceConnection(guildId);
    if (connection) {
      this.retired.add(connection);
      try {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
      } catch (_) { /* already destroyed */ }
    }

    const player = this.players.get(guildId);
    if (player) {
      // Detach listeners first so stopping can't emit a fake "idle" (which would skip to the next surah)
      try {
        player.removeAllListeners();
        player.on('error', () => {});
        player.stop(true);
      } catch (_) {}
    }

    this.connections.delete(guildId);
    this.players.delete(guildId);
    this.isPlaying.delete(guildId);
    this.isPaused.delete(guildId);
    this.currentStreams.delete(guildId);
    this.suppressIdleEmit.delete(guildId);
  }

  // ===================== Audio playback =====================
  async playAudio(guildId, audioStream, options = {}) {
    try {
      // Make sure we are connected (try to get back right now if not)
      if (!this.isConnected(guildId)) {
        logger.log('WARN', `No connection in guild ${guildId}, trying to reconnect before playing...`);
        if (this.pendingChannels.has(guildId) && !this.connectingGuilds.has(guildId)) {
          this.clearReconnectTimeout(guildId);
          await this._connect(guildId, { resume: false });
        }

        if (!this.isConnected(guildId)) {
          logger.log('ERROR', `Cannot play audio: no connection in guild ${guildId}`);
          return false;
        }
      }

      const player = this.players.get(guildId);
      if (!player) {
        logger.log('ERROR', `No audio player found for guild ${guildId}`);
        return false;
      }

      // audioStream.on('error') = log only. player.on('error') is the single source of streamError.
      if (audioStream && typeof audioStream.on === 'function') {
        audioStream.removeAllListeners('error');
        audioStream.removeAllListeners('end');
        audioStream.removeAllListeners('close');

        audioStream.on('error', (error) => {
          logger.log('ERROR', `Audio stream error in guild ${guildId}:`, error);
          this.isPlaying.set(guildId, false);
        });

        audioStream.on('end', () => {
          logger.log('INFO', `📢 Audio stream ended for guild ${guildId}`);
        });

        audioStream.on('close', () => {
          logger.log('INFO', `🔚 Audio stream closed for guild ${guildId}`);
        });
      }

      // Stop current playback if something is already playing
      if (this.isPlaying.get(guildId)) {
        this.suppressIdleEmit.set(guildId, true);
        player.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!audioStream || typeof audioStream.pipe !== 'function') {
        logger.log('ERROR', `Invalid audio stream for guild ${guildId}`);
        return false;
      }

      // The audio source (mp3quran.net) serves plain MP3, so it must be transcoded
      // (StreamType.Arbitrary) - OggOpus made the player never return to Idle.
      const resource = createAudioResource(audioStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });

      const volumeLevel = options.volume || this.volume.get(guildId) || 1;
      resource.volume.setVolume(Math.max(0, Math.min(1, volumeLevel)));

      try {
        player.play(resource);
      } catch (playError) {
        logger.log('ERROR', `Error playing audio resource in guild ${guildId}:`, playError);
        this.isPlaying.set(guildId, false);
        this.emit('resourceError', { guildId, error: playError });
        return false;
      }

      this.currentStreams.set(guildId, resource);
      this.isPlaying.set(guildId, true);
      this.isPaused.set(guildId, false);

      logger.log('INFO', `▶️ Started audio playback in guild ${guildId}`);
      return true;

    } catch (error) {
      logger.log('ERROR', `Error playing audio in guild ${guildId}:`, error);
      // VoiceHandler.handlePlaybackFailure retries in a controlled way
      return false;
    }
  }

  // ===================== Playback control =====================
  /**
   * Only set the suppress flag when the player is actually non-idle: stopping an
   * idle player emits no Idle event, so the flag would stay stuck and swallow the
   * next *real* Idle (breaking auto-advance to the next surah).
   */
  stop(guildId, suppressAutoAdvance = false) {
    try {
      const player = this.players.get(guildId);
      const isActuallyPlaying =
        this.isPlaying.get(guildId) === true ||
        (player && player.state && player.state.status !== AudioPlayerStatus.Idle);

      if (suppressAutoAdvance && isActuallyPlaying) {
        this.suppressIdleEmit.set(guildId, true);
      }

      if (player) {
        player.stop();
      }
      this.isPlaying.set(guildId, false);
      this.isPaused.set(guildId, false);
      this.currentStreams.delete(guildId);
      logger.log('SUCCESS', `⏹ Playback stopped in guild ${guildId}`);
      return true;
    } catch (error) {
      logger.log('ERROR', `Error stopping playback: ${error.message}`);
      return false;
    }
  }

  // إيقاف مؤقت
  pause(guildId) {
    try {
      const player = this.players.get(guildId);
      if (player && this.isPlaying.get(guildId)) {
        player.pause();
        this.isPaused.set(guildId, true);
        logger.log('SUCCESS', `⏸ Playback paused in guild ${guildId}`);
        return true;
      }
      logger.log('WARN', `Cannot pause playback in guild ${guildId}`);
      return false;
    } catch (error) {
      logger.log('ERROR', `Error pausing playback: ${error.message}`);
      return false;
    }
  }

  // استكمال
  resume(guildId) {
    try {
      const player = this.players.get(guildId);
      if (player && this.isPaused.get(guildId)) {
        player.unpause();
        this.isPaused.set(guildId, false);
        logger.log('SUCCESS', `▶️ Playback resumed in guild ${guildId}`);
        return true;
      }
      logger.log('WARN', `Cannot resume playback in guild ${guildId}`);
      return false;
    } catch (error) {
      logger.log('ERROR', `Error resuming playback: ${error.message}`);
      return false;
    }
  }

  /**
   * Leaves the voice channel NOW but keeps the "desired" state, so the watchdog /
   * reconnect loop will bring the bot back. (Use leaveVoiceChannelPermanent to leave for good.)
   * Since the connection is retired first, this call itself never causes a reconnect storm.
   */
  leaveVoiceChannel(guildId, silent = false) {
    try {
      this.clearReconnectTimeout(guildId);
      this.dropConnection(guildId);
      this.volume.delete(guildId);
      this.actionLocks.delete(guildId);

      if (!silent) {
        logger.log('SUCCESS', `👋 Left voice channel in guild ${guildId}`);
      }
      return true;
    } catch (error) {
      if (!silent) {
        logger.log('ERROR', `Error leaving voice channel: ${error.message}`);
      }
      return false;
    }
  }

  /** Leave and DON'T come back (forgets the saved channel). */
  leaveVoiceChannelPermanent(guildId) {
    this.forget(guildId);
    return this.leaveVoiceChannel(guildId);
  }

  // ===================== Helpers =====================
  setVolume(guildId, volume) {
    try {
      const resource = this.currentStreams.get(guildId);
      if (resource) {
        const newVolume = Math.max(0, Math.min(1, volume));
        resource.volume.setVolume(newVolume);
        this.volume.set(guildId, newVolume);
        logger.log('VOICE', `🔊 Volume set to ${newVolume} in guild ${guildId}`);
        return true;
      }
      logger.log('WARN', `No active audio stream for guild ${guildId}`);
      return false;
    } catch (error) {
      logger.log('ERROR', `Error changing volume: ${error.message}`);
      return false;
    }
  }

  // مستوى الصوت الحالي
  getVolume(guildId) {
    return this.volume.get(guildId) || 1;
  }

  // هل البوت متصل؟
  isConnected(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) return false;

    const status = connection.state?.status;
    return !!status && status !== VoiceConnectionStatus.Destroyed && status !== VoiceConnectionStatus.Disconnected;
  }

  isReconnecting(guildId) {
    return this.reconnectTimeouts.has(guildId) || this.connectingGuilds.has(guildId);
  }

  getState(guildId) {
    return {
      isConnected: this.isConnected(guildId),
      isPlaying: this.isPlaying.get(guildId) || false,
      isPaused: this.isPaused.get(guildId) || false,
      volume: this.volume.get(guildId) || 1,
      reconnectAttempts: this.reconnectAttempts.get(guildId) || 0,
      isReconnecting: this.isReconnecting(guildId),
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  getConnectedGuilds() {
    return Array.from(this.connections.keys());
  }

  getReconnectingGuilds() {
    return Array.from(this.pendingChannels.keys()).filter((id) => this.isReconnecting(id));
  }

  getSavedChannels() {
    try {
      return Array.from(this.voiceChannelsStore.entries()).map(([guildId, entry]) => ({
        guild_id: guildId,
        channel_id: entry.channelId,
        self_deaf: entry.selfDeaf,
        joined_at: entry.joinedAt
      }));
    } catch (err) {
      console.error('❌ Error fetching saved channels:', err.message);
      return [];
    }
  }

  /** Called on process shutdown. Keeps the saved channels so the bot returns after restart. */
  cleanup() {
    this.shuttingDown = true;
    this.stopWatchdog();

    for (const [guildId] of Array.from(this.reconnectTimeouts)) {
      this.clearReconnectTimeout(guildId);
    }

    for (const [guildId] of Array.from(this.connections)) {
      this.leaveVoiceChannel(guildId, true);
    }

    this.reconnectAttempts.clear();
    this.suppressIdleEmit.clear();
    this.actionLocks.clear();

    this.persistStore();

    console.log('🧹 All voice connections cleaned up');
  }
}

module.exports = new VoiceService();
