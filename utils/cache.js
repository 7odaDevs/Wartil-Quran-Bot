// ============================================================
// 📄 utils/cache.js
// كلاسات كاش بسيطة (تخزين مؤقت في الذاكرة مع مدة صلاحية)
// ============================================================

const logger = require('./logger');

/**
 * كاش بسيط مع انتهاء صلاحية
 */
class Cache {
  constructor(options = {}) {
    this.cache = new Map();
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 دقيقة
    this.maxSize = options.maxSize || Infinity;
    this.hits = 0;
    this.misses = 0;
    this.startCleanup();
  }

  /**
   * إضافة قيمة إلى الكاش
   */
  set(key, value, ttl = 3600000) { // افتراضي 1 ساعة
    // التحقق من الحجم
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
      createdAt: Date.now()
    });
    return this;
  }

  /**
   * الحصول على قيمة من الكاش
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // التحقق من انتهاء الصلاحية
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * التحقق من وجود مفتاح في الكاش
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * حذف مفتاح من الكاش
   */
  delete(key) {
    this.cache.delete(key);
    return this;
  }

  /**
   * مسح الكاش بالكامل
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    return this;
  }

  /**
   * الحصول على حجم الكاش
   */
  size() {
    return this.cache.size;
  }

  /**
   * الحصول على إحصائيات الكاش
   */
  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * إزالة القيم الأقدم
   */
  evictOldest() {
    let oldest = Infinity;
    let oldestKey = null;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldest) {
        oldest = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * بدء التنظيف التلقائي
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let deleted = 0;

      for (const [key, entry] of this.cache) {
        if (now > entry.expiry) {
          this.cache.delete(key);
          deleted++;
        }
      }

      if (deleted > 0) {
        logger.debug(`🧹 Cleaned up ${deleted} cache item(s)`);
      }
    }, this.cleanupInterval);

    // منع تسريب الذاكرة
    this.cleanupTimer.unref();
  }

  /**
   * إيقاف التنظيف التلقائي
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * الحصول على جميع المفاتيح
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * الحصول على جميع القيم الصالحة
   */
  values() {
    const values = [];
    for (const [key, entry] of this.cache) {
      if (Date.now() <= entry.expiry) {
        values.push(entry.value);
      }
    }
    return values;
  }

  /**
   * تكرار على الكاش
   */
  forEach(callback) {
    for (const [key, entry] of this.cache) {
      if (Date.now() <= entry.expiry) {
        callback(entry.value, key);
      }
    }
  }
}

/**
 * كاش LRU (Least Recently Used)
 */
class LRUCache extends Cache {
  constructor(options = {}) {
    super(options);
    this.accessOrder = [];
  }

  /**
   * تحديث ترتيب الوصول
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * إضافة قيمة مع تحديث ترتيب الوصول
   */
  set(key, value, ttl) {
    super.set(key, value, ttl);
    this.updateAccessOrder(key);
    return this;
  }

  /**
   * الحصول على قيمة مع تحديث ترتيب الوصول
   */
  get(key) {
    const value = super.get(key);
    if (value !== null) {
      this.updateAccessOrder(key);
    }
    return value;
  }

  /**
   * إزالة الأقل استخداماً
   */
  evictOldest() {
    if (this.accessOrder.length === 0) return;
    
    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * حذف مفتاح
   */
  delete(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    super.delete(key);
    return this;
  }

  /**
   * مسح الكاش
   */
  clear() {
    super.clear();
    this.accessOrder = [];
    return this;
  }
}

// ============ كاش متخصص للـ Voice ============
class VoiceCache extends LRUCache {
  constructor(options = {}) {
    super({
      maxSize: options.maxSize || 100,
      cleanupInterval: options.cleanupInterval || 30000
    });
    this.audioCache = new Map();
  }

  /**
   * تخزين ملف صوتي
   */
  setAudio(guildId, surahNumber, audioData) {
    const key = `${guildId}_${surahNumber}`;
    this.audioCache.set(key, {
      data: audioData,
      timestamp: Date.now()
    });
    return this;
  }

  /**
   * الحصول على ملف صوتي
   */
  getAudio(guildId, surahNumber) {
    const key = `${guildId}_${surahNumber}`;
    const entry = this.audioCache.get(key);
    
    if (!entry) return null;
    
    // انتهاء صلاحية بعد 10 دقائق
    if (Date.now() - entry.timestamp > 600000) {
      this.audioCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * تنظيف الملفات الصوتية القديمة
   */
  cleanup() {
    const now = Date.now();
    let deleted = 0;
    
    for (const [key, entry] of this.audioCache) {
      if (now - entry.timestamp > 600000) {
        this.audioCache.delete(key);
        deleted++;
      }
    }
    
    if (deleted > 0) {
      logger.debug(`🎵 Cleaned up ${deleted} old audio file(s)`);
    }
  }
}

/**
 * كاش مع دعم الأحداث
 */
class EventedCache extends Cache {
  constructor(options = {}) {
    super(options);
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);
    return this;
  }

  emit(event, data) {
    const callbacks = this.events.get(event) || [];
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        logger.error(`Error in event ${event}:`, error);
      }
    }
  }

  set(key, value, ttl) {
    const result = super.set(key, value, ttl);
    this.emit('set', { key, value });
    return result;
  }

  get(key) {
    const value = super.get(key);
    if (value !== null) {
      this.emit('hit', { key });
    } else {
      this.emit('miss', { key });
    }
    return value;
  }

  delete(key) {
    const result = super.delete(key);
    this.emit('delete', { key });
    return result;
  }

  clear() {
    super.clear();
    this.emit('clear', {});
    return this;
  }
}

module.exports = {
  Cache,
  LRUCache,
  VoiceCache,
  EventedCache
};