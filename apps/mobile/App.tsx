import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
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
  getCurrentSession,
  getErrorCode,
  getListenerApplication,
  logoutCurrentSession,
  type BootstrapLanguage,
  type SessionResponse,
} from './src/api';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './src/session-storage';
import CallerClosedBetaScreen from './src/CallerClosedBetaScreen';
import EmailAuthScreen from './src/EmailAuthScreen';
import ListenerKycScreen from './src/ListenerKycScreen';
import ListenerTrainingScreen from './src/ListenerTrainingScreen';
import ListenerWorkScreen from './src/ListenerWorkScreen';
import { mobileRadius, mobileTheme } from './src/theme';

type Screen =
  | 'home'
  | 'waitlist'
  | 'listener-intro'
  | 'auth-email'
  | 'caller-beta'
  | 'listener-profile'
  | 'listener-training'
  | 'listener-kyc'
  | 'listener-work';

type AuthPurpose = 'listener' | 'caller';
type ChoiceProps = { label: string; selected?: boolean; onPress: () => void };

function Choice({ label, selected, onPress }: ChoiceProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BrandLockup() {
  return (
    <View style={styles.brandLockup}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>◒</Text></View>
      <View>
        <Text style={styles.brand}>یکی هست</Text>
        <Text style={styles.brandTagline}>یک انسان، برای شنیدن</Text>
      </View>
    </View>
  );
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    caller_closed_beta_disabled: 'مسیر گفت‌وگو در این محیط فعال نیست.',
    unknown_language: 'یکی از زبان‌های انتخاب‌شده در دسترس نیست.',
    application_locked: 'این درخواست وارد مرحله بعد شده و دیگر قابل ویرایش نیست.',
    listener_application_not_found: 'درخواست شنونده هنوز ساخته نشده.',
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

const PUBLIC_LINKS = [
  ['حریم خصوصی', 'https://yekihast.app/privacy'],
  ['قوانین استفاده', 'https://yekihast.app/terms'],
  ['مرکز ایمنی', 'https://yekihast.app/safety'],
  ['ایمنی کودک', 'https://yekihast.app/safety/children'],
  ['حذف حساب', 'https://yekihast.app/account/delete'],
  ['پشتیبانی', 'mailto:sales@uniqueholding.com.tr'],
] as const;

function LegalLinks({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.legalBox, compact && styles.legalBoxCompact]}>
      {!compact && <Text style={styles.legalTitle}>اطلاعات و پشتیبانی</Text>}
      <View style={styles.legalRow}>
        {PUBLIC_LINKS.map(([label, url]) => (
          <TouchableOpacity key={url} onPress={() => { void Linking.openURL(url).catch(() => undefined); }}>
            <Text style={styles.legalLink}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function screenForApplicationStatus(status: string): Screen {
  if (status === 'approved' || status === 'active') return 'listener-work';
  if (status === 'assessment_passed' || status === 'kyc_pending' || status === 'kyc_expired') return 'listener-kyc';
  if (status === 'exploring' || status === 'training' || status === 'assessment') return 'listener-training';
  return 'listener-training';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [authPurpose, setAuthPurpose] = useState<AuthPurpose>('listener');
  const [callerBetaEnabled, setCallerBetaEnabled] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [sessionRestoreComplete, setSessionRestoreComplete] = useState(false);
  const [languageOptions, setLanguageOptions] = useState<BootstrapLanguage[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | null>(null);
  const [shortIntro, setShortIntro] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    setBootstrapReady(false);
    setBootstrapAvailable(false);

    getBootstrap()
      .then((value) => {
        if (disposed) return;
        if (!value.languages.length) throw new Error('bootstrap_languages_unavailable');
        const bootstrap = value as typeof value & { features?: { callerClosedBetaEnabled?: boolean } };
        setCallerBetaEnabled(bootstrap.features?.callerClosedBetaEnabled === true);
        setLanguageOptions(value.languages);
        setSelectedLanguages((current) => {
          const stillValid = current.filter((code) => value.languages.some((item) => item.code === code));
          if (stillValid.length) return stillValid;
          const preferred = value.languages.find((item) => item.code === 'fa') ?? value.languages[0];
          return [preferred.code];
        });
        setBootstrapAvailable(true);
      })
      .catch(() => {
        if (disposed) return;
        setCallerBetaEnabled(false);
        setLanguageOptions([]);
        setSelectedLanguages([]);
        setBootstrapAvailable(false);
      })
      .finally(() => {
        if (!disposed) setBootstrapReady(true);
      });

    return () => { disposed = true; };
  }, [bootstrapAttempt]);

  async function resumeListener(sessionToken: string) {
    try {
      const application = await getListenerApplication(sessionToken);
      setScreen(screenForApplicationStatus(application.status));
    } catch (cause) {
      const code = getErrorCode(cause);
      if (code === 'listener_application_not_found') {
        setScreen('listener-profile');
        return;
      }
      throw cause;
    }
  }

  useEffect(() => {
    if (!bootstrapReady) return;
    if (!bootstrapAvailable) {
      setSessionRestoreComplete(true);
      return;
    }
    let disposed = false;

    async function restoreSession() {
      try {
        const stored = await loadStoredSession();
        if (!stored || disposed) return;
        await getCurrentSession(stored.token);
        if (disposed) return;
        setToken(stored.token);
        setAuthPurpose(stored.purpose);
        if (stored.purpose === 'caller') {
          setScreen(callerBetaEnabled ? 'caller-beta' : 'waitlist');
          return;
        }
        await resumeListener(stored.token);
      } catch (cause) {
        const code = getErrorCode(cause);
        if (code === 'unauthorized') {
          await clearStoredSession().catch(() => undefined);
          if (!disposed) {
            setToken('');
            setScreen('home');
          }
          return;
        }
        if (!disposed) setError(errorMessage(code));
      } finally {
        if (!disposed) setSessionRestoreComplete(true);
      }
    }

    void restoreSession();
    return () => { disposed = true; };
  }, [bootstrapReady, bootstrapAvailable, callerBetaEnabled]);

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

  function retryBootstrap() {
    setError('');
    setSessionRestoreComplete(false);
    setBootstrapAttempt((current) => current + 1);
  }

  function beginListenerAuth() {
    setAuthPurpose('listener');
    setError('');
    setScreen('auth-email');
  }

  function beginCallerAuth() {
    if (!callerBetaEnabled) {
      setScreen('waitlist');
      return;
    }
    setAuthPurpose('caller');
    setError('');
    setScreen('auth-email');
  }

  async function completeEmailAuth(session: SessionResponse) {
    setToken(session.token);
    await saveStoredSession(session.token, authPurpose).catch(() => undefined);
    if (authPurpose === 'caller') {
      if (!callerBetaEnabled) {
        setScreen('waitlist');
        return;
      }
      setScreen('caller-beta');
      return;
    }
    await resumeListener(session.token);
  }

  async function logout() {
    if (busy) return;
    const currentToken = token;
    setBusy(true);
    try {
      if (currentToken) await logoutCurrentSession(currentToken);
    } catch {
      // Local logout must still complete when the network is unavailable.
    } finally {
      await clearStoredSession().catch(() => undefined);
      setToken('');
      setAuthPurpose('listener');
      setError('');
      setScreen('home');
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

  if (!bootstrapReady || !sessionRestoreComplete) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.restorePage}>
          <BrandLockup />
          <Text style={styles.helperOnDark}>در حال بررسی سرویس و نشست امن…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!bootstrapAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.restorePage}>
          <BrandLockup />
          <Text style={styles.titleOnDark}>سرویس موقتاً در دسترس نیست</Text>
          <Text style={styles.bodyOnDark}>
            برای جلوگیری از ثبت ناقص، ورود و ثبت‌نام تا دریافت اطلاعات اصلی سرویس از سرور باز نمی‌شود.
          </Text>
          <TouchableOpacity style={styles.accentButton} onPress={retryBootstrap}>
            <Text style={styles.accentButtonText}>تلاش دوباره</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'caller-beta' && token) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.sessionBar}>
          <BrandLockup />
          <TouchableOpacity disabled={busy} onPress={logout}>
            <Text style={styles.logoutTextOnDark}>{busy ? 'در حال خروج…' : 'خروج از حساب'}</Text>
          </TouchableOpacity>
        </View>
        <LegalLinks compact />
        <CallerClosedBetaScreen token={token} onClose={() => setScreen('home')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <BrandLockup />

        {screen === 'home' && (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>گفت‌وگو با یک شنوندهٔ انسانی</Text>
              <Text style={styles.title}>گاهی فقط لازم است یکی واقعاً گوش بدهد.</Text>
              <Text style={styles.heroBody}>
                {callerBetaEnabled
                  ? 'گفت‌وگوی آزمایشی در این محیط فعال است. ورود با ایمیل انجام می‌شود و تماس از اینترنت برقرار می‌شود.'
                  : 'گفت‌وگوی عمومی فعلاً بسته است. ورود و مسیر شنونده‌شدن در دسترس است.'}
              </Text>
              <TouchableOpacity style={styles.outlineButton} onPress={beginCallerAuth}>
                <Text style={styles.outlineButtonText}>{callerBetaEnabled ? 'ورود به گفت‌وگوی آزمایشی' : 'وضعیت گفت‌وگو'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>مسیر شنونده</Text>
              <Text style={styles.cardTitle}>شنونده خوبی هستی؟</Text>
              <Text style={styles.body}>اول نقش و مرزها را ببین، با ایمیل وارد شو و مسیر آموزش را شروع کن.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('listener-intro')}>
                <Text style={styles.primaryButtonText}>می‌خوام شنونده بشم</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === 'waitlist' && (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>وضعیت فعلی</Text>
            <Text style={styles.titleSmall}>گفت‌وگوی عمومی هنوز باز نشده است</Text>
            <Text style={styles.body}>
              در نسخه فعلی، مسیر Caller برای عموم بسته است. تا بازشدن رسمی این بخش، تماس یا پرداخت عمومی فعال نمی‌شود.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('home')}>
              <Text style={styles.primaryButtonText}>برگشت</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'listener-intro' && (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>قبل از شروع</Text>
            <Text style={styles.titleSmall}>شنونده بودن یعنی چی؟</Text>
            <Text style={styles.body}>
              کار تو درمان یا مشاوره نیست. گوش می‌دی، سؤال طبیعی می‌پرسی و با احترام همراه مکالمه می‌مونی.
              هویت واقعی‌ات بعداً فقط برای قرارداد، احراز و پرداخت نزد پلتفرم ثبت می‌شود و Caller آن را نمی‌بیند.
            </Text>
            <View style={styles.rule}><Text style={styles.ruleText}>ساعات حضورت را خودت تعیین می‌کنی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>وقتی Online هستی یعنی آماده پاسخگویی هستی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>تماس صوتی از اینترنت انجام می‌شود و شماره واقعی دو طرف نمایش داده نمی‌شود.</Text></View>
            <TouchableOpacity style={styles.primaryButton} onPress={beginListenerAuth}>
              <Text style={styles.primaryButtonText}>ادامه با ایمیل</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.link}>فعلاً نه</Text></TouchableOpacity>
          </View>
        )}

        {screen === 'auth-email' && (
          <EmailAuthScreen
            onAuthenticated={completeEmailAuth}
            onBack={() => setScreen(authPurpose === 'caller' ? 'home' : 'listener-intro')}
          />
        )}

        {screen === 'listener-profile' && (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>پروفایل شنونده</Text>
            <Text style={styles.titleSmall}>پروفایل آزمایشی</Text>
            <Text style={styles.helper}>فعلاً اسم واقعی، مدرک هویتی یا حساب بانکی لازم نیست.</Text>

            <Text style={styles.label}>اسم مستعار</Text>
            <TextInput value={nickname} onChangeText={setNickname} placeholder="مثلاً رها" placeholderTextColor="#9A8F85" style={styles.input} textAlign="right" />

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
              placeholderTextColor="#9A8F85"
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

        {screen === 'listener-kyc' && token && (
          <ListenerKycScreen token={token} onDone={() => setScreen('home')} />
        )}

        {screen === 'listener-work' && token && (
          <ListenerWorkScreen token={token} onDone={() => setScreen('home')} />
        )}

        <LegalLinks />

        {token && (
          <TouchableOpacity disabled={busy} onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>{busy ? 'در حال خروج…' : 'خروج از حساب'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: mobileTheme.deep },
  page: { padding: 20, gap: 18, direction: 'rtl', backgroundColor: mobileTheme.deep },
  restorePage: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: mobileTheme.deep },
  sessionBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, gap: 12, backgroundColor: mobileTheme.deep },
  brandLockup: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-end', gap: 10, marginTop: 4 },
  brandMark: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(233,156,88,0.12)', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFD49F', fontSize: 26, lineHeight: 28, transform: [{ rotate: '180deg' }] },
  brand: { fontSize: 19, fontWeight: '900', textAlign: 'right', color: '#FFFFFF', letterSpacing: -0.5 },
  brandTagline: { marginTop: 2, color: 'rgba(255,255,255,0.68)', fontSize: 10, textAlign: 'right' },
  hero: { backgroundColor: mobileTheme.surface, padding: 24, borderRadius: mobileRadius.large, gap: 14, borderWidth: 1, borderColor: mobileTheme.lineDark },
  eyebrow: { color: mobileTheme.accent, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  title: { color: '#FFFFFF', textAlign: 'right', fontSize: 31, fontWeight: '900', lineHeight: 43, letterSpacing: -1.2 },
  heroBody: { color: mobileTheme.muted, textAlign: 'right', fontSize: 15, lineHeight: 26 },
  titleOnDark: { color: mobileTheme.onDark, textAlign: 'right', fontSize: 25, fontWeight: '900', lineHeight: 35 },
  bodyOnDark: { color: mobileTheme.muted, textAlign: 'right', fontSize: 15, lineHeight: 26 },
  helperOnDark: { textAlign: 'right', color: mobileTheme.muted, fontSize: 13, lineHeight: 22 },
  card: { backgroundColor: mobileTheme.paper, padding: 22, borderRadius: mobileRadius.large, gap: 14 },
  cardEyebrow: { color: '#9E572E', textAlign: 'right', fontSize: 12, fontWeight: '900' },
  cardTitle: { color: mobileTheme.ink, textAlign: 'right', fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  titleSmall: { color: mobileTheme.ink, textAlign: 'right', fontSize: 24, fontWeight: '900', lineHeight: 34, letterSpacing: -0.5 },
  body: { color: mobileTheme.mutedInk, textAlign: 'right', fontSize: 15, lineHeight: 26 },
  primaryButton: { backgroundColor: mobileTheme.inkStrong, paddingVertical: 15, paddingHorizontal: 18, borderRadius: mobileRadius.small, marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '800', fontSize: 15 },
  accentButton: { backgroundColor: mobileTheme.accentStrong, paddingVertical: 15, paddingHorizontal: 18, borderRadius: mobileRadius.small, marginTop: 4 },
  accentButtonText: { color: mobileTheme.inkStrong, textAlign: 'center', fontWeight: '900', fontSize: 15 },
  outlineButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', paddingVertical: 14, paddingHorizontal: 18, borderRadius: mobileRadius.small },
  outlineButtonText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '800', fontSize: 15 },
  input: { borderWidth: 1, borderColor: mobileTheme.lineLight, borderRadius: mobileRadius.medium, padding: 14, fontSize: 16, color: mobileTheme.ink, backgroundColor: mobileTheme.field },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  label: { textAlign: 'right', color: mobileTheme.ink, fontWeight: '800', marginTop: 5 },
  helper: { textAlign: 'right', color: '#807269', fontSize: 13, lineHeight: 22 },
  error: { textAlign: 'right', color: mobileTheme.danger, backgroundColor: mobileTheme.dangerSurface, borderRadius: mobileRadius.medium, padding: 12, lineHeight: 22 },
  link: { textAlign: 'center', color: '#6F5E54', padding: 8, textDecorationLine: 'underline' },
  row: { flexDirection: 'row-reverse', gap: 10 },
  wrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: mobileTheme.lineLight, paddingVertical: 11, paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#FFF9F2' },
  choiceSelected: { backgroundColor: '#F4D8BB', borderColor: mobileTheme.accentStrong },
  choiceText: { color: '#5E5148' },
  choiceTextSelected: { color: mobileTheme.inkStrong, fontWeight: '900' },
  rule: { backgroundColor: '#F1E6DB', padding: 12, borderRadius: mobileRadius.medium, borderRightWidth: 3, borderRightColor: mobileTheme.accent },
  ruleText: { color: '#4D4038', textAlign: 'right', lineHeight: 23 },
  logoutButton: { borderWidth: 1, borderColor: mobileTheme.lineDark, borderRadius: mobileRadius.small, paddingVertical: 12, paddingHorizontal: 16 },
  logoutText: { color: mobileTheme.muted, textAlign: 'center', fontWeight: '700' },
  logoutTextOnDark: { color: mobileTheme.accentSoft, textAlign: 'right', fontWeight: '700' },
  legalBox: { backgroundColor: mobileTheme.surface, borderRadius: mobileRadius.medium, padding: 14, gap: 10, borderWidth: 1, borderColor: mobileTheme.lineDark },
  legalBoxCompact: { marginHorizontal: 20, marginBottom: 8, paddingVertical: 10 },
  legalTitle: { color: mobileTheme.onDark, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  legalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  legalLink: { color: mobileTheme.accentSoft, fontSize: 12, textDecorationLine: 'underline' },
  disabled: { opacity: 0.4 },
});
