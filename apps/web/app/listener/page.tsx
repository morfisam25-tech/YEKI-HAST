'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type TrainingModuleKey = 'active_listening' | 'role_boundary' | 'safety' | 'platform_rules';
type Gender = 'female' | 'male';
type KycState = 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';

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
  title: string;
  intro: string;
  lessons: Array<{
    title: string;
    paragraphs: string[];
    points?: string[];
    examples?: LessonExample[];
  }>;
};

const trainingModules: TrainingGroup[] = [
  {
    key: 'active_listening',
    title: 'بخش اول: نقش و گوش‌دادن',
    intro: 'پایه کار شنونده این است که به جای هدایت زندگی طرف مقابل، برای شنیده‌شدن او جا باز کند.',
    lessons: [
      {
        title: 'درس ۱ — نقش شنونده',
        paragraphs: [
          'شنونده قرار نیست مشکل طرف مقابل را حل کند. وظیفه اصلی تو حضور، توجه و شنیدن بدون قضاوت است.',
          'گاهی بهترین کمک این است که چند دقیقه دنبال پاسخ بعدی نگردی و واقعاً بفهمی طرف مقابل چه می‌گوید. اگر چیزی روشن نیست، با احترام سؤال کن؛ اگر می‌دانی چه می‌خواهد بگوید، باز هم به او اجازه بده با زبان خودش ادامه دهد.',
        ],
        points: [
          'به جای نتیجه‌گیری سریع، برای فهمیدن وقت بگذار.',
          'تجربه و ارزش‌های خودت را معیار قضاوت زندگی او قرار نده.',
          'شنونده متخصص درمان، تشخیص یا حل بحران نیست.',
        ],
      },
      {
        title: 'درس ۲ — گوش‌دادن فعال',
        paragraphs: [
          'گوش‌دادن فعال یعنی نشان بدهی حرف را دنبال کرده‌ای، بدون اینکه گفتگو را از صاحبش بگیری. سؤال باز، بازتاب کوتاه، خلاصه‌کردن و سکوت به‌جا ابزارهای اصلی تو هستند.',
          'می‌توانی احساسی را که از حرف او فهمیده‌ای با احتیاط بازتاب بدهی، اما نباید آن را به تشخیص روان‌شناختی تبدیل کنی. جمله‌هایی مثل «به نظر میاد این موضوع خیلی خسته‌ات کرده» با «تو اضطراب شدید داری» یکسان نیستند.',
        ],
        points: [
          'سؤال باز: «بیشتر از کدام بخشش اذیت شدی؟»',
          'بازتاب: «می‌گی بیشتر از خود اتفاق، بی‌خبری بعدش برات سخت بوده.»',
          'خلاصه: «اگر درست فهمیدم، هم خسته‌ای هم نمی‌دونی قدم بعدی چی باید باشد.»',
          'سکوت: اگر طرف مقابل چند ثانیه مکث کرد، لازم نیست فوراً فضا را پر کنی.',
        ],
      },
    ],
  },
  {
    key: 'role_boundary',
    title: 'بخش دوم: پاسخ‌های آسیب‌زا و مرزها',
    intro: 'شنونده خوب فقط می‌داند چه بگوید؛ می‌داند چه وقت نباید نصیحت، قضاوت یا رابطه را شخصی کند.',
    lessons: [
      {
        title: 'درس ۳ — چه چیزهایی نگوییم',
        paragraphs: [
          'نصیحت فوری معمولاً قبل از فهم کامل مسئله می‌آید. مقایسه با تجربه خودت هم می‌تواند گفتگو را از طرف مقابل بگیرد. کوچک‌کردن احساس، تشخیص‌دادن، وعده نتیجه، قضاوت اخلاقی و بحث برای اثبات اینکه حق با توست، با نقش شنونده سازگار نیست.',
        ],
        examples: [
          {
            situation: 'کاربر می‌گوید: «این هفته واقعاً از کارم بریدم.»',
            weak: '«ولش کن، استعفا بده. من هم یک بار همین کار را کردم و خیلی بهتر شد.»',
            better: '«انگار فشارش خیلی زیاد شده. کدام بخش این هفته بیشتر از همه خسته‌ات کرد؟»',
            why: 'پاسخ دوم قبل از راه‌حل‌دادن، تجربه خود کاربر را روشن می‌کند و گفتگو را به سمت داستان شنونده نمی‌برد.',
          },
          {
            situation: 'کاربر می‌گوید: «حس می‌کنم هیچ‌کس من را جدی نمی‌گیرد.»',
            weak: '«زیادی حساس شدی؛ همه این حس را دارند.»',
            better: '«اینکه حس کنی جدی گرفته نمی‌شی می‌تونه سنگین باشه. آخرین بار کی این حس پررنگ شد؟»',
            why: 'پاسخ بهتر احساس را انکار نمی‌کند و بدون تشخیص یا اغراق، راه ادامه گفتگو را باز می‌گذارد.',
          },
        ],
      },
      {
        title: 'درس ۴ — مرزهای حرفه‌ای و رفتاری',
        paragraphs: [
          'رابطه در «یکی هست» باید در چارچوب شنیدن و همراهی انسانی بماند. صمیمیت در گفتگو به معنی رابطه شخصی، تعهد عاطفی یا دسترسی نامحدود به شنونده نیست.',
          'اطلاعات شخصی غیرضروری را نخواه و اطلاعات تماس خودت را هم برای ادامه رابطه خارج از سرویس نده. درخواست‌های جنسی یا نامناسب، آزار، تهدید، فشار برای ارتباط شخصی و تلاش برای ایجاد وابستگی باید با مرزی روشن و محترمانه پاسخ داده شوند.',
        ],
        points: [
          'برای حفظ مرز، لازم نیست خشن یا تحقیرکننده باشی.',
          'اگر گفتگو از هدف سرویس خارج شد، مرز را واضح بگو و در صورت ادامه رفتار نامناسب از مسیر ایمنی استفاده کن.',
          'اگر رابطه یا منفعت شخصی تو می‌تواند قضاوتت را تحت تأثیر قرار دهد، ادامه‌دادن گفتگو انتخاب مناسبی نیست.',
        ],
      },
    ],
  },
  {
    key: 'safety',
    title: 'بخش سوم: موقعیت‌های حساس',
    intro: 'در شرایط حساس، صداقت درباره حدود نقش از وانمودکردن به تخصص مهم‌تر است.',
    lessons: [
      {
        title: 'درس ۵ — وقتی موضوع از توان نقش شنونده بیرون است',
        paragraphs: [
          'اگر کاربر درباره تشخیص پزشکی یا روان‌شناختی، درمان، تصمیم حقوقی یا موضوع تخصصی دیگری پاسخ قطعی می‌خواهد، ادعای تخصص نکن. می‌توانی حرفش را بشنوی و روشن بگویی که این بخش خارج از نقش شنونده است.',
          'اگر از حرف کاربر برمی‌آید که خطر فوری متوجه خودش یا فرد دیگری است، نقش تو ارائه مداخله حرفه‌ای بحران نیست. در چنین وضعی نباید وانمود کنی که «یکی هست» خدمات اضطراری ارائه می‌دهد. می‌توانی با آرامش محدودیت سرویس را بگویی و او را به استفاده از خدمات اضطراری یا کمک قابل اعتماد در دسترس خودش تشویق کنی، بدون ساختن شماره یا دستور محلی که از صحتش مطمئن نیستی.',
        ],
        examples: [
          {
            situation: 'کاربر از تو می‌خواهد تشخیص بدهی که «افسردگی دارم یا نه؟»',
            weak: '«به نظرم بله؛ نشانه‌هایت واضح است.»',
            better: '«من نمی‌تونم تشخیص پزشکی یا روان‌شناختی بدم، اما اگر دوست داری می‌تونم گوش بدم این روزها چه چیزهایی برات سخت‌تر شده.»',
            why: 'پاسخ دوم مرز نقش را روشن نگه می‌دارد و در عین حال گفتگو را رها نمی‌کند.',
          },
        ],
      },
    ],
  },
  {
    key: 'platform_rules',
    title: 'بخش چهارم: پایان گفتگو و تمرین',
    intro: 'پایان خوب به اندازه شروع خوب مهم است؛ کاربر باید بداند گفتگو تمام شده، بدون اینکه وعده یا وابستگی تازه‌ای ساخته شود.',
    lessons: [
      {
        title: 'درس ۶ — پایان‌دادن درست به گفتگو',
        paragraphs: [
          'نزدیک پایان گفتگو، اگر مناسب بود در یک یا دو جمله چیزی را که شنیدی جمع‌بندی کن. از وعده‌هایی مثل «هر وقت خواستی فقط من هستم» یا تعهدی که نمی‌توانی تضمین کنی پرهیز کن.',
          'یک خداحافظی ساده و روشن کافی است: «ممنون که این‌ها را گفتی. امیدوارم بعد از این گفتگو کمی سبک‌تر باشی. مراقب خودت باش.» لازم نیست نتیجه‌ای را تضمین کنی.',
        ],
      },
      {
        title: 'درس ۷ — نمونه‌های واقعی',
        paragraphs: [
          'در هر سناریو، هدف این نیست که یک جمله حفظ کنی. ببین پاسخ بهتر چه کاری انجام می‌دهد: فضا می‌دهد، قضاوت نمی‌کند، مرز را نگه می‌دارد و چیزی را که نمی‌داند ادعا نمی‌کند.',
        ],
        examples: [
          {
            situation: 'تنهایی — «چند وقته شب‌ها حس می‌کنم هیچ‌کس واقعاً منو نمی‌شناسه.»',
            weak: '«باید بیشتر بیرون بری و دوست پیدا کنی.»',
            better: '«این حسِ دیده‌نشدن خیلی می‌تونه سنگین باشه. بیشتر دلت برای چه نوع ارتباطی تنگ شده؟»',
            why: 'پاسخ بهتر به جای نسخه‌دادن، تجربه تنهایی را باز می‌کند.',
          },
          {
            situation: 'دلخوری رابطه — «هرچی می‌گم انگار طرف مقابلم اصلاً نمی‌شنوه.»',
            weak: '«پس حتماً آدم خودخواهیه؛ ولش کن.»',
            better: '«به نظر میاد شنیده‌نشدن توی این رابطه اذیتت کرده. معمولاً وقتی موضوع مهمی را مطرح می‌کنی چه اتفاقی می‌افته؟»',
            why: 'پاسخ بهتر بدون قضاوت درباره فرد غایب، روی تجربه خود کاربر می‌ماند.',
          },
          {
            situation: 'فشار کاری — «از صبح تا شب کار می‌کنم و دیگه کشش ندارم.»',
            weak: '«همه کار می‌کنن؛ باید مقاوم‌تر باشی.»',
            better: '«انگار مدتیه فشار بدون وقفه ادامه داشته. الان بیشتر خستگی جسمی اذیتت می‌کنه یا فشار ذهنی؟»',
            why: 'پاسخ بهتر احساس را کوچک نمی‌کند و سؤال مشخصی برای ادامه می‌پرسد.',
          },
          {
            situation: 'فقط تخلیه — «راه‌حل نمی‌خوام، فقط می‌خوام بگم امروز چی شد.»',
            weak: '«باشه، ولی اول سه تا راهکار بهت می‌گم.»',
            better: '«باشه. فعلاً فقط گوش می‌دم؛ از هرجا راحتی شروع کن.»',
            why: 'پاسخ بهتر خواسته روشن کاربر را می‌پذیرد و کنترل گفتگو را از او نمی‌گیرد.',
          },
          {
            situation: 'درخواست تصمیم — «تو جای من بودی چی کار می‌کردی؟»',
            weak: '«من قطعاً همین امروز تصمیم می‌گرفتم و تمامش می‌کردم.»',
            better: '«می‌تونم کمک کنم گزینه‌هات رو با صدای بلند مرور کنی. بین این انتخاب‌ها، کدوم نگرانی بیشتر ذهنت رو گرفته؟»',
            why: 'پاسخ بهتر تصمیم را به جای کاربر نمی‌گیرد، اما او را با سؤال تنها هم نمی‌گذارد.',
          },
          {
            situation: 'عبور از مرز — کاربر گفتگو را به سمت محتوای جنسی می‌برد یا اطلاعات تماس شخصی می‌خواهد.',
            weak: '«اگر قول بدی جایی نگی، اشکالی نداره.»',
            better: '«من اینجا برای شنیدن و گفت‌وگوی محترمانه‌ام. وارد این نوع درخواست یا ارتباط خارج از سرویس نمی‌شم. اگر دوست داری می‌تونیم درباره موضوعی که باعث شد به اینجا برسیم حرف بزنیم.»',
            why: 'پاسخ بهتر مرز را روشن می‌کند، تحقیر نمی‌کند و در صورت امکان راه بازگشت به هدف گفتگو را نگه می‌دارد.',
          },
        ],
      },
    ],
  },
];

