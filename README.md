<div align="center">

# 🕌 ورتل | Wartil

### Quran Radio, Prayer Times & Azkar Discord Bot
### بوت ديسكورد لإذاعة القرآن الكريم ومواقيت الصلاة والأذكار

**Free • Open Source • Fully Arabic  |  مجاني • مفتوح المصدر • عربي بالكامل**

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-success)

**[🇬🇧 English](#english)** &nbsp;|&nbsp; **[🇪🇬 العربية](#arabic)**

</div>

---

<a id="english"></a>

# 🇬🇧 English

## 📖 About

**Wartil** is a free, open-source Discord bot that plays the **entire Holy Quran (114 surahs)** in a voice channel, recited by **14 well-known reciters**. It also sends **prayer times with adhan notifications**, **azkar**, and **daily reminders** as beautifully rendered images.

> ﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾

## ✨ Features

- 🎙️ **Continuous Quran radio**: 114 surahs, 14 reciters, auto-advances to the next surah.
- 🎛️ **Control panel**: reciter and surah menus with Skip, Pause, Resume and Restart buttons.
- 🔁 **Auto-reconnect**: returns to its voice channel after a dropped connection or a restart.
- 🕌 **Prayer times & adhan**: image-based timetable, adhan alerts, optional role mention.
- 📿 **Azkar**: sent periodically as images.
- 🔔 **Reminders**: random-interval Islamic reminders.
- 🌍 **Multi-server**: every server keeps its own settings.
- 📊 **Basic stats**: most-played reciters, surahs played, and more.
- ➕ **Easy to customize**: adding a reciter is a single JSON file.

## 📋 Requirements

- **Node.js 18 or newer** (20 LTS recommended)
- A Discord bot token ([Developer Portal](https://discord.com/developers/applications)) with **Message Content Intent** enabled
- Internet access (audio and prayer times are fetched online)

FFmpeg is bundled through `ffmpeg-static`, so you don't need to install it yourself. See [`docs/requirements.md`](docs/requirements.md) for details.

## 🚀 Quick Start

```bash
# 1) Clone the project
git clone https://github.com/<your-username>/wartil-quran-bot.git
cd wartil-quran-bot

# 2) Install dependencies
npm install

# 3) Create your config file, then add your BOT_TOKEN and CLIENT_ID
cp .env.example .env        # Windows (CMD): copy .env.example .env

# 4) Start the bot
npm start
```

Then, in Discord, run `/setup` and pick your channels. ✅

Want it online 24/7? Run it with [pm2](https://pm2.keymetrics.io): `pm2 start index.js --name wartil`.

## ⚙️ Configuration (`.env`)

| Variable | Required | Description |
|---|:---:|---|
| `BOT_TOKEN` | ✅ | Your bot token |
| `CLIENT_ID` | Recommended | Application ID, used to build the invite link |
| `ALLOWED_GUILD_ID` | ❌ | Restrict the bot to a single server |
| `JOIN_LOG_CHANNEL_ID` | ❌ | Channel that logs every server the bot joins |
| `BOT_LOGO_URL` | ❌ | Logo shown in the control panel |
| `PANEL_BANNER_URL` | ❌ | Large banner shown under the control panel |
| `SUPPORT_SERVER_URL` | ❌ | Support server link shown in the bot's status |

> ⚠️ **Never** commit your `.env` file or share your token. If it leaks, click **Reset Token** in the Developer Portal immediately.

## 💬 Commands

| Command | Description | Who |
|---|---|---|
| `/setup` | Set up the bot and choose its channels | Admins |
| `/country` | Choose the country/city for prayer times | Admins |
| `/prayer status` | Toggle adhan alerts and pick a role to mention | Admins |
| `/link-invite` | Get the bot's invite link | Everyone |

## 🎙️ Managing Reciters

Each reciter is one JSON file inside `data/reciters/`. To add one, copy an existing file and edit `name`, `id` and `baseUrl`. To remove one, delete its file. Restart the bot after any change.

Audio is streamed from the internet (it is not stored in the project). The URL is built as `baseUrl` + a 3-digit surah number + `.mp3`, for example `https://example.com/sheikh/001.mp3`.

Full guide (Arabic): [`docs/reciters.md`](docs/reciters.md)

## 🗂️ Project Structure

```
.
├── index.js                 # Entry point
├── config/                  # Settings and constants
├── handlers/                # Commands, buttons, menus, voice events
│   └── commands/            # Slash commands (/setup, /country, ...)
├── services/                # Quran, voice, prayer, azkar, reminders
├── models/                  # Per-server settings and data storage
├── utils/                   # Helpers, control panel, logging
├── data/
│   ├── reciters/            # One JSON file per reciter  <- add/remove reciters here
│   ├── quran_data.json      # Surah data
│   └── azkar.json           # Azkar
├── assets/
│   ├── fonts/               # Arabic fonts
│   └── templates/           # Image templates (prayer/azkar/reminders)
├── docs/                    # Guides (Arabic)
├── .env.example             # Example config
└── package.json
```

Per-server data (`data/guilds` and the settings files) is created automatically at runtime and is ignored by Git.

## 📚 Guides (Arabic)

| Guide | Contents |
|---|---|
| [Setup from scratch](docs/setup.md) | Creating the bot, token, setup, 24/7 hosting, troubleshooting |
| [Managing reciters](docs/reciters.md) | Add/remove reciters, emojis, audio sources |
| [Requirements](docs/requirements.md) | Everything needed to run the bot |

## 🤝 Contributing

Contributions are welcome. 🐞 Report bugs through **Issues**, or 🔧 open a **Pull Request** with an improvement or a new reciter.

## 🙏 Credits

- Audio files: **mp3quran.net**
- Prayer times: **Aladhan API**
- Fonts: Amiri, Cairo, Traditional Arabic

## 📄 License

Released under the **MIT License**. You are free to use, modify and distribute it. See [LICENSE](LICENSE).

<div align="right">

[⬆️ Back to top](#top)

</div>

---

<a id="arabic"></a>

<div dir="rtl">

# 🇪🇬 العربية

## 📖 نبذة

**ورتل** بوت ديسكورد مجاني ومفتوح المصدر، بيشغّل **القرآن الكريم كامل (114 سورة)** في الروم الصوتي بأصوات **14 قارئ** من أشهر القرّاء. ومعاه **مواقيت الصلاة والأذان** و**الأذكار** و**تنبيهات** إيمانية بشكل صور جميلة.

> ﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾

## ✨ المميزات

- 🎙️ **إذاعة قرآن مستمرة**: 114 سورة بـ 14 قارئ، والبوت بينتقل للسورة اللي بعدها أوتوماتيك.
- 🎛️ **لوحة تحكم**: قايمة اختيار القارئ والسورة، وأزرار (تخطي / إيقاف مؤقت / استكمال / إعادة القرآن).
- 🔁 **إعادة اتصال تلقائية**: بيرجع للروم الصوتي لو الاتصال وقع أو البوت اتعمله restart.
- 🕌 **مواقيت الصلاة والأذان**: صورة جاهزة، وإشعار أذان في وقته، مع إمكانية منشن رتبة معيّنة.
- 📿 **أذكار**: بتتبعت كل فترة على شكل صور.
- 🔔 **تنبيهات إيمانية**: في أوقات عشوائية.
- 🌍 **يشتغل على أكتر من سيرفر**: وكل سيرفر ليه إعداداته.
- 📊 **إحصائيات بسيطة**: أكتر قارئ اتسمع، عدد السور المشغّلة، وغيرها.
- ➕ **سهل التخصيص**: إضافة قارئ جديد = ملف JSON واحد.

## 📋 المتطلبات

- **Node.js نسخة 18 أو أحدث** (يفضل 20 LTS).
- توكن بوت من [Developer Portal](https://discord.com/developers/applications) مع تفعيل **Message Content Intent**.
- اتصال بالإنترنت (الصوت والمواقيت بيتجابوا من النت).

مش محتاج تنزّل FFmpeg، لأنه بيتنزل مع المكتبات (`ffmpeg-static`). التفاصيل في [`docs/requirements.md`](docs/requirements.md).

## 🚀 تشغيل سريع

```bash
# 1) نزّل المشروع
git clone https://github.com/<اسمك>/wartil-quran-bot.git
cd wartil-quran-bot

# 2) نزّل المكتبات
npm install

# 3) جهّز ملف الإعدادات وحط فيه BOT_TOKEN و CLIENT_ID
cp .env.example .env        # ويندوز (CMD): copy .env.example .env

# 4) شغّل البوت
npm start
```

وبعدها في ديسكورد اكتب `/setup` واختار الرومات. ✅

عايزه شغال 24 ساعة؟ شغّله بـ [pm2](https://pm2.keymetrics.io): `pm2 start index.js --name wartil`.

## ⚙️ الإعدادات (`.env`)

| المتغير | مطلوب؟ | الوصف |
|---|:---:|---|
| `BOT_TOKEN` | ✅ | توكن البوت |
| `CLIENT_ID` | موصى به | الـ Application ID (لبناء رابط الدعوة) |
| `ALLOWED_GUILD_ID` | ❌ | تقييد البوت على سيرفر واحد |
| `JOIN_LOG_CHANNEL_ID` | ❌ | روم لوج دخول السيرفرات |
| `BOT_LOGO_URL` | ❌ | لوجو لوحة التحكم |
| `PANEL_BANNER_URL` | ❌ | صورة كبيرة أسفل لوحة التحكم |
| `SUPPORT_SERVER_URL` | ❌ | لينك سيرفر الدعم في حالة البوت |

> ⚠️ **متنشرش** ملف `.env` ولا التوكن أبداً. لو اتسرّب اعمله **Reset Token** من Developer Portal فوراً.

## 💬 الأوامر

| الأمر | الوصف | مين يستخدمه |
|---|---|---|
| `/setup` | تجهيز البوت واختيار الرومات | الأدمن |
| `/country` | اختيار الدولة/المدينة لمواقيت الصلاة | الأدمن |
| `/prayer status` | تشغيل/إيقاف تنبيهات الأذان واختيار رتبة المنشن | الأدمن |
| `/link-invite` | رابط دعوة البوت | الكل |

## 🎙️ إدارة الشيوخ

كل شيخ عبارة عن ملف JSON جوه `data/reciters/`. عشان تضيف شيخ انسخ ملف موجود وعدّل `name` و`id` و`baseUrl`. وعشان تحذف شيخ امسح ملفه. وأعد تشغيل البوت بعد أي تعديل.

الصوت بيتجاب من الإنترنت (مش متخزن في المشروع). واللينك بيتركّب كده: `baseUrl` + رقم السورة من 3 أرقام + `.mp3`، مثلاً `https://example.com/sheikh/001.mp3`.

الشرح الكامل: [`docs/reciters.md`](docs/reciters.md)

## 🗂️ هيكل المشروع

```
.
├── index.js                 # نقطة البداية
├── config/                  # الإعدادات والثوابت
├── handlers/                # الأوامر والأزرار والقوايم وأحداث الصوت
│   └── commands/            # أوامر السلاش (/setup /country ...)
├── services/                # القرآن، الصوت، الصلاة، الأذكار، التنبيهات
├── models/                  # حفظ إعدادات وبيانات السيرفرات
├── utils/                   # دوال مساعدة ولوحة التحكم واللوج
├── data/
│   ├── reciters/            # ملف JSON لكل قارئ  <- هنا بتضيف وتحذف الشيوخ
│   ├── quran_data.json      # بيانات السور
│   └── azkar.json           # الأذكار
├── assets/
│   ├── fonts/               # الخطوط العربية
│   └── templates/           # قوالب الصور (مواقيت/أذكار/تنبيهات)
├── docs/                    # الشروحات
├── .env.example             # مثال لملف الإعدادات
└── package.json
```

بيانات السيرفرات (`data/guilds` وملفات الإعدادات) بتتعمل أوتوماتيك وانت شغال، وGit بيتجاهلها.

## 📚 الشروحات

| الدليل | المحتوى |
|---|---|
| [دليل التشغيل من الصفر](docs/setup.md) | إنشاء البوت، التوكن، الإعداد، التشغيل 24 ساعة، حل المشاكل |
| [إدارة الشيوخ](docs/reciters.md) | إضافة/حذف شيخ، الإيموجي، الصوتيات |
| [المتطلبات](docs/requirements.md) | كل اللي محتاجه عشان البوت يشتغل |

## 🤝 المساهمة

أي مساهمة مرحّب بيها: 🐞 بلّغ عن مشكلة بـ **Issue**، أو 🔧 افتح **Pull Request** بتحسين أو قارئ جديد.

## 🙏 شكر

- ملفات الصوت من **mp3quran.net**.
- مواقيت الصلاة من **Aladhan API**.
- الخطوط: Amiri و Cairo و Traditional Arabic.

## 📄 الرخصة

المشروع تحت رخصة **MIT**: تقدر تستخدمه وتعدّل عليه وتنشره بحرية. شوف ملف [LICENSE](LICENSE).

</div>

<div align="center">

[⬆️ العودة للأعلى](#top)

**اللهم اجعله خالصاً لوجهك الكريم، وانفع به المسلمين** 🤍

</div>
