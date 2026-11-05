// ============================================================
// 📄 handlers/VoiceHandler.js
// مسؤول عن أحداث الصوت: لما التلاوة تخلص يشغّل السورة اللي بعدها، ولو حصل خطأ يعيد المحاولة
// ============================================================

const { VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const logger = require('../utils/logger');
const { voiceService, quranService } = require('../services');
const guildSettings = require('../models/GuildSettings');
const guildDataModel = require('../models/GuildData');
const { updateControlPanel } = require('../utils/controlPanelRenderer');

class VoiceHandler {
  constructor(client) {
    this.client = client;
    // ✅ تتبع محاولات إعادة التشغيل لكل سيرفر، عشان لو التحميل اتقطع نعيد
    // *نفس* السورة بدل ما نقفز للسورة التالية (اللي كان بيسبب تخطي عشوائي للسور)
    this.retryAttempts = new Map();
    this.maxRetries = 3;

    // ✅ إصلاح bug الـ retry counter الثابت على (1/3):
    // المشكلة: streamError بيتطلق → handlePlaybackFailure بيبدأ delay 1.5s →
    // أثناء الـ delay، السورة اللي بتتحاول تنشغل بتطلق streamError تاني →
    // handlePlaybackFailure بيتستدعى مرة ثانية بنفس القيمة القديمة للعداد
    // (لأن الأول لسه في الـ delay) → العداد بيتزاد مرة ثانية بس بنفس الباقيةstale
    // → النتيجة: (1/3) يظهر بشكل متكرر لأنه بيتزاد ويترجع في نفس الوقت.
    // الحل: mutex بسيط — لو في retry جاري، نتجاهل أي streamError جديد.
    this.isHandlingFailure = new Map();

    this.setupListeners();
  }

  getGuildSetting(guildId, key) {
    return guildSettings.getSetting(guildId, key);
  }

  // بتسمع لأحداث الصوت (خلصت السورة / حصل خطأ / فصل الاتصال)
  setupListeners() {
    // ✅ لما البوت يرجع للروم بعد انقطاع/ريستارت، نكمل التلاوة اللي كانت شغالة
    voiceService.on('reconnected', ({ guildId }) => {
      this.resumePlayback(guildId).catch((err) => {
        logger.error(`Failed to resume playback in server ${guildId}:`, err);
      });
    });

    voiceService.on('idle', (guildId) => {
      this.handleIdle(guildId);
    });

    voiceService.on('error', ({ guildId, error }) => {
      this.handleError(guildId, error);
    });

    // ✅ لما يحصل فشل حقيقي في التحميل/التشغيل (رابط ميت، انقطاع تدفق، إلخ)
    // نعيد محاولة *نفس* السورة (لعدد محدود من المرات) بدل ما نتخطاها للسورة
    // التالية — التخطي كان بيسبب "قفز عشوائي" بين السور عند أي انقطاع مؤقت.
    voiceService.on('streamError', ({ guildId, error }) => {
      // ✅ إصلاح: لو في retry جاري لهذا السيرفر، نتجاهل streamError الجديد
      // عشان ما نستدعيش handlePlaybackFailure مرتين في نفس الوقت ونخلي
      // العداد يتعمل reset بشكل غلط (ده كان سبب ظهور 1/3 بشكل متكرر في اللوج)
      if (this.isHandlingFailure.get(guildId)) return;
      this.handlePlaybackFailure(guildId, 'خطأ في تدفق الصوت', error);
    });

    voiceService.on('resourceError', ({ guildId, error }) => {
      if (this.isHandlingFailure.get(guildId)) return;
      this.handlePlaybackFailure(guildId, 'خطأ في مورد الصوت', error);
    });

    voiceService.on('playbackStopped', ({ guildId }) => {
      if (this.isHandlingFailure.get(guildId)) return;
      this.handlePlaybackFailure(guildId, 'توقف غير متوقع', null);
    });
  }

  /**
   * ✅ إصلاح "البوت بيخرج من المكالمة ومش بيرجع":
   * كان فيه هنا خروج تلقائي لما الروم تفضى من الأعضاء (leaveVoiceChannel +
   * quranService.cleanup)، ومفيش أي كود بيرجّع البوت لما حد يدخل تاني.
   * ده راديو قرآن 24/7، فالبوت لازم يفضل في الروم طول الوقت. تم حذف الخروج التلقائي.
   */

  /**
   * بعد ما البوت يرجع للروم (إعادة اتصال أو ريستارت) نكمل نفس السورة لو كانت شغالة.
   */
  async resumePlayback(guildId) {
    const guildData = guildDataModel.load(guildId);
    if (!guildData || !guildData.quran || !guildData.quran.isPlaying || guildData.quran.isPaused) {
      return false;
    }

    let reciter = quranService.guildReciters.get(guildId);
    if (!reciter && guildData.quran.currentReciter) {
      reciter = quranService.getReciter(guildData.quran.currentReciter);
      if (reciter) quranService.guildReciters.set(guildId, reciter);
    }

    let surah = quranService.guildSurahIndex.get(guildId);
    if (surah === undefined || surah === null) surah = guildData.quran.currentSurah;

    if (!reciter || !surah) {
      logger.warn(`Cannot resume playback in server ${guildId}: missing reciter/surah`);
      return false;
    }

    // ممكن الاتصال يكون لسه بيستقر، فنستنى لحظة
    await new Promise((resolve) => setTimeout(resolve, 1500));

    logger.info(`▶️ Resuming surah ${surah} in server ${guildId} after reconnect`);
    this.retryAttempts.delete(guildId);
    this.isHandlingFailure.set(guildId, false);
    return this.playSurah(guildId, surah);
  }

  // بتتنفّذ لما السورة تخلص: بتنقل للسورة اللي بعدها أوتوماتيك
  async handleIdle(guildId) {
    try {
      // انتهت السورة بشكل طبيعي، فأي محاولات إعادة كانت متراكمة للسورة دي بقت
      // مالهاش لازمة
      this.retryAttempts.delete(guildId);
      // ✅ إصلاح: نمسح الـ mutex كمان عند الانتهاء الطبيعي
      this.isHandlingFailure.set(guildId, false);

      const currentSurah = quranService.guildSurahIndex.get(guildId);

      // ✅ لو مفيش رقم سورة مسجل خالص (يعني ولا سورة اتشغلت بنجاح لحد دلوقتي)،
      // ده مش معناه "خلصنا القرآن" — ده معناه إننا مش عارفين نكمل من فين،
      // فبنوقف من غير ما نعلن اكتمال غلط.
      if (currentSurah === undefined || currentSurah === null) {
        logger.warn(`No known current surah for server ${guildId}, playback stopped`);
        return;
      }

      if (currentSurah >= 114) {
        logger.info(`⏹️ Full Quran completed in server ${guildId}`);
        quranService.guildQuranComplete.set(guildId, true);
        quranService.totalQuranComplete++;
        
        const guildData = guildDataModel.load(guildId);
        guildData.quran.isPlaying = false;
        guildDataModel.save(guildId, guildData);
        
        await updateControlPanel(this.client, guildId);
        return;
      }

      const nextSurah = currentSurah + 1;
      const reciter = quranService.guildReciters.get(guildId);

      if (!reciter) return;

      logger.info(`⏭️ Moving to surah ${nextSurah} in server ${guildId}`);
      await this.playSurah(guildId, nextSurah);

    } catch (error) {
      logger.error(`Error in idle handler:`, error);
    }
  }

  /**
   * ✅ فشل حقيقي في التحميل/التشغيل (مش انتهاء طبيعي للسورة).
   * نعيد محاولة *نفس* السورة الحالية (مش نقفز للتالية) لعدد محدود من المرات،
   * عشان انقطاع مؤقت في الشبكة ميسببش تخطي عشوائي للسور.
   *
   * ✅ إصلاح retry counter ثابت (1/3):
   * بنستخدم isHandlingFailure كـ mutex: بنشغّله في الأول وبنوقفه في الآخر.
   * أي streamError تاني بيجي أثناء الـ delay بيتتجاهل بالـ guard في setupListeners.
   * كده العداد بيتزاد بشكل صحيح (1 → 2 → 3) بدل ما يظل ثابت على 1.
   */
  async handlePlaybackFailure(guildId, reasonLabel, error) {
    // ✅ نشغّل الـ mutex فوراً
    this.isHandlingFailure.set(guildId, true);

    try {
      const currentSurah = quranService.guildSurahIndex.get(guildId);

      if (currentSurah === undefined || currentSurah === null) {
        logger.error(`${reasonLabel} in server ${guildId} before any successful playback, cannot determine which surah to retry:`, error);
        this.isHandlingFailure.set(guildId, false);
        return;
      }

      const attempts = (this.retryAttempts.get(guildId) || 0) + 1;

      if (attempts > this.maxRetries) {
        logger.error(`Retrying surah ${currentSurah} in server ${guildId} failed after ${this.maxRetries} attempts (${reasonLabel}), stopping:`, error);
        this.retryAttempts.delete(guildId);
        this.isHandlingFailure.set(guildId, false);

        const guildData = guildDataModel.load(guildId);
        guildData.quran.isPlaying = false;
        guildDataModel.save(guildId, guildData);

        await updateControlPanel(this.client, guildId);
        return;
      }

      this.retryAttempts.set(guildId, attempts);
      logger.warn(`${reasonLabel} in server ${guildId}, retrying surah ${currentSurah} (${attempts}/${this.maxRetries})`);

      // ✅ مهلة قبل إعادة المحاولة — الـ mutex شغّال طول الـ delay
      // فأي streamError جديد هيتتجاهل تلقائياً
      const retryDelay = 1500 * attempts; // delay تدريجي: 1.5s، 3s، 4.5s
      await new Promise(resolve => setTimeout(resolve, retryDelay));

      // ✅ نوقف الـ mutex قبل playSurah عشان لو السورة الجديدة فشلت
      // نقدر نعالج الـ streamError بتاعها بشكل صحيح
      this.isHandlingFailure.set(guildId, false);

      await this.playSurah(guildId, currentSurah);

    } catch (err) {
      logger.error(`Error in playback-failure handler:`, err);
      this.isHandlingFailure.set(guildId, false);
    }
  }

  // بتسجّل خطأ الصوت في اللوج
  handleError(guildId, error) {
    logger.error(`Audio error in server ${guildId}:`, error);
  }

  // بتشغّل سورة معيّنة في الروم الصوتي
  async playSurah(guildId, surahNumber) {
    // ✅ نفس آلية التذكرة المستخدمة في playSurah اليدوي — لو المستخدم اختار
    // سورة تانية يدوياً وإحنا لسه بنحمّل صوت الانتقال التلقائي، نلغي نفسنا
    // بدل ما نشغل فوق اختياره.
    const playToken = quranService.nextPlayToken(guildId);

    try {
      const reciter = quranService.guildReciters.get(guildId);
      if (!reciter) {
        logger.warn(`No reciter set for server ${guildId}`);
        return false;
      }

      const audioUrl = quranService.getAudioUrl(reciter.id, surahNumber);
      if (!audioUrl) {
        logger.error(`Failed to get URL for surah ${surahNumber}`);
        return false;
      }

      const stream = await quranService.fetchAudio(audioUrl);
      if (!stream) {
        logger.error(`Failed to load surah ${surahNumber}`);
        return false;
      }

      // ✅ لو محاولة أحدث (يدوية غالباً) بدأت وإحنا لسه بنحمّل، نلغي هنا
      if (!quranService.isPlayTokenCurrent(guildId, playToken)) {
        logger.info(`↩️ Cancelled auto-advance to surah ${surahNumber} in server ${guildId} (a newer attempt started)`);
        try { stream.destroy(); } catch (_) {}
        return false;
      }

      let connection = voiceService.connections.get(guildId);
      if (!connection) {
        const voiceChannelId = this.getGuildSetting(guildId, 'voiceChannelId');
        if (!voiceChannelId) {
          logger.warn(`No voice channel for server ${guildId}`);
          return false;
        }

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return false;

        connection = await voiceService.joinVoiceChannel(
          guildId,
          voiceChannelId,
          guild.voiceAdapterCreator,
          true
        );
        
        if (connection) {
          const guildData = guildDataModel.load(guildId);
          guildData.channels.voice.isConnected = true;
          guildDataModel.save(guildId, guildData);
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

      // ✅ فحص أخير قبل التشغيل الفعلي
      if (!quranService.isPlayTokenCurrent(guildId, playToken)) {
        logger.info(`↩️ Cancelled auto-advance to surah ${surahNumber} in server ${guildId} (a newer attempt started)`);
        try { stream.destroy(); } catch (_) {}
        return false;
      }

      // ✅ ملحوظة: مبنحطش suppressIdleEmit هنا يدويًا. playAudio() أصلاً بيتعامل
      // مع الموضوع ده جوّاه (بيحط العلم ويوقف التشغيل القديم بس لو فيه فعلاً
      // حاجة شغالة). لو حطينا العلم هنا وإحنا جايين من انتهاء طبيعي (idle حقيقي)،
      // مفيش حاجة شغالة عشان توقفها، فالعلم كان بيفضل عالق true من غير ما حد
      // يستهلكه، وده كان بيسبب تجاهل أول idle حقيقي للسورة الجديدة (يعني بعد
      // ما تخلص، النظام كان بيفتكرها "توقف مقصود" ومش بيكمل للسورة اللي بعدها).
      const success = await voiceService.playAudio(guildId, stream, { volume: 1 });
      
      if (success) {
        this.retryAttempts.delete(guildId);
        // ✅ إصلاح: نمسح الـ mutex عند نجاح التشغيل
        this.isHandlingFailure.set(guildId, false);
        quranService.guildSurahIndex.set(guildId, surahNumber);
        quranService.guildLastSurah.set(guildId, surahNumber);
        guildSettings.set(guildId, 'currentSurah', surahNumber);
        
        const guildData = guildDataModel.load(guildId);
        guildData.quran.currentSurah = surahNumber;
        guildData.quran.currentReciter = reciter.id;
        guildData.quran.isPlaying = true;
        guildData.quran.isPaused = false;
        guildDataModel.save(guildId, guildData);
        
        const surahName = quranService.getSurahName(reciter.id, surahNumber);
        logger.info(`▶️ Started playing surah ${surahName} in server ${guildId}`);
        
        await updateControlPanel(this.client, guildId);
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`Failed to play surah ${surahNumber}:`, error);
      return false;
    }
  }
}

module.exports = VoiceHandler;