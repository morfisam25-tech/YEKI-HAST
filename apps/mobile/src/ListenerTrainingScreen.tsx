import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ListenerKycScreen from './ListenerKycScreen';
import {
  completeListenerTraining,
  getErrorCode,
  getListenerApplication,
  submitListenerAssessment,
  type ListenerApplicationResponse,
  type ListenerTrainingModuleKey,
} from './api';

type Props = {
  token: string;
  onDone: () => void;
};

const modules: Array<{
  key: ListenerTrainingModuleKey;
  title: string;
  body: string;
}> = [
  {
    key: 'role_boundary',
    title: '۱. نقش شنونده',
    body: 'قرار نیست مشکل مخاطب را به جای او حل کنی یا درباره‌اش تصمیم بگیری. با توجه کامل گوش بده، قضاوت نکن و درباره جزئیاتی که برای گفت‌وگو لازم نیست کنجکاوی نکن.',
  },
  {
    key: 'active_listening',
    title: '۲. گوش‌دادن فعال',
    body: 'از سؤال‌های باز، بازتاب احساس و خلاصه‌کردن استفاده کن. گاهی مکث کوتاه بهتر از پرکردن سکوت است. اگر مطمئن نیستی، بپرس: «درست فهمیدم که …؟»',
  },
  {
    key: 'what_not_to_say',
    title: '۳. چه چیزهایی نگوییم',
    body: 'نصیحت فوری، عوض‌کردن موضوع به تجربه خودت، کوچک‌شمردن احساس، تشخیص پزشکی یا روان‌شناختی و قولی که نمی‌توانی نگه داری، گفت‌وگو را ناامن می‌کند.',
  },
  {
    key: 'platform_rules',
    title: '۴. مرزهای سالم',
    body: 'اطلاعات تماس شخصی، عکس خصوصی، پول، رابطه عاطفی یا ادامه گفت‌وگو خارج از سرویس را پیشنهاد یا قبول نکن. اگر درخواستی ناراحت‌کننده شد، کوتاه و محترمانه مرزت را بگو.',
  },
  {
    key: 'safety',
    title: '۵. شرایط حساس',
    body: 'این سرویس درمان، تشخیص یا پاسخ اضطراری نیست. اگر مخاطب از خطر فوری یا تهدید جدی گفت، آرام بمان، ادعای درمان نکن و طبق دستورالعمل ایمنی سرویس مسیر گزارش و خروج امن را فعال کن.',
  },
  {
    key: 'closing_conversation',
    title: '۶. پایان مناسب گفت‌وگو',
    body: 'در پایان خلاصه‌ای کوتاه بده و بدون وعده ادامه رابطه خداحافظی کن. یک پایان روشن و محترمانه، از وابستگی و سوءتفاهم جلوگیری می‌کند.',
  },
  {
    key: 'scenarios',
    title: '۷. تمرین سناریوها',
    body: 'در تمرین‌ها تشخیص بده چه زمانی سؤال بپرسی، چه زمانی احساس را بازتاب بدهی و چه زمانی مرز بگذاری. پاسخ خوب لازم نیست طولانی باشد؛ دقیق و محترمانه باشد.',
  },
];