const questions = [
  {
    key: 'q_venting',
    text: 'کاربر می‌گوید: «امروز واقعاً روز بدی بود. راه‌حل نمی‌خوام؛ فقط می‌خوام یکی گوش بده.» تو چه می‌کنی؟',
    choices: [
      ['follow_need', 'می‌گویم «باشه، فعلاً فقط گوش می‌دم. از هرجا راحتی شروع کن.» و تا وقتی خودش نخواسته سراغ راه‌حل نمی‌روم.'],
      ['gentle_advice', 'می‌گذارم چند دقیقه حرف بزند و بعد چند پیشنهاد عملی می‌دهم، حتی اگر خودش نخواسته باشد.'],
      ['share_story', 'برای اینکه احساس تنهایی نکند، سریع تجربه مشابه خودم را با جزئیات تعریف می‌کنم.'],
    ],
  },
  {
    key: 'q_open_question',
    text: 'کاربر از فشار کار می‌گوید اما حرفش پراکنده است. کدام پاسخ بیشتر به ادامه گفتگو کمک می‌کند؟',
    choices: [
      ['open_question', '«از بین چیزهایی که گفتی، کدوم بخش این روزها بیشتر از همه انرژی‌ت رو می‌گیره؟»'],
      ['solution_question', '«چرا استعفا نمی‌دی و یک جای بهتر پیدا نمی‌کنی؟»'],
      ['normalise_away', '«تقریباً همه از کارشون خسته‌ان؛ طبیعی‌ه.»'],
    ],
  },
  {
    key: 'q_advice',
    text: 'کاربر می‌پرسد: «تو جای من بودی رابطه‌ات رو تمام می‌کردی یا نه؟» مناسب‌ترین واکنش کدام است؟',
    choices: [
      ['explore_choice', 'می‌گویم نمی‌خواهم به جای او تصمیم بگیرم و کمک می‌کنم نگرانی‌ها و گزینه‌هایش را روشن‌تر مرور کند.'],
      ['give_personal_answer', 'نظر شخصی‌ام را صریح می‌گویم تا بالاخره یک جواب مشخص داشته باشد.'],
      ['refuse_topic', 'می‌گویم این سؤال را نباید از من بپرسی و موضوع را عوض می‌کنم.'],
    ],
  },
  {
    key: 'q_validation',
    text: 'کاربر می‌گوید: «مدتیه خیلی تنها شدم و بعضی روزها تحملش سخته.» کدام پاسخ با نقش شنونده سازگارتر است؟',
    choices: [
      ['reflect_feeling', '«به نظر میاد این تنهایی واقعاً خسته‌ات کرده. اگر راحتی، بگو این روزها کِی بیشتر حسش می‌کنی.»'],
      ['diagnose', '«این نشانه واضح افسردگیه و باید حتماً درمان شروع کنی.»'],
      ['minimise', '«تنهایی برای همه پیش میاد؛ زیاد بهش فکر نکن.»'],
    ],
  },
  {
    key: 'q_silence',
    text: 'وسط حرف، کاربر چند ثانیه ساکت می‌شود و مشخص است که دنبال کلماتش می‌گردد. چه واکنشی مناسب‌تر است؟',
    choices: [
      ['allow_silence', 'چند لحظه فضا می‌دهم و اگر مکث طولانی شد آرام می‌گویم «عجله‌ای نیست؛ هر وقت آماده بودی ادامه بده.»'],
      ['fill_silence', 'برای جلوگیری از سکوت، بلافاصله داستانی از تجربه خودم تعریف می‌کنم.'],
      ['push_answer', 'چند سؤال پشت سر هم می‌پرسم تا زودتر جواب بدهد.'],
    ],
  },
  {
    key: 'q_contact',
    text: 'کاربر می‌گوید با تو احساس نزدیکی کرده و شناسه شبکه اجتماعی‌ات را می‌خواهد. چه می‌کنی؟',
    choices: [
      ['keep_boundary', 'محترمانه می‌گویم ارتباط شخصی خارج از سرویس را ادامه نمی‌دهم و مرز گفتگو را روشن نگه می‌دارم.'],
      ['trust_exception', 'اگر تا اینجا محترمانه بوده، یک استثنا قائل می‌شوم و راه ارتباطی می‌دهم.'],
      ['shame_request', 'به او می‌گویم درخواستش نامناسب و خجالت‌آور است و فوراً گفتگو را می‌بندم.'],
    ],
  },
  {
    key: 'q_safety',
    text: 'از حرف کاربر احتمال می‌دهی خطر فوری متوجه خودش یا فرد دیگری است. نقش تو چیست؟',
    choices: [
      ['state_limit', 'آرام و روشن می‌گویم «یکی هست» خدمات اضطراری نیست و تشویقش می‌کنم از کمک فوری و قابل اعتماد در دسترس خودش استفاده کند؛ وانمود نمی‌کنم متخصص بحرانم.'],
      ['take_control', 'مسئولیت کامل وضعیت را می‌پذیرم و قدم‌به‌قدم دستور می‌دهم چه کار کند، حتی اگر از شرایط محلی او مطمئن نباشم.'],
      ['ignore_risk', 'چون شنونده هستم، هیچ اشاره‌ای به خطر نمی‌کنم و فقط اجازه می‌دهم حرف بزند.'],
    ],
  },
  {
    key: 'q_closing',
    text: 'زمان گفتگو رو به پایان است و کاربر هنوز کمی ناراحت است. کدام پایان مناسب‌تر است؟',
    choices: [
      ['clear_close', 'کوتاه جمع‌بندی می‌کنم، از اعتمادی که کرده تشکر می‌کنم و بدون وعده نتیجه یا رابطه بعدی خداحافظی می‌کنم.'],
      ['promise_access', 'قول می‌دهم هر وقت حالش بد شد همیشه شخصاً در دسترسش باشم.'],
      ['abrupt_end', 'بدون اشاره به پایان زمان، ناگهان گفتگو را قطع می‌کنم تا وابستگی شکل نگیرد.'],
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
    languages_required: 'حداقل یک زبان برای گفتگو انتخاب کنید.',
    invalid_language: 'انتخاب زبان کامل نیست. دوباره بررسی کنید.',
    invalid_gender: 'لطفاً جنسیت را انتخاب کنید.',
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
    rejected: 'نیازمند بررسی بیشتر',
    archived: 'بایگانی‌شده',
  };
  return labels[status] ?? 'در حال بررسی';
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busyModule, setBusyModule] = useState<TrainingModuleKey | null>(null);

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
  const canCreateApplication = nickname.trim().length >= 2 && gender !== null && selectedLanguages.length > 0;
  const normalizedNationalId = normalizeDigits(nationalId).replace(/\D/g, '').slice(0, 10);
  const normalizedBirth = normalizeDigits(birthJalali).replace(/[/.]/g, '-').replace(/[^\d-]/g, '').slice(0, 10);
  const normalizedIban = normalizeDigits(iban).replace(/[\s-]/g, '').toUpperCase().slice(0, 26);
  const canSubmitKyc = legalName.trim().length >= 2
    && /^\d{10}$/.test(normalizedNationalId)
    && /^\d{4}-\d{2}-\d{2}$/.test(normalizedBirth)
    && /^IR\d{24}$/.test(normalizedIban);

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) => {
      if (current.includes(code)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== code);
      }
      return [...current, code];
    });
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
          languages: selectedLanguages.map((code) => ({ code, proficiency: 'fluent' })),
        }),
      });
      await loadApplication();
      setNotice('اطلاعات اولیه ثبت شد. مرحله بعد، آموزش شنونده است؛ قبل از ارزیابی همه بخش‌ها را با دقت بخوانید.');
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

  return (
    <main className="listener-onboarding-page">
      <header className="site-header">
        <a className="brand" href="/">یکی هست</a>
        <span>مسیر شنونده</span>
      </header>

      <section className="listener-onboarding-hero">
        <div>
          <p className="kicker">شنونده‌شدن</p>
          <h1>قبل از شنیدن دیگران، این نقش را درست یاد بگیر</h1>
        </div>
        <p>
          مسیر شنونده از معرفی اولیه شروع می‌شود، با آموزش ادامه پیدا می‌کند و بعد به ارزیابی می‌رسد. اگر برای ادامه آماده باشید، مرحله بررسی هویت و مراحل نهایی حساب باز می‌شود. قبولی در ارزیابی به معنی فعال‌شدن فوری گفت‌وگوی عمومی یا پرداخت نیست.
        </p>
      </section>

      <section className="listener-note" aria-labelledby="journey-title">
        <div>
          <p className="kicker">مسیر شما</p>
          <h2 id="journey-title">چهار قدم روشن</h2>
        </div>
        <p>
          ۱) معرفی اولیه و زبان‌ها. ۲) آموزش شنونده و تمرین موقعیت‌های واقعی. ۳) ارزیابی آنچه یاد گرفته‌اید. ۴) در صورت آماده‌بودن، بررسی هویت و مراحل نهایی حساب. در هر مرحله همین صفحه می‌گوید چه کاری لازم است و بعد از آن چه اتفاقی می‌افتد.
        </p>
      </section>

      {loading && <p className="helper">در حال دریافت وضعیت حساب…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="helper" aria-live="polite">{notice}</p>}

      {!loading && applicationMissing && bootstrap && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="profile-title">
          <div>
            <p className="kicker">مرحله ۱</p>
            <h2 id="profile-title">معرفی اولیه</h2>
          </div>
          <p className="helper">
            در این مرحله فقط اطلاعاتی را می‌گیریم که برای شروع مسیر شنونده لازم است. نام واقعی، کد ملی و اطلاعات بانکی اینجا خواسته نمی‌شود. معرفی کوتاه و سبک شنیدن را خودتان می‌نویسید و این متن‌ها به معنی تأیید رسمی سابقه یا تخصص نیستند.
          </p>

          <label htmlFor="listener-nickname">نامی که در پروفایل دیده می‌شود</label>
          <input
            id="listener-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value.slice(0, 80))}
            placeholder="مثلاً نازنین"
          />

          <span className="field-label">جنسیت</span>
          <div className="duration-options two-column">
            <button type="button" className={gender === 'female' ? 'selected' : ''} onClick={() => setGender('female')}>زن</button>
            <button type="button" className={gender === 'male' ? 'selected' : ''} onClick={() => setGender('male')}>مرد</button>
          </div>

          <span className="field-label">زبان‌هایی که می‌توانید در آن‌ها با دقت گوش بدهید</span>
          <div className="language-grid">
            {bootstrap.languages.map((language) => (
              <button
                type="button"
                className={selectedLanguages.includes(language.code) ? 'selected language-button' : 'language-button'}
                key={language.code}
                onClick={() => toggleLanguage(language.code)}
              >
                {language.nameFa}
              </button>
            ))}
          </div>

          <label htmlFor="listener-intro">معرفی کوتاه برای پروفایل</label>
          <textarea
            id="listener-intro"
            value={shortIntro}
            onChange={(event) => setShortIntro(event.target.value.slice(0, 400))}
            rows={4}
            placeholder="در چند جمله بگویید چه نوع گفت‌وگویی برایتان آشناتر است و دوست دارید کاربر از شما چه بداند."
          />

          <label htmlFor="listener-style">سبک شنیدن شما</label>
          <textarea
            id="listener-style"
            value={listeningStyle}
            onChange={(event) => setListeningStyle(event.target.value.slice(0, 400))}
            rows={3}
            placeholder="مثلاً آرام و کم‌حرف، سؤال‌محور، یا بیشتر همراه با بازتاب و خلاصه‌کردن."
          />

          <button type="button" disabled={!canCreateApplication || busy} onClick={() => void createApplication()}>
            {busy ? 'در حال ثبت…' : 'ثبت و شروع آموزش'}
          </button>
          {!canCreateApplication && <p className="helper">برای ادامه، یک نام، جنسیت و حداقل یک زبان انتخاب کنید.</p>}
        </section>
      )}

      {!loading && application && onboardingMutable && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="training-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">مرحله ۲</p>
              <h2 id="training-title">آموزش شنونده</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">
            این آموزش هفت درس دارد که در چهار بخش ثبت می‌شوند. هر بخش را کامل بخوانید و بعد تأیید کنید. ارزیابی فقط از همین مطالب سؤال می‌پرسد.
          </p>

          <div className="training-grid">
            {trainingModules.map((module) => {
              const done = completedModules.has(module.key);
              return (
                <article className={done ? 'training-card training-card-done' : 'training-card'} key={module.key}>
                  <h3>{module.title}</h3>
                  <p>{module.intro}</p>
                  {module.lessons.map((lesson) => (
                    <div key={lesson.title}>
                      <h4>{lesson.title}</h4>
                      {lesson.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {lesson.points?.length ? (
                        <ul>
                          {lesson.points.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                      ) : null}
                      {lesson.examples?.map((example) => (
                        <div className="question-card" key={example.situation}>
                          <p><strong>موقعیت:</strong> {example.situation}</p>
                          <p><strong>پاسخ ضعیف:</strong> {example.weak}</p>
                          <p><strong>پاسخ بهتر:</strong> {example.better}</p>
                          <p><strong>چرا بهتر است:</strong> {example.why}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button type="button" disabled={done || busyModule !== null} onClick={() => void completeModule(module.key)}>
                    {done ? 'این بخش کامل شده' : busyModule === module.key ? 'در حال ثبت…' : 'این بخش را خواندم و آماده ادامه‌ام'}
                  </button>
                </article>
              );
            })}
          </div>

          {application.trainingComplete && (!assessment || assessment.result === 'failed') && (
            <div className="assessment-panel">
              <p className="kicker">مرحله ۳</p>
              <h3>ارزیابی شنونده</h3>
              <p className="helper">
                این ارزیابی شامل {questions.length.toLocaleString('fa-IR')} موقعیت کوتاه است و می‌سنجد در شنیدن، مرزبندی، پرهیز از نصیحت و تشخیص، توجه به ایمنی و پایان گفتگو چه انتخابی می‌کنید. پاسخ «بی‌نقص» نمایشی لازم نیست؛ گزینه‌ای را انتخاب کنید که واقعاً به رفتار شما نزدیک‌تر است. بعد از ارسال، نتیجه پس از بررسی روی همین صفحه ثبت می‌شود.
              </p>
              {questions.map((question, index) => (
                <fieldset className="question-card" key={question.key}>
                  <legend>{(index + 1).toLocaleString('fa-IR')}. {question.text}</legend>
                  {question.choices.map(([value, label]) => (
                    <label className="answer-choice" key={value}>
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
              <button type="button" disabled={!allAnswered || busy} onClick={() => void submitAssessment()}>
                {busy ? 'در حال ارسال…' : 'ارسال ارزیابی'}
              </button>
              {!allAnswered && <p className="helper">پیش از ارسال، برای همه موقعیت‌ها یک پاسخ انتخاب کنید.</p>}
            </div>
          )}

          {assessment?.result === 'pending' && (
            <div className="status-notice">
              <strong>ارزیابی ثبت شده است.</strong>
              <span>نتیجه هنوز اعلام نشده. تا آن زمان نیازی به ارسال دوباره نیست.</span>
            </div>
          )}
          {assessment?.result === 'failed' && (
            <div className="status-notice warning-notice">
              <strong>نیاز به مرور بیشتر</strong>
              <span>درخواست شما بسته نشده است. بخش‌های آموزش را دوباره مرور کنید و در تلاش بعدی به مرز نقش، نصیحت‌نکردن و موقعیت‌های حساس بیشتر توجه کنید.</span>
            </div>
          )}
          {assessment?.result === 'passed' && (
            <div className="status-notice">
              <strong>آماده ادامه مسیر</strong>
              <span>ارزیابی این مرحله تأیید شده است. مرحله بعد، در صورت فعال‌بودن برای حساب شما، بررسی هویت است.</span>
            </div>
          )}

          <button type="button" className="text-button" onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && application && needsKyc && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="kyc-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">مرحله ۴</p>
              <h2 id="kyc-title">بررسی هویت</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">
            اطلاعات این بخش برای بررسی هویت و الزامات حساب استفاده می‌شود و در پروفایل عمومی نمایش داده نمی‌شود. فرستادن فرم به معنی تأیید فوری نیست. فعال‌بودن این مرحله نیز به معنی فعال‌بودن پرداخت یا تسویه عمومی نیست.
          </p>

          {!kycStatus && (
            <button type="button" disabled={busy} onClick={() => void loadKyc()}>
              {busy ? 'در حال بررسی…' : 'بررسی وضعیت احراز هویت'}
            </button>
          )}

          {kycStatus?.status === 'pending' && (
            <div className="status-notice">
              <strong>اطلاعات دریافت شد.</strong>
              <span>بررسی هنوز کامل نشده است.</span>
            </div>
          )}

          {kycStatus?.status === 'verified' && (
            <div className="status-notice">
              <strong>هویت تأیید شده است.</strong>
              <span>اگر مراحل دیگری برای حساب شما باقی مانده باشد، وضعیت آن‌ها جداگانه در همین مسیر نمایش داده می‌شود.</span>
            </div>
          )}

          {kycStatus && ['not_started', 'rejected', 'expired'].includes(kycStatus.status) && (
            <div className="kyc-form">
              {(kycStatus.status === 'rejected' || kycStatus.status === 'expired') && (
                <p className="error">اطلاعات قبلی نیاز به ثبت دوباره دارد. فیلدها را با مدرک و اطلاعات بانکی خودتان تطبیق دهید.</p>
              )}

              <label htmlFor="legal-name">نام و نام خانوادگی مطابق مدرک هویتی</label>
              <input id="legal-name" autoComplete="name" value={legalName} onChange={(event) => setLegalName(event.target.value.slice(0, 140))} />

              <label htmlFor="national-id">کد ملی</label>
              <input id="national-id" inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)} placeholder="۱۰ رقم" />

              <label htmlFor="birth-jalali">تاریخ تولد شمسی</label>
              <input id="birth-jalali" inputMode="numeric" autoComplete="off" value={birthJalali} onChange={(event) => setBirthJalali(event.target.value)} placeholder="مثلاً ۱۳۷۰-۰۵-۲۱" />

              <label htmlFor="iban">شماره شبا</label>
              <input id="iban" dir="ltr" autoComplete="off" value={iban} onChange={(event) => setIban(event.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" />

              <label htmlFor="account-holder">نام صاحب حساب، اگر با نام شما تفاوت دارد</label>
              <input id="account-holder" value={accountHolder} onChange={(event) => setAccountHolder(event.target.value.slice(0, 140))} />

              <button type="button" disabled={!canSubmitKyc || busy} onClick={() => void submitKyc()}>
                {busy ? 'در حال ثبت…' : 'ثبت اطلاعات برای بررسی'}
              </button>
              {!canSubmitKyc && <p className="helper">نام، کد ملی ۱۰ رقمی، تاریخ تولد با قالب نمونه و شماره شبای کامل را وارد کنید.</p>}
            </div>
          )}

          <button type="button" className="text-button" onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && application && reviewOnly && (
        <section className="call-setup wide-card onboarding-card" aria-labelledby="review-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="kicker">وضعیت درخواست</p>
              <h2 id="review-title">درخواست شما در مرحله بررسی است.</h2>
            </div>
            <span className="presence-pill">{statusLabel(application.status)}</span>
          </div>
          <p className="helper">
            {application.status === 'rejected'
              ? 'در این مرحله بخش‌هایی از درخواست نیاز به بررسی یا تکمیل دوباره دارد. اگر امکان اقدام تازه برای حساب باز شود، همین صفحه آن را نشان می‌دهد.'
              : application.status === 'suspended'
                ? 'حساب شنونده فعلاً غیرفعال است. برای وضعیت فعلی، از اطلاعات همین صفحه و در صورت نیاز پشتیبانی استفاده کنید.'
                : 'درخواست وارد یکی از مراحل نهایی شده است. تا زمانی که وضعیت تغییر نکرده، نیازی به ثبت دوباره آموزش یا ارزیابی نیست.'}
          </p>
          <button type="button" className="text-button" onClick={() => void refresh()}>به‌روزرسانی وضعیت</button>
        </section>
      )}

      {!loading && appReadyForWork && (
        <section className="call-setup wide-card onboarding-card ready-card" aria-labelledby="ready-title">
          <p className="kicker">آماده ادامه</p>
          <h2 id="ready-title">مراحل فعلی حساب شنونده کامل شده است.</h2>
          <p className="helper">
            گفت‌وگوی عمومی هنوز برای استفاده همگانی باز نشده است. آماده‌بودن حساب شما به معنی فعال‌بودن فوری دریافت گفتگو، پرداخت یا تسویه نیست؛ هر قابلیت زمانی در دسترس قرار می‌گیرد که همان بخش رسماً فعال شده باشد.
          </p>
        </section>
      )}

      <nav className="public-links" aria-label="مسیرهای مرتبط">
        <a href="/">خانه</a>
        <a href="/privacy">حریم خصوصی</a>
        <a href="/terms">قوانین استفاده</a>
        <a href="/account/delete">حذف حساب</a>
        <a href="mailto:sales@uniqueholding.com.tr">پشتیبانی</a>
      </nav>
    </main>
  );
}
