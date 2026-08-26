export const productConfig = {
  brandName: 'یکی هست',
  productCode: 'yeki_hast',
  primaryServiceCode: 'human_listening',
  launchMarketCode: 'ir',
  wave: 1,
  photosEnabled: false,
  languageConversationEnabled: false,
  callerMoodRequired: false,
  callerTopicRequired: false,
  callerMinimumAgePolicy: {
    threshold: null as number | null,
    policyVersion: 'pre-beta-unset',
  },
  iranBetaPricing: {
    currencyCode: 'IRR',
    callerRatePerMinuteMinor: 31_000,
    listenerRatePerMinuteMinor: 21_000,
    platformGrossSpreadPerMinuteMinor: 10_000,
    billingIncrementSeconds: 1,
  },
  listenerKyc: { deleteExpiredDrafts: false },
} as const;
