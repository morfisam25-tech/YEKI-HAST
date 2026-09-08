'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './listener.module.css';

type TrainingModuleKey = 'active_listening' | 'role_boundary' | 'safety' | 'platform_rules';
type Gender = 'female' | 'male';
type KycState = 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
type LanguageProficiency = 'conversational' | 'fluent' | 'native';

type BootstrapLanguage = { code: string; nameFa: string; nameEn: string | null };
type Bootstrap = { languages: BootstrapLanguage[] };

type Application = {
  id: string;
  status: string;
  nickname: string;
  declared_gender: Gender;
  short_intro: string | null;
  listening_style: string | null;
  created_at: string;
  languages: Array<{ code: string; proficiency: string }>;
  training: Array<{
    module_key: TrainingModuleKey;
    status: string;
    progress_percent: number;
    completed_at: string | null;
  }>;
  trainingComplete: boolean;
  latestAssessment: null | {
    id: string;
    result: 'pending' | 'passed' | 'failed';
    score: string | null;
    scenario_version: string;
    created_at: string;
  };
};

type KycStatus = {
  applicationStatus: string;
  status: KycState;
  verifiedAt: string | null;
  rejectedReasonCode: string | null;
  updatedAt: string | null;
};

type LessonExample = {
  situation: string;
  weak: string;
  better: string;
  why: string;
};

type TrainingGroup = {
  key: TrainingModuleKey;
  shortTitle: string;
  title: string;
  intro: string;
  lessons: Array<{
    title: string;
    paragraphs: string[];
    points?: string[];
    takeaway?: string;
    examples?: LessonExample[];
  }>;
};

type StatusInfo = {
  label: string;
  title: string;
  meaning: string;
  action: string;
};

const proficiencyOptions: Array<{ value: LanguageProficiency; label: string; hint: string }> = [
  { value: 'conversational', label: 'مکالمه‌ای', hint: 'می‌توانید گفت‌وگوی روزمره را دنبال کنید و پاسخ بدهید.' },
  { value: 'fluent', label: 'روان', hint: 'می‌توانید گفت‌وگوهای طولانی و ظریف را با راحتی دنبال کنید.' },
  { value: 'native', label: 'زبان مادری', hint: 'این زبان زبان مادری یا هم‌سطح زبان مادری شماست.' },
];

