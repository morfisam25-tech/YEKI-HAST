import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  createListenerApplication,
  getBootstrap,
  getErrorCode,
  normalizeIranPhone,
  requestOtp,
  verifyOtp,
  type BootstrapLanguage,
} from './src/api';
import ListenerTrainingScreen from './src/ListenerTrainingScreen';

type Screen =
  | 'home'
  | 'waitlist'
  | 'listener-intro'
  | 'auth-phone'
  | 'auth-code'
  | 'listener-profile'
  | 'listener-training';

type ChoiceProps = { label: string; selected?: boolean; onPress: () => void };

const fallbackLanguages: BootstrapLanguage[] = [
  { code: 'fa', nameFa: 'فارسی', nameEn: 'Persian' },
  { code: 'az', nameFa: 'ترکی آذری', nameEn: 'Azerbaijani' },
  { code: 'ku', nameFa: 'کردی', nameEn: 'Kurdish' },
  { code: 'lrc', nameFa: 'لری', nameEn: 'Luri' },
  { code: 'ar', nameFa: 'عربی', nameEn: 'Arabic' },
];

function Choice({ label, selected, onPress }: ChoiceProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_phone: 'شماره موبایل را درست وارد کن.',
    invalid_otp: 'کد واردشده درست نیست یا منقضی شده.',
    otp_request_rate_limited: 'تعداد درخواست کد زیاد شده. کمی بعد دوباره امتحان کن.',
    auth_not_configured: 'ورود نسخه آزمایشی هنوز فعال نشده.',
    sms_delivery_unavailable: 'ارسال پیامک موقتاً در دسترس نیست.',
    unknown_language: 'یکی از زبان‌های انتخاب‌شده در دسترس نیست.',
    application_locked: 'این درخواست وارد مرحله بعد شده و دیگر قابل ویرایش نیست.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [languageOptions, setLanguageOptions] = useState<BootstrapLanguage[]>(fallbackLanguages);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['fa']);
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | null>(null);
  const [shortIntro, setShortIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBootstrap()
      .then((value) => {
        if (value.languages.length) {
          setLanguageOptions(value.languages);
          if (!value.languages.some((x) => x.code === 'fa')) {
            setSelectedLanguages([value.languages[0].code]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const canContinueProfile = useMemo(
    () => nickname.trim().length >= 2 && gender !== null && selectedLanguages.length > 0,
    [nickname, gender, selectedLanguages],
  );

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((current) => {
      if (current.includes(code)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== code);
      }
      return [...current, code];
    });
  };

  async function sendCode() {
    setError('');
    setBusy(true);
    try {
      const normalized = normalizeIranPhone(phone);
      await requestOtp(normalized);
      setPhoneE164(normalized);
      setScreen('auth-code');
    } catch (cause) {
      setError(errorMessage(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    setError('');
    setBusy(true);
    try {
      const session = await verifyOtp(phoneE164, otp.trim());
      setToken(session.token);
      setScreen('listener-profile');
    } catch (cause) {
      setError(errorMessage(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function submitListenerApplication() {
    if (!token || !gender || !canContinueProfile) return;
    setError('');
    setBusy(true);
    try {
      await createListenerApplication(token, {
        nickname: nickname.trim(),
        gender,
        shortIntro: shortIntro.trim() || undefined,
        languages: selectedLanguages.map((code) => ({ code, proficiency: 'fluent' as const })),
      });
      setScreen('listener-training');
    } catch (cause) {
      setError(errorMessage(getErrorCode(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>یکی هست</Text>

        {screen === 'home' && (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>برای وقتی که فقط یک آدم واقعی می‌خواهی</Text>
              <Text style={styles.title}>دلت می‌خواد با یکی حرف بزنی؟</Text>
              <Text style={styles.heroBody}>بخش مکالمه برای Caller هنوز در بتای بسته است.</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('waitlist')}>
                <Text style={styles.secondaryButtonText}>اطلاعات شروع Caller</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>شنونده خوبی هستی؟</Text>
              <Text style={styles.body}>اول کار را ببین، با شماره موبایل وارد شو و پروفایل آزمایشی‌ات را بساز.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('listener-intro')}>
                <Text style={styles.primaryButtonText}>می‌خوام شنونده بشم</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === 'waitlist' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>Caller هنوز باز نشده</Text>
            <Text style={styles.body}>
              ثبت Caller بعد از نهایی‌شدن سیاست سنی و فعال‌شدن بتای بسته باز می‌شود. فعلاً هیچ ثبت صوری انجام نمی‌دهیم.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('home')}>
              <Text style={styles.primaryButtonText}>برگشت</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'listener-intro' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>شنونده بودن یعنی چی؟</Text>
            <Text style={styles.body}>
              کار تو درمان یا مشاوره نیست. گوش می‌دی، سؤال طبیعی می‌پرسی و با احترام همراه مکالمه می‌مونی.
              هویت واقعی‌ات بعداً فقط برای قرارداد، احراز و پرداخت نزد پلتفرم ثبت می‌شود و Caller آن را نمی‌بیند.
            </Text>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ ساعات حضورت را خودت تعیین می‌کنی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ وقتی Online هستی یعنی آماده پاسخگویی هستی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ شماره واقعی دو طرف نمایش داده نمی‌شود.</Text></View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => { setError(''); setScreen('auth-phone'); }}>
              <Text style={styles.primaryButtonText}>ادامه با شماره موبایل</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.link}>فعلاً نه</Text></TouchableOpacity>
          </View>
        )}

        {screen === 'auth-phone' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>ورود با شماره موبایل</Text>
            <Text style={styles.helper}>شماره فقط نزد پلتفرم می‌ماند و در پروفایل عمومی نمایش داده نمی‌شود.</Text>
            <TextInput
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="0912..."
              style={styles.input}
              textAlign="right"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={sendCode}>
              <Text style={styles.primaryButtonText}>{busy ? 'در حال ارسال…' : 'ارسال کد'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('listener-intro')}><Text style={styles.link}>برگشت</Text></TouchableOpacity>
          </View>
        )}

        {screen === 'auth-code' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>کد تأیید</Text>
            <Text style={styles.helper}>کد ۶ رقمی پیامک‌شده را وارد کن.</Text>
            <TextInput
              keyboardType="number-pad"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="------"
              maxLength={6}
              style={styles.input}
              textAlign="center"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity disabled={busy || otp.length !== 6} style={[styles.primaryButton, (busy || otp.length !== 6) && styles.disabled]} onPress={confirmCode}>
              <Text style={styles.primaryButtonText}>{busy ? 'در حال بررسی…' : 'تأیید و ادامه'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('auth-phone')}><Text style={styles.link}>تغییر شماره</Text></TouchableOpacity>
          </View>
        )}

        {screen === 'listener-profile' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>پروفایل آزمایشی</Text>
            <Text style={styles.helper}>فعلاً اسم واقعی، مدرک هویتی یا حساب بانکی لازم نیست.</Text>

            <Text style={styles.label}>اسم مستعار</Text>
            <TextInput value={nickname} onChangeText={setNickname} placeholder="مثلاً رها" style={styles.input} textAlign="right" />

            <Text style={styles.label}>جنسیت</Text>
            <View style={styles.row}>
              <Choice label="زن" selected={gender === 'female'} onPress={() => setGender('female')} />
              <Choice label="مرد" selected={gender === 'male'} onPress={() => setGender('male')} />
            </View>

            <Text style={styles.label}>زبان‌هایی که روان صحبت می‌کنی</Text>
            <View style={styles.wrap}>
              {languageOptions.map((item) => (
                <Choice key={item.code} label={item.nameFa} selected={selectedLanguages.includes(item.code)} onPress={() => toggleLanguage(item.code)} />
              ))}
            </View>

            <Text style={styles.label}>معرفی کوتاه (اختیاری)</Text>
            <TextInput
              value={shortIntro}
              onChangeText={(value) => setShortIntro(value.slice(0, 500))}
              placeholder="مثلاً شنونده آرامی هستم و بدون قضاوت گوش می‌دم."
              style={[styles.input, styles.multiline]}
              multiline
              textAlign="right"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              disabled={!canContinueProfile || busy}
              style={[styles.primaryButton, (!canContinueProfile || busy) && styles.disabled]}
              onPress={submitListenerApplication}
            >
              <Text style={styles.primaryButtonText}>{busy ? 'در حال ثبت…' : 'ثبت درخواست و دیدن آموزش'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'listener-training' && token && (
          <ListenerTrainingScreen token={token} onDone={() => setScreen('home')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f3ee' },
  page: { padding: 20, gap: 18, direction: 'rtl' },
  brand: { fontSize: 21, fontWeight: '800', textAlign: 'right', color: '#20211f', marginTop: 8 },
  hero: { backgroundColor: '#20211f', padding: 24, borderRadius: 24, gap: 14 },
  eyebrow: { color: '#c8c6bf', textAlign: 'right', fontSize: 13 },
  title: { color: '#ffffff', textAlign: 'right', fontSize: 30, fontWeight: '800', lineHeight: 42 },
  heroBody: { color: '#d6d4cd', textAlign: 'right', fontSize: 16, lineHeight: 27 },
  titleSmall: { color: '#20211f', textAlign: 'right', fontSize: 24, fontWeight: '800', lineHeight: 34 },
  body: { color: '#66665f', textAlign: 'right', fontSize: 16, lineHeight: 27 },
  card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 22, gap: 14 },
  cardTitle: { color: '#20211f', textAlign: 'right', fontSize: 22, fontWeight: '800' },
  primaryButton: { backgroundColor: '#20211f', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, marginTop: 4 },
  primaryButtonText: { color: '#ffffff', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  secondaryButton: { backgroundColor: '#ffffff', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16 },
  secondaryButtonText: { color: '#20211f', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#dedbd3', borderRadius: 14, padding: 14, fontSize: 16, color: '#20211f', backgroundColor: '#fbfaf7' },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  label: { textAlign: 'right', color: '#20211f', fontWeight: '700', marginTop: 5 },
  helper: { textAlign: 'right', color: '#84837c', fontSize: 13, lineHeight: 22 },
  error: { textAlign: 'right', color: '#8a3430', backgroundColor: '#f9ecea', borderRadius: 12, padding: 12, lineHeight: 22 },
  link: { textAlign: 'center', color: '#55564f', padding: 8 },
  row: { flexDirection: 'row-reverse', gap: 10 },
  wrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#d8d5cd', paddingVertical: 11, paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#ffffff' },
  choiceSelected: { backgroundColor: '#e8ece4', borderColor: '#798272' },
  choiceText: { color: '#44453f' },
  choiceTextSelected: { color: '#20211f', fontWeight: '800' },
  rule: { backgroundColor: '#f6f5f1', padding: 12, borderRadius: 12 },
  ruleText: { color: '#40413c', textAlign: 'right', lineHeight: 23 },
  disabled: { opacity: 0.35 },
});
