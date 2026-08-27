import * as SecureStore from 'expo-secure-store';

export type StoredAuthPurpose = 'listener' | 'caller';

const TOKEN_KEY = 'yeki-hast.auth.token';
const PURPOSE_KEY = 'yeki-hast.auth.purpose';

export async function saveStoredSession(token: string, purpose: StoredAuthPurpose): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(PURPOSE_KEY, purpose),
  ]);
}

export async function loadStoredSession(): Promise<{ token: string; purpose: StoredAuthPurpose } | null> {
  const [token, purpose] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(PURPOSE_KEY),
  ]);

  if (!token || (purpose !== 'listener' && purpose !== 'caller')) {
    if (token || purpose) await clearStoredSession();
    return null;
  }
  return { token, purpose };
}

export async function clearStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(PURPOSE_KEY),
  ]);
}
