// ============================================================
// 📄 utils/httpClient.js
// عميل HTTP مشترك (axios) بيفضّل IPv4 وبيعيد المحاولة تلقائي عشان تحميل الصوت يبقى أسرع وأثبت
// ============================================================

// httpClient.js - عميل HTTP مشترك لتسريع كل طلبات الشبكة في البوت
//
// ليه ده مهم؟
// اللوج بيوريك أخطاء زي:
//   connect ETIMEDOUT 5.161.200.100:443; connect ENETUNREACH 2a01:4ff:f0:ab3::1:443
//   connect ETIMEDOUT 104.26.10.243:443; connect ENETUNREACH 2606:4700:20::681a:bf3:443
// ده معناه إن Node بيحاول أولاً يتصل بعنوان IPv6 (اللي مش متاح فعلياً على شبكة السيرفر)
// وبيستنى المهلة كاملة قبل ما يرجع يجرب IPv4. ده بيسبب بطء شديد وتايم أوت متكرر
// في تحميل الصوت وجلب مواقيت الصلاة.
//
// الحل هنا:
// 1) إجبار Node يفضّل IPv4 عند الحل (dns.setDefaultResultOrder).
// 2) استخدام Keep-Alive عشان نعيد استخدام نفس الاتصال بدل ما نفتح TLS جديد كل مرة (أسرع بكتير).
// 3) مهلة زمنية قصيرة + إعادة محاولة واحدة سريعة بدل الانتظار الطويل.

const axios = require('axios');
const http = require('http');
const https = require('https');
const dns = require('dns');

// مهم: لازم يتحمل هذا الملف بأسرع وقت ممكن في بداية تشغيل البوت (من index.js لو أمكن)
// عشان إعداد الـ DNS يتطبق قبل ما أي خدمة تعمل أي طلب شبكة.
try {
  dns.setDefaultResultOrder('ipv4first');
  console.log('✅ Network set to prefer IPv4 (fixes ENETUNREACH/ETIMEDOUT issues)');
} catch (e) {
  // Node < 18 لا يدعم هذه الدالة، تجاهل بأمان
  console.warn('⚠️ Could not set DNS order (old Node version), skipping this optimization');
}

const httpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
  maxSockets: 50,
  keepAliveMsecs: 10000
});

const httpAgent = new http.Agent({
  keepAlive: true,
  family: 4,
  maxSockets: 50,
  keepAliveMsecs: 10000
});

const httpClient = axios.create({
  timeout: 10000, // مهلة قصيرة نسبياً: الفشل يبان بسرعة بدل ما يعلّق البوت
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

/**
 * تنفيذ طلب axios مع إعادة محاولة سريعة واحدة عند أخطاء الشبكة المؤقتة فقط
 * (لا يعيد المحاولة عند أخطاء 4xx/5xx الحقيقية، فقط عند مشاكل الاتصال)
 */
async function requestWithRetry(config, retries = 1) {
  try {
    return await httpClient(config);
  } catch (error) {
    const retriableCodes = ['ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET', 'ECONNABORTED', 'EAI_AGAIN'];
    const isRetriable = retriableCodes.includes(error.code) || /timeout/i.test(error.message || '');

    if (retries > 0 && isRetriable) {
      await new Promise(resolve => setTimeout(resolve, 400));
      return requestWithRetry(config, retries - 1);
    }
    throw error;
  }
}

module.exports = { httpClient, httpsAgent, httpAgent, requestWithRetry };