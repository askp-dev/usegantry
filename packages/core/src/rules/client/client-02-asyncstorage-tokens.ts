import { defineRule } from "../helpers";

const ASYNC_STORAGE = /^@react-native-async-storage\/async-storage$|^@react-native-community\/async-storage$/;
const SECRETISH = /token|jwt|secret|session|passw(?:or)?d|refresh|access[_-]?key|api[_-]?key|credential|bearer|auth|private[_-]?key|pin\b/i;

export const client02AsyncstorageTokens = defineRule(
  { id: "CLIENT-02", pillar: "SECURITY", severity: "HIGH", title: "Auth Token Stored in Plaintext AsyncStorage (React Native / Expo)" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      if (!/\.[cm]?[jt]sx?$/.test(file) || /\.(?:test|spec|d)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|tests?)\//.test(file)) continue;
      if (!/async-storage/.test(ctx.getText(file))) continue;
      const ci = ctx.getCode(file);
      const names = ci.importsFrom(ASYNC_STORAGE).flatMap((i) => [i.defaultName, i.namespace].filter(Boolean) as string[]);
      if (!names.length) continue;
      const recv = names.map((n) => n.replace(/\$/g, "\\$")).join("|");
      // 1. setItem / multiSet / mergeItem of a token-ish key or value
      for (const call of ci.calls(new RegExp(`(?<![\\w$.])(?:${recv})\\.(?:setItem|mergeItem|multiSet|multiMerge)\\b`))) {
        const text = ci.slice(call.openParen + 1, call.closeParen, "noComments");
        if (!SECRETISH.test(text)) continue;
        emit({
          file,
          line: call.line,
          evidence: ci.snippet(call.start, { after: 1 }),
          impact:
            "AsyncStorage is an unencrypted file (SQLite on Android, a plist/JSON file on iOS). Anything with file access (a rooted/jailbroken device, an unencrypted device backup, adb on a debug build, or malware) reads the token and takes over the account without the password.",
          agentRemediationPrompt: `In ${file}:${call.line}, store the secret with \`expo-secure-store\` (\`await SecureStore.setItemAsync(key, value)\`, Keychain/Keystore-backed) or \`react-native-keychain\` instead of AsyncStorage, read it back with \`getItemAsync\`, and delete any old AsyncStorage copy on upgrade.`,
        });
      }
      // 2. Supabase (or similar) client persisting its session through AsyncStorage
      for (const call of ci.calls(/(?<![\w$.])createClient\b/)) {
        const text = ci.slice(call.openParen + 1, call.closeParen, "masked");
        const m = text.match(new RegExp(`\\bstorage\\s*:\\s*(?:${recv})\\b`));
        if (!m) continue;
        const line = ci.lineOf(call.openParen + 1 + (m.index ?? 0));
        emit({
          file,
          line,
          severity: "MEDIUM",
          evidence: ci.lineText(line).trim(),
          impact:
            "The auth client persists its session (access + refresh token) in plaintext AsyncStorage, so a device backup or file-level access yields a long-lived refresh token for the account.",
          agentRemediationPrompt: `In ${file}:${line}, pass a SecureStore-backed storage adapter (\`{ getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync }\`, or Supabase's LargeSecureStore pattern for sessions over 2 KB) instead of AsyncStorage.`,
        });
      }
    }
  },
);