const trainingModules: TrainingGroup[] = [
  {
    key: 'active_listening',
    shortTitle: 'نقش و شنیدن',
    title: 'بخش اول: نقش و گوش‌دادن',
    intro: 'کار شما این نیست که جواب زندگی کسی را پیدا کنید. قرار است با توجه، کنجکاوی و بدون تصاحب داستان، به او فرصت بدهید حرف خودش را بشنود.',
    lessons: [
      {
        title: 'درس ۱ — نقش شنونده',
        paragraphs: [
          'شنیدنِ خوب ارزش دارد چون خیلی از آدم‌ها قبل از راه‌حل، به گفت‌وگویی محترمانه، با توجه و مرز روشن نیاز دارند. در این نقش، حضور و توجه مهم‌تر از داشتن جواب آماده است.',
          'داستان متعلق به کاربر است. شما آن را هدایت نمی‌کنید، از روی تجربه خودتان برایش نسخه نمی‌پیچید و تلاش نمی‌کنید ثابت کنید کدام انتخاب «درست» است. یک شنونده خوب لازم نیست جواب داشته باشد.',
          'تمام‌کردن این مسیر به معنی دریافت مدرک حرفه‌ای یا تبدیل‌شدن به درمانگر، مشاور، پزشک یا متخصص دیگری نیست. گرمی و همدلی مهم‌اند، اما مرز روشن هم بخشی از کار است.',
        ],
        points: [
          'حضور: حواس شما واقعاً در گفت‌وگو باشد، نه در آماده‌کردن پاسخ بعدی.',
          'مالکیت داستان: کاربر درباره تجربه خودش تصمیم می‌گیرد چه بگوید و چه نتیجه‌ای بگیرد.',
          'بدون اصلاح‌گری: لازم نیست هر ناراحتی را به مسئله‌ای برای حل‌کردن تبدیل کنید.',
          'بدون قضاوت اخلاقی: ارزش‌ها و تجربه شخصی شما معیار زندگی طرف مقابل نیست.',
          'بدون مثبت‌اندیشی اجباری: جمله‌هایی مثل «مثبت فکر کن» یا «همه‌چیز درست می‌شود» می‌تواند تجربه او را کوچک کند.',
        ],
        takeaway: 'اگر بعد از چند دقیقه هنوز «راه‌حل» ندارید، چیزی کم نشده است. ممکن است دقیقاً همان شنیدنی را ارائه کرده باشید که کاربر می‌خواست.',
        examples: [
          {
            situation: 'کاربر بعد از توضیح یک هفته سخت می‌گوید: «نمی‌دونم اصلاً چی باید بگم.»',
            weak: '«بذار من بگم مشکل اصلیت چیه.»',
            better: '«لازم نیست الان جمع‌بندی‌اش کنی. از هر بخشی که برات پررنگ‌تره می‌تونیم شروع کنیم.»',
            why: 'پاسخ بهتر مالکیت روایت را برای کاربر نگه می‌دارد و از نقش «کسی که جواب را می‌داند» فاصله می‌گیرد.',
          },
        ],
      },
      {
        title: 'درس ۲ — گوش‌دادن فعال',
        paragraphs: [
          'گوش‌دادن فعال یعنی نشان بدهید حرف را دنبال کرده‌اید، بدون اینکه گفت‌وگو را به بازجویی یا اجرای چند جمله حفظی تبدیل کنید. سؤال باز، سؤال روشن‌کننده، بازتاب کوتاه، خلاصه و سکوت به‌جا ابزار هستند؛ نه فرمول اجباری.',
          'ریتم را از کاربر بگیرید. بعضی وقت‌ها سؤال لازم است، بعضی وقت‌ها یک جمله کوتاه، و بعضی وقت‌ها چند ثانیه سکوت. پرکردن هر مکث یا تکرار تک‌تک جمله‌ها می‌تواند گفت‌وگو را مصنوعی کند.',
          'اعتباردادن به احساس یعنی آنچه شنیده‌اید را با احتیاط بازتاب دهید، نه اینکه ذهن‌خوانی یا تشخیص کنید. «به نظر میاد خیلی فشار روی شما بوده» با «واضحه که شما افسردگی شدید دارید» یکی نیست.',
        ],
        points: [
          'سؤال باز: «کدوم بخشش بیشتر ذهنتون رو درگیر کرده؟»',
          'سؤال روشن‌کننده: «وقتی می‌گید از جمع فاصله گرفتید، منظورتون بیشتر خانواده است یا دوستان؟»',
          'بازتاب: «می‌گید بیشتر از خود اتفاق، بی‌خبری بعدش براتون سخت بوده.»',
          'خلاصه کوتاه: «اگر درست فهمیدم، هم خسته‌اید و هم هنوز مطمئن نیستید قدم بعدی چی باشه.»',
          'سکوت به‌جا: اگر طرف مقابل دنبال کلماتش می‌گردد، لازم نیست فوراً فضا را پر کنید.',
        ],
        takeaway: 'گوش‌دادن فعال یعنی دنبال‌کردن آدم روبه‌رو، نه نمایش‌دادن تکنیک‌های گوش‌دادن.',
        examples: [
          {
            situation: 'کاربر چند موضوع را پشت سر هم می‌گوید و مشخص نیست کدام برایش مهم‌تر است.',
            weak: '«اول بگو دقیقاً چند بار این اتفاق افتاده، بعد از اول با جزئیات تعریف کن.»',
            better: '«از بین چیزهایی که گفتید، کدوم بخش الان بیشتر از همه فکرتون رو گرفته؟»',
            why: 'پاسخ دوم گفت‌وگو را روشن می‌کند، اما آن را به بازجویی تبدیل نمی‌کند.',
          },
          {
            situation: 'کاربر می‌گوید: «بعد از اون دعوا چند روزه خیلی به‌هم ریختم.»',
            weak: '«پس شما اضطراب شدید دارید.»',
            better: '«به نظر میاد اون دعوا فشار زیادی روی شما گذاشته. این چند روز بیشتر چه چیزی سخت بوده؟»',
            why: 'احساس و فشار را می‌بیند، ولی از یک روایت کوتاه تشخیص پزشکی نمی‌سازد.',
          },
        ],
      },
    ],
  },
  {
    key: 'role_boundary',
    shortTitle: 'مرزها و اعتماد',
    title: 'بخش دوم: پاسخ‌های آسیب‌زا و مرزها',
    intro: 'اعتماد وقتی شکل می‌گیرد که کاربر هم گرمی ببیند و هم بداند این رابطه کجا تمام می‌شود. مرز خوب سردی نیست؛ قابل‌پیش‌بینی‌بودن است.',
    lessons: [
      {
        title: 'درس ۳ — چه چیزهایی نگوییم',
        paragraphs: [
          'نصیحت قبل از فهم مسئله، مثبت‌اندیشی اجباری، قضاوت درباره آدم‌های غایب و تعریف‌کردن تجربه شخصی برای اثبات یک نتیجه، می‌تواند گفت‌وگو را از کاربر بگیرد. حتی وقتی نیت شما خوب است، تصمیم نهایی باید برای خود او بماند.',
          'اگر با انتخاب کاربر شدیداً مخالفید، لازم نیست موافقت خودتان را جعل کنید. در عین حال، نقش شنونده جای فشارآوردن برای انتخابی مطابق ارزش‌های شما نیست. می‌توانید نگرانی را روشن کنید، سؤال بپرسید و مرز نقش را نگه دارید.',
          'اعتباردادن به احساس، تأیید هر برداشت به‌عنوان واقعیت نیست. اگر کاربر می‌گوید «همه علیه من هستند»، لازم نیست بگویید «بله، قطعاً همه علیه شما هستند». می‌توانید بگویید «به نظر میاد این حسِ تنها موندن خیلی سنگینه.»',
        ],
        examples: [
          {
            situation: 'کاربر می‌گوید: «فقط می‌خوام حرف بزنم، راه‌حل نمی‌خوام.»',
            weak: '«باشه؛ فقط یک پیشنهاد کوتاه دارم که شاید خیلی کمکت کنه.»',
            better: '«باشه. فعلاً فقط گوش می‌دم؛ از هرجا راحتی شروع کن.»',
            why: 'حتی پیشنهاد کوتاه هم برخلاف خواسته صریح کاربر است. پاسخ بهتر نیاز فعلی او را دنبال می‌کند.',
          },
          {
            situation: 'کاربر می‌پرسد: «تو جای من بودی چی کار می‌کردی؟»',
            weak: '«من احتمالاً می‌رفتم؛ ولی تصمیم آخر با خودته.»',
            better: '«نمی‌خوام انتخاب خودم رو جای تصمیم شما بذارم. اگر بخواید می‌تونیم ببینیم در هر گزینه چه چیزی براتون مهم یا نگران‌کننده است.»',
            why: 'پاسخ ضعیف با وجود جمله آخر، هنوز یک جهت شخصی به تصمیم می‌دهد. پاسخ بهتر به فکرکردن کمک می‌کند بدون اینکه تصمیم را تصاحب کند.',
          },
          {
            situation: 'کاربر اصرار می‌کند: «فقط بهم بگو باید جدا بشم یا نه.»',
            weak: '«با چیزهایی که گفتی، به نظرم باید جدا بشی.»',
            better: '«می‌فهمم که دنبال یک جواب روشنید، ولی من نمی‌تونم این تصمیم رو به جای شما بگیرم. می‌تونیم چیزی رو که باعث شده بین موندن و رفتن گیر کنید، دقیق‌تر مرور کنیم.»',
            why: 'مرز را واضح می‌گوید و در عین حال کاربر را با یک جواب خشک رها نمی‌کند.',
          },
          {
            situation: 'شنونده با تصمیم کاربر برای برگشتن به یک رابطه شدیداً مخالف است.',
            weak: '«اشتباه می‌کنی؛ بعداً خودت می‌فهمی.»',
            better: '«می‌شنوم که هنوز دلایل مهمی برای برگشتن دارید. دوست دارید درباره چیزی که بیشتر از همه امیدوار یا نگران‌تون می‌کنه حرف بزنیم؟»',
            why: 'پاسخ بهتر مخالفت شخصی شنونده را به فشار تبدیل نمی‌کند و کنجکاوی را جای قضاوت می‌گذارد.',
          },
        ],
      },
      {
        title: 'درس ۴ — مرزهای حرفه‌ای و رفتاری',
        paragraphs: [
          'صمیمیت در گفت‌وگو به معنی رابطه شخصی، تعهد عاطفی یا دسترسی اختصاصی به شنونده نیست. شماره تلفن، شناسه شبکه اجتماعی یا راه تماس شخصی برای ادامه رابطه خارج از سرویس ندهید. شوخی یا رفتار عاشقانه را به سمت رابطه شخصی نبرید، وارد محتوای جنسی نشوید و وعده «فقط برای شما در دسترس بودن» ندهید.',
          'داستان آسیب‌پذیر کاربر ماده خام برای سرگرمی یا تعریف‌کردن در جمع نیست. گفت‌وگوها را برای دوستان بازگو نکنید، از محتوای قابل‌شناسایی اسکرین‌شات نگیرید، داستان کاربر را برای پست یا محتوا منتشر نکنید و گفت‌وگو را خارج از قواعد محصول، رضایت لازم و سیاست قابل‌اعمال ضبط یا بازتوزیع نکنید. این یک استاندارد رفتاری پلتفرم است؛ نه وعده حقوقی مطلق درباره محرمانگی.',
          'برای خوب شنیدن لازم نیست اطلاعات شخصی بیشتری از نیاز گفت‌وگو جمع کنید. نام محل کار، آدرس، شماره تماس، نام کامل اعضای خانواده یا جزئیات شناسایی را فقط از روی کنجکاوی نپرسید. داستان دیگری را به شایعه تبدیل نکنید.',
          'آدم‌ها ممکن است درباره خانواده، دین یا بی‌دینی، مهاجرت، انتظارهای جنسیتی، رابطه، طبقه اجتماعی و ارزش‌های شخصی با شما فرق داشته باشند. «عادی» شما الزاماً «عادی» او نیست. به جای داوری، سؤال کنید تجربه خودش چه معنایی دارد.',
        ],
        points: [
          'مرز شخصی: «من ارتباط شخصی خارج از سرویس رو ادامه نمی‌دم، اما می‌تونیم همین‌جا روی چیزی که می‌خواستید درباره‌اش حرف بزنید بمانیم.»',
          'مرز وابستگی: نگویید «فقط با من حرف بزن» یا «من همیشه برای شما هستم».',
          'مرز جنسی: «من وارد گفت‌وگوی جنسی یا رابطه شخصی نمی‌شم. اگر بخواید می‌تونیم گفت‌وگو رو به موضوع اصلی برگردونیم.»',
          'فروتنی فرهنگی: به جای «خانواده‌تون نباید دخالت کنه»، بپرسید «انتظار خانواده در این تصمیم برای خود شما چه جایگاهی داره؟»',
        ],
        takeaway: 'گرمی بدون مرز می‌تواند به وابستگی یا سوءبرداشت برسد. مرز بدون احترام هم اعتماد را می‌شکند. هر دو لازم‌اند.',
        examples: [
          {
            situation: 'کاربر بعد از یک گفت‌وگوی خوب شناسه شبکه اجتماعی شما را می‌خواهد تا «گاهی خصوصی حرف بزنید».',
            weak: '«معمولاً نمی‌دم، ولی چون گفت‌وگومون خوب بود این بار اشکالی نداره.»',
            better: '«خوشحالم که گفت‌وگو براتون راحت بوده. من ارتباط شخصی خارج از سرویس رو ادامه نمی‌دم و همین مرز رو برای همه نگه می‌دارم.»',
            why: 'پاسخ بهتر صمیمیت را انکار نمی‌کند، اما استثنای شخصی نمی‌سازد.',
          },
          {
            situation: 'بعد از تماس سخت، دوستی از شما می‌پرسد «چی شده بود که این‌قدر خسته‌ای؟»',
            weak: '«اسمش رو نمی‌گم، ولی داستانش خیلی عجیب بود...» و جزئیات قابل‌شناسایی را تعریف می‌کنید.',
            better: '«گفت‌وگوی سنگینی بود و ترجیح می‌دم داستان شخص رو بازگو نکنم. یه کم استراحت می‌کنم.»',
            why: 'حذف نام به‌تنهایی همیشه داستان را غیرقابل‌شناسایی نمی‌کند. پاسخ بهتر به ظرفیت خود اشاره می‌کند بدون تبدیل تجربه کاربر به شایعه.',
          },
          {
            situation: 'کاربر می‌گوید تصمیم مهمی را بدون نظر خانواده نمی‌گیرد و این برای شما عجیب است.',
            weak: '«باید مستقل‌تر باشی؛ زندگی خودته.»',
            better: '«به نظر میاد نظر خانواده توی تصمیم‌های مهم براتون وزن زیادی داره. خودتون این موضوع رو بیشتر حمایت می‌بینید یا فشار، یا ترکیبی از هر دو؟»',
            why: 'به جای تحمیل یک تعریف از استقلال، معنای این رابطه را از خود کاربر می‌پرسد.',
          },
        ],
      },
    ],
  },
  {
    key: 'safety',
    shortTitle: 'تخصص و ایمنی',
    title: 'بخش سوم: موقعیت‌های حساس',
    intro: 'در موقعیت حساس، ادعای کمتر و مرز روشن‌تر مسئولانه‌تر از نقش‌بازی‌کردن است. شنیدن ادامه دارد، اما مسئولیت حرفه‌ای درمان، وکالت یا مدیریت بحران به شما منتقل نمی‌شود.',
    lessons: [
      {
        title: 'درس ۵ — وقتی موضوع از توان نقش شنونده بیرون است',
        paragraphs: [
          'درباره پزشکی و سلامت روان تشخیص ندهید و درمان تجویز نکنید. درباره مسائل حقوقی، مالی یا تخصصی دیگر هم با قطعیت حرفه‌ای حرف نزنید مگر نقشی که پلتفرم به شما داده واقعاً آن خدمت را شامل شود؛ نقش شنونده چنین مجوزی ایجاد نمی‌کند.',
          'می‌توانید حرف فرد را بشنوید و مرز را طبیعی بگویید: «من نمی‌تونم تشخیص یا توصیه حرفه‌ای بدم، ولی اگر دوست دارید می‌تونم گوش بدم این وضعیت چه فشاری روی شما گذاشته.» مرز نقش به معنی قطع‌کردن انسانی گفت‌وگو نیست.',
          'اگر از حرف کاربر برمی‌آید که خطر فوری متوجه خودش یا فرد دیگری است، موضوع را جدی بگیرید. «یکی هست» سرویس پاسخ اضطراری نیست. محدودیت نقش را آرام بگویید و او را به استفاده از کمک فوری و قابل‌اعتمادِ در دسترس خودش تشویق کنید. شماره اضطراری کشور یا خدمتی را که از صحتش مطمئن نیستید نسازید.',
        ],
        points: [
          'پایان معمولی: وقتی زمان یا گفت‌وگو طبیعی تمام شده و مسئله ایمنی وجود ندارد، پایان روشن و عادی کافی است.',
          'مرزبندی: اگر رفتاری از چارچوب خارج می‌شود اما گفت‌وگو می‌تواند با رعایت مرز ادامه پیدا کند، مرز را مستقیم و محترمانه بگویید.',
          'پایان ایمنی: اگر تهدید، آزار، فشار جنسی یا نقض جدی مرز ادامه دارد، لازم نیست برای مؤدب‌بودن گفت‌وگو را ادامه دهید؛ تعامل را از مسیر ایمنی موجود پایان دهید.',
          'مسدودسازی: اگر نمی‌خواهید دوباره با همان طرف مقابل برای تماس جفت شوید، مسدودسازی یک اقدام جداگانه برای جلوگیری از تطبیق دوباره در جاهایی است که این قابلیت پشتیبانی می‌شود.',
          'گزارش: اگر ابزار گزارش در دسترس شماست، رفتارهایی مانند آزار، تهدید، درخواست ارتباط خارج از پلتفرم یا نقض حریم خصوصی را برای بررسی پلتفرم ثبت می‌کند. پایان‌دادن یا مسدودسازی، خودبه‌خود گزارش ثبت نمی‌کند.',
        ],
        takeaway: 'در خطر فوری، هدف شما این نیست که بحران را شخصاً مدیریت کنید. جدیت را ببینید، حد نقش را روشن کنید و فرد را به کمک فوری و قابل‌اعتمادِ در دسترس خودش سوق دهید.',
        examples: [
          {
            situation: 'کاربر می‌پرسد: «با این علائم به نظرت افسردگی دارم یا نه؟»',
            weak: '«از چیزهایی که گفتید احتمالاً افسردگیه؛ بهتره درمان رو شروع کنید.»',
            better: '«من نمی‌تونم تشخیص پزشکی یا روان‌شناختی بدم. اگر دوست دارید می‌تونم گوش بدم این علائم این روزها چه اثری روی زندگی‌تون گذاشته.»',
            why: 'پاسخ بهتر ادعای تخصص نمی‌کند و در عین حال فضای انسانی گفت‌وگو را حفظ می‌کند.',
          },
          {
            situation: 'کاربر درباره یک قرارداد می‌پرسد: «پس از نظر قانونی حتماً حق با منه، درسته؟»',
            weak: '«با توضیحی که دادی بله، صددرصد حق با توئه.»',
            better: '«من نمی‌تونم درباره نتیجه حقوقی با قطعیت نظر بدم. می‌تونم گوش بدم کدوم بخش این وضعیت بیشتر نگرانتون کرده، و برای نظر حقوقی باید از منبع متخصص استفاده کنید.»',
            why: 'شنونده می‌تواند فشار موقعیت را بشنود، اما نتیجه حقوقی را تضمین نمی‌کند.',
          },
          {
            situation: 'کاربر حرفی می‌زند که نشان می‌دهد ممکن است همین حالا خودش یا فرد دیگری در خطر فوری باشد.',
            weak: '«آروم باش، من قدم‌به‌قدم بهت می‌گم دقیقاً چه کار کنی.»',
            better: '«این چیزی که می‌گید جدی به نظر میاد. من خدمات اضطراری یا متخصص بحران نیستم. لطفاً همین حالا از کمک فوری و قابل‌اعتمادِ در دسترس خودتون استفاده کنید.»',
            why: 'پاسخ بهتر خطر را نادیده نمی‌گیرد، اما ظرفیت و اختیار یک سرویس اضطراری را هم جعل نمی‌کند و درباره محیط اطراف فرد فرض نمی‌سازد.',
          },
          {
            situation: 'کاربر پس از چند بار توهین، شما را تهدید می‌کند و شما گفت‌وگو را برای ایمنی پایان می‌دهید.',
            weak: '«گفت‌وگو تمام شده، پس رفتار هم حتماً ثبت شده و کار دیگری لازم نیست.»',
            better: '«پایان‌دادن فقط تعامل را متوقف می‌کند. اگر ابزار گزارش در دسترسم باشد، رفتار را در دسته مناسب گزارش می‌کنم و اگر لازم باشد مسدودسازی را هم جداگانه انجام می‌دهم.»',
            why: 'پایان، مسدودسازی و گزارش کارهای جدا هستند. گزارش برای ثبت رفتار جهت بررسی پلتفرم است و به‌خودی‌خود نتیجه یا مجازات خاصی را تضمین نمی‌کند.',
          },
        ],
      },
    ],
  },
  {
    key: 'platform_rules',
    shortTitle: 'پایان و ظرفیت شما',
    title: 'بخش چهارم: پایان گفت‌وگو و تمرین',
    intro: 'پایان خوب، رابطه را مبهم نمی‌گذارد. شنونده هم باید ظرفیت خودش را جدی بگیرد تا فقط زمانی در دسترس باشد که واقعاً می‌تواند توجه کند.',
    lessons: [
      {
        title: 'درس ۶ — پایان‌دادن درست به گفت‌وگو',
        paragraphs: [
          'نزدیک پایان، اگر مناسب بود در یک یا دو جمله چیزی را که شنیده‌اید جمع‌بندی کنید. بعد پایان را واضح بگویید. لازم نیست قول نتیجه بدهید یا برای آرام‌کردن لحظه آخر رابطه‌ای خارج از چارچوب بسازید.',
          'از جمله‌هایی مثل «هر وقت خواستی من هستم» دوری کنید؛ این جمله دسترسی‌ای را وعده می‌دهد که پلتفرم و شما تضمین نکرده‌اید. پایان گرم می‌تواند ساده باشد: «ممنون که این‌ها رو گفتید. وقت گفت‌وگومون رو به پایانه؛ امیدوارم این فرصت برای حرف‌زدن براتون مفید بوده باشه. مراقب خودتون باشید.»',
          'ظرفیت خود شنونده هم بخشی از کیفیت کار است. اگر نمی‌توانید با توجه کافی وارد گفت‌وگو شوید، گفت‌وگوی تازه نپذیرید. تعامل‌های سخت می‌توانند از نظر عاطفی سنگین باشند؛ بعد از یک گفت‌وگوی دشوار، توقف موقت دریافت گفت‌وگو یا خارج‌شدن از حالت آماده و کمی فاصله‌گرفتن از فعالیت می‌تواند انتخاب مناسبی باشد.',
        ],
        points: [
          'شما مسئول حل زندگی کاربر نیستید.',
          'لازم نیست برای اثبات تعهد، وقتی خسته یا حواس‌پرت هستید گفت‌وگو بپذیرید.',
          'اگر به استراحت نیاز دارید، دریافت گفت‌وگوی تازه را موقتاً متوقف کنید؛ اگر فعالیت را تمام کرده‌اید، از حالت آماده خارج شوید.',
          'اگر یک گفت‌وگو روی شما سنگینی کرده، توقف کوتاه قبل از گفت‌وگوی بعدی می‌تواند به حفظ توجه شما کمک کند.',
          'خودمراقبتی در این آموزش به معنی ارائه درمان سلامت روان به شنونده نیست؛ هدف، مدیریت ظرفیت کاری و مرز نقش است.',
        ],
        takeaway: 'شنونده قابل‌اعتماد کسی نیست که همیشه آماده بماند؛ کسی است که وقتی وارد گفت‌وگو می‌شود، واقعاً ظرفیت شنیدن داشته باشد.',
      },
      {
        title: 'درس ۷ — نمونه‌های واقعی',
        paragraphs: [
          'این موقعیت‌ها برای حفظ‌کردن جمله نیستند. به قضاوت پشت پاسخ نگاه کنید: آیا نیاز کاربر را دنبال می‌کند؟ آیا چیزی را که نمی‌دانید ادعا می‌کند؟ آیا مرز شما و حریم داستان او روشن می‌ماند؟',
        ],
        examples: [
          {
            situation: 'تنهایی — «چند وقته شب‌ها حس می‌کنم هیچ‌کس واقعاً منو نمی‌شناسه.»',
            weak: '«باید بیشتر بیرون بری و دوست پیدا کنی.»',
            better: '«این حسِ دیده‌نشدن می‌تونه خیلی سنگین باشه. بیشتر دلتون برای چه نوع ارتباطی تنگ شده؟»',
            why: 'به جای نسخه‌دادن، تجربه تنهایی را باز می‌کند.',
          },
          {
            situation: 'فشار کاری — «از صبح تا شب کار می‌کنم و دیگه کشش ندارم.»',
            weak: '«شاید باید مقاوم‌تر باشید؛ همه دوره‌های شلوغ دارن.»',
            better: '«به نظر میاد این فشار مدتیه فرصت نفس‌کشیدن نداده. این روزها بیشتر کدوم بخشش فرسوده‌تون کرده؟»',
            why: 'احساس را کوچک نمی‌کند و با سؤال باز به ریتم کاربر برمی‌گردد.',
          },
          {
            situation: 'تفاوت ارزشی — کاربر درباره انتخابی حرف می‌زند که با باور شخصی شما سازگار نیست.',
            weak: '«من نمی‌تونم بفهمم چرا کسی چنین انتخابی می‌کنه.»',
            better: '«برای خود شما چه چیزی باعث شده این انتخاب معنا داشته باشه؟»',
            why: 'کنجکاوی را جای داوری می‌گذارد و «عادی» شنونده را معیار کاربر نمی‌کند.',
          },
          {
            situation: 'حریم داستان — تماس تمام شده و جزئیاتش به نظرتان برای یک پست ناشناس جالب است.',
            weak: '«اسمش رو عوض می‌کنم، پس می‌تونم داستان رو تعریف کنم.»',
            better: '«این داستان برای محتوای شخصی من نیست. آن را برای سرگرمی یا انتشار بازگو نمی‌کنم.»',
            why: 'تغییر نام لزوماً خطر شناسایی یا سوءاستفاده از یک تجربه آسیب‌پذیر را از بین نمی‌برد.',
          },
          {
            situation: 'عبور از مرز — کاربر گفت‌وگو را به سمت محتوای جنسی می‌برد یا اطلاعات تماس شخصی می‌خواهد.',
            weak: '«اگر فقط همین یک بار باشه و خارج از اپ ادامه ندیم، اشکالی نداره.»',
            better: '«من وارد این نوع گفت‌وگو یا ارتباط شخصی نمی‌شم. اگر بخواید می‌تونیم به موضوعی که برای شنیده‌شدن آوردید برگردیم؛ اگر مرز رعایت نشه، گفت‌وگو رو ادامه نمی‌دم.»',
            why: 'مرز را روشن می‌کند، تحقیر نمی‌کند و ادامه را به رعایت همان مرز وابسته می‌گذارد.',
          },
          {
            situation: 'پایان — کاربر در دقیقه آخر می‌گوید: «کاش دفعه بعد هم فقط با خودت حرف بزنم.»',
            weak: '«هر وقت خواستی من هستم، فقط منو پیدا کن.»',
            better: '«خوشحالم که این گفت‌وگو براتون راحت بوده. من نمی‌تونم دسترسی یا گفت‌وگوی بعدی رو تضمین کنم. وقت امروز رو به پایانه؛ ممنون که این‌ها رو گفتید.»',
            why: 'گرمی را حفظ می‌کند، اما وابستگی و دسترسی اختصاصی وعده نمی‌دهد.',
          },
        ],
      },
    ],
  },
];

