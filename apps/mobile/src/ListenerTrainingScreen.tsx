import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    key: 'active_listening',
    title: '۱. گوش‌دادن فعال',
    body: 'قرار نیست سریع راه‌حل بدهی. اول گوش می‌دهی، حرف طرف مقابل را می‌فهمی و با سؤال طبیعی کمک می‌کنی خودش ادامه بدهد.',
  },
  {
    key: 'role_boundary',
    title: '۲. مرز نقش',
    body: 'تو درمانگر، پزشک یا مشاور حقوقی نیستی. تشخیص نمی‌دهی، نسخه نمی‌پیچی و خودت را متخصص معرفی نمی‌کنی.',
  },
  {
    key: 'safety',
    title: '۳. ایمنی',
    body: 'اگر مکالمه شامل تهدید، آزار، رفتار جنسی یا وضعیت ناامن شد، از Safety Exit و گزارش داخل اپ استفاده می‌کنی. پروتکل بحران پیش از بتای پولی به‌صورت جدا قفل می‌شود.',
  },
  {
    key: 'platform_rules',
    title: '۴. قوانین پلتفرم',
    body: 'قرار عاشقانه، سکس‌چت، درخواست شماره یا آیدی خارج از اپ و انتقال رابطه به بیرون از پلتفرم ممنوع است.',
  },
];

const questions = [
  {
    key: 'q_listening',
    text: 'Caller می‌گوید: «فقط می‌خوام یکی گوش بده.» بهترین واکنش کدام است؟',
    choices: [
      ['listen', '«باشه، من اینجام. از هرجا راحتی شروع کن.»'],
      ['diagnose', '«احتمالاً افسردگی داری.»'],
    ],
  },
  {
    key: 'q_contact',
    text: 'Caller از تو شماره یا آیدی شخصی می‌خواهد. چه می‌کنی؟',
    choices: [
      ['decline_contact', 'محترمانه رد می‌کنم و مکالمه را داخل پلتفرم نگه می‌دارم.'],
      ['share_contact', 'اگر آدم خوبی بود شماره‌ام را می‌دهم.'],
    ],
  },
  {
    key: 'q_boundary',
    text: 'Caller از تو تشخیص پزشکی یا روان‌شناختی قطعی می‌خواهد. چه می‌کنی؟',
    choices: [
      ['no_diagnosis', 'می‌گویم این خارج از نقش من است و تشخیص نمی‌دهم.'],
      ['give_diagnosis', 'بر اساس تجربه شخصی تشخیص می‌دهم.'],
    ],
  },
] as const;

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    listener_application_not_found: 'درخواست شنونده پیدا نشد.',
    training_locked: 'مرحله آموزش برای این درخواست بسته شده.',
    invalid_training_module: 'بخش آموزش معتبر نیست.',
    training_incomplete: 'اول هر چهار بخش آموزش را کامل کن.',
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

  return (
    <View style={styles.card}>
      <Text style={styles.title}>آموزش شنونده</Text>
      <Text style={styles.helper}>چهار بخش کوتاه را بخوان. بعد یک آزمون سناریویی می‌دهی و نتیجه برای بررسی می‌رود.</Text>

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

      {application.trainingComplete && !assessment && (
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
          <Text style={styles.body}>مرحله بعد احراز هویت است. تا وقتی فرایند KYC رسمی قفل نشده، اطلاعات هویتی داخل این صفحه جمع نمی‌کنیم.</Text>
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