const trainingScenarios = [
  {
    title: 'تنهایی',
    situation: 'مخاطب می‌گوید: «چند روز است با هیچ‌کس حرف نزده‌ام.»',
    weak: '«همه همین‌اند؛ خودت را سرگرم کن.»',
    better: '«به‌نظر می‌آید این چند روز سکوت برایت سنگین بوده. بیشتر از نبودن آدم‌ها اذیت می‌شوی یا از اینکه حرفت شنیده نمی‌شود؟»',
    why: 'احساس را کوچک نمی‌کند و با یک سؤال باز، راه ادامه گفت‌وگو را باز می‌گذارد.',
  },
  {
    title: 'فشار رابطه',
    situation: 'مخاطب از یک بحث سنگین با شریک عاطفی‌اش می‌گوید.',
    weak: '«فقط جدا شو؛ این رابطه به درد نمی‌خورد.»',
    better: '«این بحث کدام بخش رابطه را برایت سخت‌تر کرده؟ می‌خواهی فقط گوش بدهم یا دوست داری گزینه‌ها را با هم مرور کنیم؟»',
    why: 'به‌جای تصمیم‌گرفتن، نیاز مخاطب را روشن می‌کند و اختیار را نزد خودش نگه می‌دارد.',
  },
  {
    title: 'فشار کاری',
    situation: 'مخاطب می‌گوید: «از کارم خسته‌ام و دیگر توان ندارم.»',
    weak: '«استعفا بده و یک کار بهتر پیدا کن.»',
    better: '«خستگی‌ات بیشتر از حجم کار است یا از برخوردهایی که آنجا می‌بینی؟»',
    why: 'قبل از پیشنهاد، مسئله را دقیق‌تر می‌فهمد.',
  },
  {
    title: 'فقط می‌خواهم حرف بزنم',
    situation: 'مخاطب می‌گوید: «نمی‌خواهم راه‌حل بشنوم؛ فقط می‌خواهم خالی شوم.»',
    weak: '«این‌قدر به موضوع فکر نکن؛ فردا بهتر می‌شود.»',
    better: '«باشه، لازم نیست الان نتیجه بگیریم. از بخشی بگو که بیشتر روی سرت مانده.»',
    why: 'نیاز اعلام‌شده را می‌پذیرد و فضا را برای ادامه امن نگه می‌دارد.',
  },
  {
    title: 'درخواست نظر',
    situation: 'مخاطب می‌پرسد: «به‌نظرت چه کار کنم؟»',
    weak: '«همین امروز این تصمیم را بگیر.»',
    better: '«اگر بخواهی می‌توانیم گزینه‌ها را کنار هم ببینیم؛ تصمیم نهایی با خودت است.»',
    why: 'برای ورود به حل مسئله اجازه می‌گیرد و نقش شنونده را به جای صاحب تصمیم نمی‌نشاند.',
  },
  {
    title: 'عبور از مرز',
    situation: 'مخاطب می‌گوید: «شماره‌ات را بده تا بیرون از سرویس ادامه بدهیم.»',
    weak: '«باشه، این شماره من است.»',
    better: '«من اطلاعات تماس شخصی را ردوبدل نمی‌کنم. اگر بخواهی، در همین چارچوب گفت‌وگو را ادامه می‌دهیم.»',
    why: 'مرز را روشن، کوتاه و بدون تحقیر بیان می‌کند.',
  },
];

