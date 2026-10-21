import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// CLIENT-02 MEDIUM: session (refresh token) persisted in plaintext AsyncStorage
export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { storage: AsyncStorage, persistSession: true },
});

export async function saveLogin(accessToken: string, theme: string) {
  // CLIENT-02 HIGH: bearer token in plaintext storage
  await AsyncStorage.setItem("access_token", accessToken);
  // OK: non-secret preference
  await AsyncStorage.setItem("theme", theme);
  // OK: Keychain/Keystore-backed
  await SecureStore.setItemAsync("refresh_token", accessToken);
}
