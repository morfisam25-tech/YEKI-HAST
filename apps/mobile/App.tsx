import React, { useMemo, useState } from 'react';
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

type Screen = 'home' | 'waitlist' | 'listener-intro' | 'listener-profile' | 'listener-training';

type ChoiceProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

function Choice({ label, selected, onPress }: ChoiceProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | null>(null);
  const [languages, setLanguages] = useState<string[]>(['فارسی']);
  const [accepts, setAccepts] = useState<Array<'female' | 'male'>>(['female', 'male']);

  const languageOptions = ['فارسی', 'ترکی آذری', 'کردی', 'لری', 'عربی'];
  const canContinueProfile = useMemo(
    () => nickname.trim().length >= 2 && gender !== null && languages.length > 0 && accepts.length > 0,
    [nickname, gender, languages, accepts],
  );

  const toggleLanguage = (value: string) => {
    setLanguages((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const toggleAccepts = (value: 'female' | 'male') => {
    setAccepts((current) => {
      if (current.includes(value)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  };

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
              <Text style={styles.body}>
                بخش مکالمه به‌زودی باز می‌شود. شماره‌ات را بگذار تا زمان شروع خبرت کنیم.
              </Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('waitlist')}>
                <Text style={styles.secondaryButtonText}>شروع شد خبرم کن</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>شنونده خوبی هستی؟</Text>
              <Text style={styles.body}>
                اول کار را ببین و آموزش را امتحان کن. برای شروع، مدرک هویتی یا حساب بانکی نمی‌خواهیم.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('listener-intro')}>
                <Text style={styles.primaryButtonText}>می‌خوام شنونده بشم</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {screen === 'waitlist' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>وقتی سرویس باز شد خبرت می‌کنیم</Text>
            <Text style={styles.label}>شماره موبایل</Text>
            <TextInput
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="09..."
              style={styles.input}
              textAlign="right"
            />
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('home')}>
              <Text style={styles.primaryButtonText}>ثبت در لیست انتظار</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.link}>برگشت</Text>
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
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('listener-profile')}>
              <Text style={styles.primaryButtonText}>ادامه و ساخت پروفایل آزمایشی</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.link}>فعلاً نه</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'listener-profile' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>پروفایل آزمایشی</Text>
            <Text style={styles.helper}>فعلاً اسم واقعی یا مدرک لازم نیست.</Text>

            <Text style={styles.label}>اسم مستعار</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="مثلاً رها"
              style={styles.input}
              textAlign="right"
            />

            <Text style={styles.label}>جنسیت</Text>
            <View style={styles.row}>
              <Choice label="زن" selected={gender === 'female'} onPress={() => setGender('female')} />
              <Choice label="مرد" selected={gender === 'male'} onPress={() => setGender('male')} />
            </View>

            <Text style={styles.label}>زبان‌هایی که روان صحبت می‌کنی</Text>
            <View style={styles.wrap}>
              {languageOptions.map((item) => (
                <Choice key={item} label={item} selected={languages.includes(item)} onPress={() => toggleLanguage(item)} />
              ))}
            </View>

            <Text style={styles.label}>با چه Callerهایی راحتی؟</Text>
            <Text style={styles.helper}>این تنظیم را وقتی آفلاین هستی یا بین تماس‌ها می‌توانی تغییر بدهی.</Text>
            <View style={styles.row}>
              <Choice label="زن" selected={accepts.includes('female')} onPress={() => toggleAccepts('female')} />
              <Choice label="مرد" selected={accepts.includes('male')} onPress={() => toggleAccepts('male')} />
            </View>

            <TouchableOpacity
              disabled={!canContinueProfile}
              style={[styles.primaryButton, !canContinueProfile && styles.disabled]}
              onPress={() => setScreen('listener-training')}
            >
              <Text style={styles.primaryButtonText}>دیدن آموزش نمونه</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'listener-training' && (
          <View style={styles.card}>
            <Text style={styles.titleSmall}>نمونه آموزش</Text>
            <Text style={styles.scenario}>Caller: «اصلاً نمی‌دونم چی بگم. فقط اعصاب ندارم و دلم می‌خواست یکی اون طرف خط باشه.»</Text>
            <Text style={styles.good}>پاسخ مناسب: «باشه. لازم نیست از جایی خاص شروع کنی. من اینجام و گوش می‌دم.»</Text>
            <Text style={styles.bad}>پاسخ نامناسب: «به نظرم تو افسردگی داری و باید بری پیش روان‌شناس.»</Text>
            <Text style={styles.body}>
              بعد از آموزش و آزمون، اگر قبول شوی مرحله احراز هویت باز می‌شود. تا آن مرحله اطلاعات هویتی واقعی از تو نمی‌خواهیم.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setScreen('home')}>
              <Text style={styles.primaryButtonText}>ثبت پیش‌درخواست</Text>
            </TouchableOpacity>
          </View>
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
  titleSmall: { color: '#20211f', textAlign: 'right', fontSize: 24, fontWeight: '800', lineHeight: 34 },
  body: { color: '#66665f', textAlign: 'right', fontSize: 16, lineHeight: 27 },
  card: { backgroundColor: '#ffffff', padding: 22, borderRadius: 22, gap: 14 },
  cardTitle: { color: '#20211f', textAlign: 'right', fontSize: 22, fontWeight: '800' },
  primaryButton: { backgroundColor: '#20211f', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, marginTop: 4 },
  primaryButtonText: { color: '#ffffff', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  secondaryButton: { backgroundColor: '#ffffff', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16 },
  secondaryButtonText: { color: '#20211f', textAlign: 'center', fontWeight: '800', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#dedbd3', borderRadius: 14, padding: 14, fontSize: 16, color: '#20211f', backgroundColor: '#fbfaf7' },
  label: { textAlign: 'right', color: '#20211f', fontWeight: '700', marginTop: 5 },
  helper: { textAlign: 'right', color: '#84837c', fontSize: 13, lineHeight: 22 },
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
  scenario: { backgroundColor: '#f3f1ec', padding: 14, borderRadius: 14, textAlign: 'right', color: '#343530', lineHeight: 25 },
  good: { backgroundColor: '#eef3ea', padding: 14, borderRadius: 14, textAlign: 'right', color: '#34402f', lineHeight: 25 },
  bad: { backgroundColor: '#f6ecea', padding: 14, borderRadius: 14, textAlign: 'right', color: '#5d3935', lineHeight: 25 },
});