const questions = [
  {
    key: 'q_role',
    text: 'مخاطب پس از چند دقیقه می‌گوید: «تو بگو من چه تصمیمی بگیرم.» بهترین شروع کدام است؟',
    choices: [
      ['clarify_need', '«قبل از هرچیز، می‌خواهی فقط شنیده شوی یا دوست داری گزینه‌ها را با هم مرتب کنیم؟»'],
      ['decide_for_them', '«اگر جای تو بودم همین امروز تصمیم می‌گرفتم.»'],
      ['avoid_topic', '«من درباره این چیزها حرف نمی‌زنم.»'],
    ],
  },
  {
    key: 'q_reflection',
    text: 'مخاطب درباره فشار کاری طولانی حرف زده و مکث کرده است. کدام پاسخ مناسب‌تر است؟',
    choices: [
      ['reflect', '«به‌نظر می‌آید مدت‌هاست هم خسته‌ای و هم احساس می‌کنی کسی متوجه این فشار نیست.»'],
      ['interrogate', '«دقیقاً چه کسی مقصر است؟ از اول همه جزئیات را بگو.»'],
      ['compare', '«من هم همین مشکل را داشتم و از تو بدتر بود.»'],
    ],
  },
  {
    key: 'q_not_minimize',
    text: 'مخاطب می‌گوید: «از این جدایی هنوز به‌هم ریخته‌ام.» کدام پاسخ بهتر است؟',
    choices: [
      ['acknowledge', '«می‌فهمم که هنوز برایت سنگین است. دوست داری بیشتر از کدام بخشش بگویی؟»'],
      ['minimize', '«زمان همه‌چیز را حل می‌کند؛ بی‌خیالش شو.»'],
      ['rush_advice', '«با نفر بعدی وارد رابطه شو تا یادت برود.»'],
    ],
  },
  {
    key: 'q_boundary',
    text: 'مخاطب شماره یا شناسه شبکه اجتماعی‌ات را می‌خواهد. چه می‌کنی؟',
    choices: [
      ['keep_on_platform', 'محترمانه می‌گویم اطلاعات تماس شخصی را ردوبدل نمی‌کنم و گفت‌وگو را داخل سرویس نگه می‌دارم.'],
      ['share_contact', 'اگر گفت‌وگو خوب پیش رفته باشد، اطلاعاتم را می‌دهم.'],
      ['shame_request', 'او را بابت این درخواست سرزنش می‌کنم تا دیگر تکرار نکند.'],
    ],
  },
  {
    key: 'q_sensitive',
    text: 'مخاطب از تهدید جدی یا خطر فوری حرف می‌زند. واکنش مناسب‌تر چیست؟',
    choices: [
      ['safety_path', 'آرام می‌مانم، ادعای درمان یا نجات نمی‌کنم و طبق مسیر ایمنی سرویس، گزارش و خروج امن را فعال می‌کنم.'],
      ['promise_secrecy', 'قول می‌دهم هرچه گفت محرمانه می‌ماند و خودم موضوع را حل می‌کنم.'],
      ['ignore_risk', 'موضوع را عوض می‌کنم تا گفت‌وگو ناراحت‌کننده نشود.'],
    ],
  },
  {
    key: 'q_closure',
    text: 'زمان گفت‌وگو رو به پایان است. کدام پایان حرفه‌ای‌تر است؟',
    choices: [
      ['close_respectfully', 'خلاصه می‌کنم چه چیزی شنیدم و روشن می‌گویم که گفت‌وگو را همین‌جا می‌بندیم.'],
      ['promise_return', 'قول می‌دهم هر زمان خواست خارج از سرویس با او در تماس باشم.'],
      ['disappear', 'بدون توضیح تماس را قطع می‌کنم تا مجبور به خداحافظی نباشم.'],
    ],
  },
  {
    key: 'q_advice',
    text: 'مخاطب مستقیم می‌پرسد: «اگر جای من بودی چه می‌کردی؟»',
    choices: [
      ['ask_permission', 'اول می‌پرسم آیا دوست دارد فقط شنیده شود یا با هم گزینه‌های ممکن را بررسی کنیم.'],
      ['give_order', 'یک دستور روشن می‌دهم تا مسئولیت تصمیم از روی دوش او برداشته شود.'],
      ['self_story', 'داستان مشابه خودم را تعریف می‌کنم و نتیجه تجربه خودم را پیشنهاد می‌دهم.'],
    ],
  },
] as const;

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_application_not_found: 'درخواست شنونده پیدا نشد.',
    training_locked: 'مرحله آموزش برای این درخواست بسته شده.',
    invalid_training_module: 'بخش آموزش معتبر نیست.',
    training_incomplete: 'اول هر هفت بخش آموزش را کامل کن.',
    assessment_pending_review: 'آزمون قبلی هنوز در حال بررسی است.',
    assessment_locked: 'مرحله آزمون برای این درخواست بسته شده.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