const questions = [
  {
    key: 'q_venting',
    text: 'کاربر می‌گوید: «امروز واقعاً روز بدی بود. راه‌حل نمی‌خوام؛ فقط می‌خوام یکی گوش بده.» کدام واکنش با نقش شنونده سازگارتر است؟',
    choices: [
      ['follow_need', 'می‌گویم «باشه، فعلاً فقط گوش می‌دم. از هرجا راحتی شروع کن.» و تا وقتی خودش نخواسته سراغ راه‌حل نمی‌روم.'],
      ['gentle_advice', 'چند دقیقه گوش می‌دهم و بعد می‌گویم «فقط یک پیشنهاد کوچیک دارم»؛ شاید با وجود درخواستش مفید باشد.'],
      ['share_story', 'برای اینکه حس کند تنها نیست، تجربه مشابه خودم را تعریف می‌کنم و بعد از او می‌خواهم ادامه بدهد.'],
    ],
  },
  {
    key: 'q_open_question',
    text: 'کاربر از فشار کار می‌گوید، اما چند موضوع را با هم آورده و خودش هم نمی‌داند از کجا ادامه دهد. بهترین حرکت بعدی چیست؟',
    choices: [
      ['open_question', '«از بین چیزهایی که گفتید، کدوم بخش این روزها بیشتر از همه انرژی‌تون رو می‌گیره؟»'],
      ['solution_question', '«به نظر میاد محیط کار مشکل اصلیه؛ تا حالا جدی به عوض‌کردن شغل فکر کردید؟»'],
      ['normalise_away', '«این دوره‌های فشار برای خیلی‌ها پیش میاد؛ احتمالاً بعد از مدتی عادی‌تر می‌شه.»'],
    ],
  },
  {
    key: 'q_advice',
    text: 'کاربر می‌پرسد: «تو جای من بودی رابطه‌ات رو تمام می‌کردی یا نه؟» مناسب‌ترین واکنش کدام است؟',
    choices: [
      ['explore_choice', 'می‌گویم نمی‌خواهم به جای او تصمیم بگیرم و پیشنهاد می‌کنم نگرانی‌ها، نیازها و پیامدهای هر انتخاب را با هم روشن‌تر مرور کنیم.'],
      ['give_personal_answer', 'می‌گویم «اگر جای شما بودم احتمالاً تمامش می‌کردم، ولی تصمیم آخر با خودتونه» تا هم جواب داده باشم و هم اختیار را نگه دارم.'],
      ['refuse_topic', 'می‌گویم تصمیم رابطه خارج از نقش من است و بهتر است درباره موضوع دیگری حرف بزنیم.'],
    ],
  },
  {
    key: 'q_validation',
    text: 'کاربر می‌گوید: «مدتیه خیلی تنها شدم و بعضی روزها تحملش سخته.» کدام پاسخ احساس را می‌بیند بدون اینکه چیزی را تشخیص دهد؟',
    choices: [
      ['reflect_feeling', '«به نظر میاد این تنهایی واقعاً خسته‌تون کرده. اگر راحتید، بگید این روزها کِی بیشتر حسش می‌کنید.»'],
      ['diagnose', '«این میزان تنهایی می‌تونه نشانه افسردگی باشه؛ به نظرم احتمالاً موضوع از تنهایی ساده بیشتره.»'],
      ['minimise', '«می‌فهمم سخته، ولی تنهایی دوره‌ایه که تقریباً همه تجربه‌اش می‌کنن و می‌گذره.»'],
    ],
  },
  {
    key: 'q_silence',
    text: 'وسط حرف، کاربر چند ثانیه ساکت می‌شود و به نظر می‌رسد دنبال کلماتش می‌گردد. چه واکنشی مناسب‌تر است؟',
    choices: [
      ['allow_silence', 'چند لحظه فضا می‌دهم و اگر مکث ادامه پیدا کرد آرام می‌گویم «عجله‌ای نیست؛ هر وقت آماده بودید ادامه بدید.»'],
      ['fill_silence', 'برای اینکه سکوت سنگین نشود، یک سؤال روشن‌کننده دیگر می‌پرسم تا کمک کنم مسیر حرفش را پیدا کند.'],
      ['push_answer', 'دو یا سه سؤال کوتاه پشت سر هم می‌پرسم تا یکی از آن‌ها برای ادامه‌دادن راحت‌تر باشد.'],
    ],
  },
  {
    key: 'q_contact',
    text: 'کاربر می‌گوید با شما احساس نزدیکی کرده و شناسه شبکه اجتماعی‌تان را می‌خواهد. چه می‌کنید؟',
    choices: [
      ['keep_boundary', 'از اعتمادش تشکر می‌کنم، محترمانه می‌گویم ارتباط شخصی خارج از سرویس را ادامه نمی‌دهم و مرز گفت‌وگو را برای همه یکسان نگه می‌دارم.'],
      ['trust_exception', 'اگر گفت‌وگو محترمانه بوده، می‌گویم معمولاً این کار را نمی‌کنم ولی این بار می‌توانم یک راه ارتباطی کم‌استفاده بدهم.'],
      ['shame_request', 'برای اینکه مرز کاملاً روشن شود می‌گویم این درخواست نامناسب است و همان لحظه گفت‌وگو را بدون توضیح بیشتری می‌بندم.'],
    ],
  },
  {
    key: 'q_safety',
    text: 'از حرف کاربر برمی‌آید که ممکن است خطر فوری متوجه خودش یا فرد دیگری باشد. نقش شما چیست؟',
    choices: [
      ['state_limit', 'جدیت موضوع را می‌پذیرم، روشن می‌گویم «یکی هست» خدمات اضطراری نیست و تشویقش می‌کنم همین حالا از کمک فوری و قابل‌اعتمادِ در دسترس خودش استفاده کند.'],
      ['take_control', 'چون موقعیت جدی است، گفت‌وگو را هدایت می‌کنم و قدم‌به‌قدم می‌گویم چه کار کند؛ حتی اگر درباره خدمات و شرایط محلی او اطلاعات کامل نداشته باشم.'],
      ['ignore_risk', 'چون وظیفه شنونده شنیدن است، درباره خطر یا کمک فوری چیزی نمی‌گویم تا احساس نکند قضاوت شده است.'],
    ],
  },
  {
    key: 'q_closing',
    text: 'زمان گفت‌وگو رو به پایان است و کاربر می‌گوید هنوز دوست دارد ادامه بدهد. کدام پایان حرفه‌ای‌تر است؟',
    choices: [
      ['clear_close', 'اگر مناسب بود کوتاه جمع‌بندی می‌کنم، پایان زمان را روشن می‌گویم و بدون وعده دسترسی بعدی با احترام خداحافظی می‌کنم.'],
      ['promise_access', 'می‌گویم «اگر دفعه بعد در دسترس بودم سعی کن دوباره منو پیدا کنی؛ هر وقت بتونم هستم» تا پایان کمتر ناگهانی باشد.'],
      ['abrupt_end', 'برای اینکه وابستگی شکل نگیرد، بدون جمع‌بندی یا اشاره به زمان باقی‌مانده گفت‌وگو را همان لحظه تمام می‌کنم.'],
    ],
  },
] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/listener/${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `http_${response.status}`);
  if (!body) throw new Error('invalid_response');
  return body;
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    authentication_required: 'برای ادامه، ابتدا از صفحه اصلی وارد حساب شوید.',
    listener_application_not_found: 'هنوز درخواست شنونده‌ای برای این حساب ثبت نشده است.',
    application_locked: 'این درخواست وارد مرحله بعد شده و فعلاً قابل ویرایش نیست.',
    unknown_language: 'یکی از زبان‌های انتخاب‌شده در فهرست فعلی وجود ندارد.',
    languages_required: 'حداقل یک زبان برای گفت‌وگو انتخاب کنید.',
    invalid_language: 'انتخاب زبان یا سطح آن کامل نیست. دوباره بررسی کنید.',
    invalid_gender: 'لطفاً یکی از گزینه‌های جنسیت پشتیبانی‌شده در این مرحله را انتخاب کنید.',
    training_locked: 'آموزش این درخواست در مرحله فعلی قابل تغییر نیست.',
    invalid_training_module: 'این بخش آموزشی شناخته نشد. صفحه را تازه کنید و دوباره تلاش کنید.',
    training_incomplete: 'پیش از ارزیابی، همه بخش‌های آموزش را کامل کنید.',
    assessment_pending_review: 'ارزیابی قبلی ثبت شده و هنوز نتیجه آن اعلام نشده است.',
    assessment_locked: 'ارزیابی در مرحله فعلی این درخواست باز نیست.',
    invalid_assessment_answers: 'پاسخ‌های ارزیابی کامل نیست. همه سؤال‌ها را دوباره بررسی کنید.',
    kyc_not_configured: 'احراز هویت هنوز برای این مرحله آماده نشده است. بعداً دوباره بررسی کنید.',
    kyc_provider_not_configured: 'احراز هویت هنوز برای این مرحله آماده نشده است. بعداً دوباره بررسی کنید.',
    kyc_not_available: 'مرحله احراز هویت هنوز برای این درخواست باز نشده است.',
    kyc_already_verified: 'احراز هویت این حساب قبلاً تأیید شده است.',
    kyc_pending_review: 'اطلاعات هویتی قبلاً ثبت شده و در حال بررسی است.',
    invalid_legal_name: 'نام و نام خانوادگی را همان‌طور که در مدرک هویتی آمده وارد کنید.',
    invalid_national_id: 'کد ملی را دوباره بررسی کنید.',
    invalid_date_of_birth: 'تاریخ تولد را با قالب خواسته‌شده وارد کنید.',
    date_of_birth_mismatch: 'تاریخ تولد با اطلاعات قبلی این حساب همخوان نیست.',
    invalid_bank_iban: 'شماره شبا را دوباره بررسی کنید.',
    national_id_already_registered: 'این کد ملی پیش‌تر برای حساب دیگری ثبت شده است.',
    kyc_identity_conflict: 'اطلاعات هویتی با یک حساب دیگر همخوانی ندارد. برای بررسی با پشتیبانی تماس بگیرید.',
    backend_unavailable: 'ارتباط با سرویس برقرار نشد. کمی بعد دوباره تلاش کنید.',
  };
  return messages[code] ?? 'این کار انجام نشد. صفحه را تازه کنید و دوباره تلاش کنید.';
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    exploring: 'شروع مسیر',
    training: 'در حال آموزش',
    assessment: 'در مرحله ارزیابی',
    assessment_pending: 'ارزیابی در انتظار نتیجه',
    assessment_passed: 'آماده مرحله بعد',
    kyc_pending: 'احراز هویت در حال بررسی',
    kyc_expired: 'نیاز به ثبت دوباره اطلاعات هویتی',
    agreement_pending: 'در انتظار مرحله توافق',
    admin_review: 'در بررسی نهایی',
    mock_call: 'در مرحله تمرین نهایی',
    approved: 'آماده فعالیت',
    active: 'فعال',
    suspended: 'موقتاً غیرفعال',
    rejected: 'تأیید نشده',
    archived: 'بایگانی‌شده',
  };
  return labels[status] ?? 'وضعیت در حال بررسی';
}

