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
  type PublicLegalConfig,
  type SessionResponse,
} from './src/api';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './src/session-storage';
import CallerClosedBetaScreen from './src/CallerClosedBetaScreen';
import EmailAuthScreen from './src/EmailAuthScreen';
import ListenerKycScreen from './src/ListenerKycScreen';
import ListenerTrainingScreen from './src/ListenerTrainingScreen';
import ListenerWorkScreen from './src/ListenerWorkScreen';

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

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    caller_closed_beta_disabled: 'مسیر تماس‌گیرنده برای این محیط فعال نیست.',
    unknown_language: 'یکی از زبان‌های انتخاب‌شده در دسترس نیست.',
    application_locked: 'این درخواست وارد مرحله بعد شده و دیگر قابل ویرایش نیست.',
    listener_application_not_found: 'درخواست شنونده هنوز ساخته نشده.',
    unauthorized: 'نشست ورود معتبر نیست. دوباره وارد شو.',
    network_error: 'ارتباط با سرور برقرار نشد.',
  };
  return messages[code] ?? 'خطایی رخ داد. دوباره امتحان کن.';
}

function LegalLinks({ compact = false, legal }: { compact?: boolean; legal: PublicLegalConfig | null }) {
  const links = [
    legal?.privacyPolicyUrl ? ['حریم خصوصی', legal.privacyPolicyUrl] : null,
    legal?.termsOfServiceUrl ? ['قوانین استفاده', legal.termsOfServiceUrl] : null,
    legal?.accountDeletionUrl ? ['حذف حساب', legal.accountDeletionUrl] : null,
    legal?.childSafetyUrl ? ['ایمنی کودک', legal.childSafetyUrl] : null,
    legal?.supportEmail ? ['پشتیبانی', `mailto:${legal.supportEmail}`] : null,
  ].filter((entry): entry is [string, string] => entry !== null);
  if (!links.length) return null;
  return (
    <View style={[styles.legalBox, compact && styles.legalBoxCompact]}>
      {!compact && <Text style={styles.legalTitle}>اطلاعات و پشتیبانی</Text>}
      <View style={styles.legalRow}>
        {links.map(([label, url]) => (
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

export default function App({ legal }: { legal: PublicLegalConfig | null }) {
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
        <StatusBar style="dark" />
        <View style={styles.restorePage}>
          <Text style={styles.brand}>یکی هست</Text>
          <Text style={styles.helper}>در حال بررسی سرویس و نشست امن…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!bootstrapAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.restorePage}>
          <Text style={styles.brand}>یکی هست</Text>
          <Text style={styles.titleSmall}>سرویس موقتاً در دسترس نیست</Text>
          <Text style={styles.body}>
            برای جلوگیری از ثبت ناقص یا استفاده از اطلاعات قدیمی، تا زمانی که اطلاعات اصلی سرویس از سرور دریافت نشود ورود و ثبت‌نام باز نمی‌شود.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={retryBootstrap}>
            <Text style={styles.primaryButtonText}>تلاش دوباره</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'caller-beta' && token) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.sessionBar}>
          <TouchableOpacity disabled={busy} onPress={logout}>
            <Text style={styles.logoutText}>{busy ? 'در حال خروج…' : 'خروج از حساب'}</Text>
          </TouchableOpacity>
        </View>
        <LegalLinks compact legal={legal} />
        <CallerClosedBetaScreen token={token} onClose={() => setScreen('home')} />
      </SafeAreaView>
    );
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
              <Text style={styles.heroBody}>
                {callerBetaEnabled
                  ? 'تماس با شنونده انسانی در این محیط فعال است. سرویس فقط برای ۱۸ سال به بالا است، تماس زنده از اینترنت برقرار می‌شود و برای امنیت کاربران، مکالمه توسط پلتفرم ضبط و امن نگهداری می‌شود.'
                  : 'بخش تماس عمومی در این محیط فعلاً فعال نیست.'}
              </Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={beginCallerAuth}>
                <Text style={styles.secondaryButtonText}>{callerBetaEnabled ? 'ورود تماس‌گیرنده' : 'اطلاعات تماس'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>شنونده خوبی هستی؟</Text>
              <Text style={styles.body}>اول نقش و مرزهای آن را ببین، با ایمیل وارد شو و پروفایل شنونده‌ات را بساز.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('listener-intro')}>
                <Text style={styles.primaryButtonText}>می‌خوام شنونده بشم</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === 'waitlist' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>تماس عمومی در این محیط فعال نیست</Text>
            <Text style={styles.body}>
              این محیط هنوز مسیر تماس‌گیرنده را باز نکرده است. ورود یا تماس تا آماده‌بودن تنظیمات لازم بسته می‌ماند.
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
              اطلاعات خصوصی لازم برای احراز یا تسویه نزد پلتفرم می‌ماند و تماس‌گیرنده آن را نمی‌بیند. جزئیات عمومی پروفایل خوداظهاری است مگر فیلدی صریحاً بررسی شود.
            </Text>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ ساعات حضورت را خودت تعیین می‌کنی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ وقتی Online هستی یعنی آماده پاسخگویی هستی.</Text></View>
            <View style={styles.rule}><Text style={styles.ruleText}>✓ تماس اصلی از اینترنت انجام می‌شود و شماره واقعی دو طرف برای آن لازم نیست یا نمایش داده نمی‌شود.</Text></View>
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
            <Text style={styles.titleSmall}>پروفایل شنونده</Text>
            <Text style={styles.helper}>نام مستعار و معرفی عمومی خوداظهاری‌اند. داده خصوصی احراز یا تسویه در پروفایل عمومی نمایش داده نمی‌شود.</Text>

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

        {screen === 'listener-kyc' && token && (
          <ListenerKycScreen token={token} onDone={() => setScreen('home')} />
        )}

        {screen === 'listener-work' && token && (
          <ListenerWorkScreen token={token} onDone={() => setScreen('home')} />
        )}

        <LegalLinks legal={legal} />

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
  safe: { flex: 1, backgroundColor: '#f5f3ee' },
  page: { padding: 20, gap: 18, direction: 'rtl' },
  restorePage: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  sessionBar: { paddingHorizontal: 20, paddingTop: 10, alignItems: 'flex-start' },
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
  logoutButton: { borderWidth: 1, borderColor: '#d8d5cd', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  logoutText: { color: '#55564f', textAlign: 'center', fontWeight: '700' },
  legalBox: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, gap: 10 },
  legalBoxCompact: { marginHorizontal: 20, marginBottom: 8, paddingVertical: 10 },
  legalTitle: { color: '#20211f', textAlign: 'right', fontSize: 13, fontWeight: '700' },
  legalRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  legalLink: { color: '#55564f', fontSize: 13, textDecorationLine: 'underline' },
  disabled: { opacity: 0.35 },
});