export default function ListenerTrainingScreen({ token, onDone }: Props) {
  const [application, setApplication] = useState<ListenerApplicationResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busyModule, setBusyModule] = useState<ListenerTrainingModuleKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const value = await getListenerApplication(token);
    setApplication(value);
  }

  useEffect(() => {
    refresh().catch((cause) => setError(messageFor(getErrorCode(cause))));
  }, [token]);

  const completed = useMemo(
    () => new Set(
      application?.training
        .filter((item) => item.status === 'completed' && item.progress_percent === 100)
        .map((item) => item.module_key) ?? [],
    ),
    [application],
  );

  const allAnswered = questions.every((question) => Boolean(answers[question.key]));
  const assessment = application?.latestAssessment ?? null;

  async function completeModule(moduleKey: ListenerTrainingModuleKey) {
    if (completed.has(moduleKey) || busyModule) return;
    setError('');
    setBusyModule(moduleKey);
    try {
      await completeListenerTraining(token, moduleKey);
      await refresh();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setBusyModule(null);
    }
  }

  async function submitAssessment() {
    if (!allAnswered || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await submitListenerAssessment(token, answers);
      await refresh();
    } catch (cause) {
      setError(messageFor(getErrorCode(cause)));
    } finally {
      setSubmitting(false);
    }
  }

  if (!application) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>آموزش شنونده</Text>
        <Text style={styles.body}>{error || 'در حال بارگذاری…'}</Text>
      </View>
    );
  }

  if (['assessment_passed', 'kyc_pending', 'kyc_expired'].includes(application.status)) {
    return <ListenerKycScreen token={token} onDone={onDone} />;
  }

  if (['agreement_pending', 'admin_review', 'mock_call', 'suspended', 'rejected', 'archived'].includes(application.status)) {
    const labels: Record<string, string> = {
      agreement_pending: 'در انتظار قرارداد',
      admin_review: 'در بررسی نهایی',
      mock_call: 'در مرحله تماس آزمایشی',
      suspended: 'حساب معلق است',
      rejected: 'درخواست رد شده است',
      archived: 'درخواست بایگانی شده است',
    };
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{labels[application.status] ?? 'وضعیت درخواست'}</Text>
        <Text style={styles.body}>
          این مرحله از داخل برنامه قابل تغییر نیست. آموزش یا آزمون قبلی فقط وقتی دوباره باز می‌شود که وضعیت واقعی سرور به مرحله قابل‌ویرایش برگردد.
        </Text>
        <TouchableOpacity onPress={onDone} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>برگشت</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>آموزش شنونده</Text>
      <Text style={styles.helper}>هفت بخش را با دقت بخوان. سناریوهای تمرینی را مرور کن و بعد یک آزمون واقعی برای بررسی می‌دهی.</Text>

      {modules.map((module) => {
        const done = completed.has(module.key);
        return (
          <View key={module.key} style={[styles.module, done && styles.moduleDone]}>
            <Text style={styles.moduleTitle}>{module.title}</Text>
            <Text style={styles.body}>{module.body}</Text>
            <TouchableOpacity
              disabled={done || busyModule !== null}
              onPress={() => completeModule(module.key)}
              style={[styles.button, (done || busyModule !== null) && styles.disabled]}
            >
              <Text style={styles.buttonText}>
                {done ? '✓ کامل شد' : busyModule === module.key ? 'در حال ثبت…' : 'خواندم و متوجه شدم'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.scenarioGrid} accessibilityLabel="سناریوهای تمرینی">
        {trainingScenarios.map((scenario) => (
          <View key={scenario.title} style={styles.scenario}>
            <Text style={styles.scenarioTitle}>{scenario.title}</Text>
            <Text style={styles.scenarioText}>{scenario.situation}</Text>
            <Text style={styles.scenarioLabel}>پاسخ ضعیف</Text>
            <Text style={styles.scenarioText}>{scenario.weak}</Text>
            <Text style={styles.scenarioLabel}>پاسخ بهتر</Text>
            <Text style={styles.scenarioText}>{scenario.better}</Text>
            <Text style={styles.scenarioLabel}>چرا؟</Text>
            <Text style={styles.scenarioText}>{scenario.why}</Text>
          </View>
        ))}
      </View>

      {application.trainingComplete && (!assessment || assessment.result === 'failed') && (
        <View style={styles.assessment}>
          <Text style={styles.sectionTitle}>آزمون سناریویی</Text>
          {questions.map((question) => (
            <View key={question.key} style={styles.question}>
              <Text style={styles.questionText}>{question.text}</Text>
              {question.choices.map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setAnswers((current) => ({ ...current, [question.key]: value }))}
                  style={[styles.choice, answers[question.key] === value && styles.choiceSelected]}
                >
                  <Text style={styles.choiceText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity
            disabled={!allAnswered || submitting}
            onPress={submitAssessment}
            style={[styles.button, (!allAnswered || submitting) && styles.disabled]}
          >
            <Text style={styles.buttonText}>{submitting ? 'در حال ارسال…' : 'ارسال آزمون برای بررسی'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {assessment?.result === 'pending' && (
        <View style={styles.notice}>
          <Text style={styles.sectionTitle}>آزمون ارسال شد</Text>
          <Text style={styles.body}>نتیجه هنوز تأیید نشده. مرحله احراز هویت فقط بعد از قبولی آزمون باز می‌شود.</Text>
        </View>
      )}

      {assessment?.result === 'passed' && (
        <View style={styles.notice}>
          <Text style={styles.sectionTitle}>آزمون تأیید شد</Text>
          <Text style={styles.body}>احراز هویت برای این درخواست آماده است.</Text>
        </View>
      )}

      {assessment?.result === 'failed' && (
        <View style={styles.notice}>
          <Text style={styles.sectionTitle}>نیاز به تلاش دوباره</Text>
          <Text style={styles.body}>درخواستت بسته نشده. پاسخ‌ها را دوباره مرور کن و آزمون بعدی را وقتی آماده بودی ارسال کن.</Text>
          <TouchableOpacity onPress={() => setApplication({ ...application, latestAssessment: null })} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>آزمون دوباره</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity onPress={onDone} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>برگشت به خانه</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 22, gap: 14 },
  title: { color: '#20211f', textAlign: 'right', fontSize: 24, fontWeight: '800', lineHeight: 34 },
  helper: { textAlign: 'right', color: '#84837c', fontSize: 13, lineHeight: 22 },
  module: { borderWidth: 1, borderColor: '#e2dfd7', borderRadius: 16, padding: 15, gap: 10 },
  moduleDone: { backgroundColor: '#f0f4ed', borderColor: '#b7c3af' },
  moduleTitle: { color: '#20211f', fontWeight: '800', textAlign: 'right', fontSize: 17 },
  body: { color: '#66665f', textAlign: 'right', fontSize: 15, lineHeight: 25 },
  button: { backgroundColor: '#20211f', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  buttonText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  disabled: { opacity: 0.35 },
  scenarioGrid: { gap: 12, marginTop: 2 },
  scenario: { borderWidth: 1, borderColor: '#e2dfd7', borderRadius: 16, padding: 15, gap: 8, backgroundColor: '#fffefa' },
  scenarioTitle: { color: '#20211f', fontWeight: '800', textAlign: 'right', fontSize: 17 },
  scenarioLabel: { color: '#5d7058', fontWeight: '800', textAlign: 'right', fontSize: 13, marginTop: 4 },
  scenarioText: { color: '#66665f', textAlign: 'right', fontSize: 14, lineHeight: 23 },
  assessment: { gap: 14, marginTop: 6 },
  sectionTitle: { color: '#20211f', fontWeight: '800', textAlign: 'right', fontSize: 19 },
  question: { gap: 9, backgroundColor: '#f7f6f2', padding: 14, borderRadius: 14 },
  questionText: { textAlign: 'right', color: '#343530', lineHeight: 24, fontWeight: '700' },
  choice: { borderWidth: 1, borderColor: '#dad7cf', borderRadius: 12, padding: 12, backgroundColor: '#ffffff' },
  choiceSelected: { borderColor: '#68735f', backgroundColor: '#e9eee5' },
  choiceText: { textAlign: 'right', color: '#3d3e39', lineHeight: 22 },
  notice: { backgroundColor: '#f3f1ec', borderRadius: 14, padding: 15, gap: 8 },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 12, lineHeight: 22 },
  secondaryButton: { borderWidth: 1, borderColor: '#d8d5cd', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  secondaryText: { color: '#44453f', textAlign: 'center', fontWeight: '700' },
});