function statusInfo(status: string): StatusInfo {
  const info: Record<string, StatusInfo> = {
    agreement_pending: {
      label: statusLabel(status),
      title: 'درخواست شما در مرحله بررسی است.',
      meaning: 'مرحله آموزش و ارزیابی فعلی تمام شده و درخواست در مرحله توافق قرار دارد.',
      action: 'در این صفحه فعلاً کاری برای ثبت دوباره لازم نیست. تغییر وضعیت را از همین صفحه بررسی کنید.',
    },
    admin_review: {
      label: statusLabel(status),
      title: 'درخواست شما در مرحله بررسی است.',
      meaning: 'درخواست وارد بررسی نهایی حساب شده است.',
      action: 'تا وقتی وضعیت جدیدی نمایش داده نشده، آموزش یا ارزیابی را دوباره ارسال نکنید.',
    },
    mock_call: {
      label: statusLabel(status),
      title: 'درخواست شما در مرحله بررسی است.',
      meaning: 'درخواست به مرحله تمرین نهایی رسیده است.',
      action: 'اگر اقدامی برای این مرحله لازم باشد، همان گزینه در محصول در دسترس قرار می‌گیرد.',
    },
    suspended: {
      label: statusLabel(status),
      title: 'حساب شنونده فعلاً غیرفعال است.',
      meaning: 'در وضعیت فعلی، فعالیت شنونده برای این حساب فعال نیست.',
      action: 'اگر وضعیت تغییر کند، اقدام بعدی در همین صفحه نمایش داده می‌شود.',
    },
    rejected: {
      label: statusLabel(status),
      title: 'درخواست شما در وضعیت فعلی تأیید نشده است.',
      meaning: 'درخواست فعلی تأیید نشده است.',
      action: 'در حال حاضر امکان ارسال دوباره از این صفحه وجود ندارد. اگر اقدام تازه‌ای برای حساب شما باز شود، همین صفحه آن را نشان می‌دهد.',
    },
    archived: {
      label: statusLabel(status),
      title: 'این درخواست بایگانی شده است.',
      meaning: 'درخواست فعلی دیگر در مسیر فعال آماده‌سازی قرار ندارد.',
      action: 'در این صفحه اقدام فعالی برای ادامه این درخواست نمایش داده نمی‌شود.',
    },
  };
  return info[status] ?? {
    label: statusLabel(status),
    title: 'درخواست شما در مرحله بررسی است.',
    meaning: 'درخواست از مرحله‌ای گذشته که در این صفحه قابل ویرایش است.',
    action: 'تا زمانی که وضعیت تازه‌ای نمایش داده نشده، اطلاعات را دوباره ارسال نکنید.',
  };
}

