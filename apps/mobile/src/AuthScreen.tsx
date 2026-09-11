import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SessionResponse } from './api';
import EmailAuthScreen from './EmailAuthScreen';
import PhoneAuthScreen from './PhoneAuthScreen';

type Props = {
  onAuthenticated: (session: SessionResponse) => Promise<void> | void;
  onBack: () => void;
};

type Method = 'email' | 'phone' | null;

export default function AuthScreen({ onAuthenticated, onBack }: Props) {
  const [method, setMethod] = useState<Method>(null);

  if (method === 'email') {
    return <EmailAuthScreen onAuthenticated={onAuthenticated} onBack={() => setMethod(null)} />;
  }
  if (method === 'phone') {
    return <PhoneAuthScreen onAuthenticated={onAuthenticated} onBack={() => setMethod(null)} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>ورود</Text>
      <Text style={styles.body}>یکی از روش‌های ورود را انتخاب کن.</Text>
      <TouchableOpacity style={styles.primary} onPress={() => setMethod('email')}>
        <Text style={styles.primaryText}>ورود با ایمیل</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => setMethod('phone')}>
        <Text style={styles.secondaryText}>ورود با شماره موبایل</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack}><Text style={styles.link}>برگشت</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#E7E2DA', borderRadius: 18, padding: 18, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  primary: { backgroundColor: '#171717', borderRadius: 12, padding: 14 },
  primaryText: { color: '#FFF', textAlign: 'center', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: '#171717', borderRadius: 12, padding: 14 },
  secondaryText: { color: '#171717', textAlign: 'center', fontWeight: '700' },
  link: { textAlign: 'center', textDecorationLine: 'underline', paddingVertical: 7 },
});
