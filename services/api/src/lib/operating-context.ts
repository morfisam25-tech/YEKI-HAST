export type OperatingContextCodes = {
  productCode: string;
  serviceCode: string;
  marketCode: string;
};

function configuredCode(name: 'DEFAULT_PRODUCT_CODE' | 'DEFAULT_SERVICE_CODE' | 'DEFAULT_MARKET_CODE', fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function getDefaultOperatingContextCodes(): OperatingContextCodes {
  return {
    productCode: configuredCode('DEFAULT_PRODUCT_CODE', 'yeki_hast'),
    serviceCode: configuredCode('DEFAULT_SERVICE_CODE', 'human_listening'),
    marketCode: configuredCode('DEFAULT_MARKET_CODE', 'ir'),
  };
}