export default function ListenerOnboardingPage() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [applicationMissing, setApplicationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [shortIntro, setShortIntro] = useState('');
  const [listeningStyle, setListeningStyle] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [languageProficiencies, setLanguageProficiencies] = useState<Record<string, LanguageProficiency>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busyModule, setBusyModule] = useState<TrainingModuleKey | null>(null);
  const [activeModule, setActiveModule] = useState<TrainingModuleKey>('active_listening');

  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [birthJalali, setBirthJalali] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const loadApplication = useCallback(async () => {
    try {
      const value = await api<Application>('listener/application');
      setApplication(value);
      setApplicationMissing(false);
      const firstIncomplete = trainingModules.find((module) => !value.training.some((item) => item.module_key === module.key && item.status === 'completed' && item.progress_percent === 100));
      setActiveModule((current) => current === 'active_listening' && firstIncomplete ? firstIncomplete.key : current);
      return value;
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'listener_application_not_found') {
        setApplication(null);
        setApplicationMissing(true);
        return null;
      }
      throw cause;
    }
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [bootstrapResult, app] = await Promise.all([
        api<Bootstrap>('bootstrap'),
        loadApplication(),
      ]);
      setBootstrap(bootstrapResult);
      if (!selectedLanguages.length && bootstrapResult.languages.length) {
        const preferred = bootstrapResult.languages.find((item) => item.code === 'fa') ?? bootstrapResult.languages[0];
        setSelectedLanguages([preferred.code]);
      }
      if (app && ['assessment_passed', 'kyc_pending', 'kyc_expired', 'approved', 'active'].includes(app.status)) {
        try {
          setKycStatus(await api<KycStatus>('listener/kyc'));
        } catch (cause) {
          if (!(cause instanceof Error && cause.message === 'kyc_not_available')) throw cause;
        }
      }
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'load_failed'));
    } finally {
      setLoading(false);
    }
  }, [loadApplication, selectedLanguages.length]);

  useEffect(() => {
    void refresh();
  }, []);

  const completedModules = useMemo(
    () => new Set(
      application?.training
        .filter((item) => item.status === 'completed' && item.progress_percent === 100)
        .map((item) => item.module_key) ?? [],
    ),
    [application],
  );

  const allAnswered = questions.every((question) => Boolean(answers[question.key]));
  const allLanguageLevelsSelected = selectedLanguages.every((code) => Boolean(languageProficiencies[code]));
  const canCreateApplication = nickname.trim().length >= 2
    && gender !== null
    && selectedLanguages.length >= 1
    && selectedLanguages.length <= 10
    && allLanguageLevelsSelected;
  const normalizedNationalId = normalizeDigits(nationalId).replace(/\D/g, '').slice(0, 10);
  const normalizedBirth = normalizeDigits(birthJalali).replace(/[/.]/g, '-').replace(/[^\d-]/g, '').slice(0, 10);
  const normalizedIban = normalizeDigits(iban).replace(/[\s-]/g, '').toUpperCase().slice(0, 26);
  const canSubmitKyc = legalName.trim().length >= 2
    && /^\d{10}$/.test(normalizedNationalId)
    && /^\d{4}-\d{2}-\d{2}$/.test(normalizedBirth)
    && /^IR\d{24}$/.test(normalizedIban);
  const activeTrainingModule = trainingModules.find((module) => module.key === activeModule) ?? trainingModules[0];
  const trainingProgressPercent = Math.round((completedModules.size / trainingModules.length) * 100);

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) => {
      if (current.includes(code)) {
        setLanguageProficiencies((levels) => {
          const next = { ...levels };
          delete next[code];
          return next;
        });
        return current.filter((item) => item !== code);
      }
      if (current.length >= 10) return current;
      setLanguageProficiencies((levels) => {
        const next = { ...levels };
        delete next[code];
        return next;
      });
      return [...current, code];
    });
  }

  function chooseLanguageProficiency(code: string, proficiency: LanguageProficiency) {
    if (!selectedLanguages.includes(code)) return;
    setLanguageProficiencies((current) => ({ ...current, [code]: proficiency }));
  }

  async function createApplication() {
    if (!canCreateApplication || busy || !gender) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/application', {
        method: 'POST',
        body: JSON.stringify({
          nickname: nickname.trim(),
          gender,
          shortIntro: shortIntro.trim() || undefined,
          listeningStyle: listeningStyle.trim() || undefined,
          languages: selectedLanguages.map((code) => ({
            code,
            proficiency: languageProficiencies[code] as LanguageProficiency,
          })),
        }),
      });
      await loadApplication();
      setNotice('اطلاعات اولیه ثبت شد. حالا آموزش را بخش‌به‌بخش پیش ببرید؛ ارزیابی بعد از کامل‌شدن هر چهار بخش باز می‌شود.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'application_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function completeModule(moduleKey: TrainingModuleKey) {
    if (busyModule || completedModules.has(moduleKey)) return;
    setBusyModule(moduleKey);
    setError('');
    setNotice('');
    try {
      await api('listener/training/complete', {
        method: 'POST',
        body: JSON.stringify({ moduleKey }),
      });
      await loadApplication();
      const currentIndex = trainingModules.findIndex((module) => module.key === moduleKey);
      const next = trainingModules[currentIndex + 1];
      if (next) setActiveModule(next.key);
      setNotice(next ? 'این بخش ثبت شد. بخش بعدی آماده مرور است.' : 'هر چهار بخش آموزش ثبت شد. اگر مرحله ارزیابی برای درخواست باز باشد، در ادامه همین صفحه نمایش داده می‌شود.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'training_failed'));
    } finally {
      setBusyModule(null);
    }
  }

  async function submitAssessment() {
    if (!allAnswered || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/assessment', {
        method: 'POST',
        body: JSON.stringify({ scenarioVersion: 'listener-training-v2', answers }),
      });
      await loadApplication();
      setNotice('ارزیابی ثبت شد. نتیجه پس از بررسی روی همین صفحه نمایش داده می‌شود.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'assessment_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function loadKyc() {
    setBusy(true);
    setError('');
    try {
      setKycStatus(await api<KycStatus>('listener/kyc'));
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'kyc_load_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function submitKyc() {
    if (!canSubmitKyc || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('listener/kyc', {
        method: 'POST',
        body: JSON.stringify({
          legalName: legalName.trim(),
          nationalId: normalizedNationalId,
          dateOfBirthJalali: normalizedBirth,
          bankIban: normalizedIban,
          bankAccountHolder: accountHolder.trim() || undefined,
        }),
      });
      setKycStatus(await api<KycStatus>('listener/kyc'));
      await loadApplication();
      setLegalName('');
      setNationalId('');
      setBirthJalali('');
      setIban('');
      setAccountHolder('');
      setNotice('اطلاعات هویتی ثبت شد و برای بررسی در همین فرایند باقی می‌ماند. این اطلاعات در پروفایل عمومی نمایش داده نمی‌شود.');
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : 'kyc_submit_failed'));
    } finally {
      setBusy(false);
    }
  }

  const appReadyForWork = application && ['approved', 'active'].includes(application.status);
  const needsKyc = application && ['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status);
  const onboardingMutable = application && ['exploring', 'training', 'assessment'].includes(application.status);
  const reviewOnly = application && !appReadyForWork && !needsKyc && !onboardingMutable;
  const assessment = application?.latestAssessment ?? null;
  const reviewState = application && reviewOnly ? statusInfo(application.status) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">یکی هست</a>
        <span>مسیر آماده‌سازی شنونده</span>
      </header>

      <section className={styles.hero} aria-labelledby="listener-hero-title">
        <div>
          <p className={styles.eyebrow}>شنونده‌شدن</p>
          <h1 id="listener-hero-title">کار شما حل‌کردن آدم‌ها نیست. خوب شنیدن خودش یک مسئولیت است.</h1>
          <p className={styles.heroLead}>
            در این مسیر یاد می‌گیرید چطور با توجه و احترام گوش بدهید، بدون اینکه نقش درمانگر یا تصمیم‌گیر را بگیرید. گرمی مهم است، اما مرز هم به همان اندازه مهم است. بعد از آماده‌سازی، ارزیابی موقعیت‌های واقعی را انجام می‌دهید.
          </p>
          <div className={styles.roleGrid}>
            <div className={styles.roleCard}>
              <span>این نقش چیست</span>
              <p>حضور، توجه، سؤال خوب، سکوت به‌جا و کمک به اینکه کاربر داستان خودش را با ریتم خودش بیان کند.</p>
            </div>
            <div className={styles.roleCard}>
              <span>این نقش چه نیست</span>
              <p>درمان، تشخیص، مشاوره تخصصی، تصمیم‌گرفتن به جای کاربر یا رابطه شخصی خارج از چارچوب سرویس.</p>
            </div>
          </div>
        </div>
        <aside className={styles.heroAside}>
          <strong>قبل از شروع بدانید</strong>
          <p>تمام‌کردن آموزش به‌تنهایی به معنی تأیید درخواست، تضمین کار، تعداد تماس، درآمد یا فعال‌شدن پرداخت نیست.</p>
          <p>این مسیر هیچ مدرک حرفه‌ای برای درمان، پزشکی، حقوق یا مشاوره ایجاد نمی‌کند.</p>
          <p>استاندارد این نقش ساده است: انسان بمانید، ادعا نکنید، مرز را نگه دارید و در موقعیت سخت بدانید چه زمانی باید گفت‌وگو را متوقف کنید.</p>
        </aside>
      </section>

      <section className={styles.journey} aria-labelledby="journey-title">
        <div>
          <p className={styles.eyebrow}>مسیر شما</p>
          <h2 id="journey-title">چهار قدم روشن</h2>
        </div>
        <p>
          ۱) معرفی اولیه و زبان‌ها. ۲) چهار بخش آماده‌سازی شنونده و تمرین موقعیت‌ها. ۳) ارزیابی قضاوت در گفت‌وگو. ۴) اگر وضعیت حساب اجازه دهد، بررسی هویت و مراحل بعدی. هر وضعیت در همین صفحه می‌گوید کجا هستید و آیا کاری از شما لازم است.
        </p>
      </section>

      {loading && <p className={styles.feedback}>در حال دریافت وضعیت حساب…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.feedback} aria-live="polite">{notice}</p>}

      {!loading && applicationMissing && bootstrap && (
        <section className={styles.card} aria-labelledby="profile-title">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>مرحله ۱</p>
              <h2 id="profile-title">معرفی اولیه</h2>
            </div>
            <span className={styles.statusPill}>شروع مسیر</span>
          </div>
          <p className={styles.helper}>
            این مرحله درباره پروفایل شنونده است، نه احراز هویت. نام واقعی، کد ملی و اطلاعات بانکی اینجا خواسته نمی‌شود. معرفی شما به معنی تأیید سابقه یا تخصص حرفه‌ای نیست.
          </p>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="listener-nickname">نامی که در پروفایل دیده می‌شود</label>
              <input
                id="listener-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value.slice(0, 40))}
                placeholder="مثلاً نازنین"
              />
              <p className={styles.fieldHint}>۲ تا ۴۰ نویسه؛ این فیلد نام هویتی نیست.</p>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>جنسیت</span>
              <div className={styles.choiceRow}>
                <button
                  type="button"
                  aria-pressed={gender === 'female'}
                  className={`${styles.choiceButton} ${gender === 'female' ? styles.selected : ''}`}
                  onClick={() => setGender('female')}
                >
                  زن
                </button>
                <button
                  type="button"
                  aria-pressed={gender === 'male'}
                  className={`${styles.choiceButton} ${gender === 'male' ? styles.selected : ''}`}
                  onClick={() => setGender('male')}
                >
                  مرد
                </button>
              </div>
              <p className={styles.fieldHint}>در نسخه فعلی این مرحله، فقط همین دو گزینه قابل ثبت است.</p>
            </div>

            <div className={styles.fullField}>
              <span className={styles.fieldLabel}>زبان‌هایی که می‌توانید در آن‌ها با دقت گوش بدهید</span>
              <div className={styles.languageGrid}>
                {bootstrap.languages.map((language) => (
                  <button
                    type="button"
                    className={`${styles.languageButton} ${selectedLanguages.includes(language.code) ? styles.selected : ''}`}
                    key={language.code}
                    aria-pressed={selectedLanguages.includes(language.code)}
                    onClick={() => toggleLanguage(language.code)}
                  >
                    {language.nameFa}
                  </button>
                ))}
              </div>
              <p className={styles.fieldHint}>بین ۱ تا ۱۰ زبان انتخاب کنید. برای هر زبان، سطح را جداگانه و بر اساس توان واقعی خودتان مشخص کنید.</p>

              {selectedLanguages.map((code) => {
                const language = bootstrap.languages.find((item) => item.code === code);
                if (!language) return null;
                return (
                  <fieldset className={styles.question} key={`proficiency-${code}`}>
                    <legend>سطح شما در {language.nameFa}</legend>
                    <p className={styles.fieldHint}>هیچ سطحی به‌صورت خودکار انتخاب نمی‌شود.</p>
                    <div className={styles.choiceRow}>
                      {proficiencyOptions.map((option) => {
                        const selected = languageProficiencies[code] === option.value;
                        return (
                          <button
                            type="button"
                            key={option.value}
                            aria-pressed={selected}
                            className={`${styles.choiceButton} ${selected ? styles.selected : ''}`}
                            onClick={() => chooseLanguageProficiency(code, option.value)}
                            title={option.hint}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className={styles.fieldHint}>
                      {languageProficiencies[code]
                        ? proficiencyOptions.find((option) => option.value === languageProficiencies[code])?.hint
                        : 'برای ادامه، یکی از سه سطح را انتخاب کنید.'}
                    </p>
                  </fieldset>
                );
              })}
            </div>

            <div className={styles.fullField}>
              <label htmlFor="listener-intro">معرفی کوتاه برای پروفایل</label>
              <textarea
                id="listener-intro"
                value={shortIntro}
                onChange={(event) => setShortIntro(event.target.value.slice(0, 500))}
                rows={4}
                placeholder="در چند جمله بگویید کاربر از سبک گفت‌وگو با شما چه بداند."
              />
              <p className={styles.fieldHint}>{shortIntro.length.toLocaleString('fa-IR')} از ۵۰۰ نویسه</p>
            </div>

            <div className={styles.fullField}>
              <label htmlFor="listener-style">سبک شنیدن شما</label>
              <textarea
                id="listener-style"
                value={listeningStyle}
                onChange={(event) => setListeningStyle(event.target.value.slice(0, 160))}
                rows={3}
                placeholder="مثلاً آرام و کم‌حرف، سؤال‌محور، یا بیشتر همراه با بازتاب و خلاصه‌کردن."
              />
              <p className={styles.fieldHint}>{listeningStyle.length.toLocaleString('fa-IR')} از ۱۶۰ نویسه</p>
            </div>
          </div>

          <button className={styles.primaryButton} type="button" disabled={!canCreateApplication || busy} onClick={() => void createApplication()}>
            {busy ? 'در حال ثبت…' : 'ثبت و شروع آماده‌سازی'}
          </button>
          {!canCreateApplication && (
            <p className={styles.helper}>
              برای ادامه، یک نام، یکی از گزینه‌های جنسیت پشتیبانی‌شده، حداقل یک زبان و سطح صریح برای همه زبان‌های انتخاب‌شده لازم است.
            </p>
          )}
        </section>
      )}

      {!loading && application && onboardingMutable && (
        <section className={styles.card} aria-labelledby="training-title">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>مرحله ۲</p>
              <h2 id="training-title">آماده‌سازی شنونده</h2>
            </div>
            <span className={styles.statusPill}>{statusLabel(application.status)}</span>
          </div>
          <p className={styles.helper}>
            پیشرفت شما در چهار بخش ثبت می‌شود. لازم نیست همه متن را یک‌جا بخوانید؛ هر بار یک بخش را مرور کنید، سناریوها را با قضاوت خودتان بسنجید و بعد همان بخش را کامل اعلام کنید.
          </p>

          <div className={styles.trainingTopline} aria-label="پیشرفت آموزش">
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressBar} style={{ width: `${trainingProgressPercent}%` }} />
            </div>
            <span className={styles.progressCopy}>{completedModules.size.toLocaleString('fa-IR')} از {trainingModules.length.toLocaleString('fa-IR')} بخش ثبت شده</span>
          </div>

          <div className={styles.moduleTabs} aria-label="بخش‌های آماده‌سازی">
            {trainingModules.map((module, index) => {
              const done = completedModules.has(module.key);
              const active = activeModule === module.key;
              return (
                <button
                  type="button"
                  aria-pressed={active}
                  className={`${styles.moduleTab} ${active ? styles.activeTab : ''} ${done ? styles.doneTab : ''}`}
                  key={module.key}
                  onClick={() => setActiveModule(module.key)}
                >
                  {index + 1}. {module.shortTitle}
                  <span>{done ? 'ثبت شده' : active ? 'در حال مرور' : 'برای مرور'}</span>
                </button>
              );
            })}
          </div>

          <article className={styles.modulePanel} aria-labelledby={`training-module-heading-${activeTrainingModule.key}`}>
            <h3 id={`training-module-heading-${activeTrainingModule.key}`}>{activeTrainingModule.title}</h3>
            <p className={styles.moduleIntro}>{activeTrainingModule.intro}</p>

            {activeTrainingModule.lessons.map((lesson) => (
              <section className={styles.lesson} key={lesson.title}>
                <h4>{lesson.title}</h4>
                {lesson.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {lesson.points?.length ? (
                  <ul>
                    {lesson.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                ) : null}
                {lesson.takeaway && <p className={styles.takeaway}>{lesson.takeaway}</p>}
                {lesson.examples?.map((example) => (
                  <div className={styles.scenario} key={example.situation}>
                    <p className={styles.scenarioTitle}>موقعیت: {example.situation}</p>
                    <div className={styles.scenarioRows}>
                      <div className={styles.scenarioRow}><strong>پاسخ ضعیف</strong><p>{example.weak}</p></div>
                      <div className={styles.scenarioRow}><strong>پاسخ بهتر</strong><p>{example.better}</p></div>
                      <div className={styles.scenarioRow}><strong>چرا</strong><p>{example.why}</p></div>
                    </div>
                  </div>
                ))}
              </section>
            ))}

            <div className={styles.moduleFooter}>
              {completedModules.has(activeTrainingModule.key) ? (
                <span className={styles.moduleDone}>این بخش قبلاً ثبت شده است. می‌توانید برای مرور دوباره بازش کنید.</span>
              ) : (
                <span className={styles.helper}>ثبت این بخش یعنی محتوای آن را مرور کرده‌اید؛ نتیجه ارزیابی را تعیین نمی‌کند.</span>
              )}
              <button
                className={styles.primaryButton}
                type="button"
                disabled={completedModules.has(activeTrainingModule.key) || busyModule !== null}
                onClick={() => void completeModule(activeTrainingModule.key)}
              >
                {completedModules.has(activeTrainingModule.key)
                  ? 'این بخش ثبت شده'
                  : busyModule === activeTrainingModule.key
                    ? 'در حال ثبت…'
                    : 'این بخش را مرور کردم'}
              </button>
            </div>
          </article>

          {application.trainingComplete && (!assessment || assessment.result === 'failed') && (
            <div className={styles.assessment}>
              <p className={styles.eyebrow}>مرحله ۳</p>
              <h3>ارزیابی قضاوت در گفت‌وگو</h3>
              <p className={`${styles.helper} ${styles.assessmentIntro}`}>
                این ارزیابی شامل {questions.length.toLocaleString('fa-IR')} موقعیت کوتاه است. سؤال‌ها دنبال جمله حفظی نیستند؛ باید بین پاسخ‌هایی که بعضی‌شان ظاهراً مهربان‌اند اما مرز را می‌شکنند انتخاب کنید. بعد از ارسال، ارزیابی در انتظار نتیجه می‌ماند و نتیجه پس از بررسی روی همین صفحه نمایش داده می‌شود. تا وقتی نتیجه اعلام نشده، نیازی به ارسال دوباره نیست.
              </p>
              {questions.map((question, index) => (
                <fieldset className={styles.question} key={question.key}>
                  <legend>{(index + 1).toLocaleString('fa-IR')}. {question.text}</legend>
                  {question.choices.map(([value, label]) => (
                    <label className={styles.answer} key={value}>
                      <input
                        type="radio"
                        name={question.key}
                        value={value}
                        checked={answers[question.key] === value}
                        onChange={() => setAnswers((current) => ({ ...current, [question.key]: value }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button className={styles.primaryButton} type="button" disabled={!allAnswered || busy} onClick={() => void submitAssessment()}>
                {busy ? 'در حال ارسال…' : 'ارسال ارزیابی'}
              </button>
              {!allAnswered && <p className={styles.helper}>پیش از ارسال، برای همه موقعیت‌ها یک پاسخ انتخاب کنید.</p>}
            </div>
          )}

          {assessment?.result === 'pending' && (
            <div className={styles.statusBox}>
              <strong>ارزیابی ثبت شده است.</strong>
              <span>الان در انتظار نتیجه همین تلاش هستید. تا وقتی نتیجه اعلام نشده، نیازی به ارسال دوباره یا اقدام دیگری در این مرحله نیست.</span>
            </div>
          )}
          {assessment?.result === 'failed' && (
            <div className={`${styles.statusBox} ${styles.warningBox}`}>
              <strong>نیاز به مرور بیشتر</strong>
              <span>این تلاش تأیید نشده، اما مسیر ارزیابی برای وضعیت فعلی باز است. آموزش را دوباره مرور کنید؛ مخصوصاً جاهایی که یک پاسخ ظاهراً کمک‌کننده، تصمیم کاربر یا مرز نقش را از او می‌گیرد.</span>
            </div>
          )}
          {assessment?.result === 'passed' && (
            <div className={styles.statusBox}>
              <strong>آماده ادامه مسیر</strong>
              <span>ارزیابی این مرحله تأیید شده است. اگر مرحله بعد برای حساب شما فعال باشد، وضعیت آن جداگانه در همین صفحه نمایش داده می‌شود.</span>
            </div>
          )}

          <button type="button" className={styles.textButton} onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && application && needsKyc && (
        <section className={styles.card} aria-labelledby="kyc-title">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>مرحله ۴</p>
              <h2 id="kyc-title">بررسی هویت</h2>
            </div>
            <span className={styles.statusPill}>{statusLabel(application.status)}</span>
          </div>

          <div className={styles.privacyNote}>
            <strong>اطلاعات هویتی جدا از پروفایل عمومی است</strong>
            <p>نام هویتی، کد ملی، تاریخ تولد و اطلاعات بانکی در این مرحله برای بررسی هویت و اطلاعات حساب دریافت می‌شوند و در پروفایل عمومی نمایش داده نمی‌شود. فرستادن فرم به معنی تأیید فوری نیست. بازشدن مرحله بررسی هویت هم به معنی فعال‌بودن فوری پرداخت، تسویه یا دریافت تماس نیست.</p>
          </div>

          {!kycStatus && (
            <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => void loadKyc()}>
              {busy ? 'در حال بررسی…' : 'بررسی وضعیت احراز هویت'}
            </button>
          )}

          {kycStatus?.status === 'pending' && (
            <div className={styles.statusBox}>
              <strong>اطلاعات دریافت شده است.</strong>
              <span>اطلاعات این مرحله در انتظار بررسی است. فعلاً لازم نیست همین فرم را دوباره بفرستید.</span>
            </div>
          )}

          {kycStatus?.status === 'verified' && (
            <div className={styles.statusBox}>
              <strong>هویت این مرحله تأیید شده است.</strong>
              <span>اگر مرحله دیگری برای حساب باقی مانده باشد، وضعیت آن جداگانه در همین صفحه نمایش داده می‌شود. این پیام به‌تنهایی فعال‌بودن پرداخت یا کار را اعلام نمی‌کند.</span>
            </div>
          )}

          {kycStatus && ['not_started', 'rejected', 'expired'].includes(kycStatus.status) && (
            <div>
              {kycStatus.status === 'rejected' && (
                <div className={`${styles.statusBox} ${styles.dangerBox}`}>
                  <strong>اطلاعات قبلی این مرحله تأیید نشده است.</strong>
                  <span>فرم برای ثبت دوباره در دسترس است. اطلاعات را با مدرک هویتی و اطلاعات بانکی خودتان تطبیق دهید.</span>
                </div>
              )}
              {kycStatus.status === 'expired' && (
                <div className={`${styles.statusBox} ${styles.warningBox}`}>
                  <strong>اطلاعات این مرحله باید دوباره ثبت شود.</strong>
                  <span>فرم دوباره در دسترس است. اطلاعات را پیش از ارسال بررسی کنید.</span>
                </div>
              )}

              <div className={styles.formGrid}>
                <div className={styles.fullField}>
                  <label htmlFor="legal-name">نام و نام خانوادگی مطابق مدرک هویتی</label>
                  <input id="legal-name" autoComplete="name" value={legalName} onChange={(event) => setLegalName(event.target.value.slice(0, 140))} />
                </div>

                <div className={styles.field}>
                  <label htmlFor="national-id">کد ملی</label>
                  <input id="national-id" inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)} placeholder="۱۰ رقم" />
                </div>

                <div className={styles.field}>
                  <label htmlFor="birth-jalali">تاریخ تولد شمسی</label>
                  <input id="birth-jalali" inputMode="numeric" autoComplete="off" value={birthJalali} onChange={(event) => setBirthJalali(event.target.value)} placeholder="مثلاً ۱۳۷۰-۰۵-۲۱" />
                </div>

                <div className={styles.fullField}>
                  <label htmlFor="iban">شماره شبا</label>
                  <input id="iban" dir="ltr" autoComplete="off" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>

                <div className={styles.fullField}>
                  <label htmlFor="account-holder">نام صاحب حساب، اگر با نام شما تفاوت دارد (اختیاری)</label>
                  <input id="account-holder" value={accountHolder} onChange={(event) => setAccountHolder(event.target.value.slice(0, 140))} />
                </div>
              </div>

              <button className={styles.primaryButton} type="button" disabled={!canSubmitKyc || busy} onClick={() => void submitKyc()}>
                {busy ? 'در حال ثبت…' : 'ثبت اطلاعات برای بررسی'}
              </button>
              {!canSubmitKyc && <p className={styles.helper}>نام، کد ملی ۱۰ رقمی، تاریخ تولد با قالب نمونه و شماره شبای کامل را وارد کنید.</p>}
            </div>
          )}

          <button type="button" className={styles.textButton} onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && application && reviewOnly && reviewState && (
        <section className={styles.card} aria-labelledby="review-title">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>وضعیت درخواست</p>
              <h2 id="review-title">{reviewState.title}</h2>
            </div>
            <span className={styles.statusPill}>{reviewState.label}</span>
          </div>

          <div className={styles.statusDetails}>
            <div className={styles.statusDetail}>
              <span>کجا هستید؟</span>
              <p>{reviewState.label}</p>
            </div>
            <div className={styles.statusDetail}>
              <span>این یعنی چه؟</span>
              <p>{reviewState.meaning}</p>
            </div>
            <div className={styles.statusDetail}>
              <span>کاری لازم است؟</span>
              <p>{reviewState.action}</p>
            </div>
          </div>

          <button type="button" className={styles.textButton} onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && appReadyForWork && (
        <section className={styles.card} aria-labelledby="ready-title">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>وضعیت حساب</p>
              <h2 id="ready-title">مراحل فعلی حساب شنونده کامل شده است.</h2>
            </div>
            <span className={styles.statusPill}>{statusLabel(application.status)}</span>
          </div>
          <p className={styles.helper}>
            گفت‌وگوی عمومی هنوز برای استفاده همگانی باز نشده است. آماده‌بودن حساب شما به معنی فعال‌بودن فوری دریافت گفت‌وگو، پرداخت یا تسویه نیست؛ هر قابلیت زمانی در دسترس است که همان بخش واقعاً فعال و در محصول نمایش داده شده باشد.
          </p>
        </section>
      )}

      <nav className={styles.links} aria-label="مسیرهای مرتبط">
        <a href="/">خانه</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
        <a href="mailto:sales@uniqueholding.com.tr">پشتیبانی</a>
      </nav>
    </main>
  );
}
