import React, { useEffect, useState } from 'react';
import { Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import App from './App';
import { getBootstrap, type BootstrapResponse } from './src/api';

type LegalConfig = {
  ready: boolean;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  accountDeletionUrl: string | null;
  supportEmail: string | null;
};

type BootstrapWithLegal = BootstrapResponse & { legal?: LegalConfig };

function openExternal(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

export default function RootApp() {
  const [legal, setLegal] = useState<LegalConfig | null>(null);

  useEffect(() => {
    let disposed = false;
    getBootstrap()
      .then((value) => {
        if (disposed) return;
        const config = (value as BootstrapWithLegal).legal ?? null;
        setLegal(config);
      })
      .catch(() => {
        if (!disposed) setLegal(null);
      });
    return () => { disposed = true; };
  }, []);

  const hasAnyLink = Boolean(
    legal?.privacyPolicyUrl
    || legal?.termsOfServiceUrl
    || legal?.accountDeletionUrl
    || legal?.supportEmail,
  );

  return (
    <View style={styles.root}>
      <View style={styles.app}><App /></View>
      {hasAnyLink && (
        <SafeAreaView style={styles.footer}>
          <Text style={styles.boundary}>
            یکی هست جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست. در خطر فوری از خدمات اضطراری محل زندگی خود کمک بگیر.
          </Text>
          <View style={styles.links}>
            {legal?.privacyPolicyUrl && (
              <TouchableOpacity onPress={() => openExternal(legal.privacyPolicyUrl!)}>
                <Text style={styles.link}>حریم خصوصی</Text>
              </TouchableOpacity>
            )}
            {legal?.termsOfServiceUrl && (
              <TouchableOpacity onPress={() => openExternal(legal.termsOfServiceUrl!)}>
                <Text style={styles.link}>قوانین استفاده</Text>
              </TouchableOpacity>
            )}
            {legal?.accountDeletionUrl && (
              <TouchableOpacity onPress={() => openExternal(legal.accountDeletionUrl!)}>
                <Text style={styles.deleteLink}>حذف حساب</Text>
              </TouchableOpacity>
            )}
            {legal?.supportEmail && (
              <TouchableOpacity onPress={() => openExternal(`mailto:${legal.supportEmail}`)}>
                <Text style={styles.link}>پشتیبانی</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f3ee' },
  app: { flex: 1 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#dedbd3',
    backgroundColor: '#fbfaf7',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  boundary: { color: '#77766f', fontSize: 10, lineHeight: 15, textAlign: 'right' },
  links: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  link: { color: '#55564f', fontSize: 12, textDecorationLine: 'underline' },
  deleteLink: { color: '#8a3430', fontSize: 12, textDecorationLine: 'underline', fontWeight: '700' },
});
