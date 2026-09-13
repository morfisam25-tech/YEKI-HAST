import React, { useEffect, useState } from 'react';
import { Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import App from './App';
import { getBootstrap, type BootstrapResponse } from './src/api';
import { mobileRadius, mobileTheme } from './src/theme';

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
      <SafeAreaView style={styles.footer}>
        <Text style={styles.boundary}>
          یکی هست جایگزین درمان، مشاوره تخصصی یا خدمات اضطراری نیست. در خطر فوری از خدمات اضطراری محل زندگی خود کمک بگیر.
        </Text>
        {hasAnyLink && (
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
            <TouchableOpacity onPress={() => openExternal('https://yekihast.app/safety/children')}>
              <Text style={styles.link}>ایمنی کودک</Text>
            </TouchableOpacity>
            {legal?.supportEmail && (
              <TouchableOpacity onPress={() => openExternal(`mailto:${legal.supportEmail}`)}>
                <Text style={styles.link}>پشتیبانی</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mobileTheme.deep },
  app: { flex: 1 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: mobileTheme.lineDark,
    backgroundColor: mobileTheme.surface,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
    gap: 7,
  },
  boundary: { color: mobileTheme.muted, fontSize: 10, lineHeight: 16, textAlign: 'right' },
  links: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 14 },
  link: {
    color: mobileTheme.accentSoft,
    fontSize: 12,
    textDecorationLine: 'underline',
    paddingVertical: mobileRadius.small / 2,
  },
  deleteLink: {
    color: '#E5A39C',
    fontSize: 12,
    textDecorationLine: 'underline',
    fontWeight: '700',
    paddingVertical: mobileRadius.small / 2,
  },
});
