import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openLocalStore } from "@/db/local";
import {
  claimPairing,
  listLinkedDevices,
  readIdentity,
  startPairing,
  unlinkDevice,
  type LinkedDevice,
} from "@/sync/progressSync";
import { colors, fonts, radius, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/**
 * Linking a browser to the phone (docs/design/sync.md §3).
 *
 * - The phone shows a one-time code (10 minutes) and the linked devices.
 * - The browser types the code; it then pulls the phone's progress.
 */

const ERRORS: Record<string, string> = {
  invalid_code: "That code is wrong or expired. Make a new one on the phone.",
  offline: "No connection. Try again in a moment.",
  unlinked: "This device was unlinked.",
  not_linked: "Not linked yet.",
  phone_only: "Only the phone can do that.",
};
function message(error: string): string {
  return ERRORS[error] ?? `Something went wrong (${error}).`;
}

export default function LinkRoute() {
  const isWeb = Platform.OS === "web";
  const [linked, setLinked] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    const identity = await readIdentity(await openLocalStore());
    setLinked(identity !== null);
    if (identity === null && isWeb) return;
    const result = await listLinkedDevices();
    if (result.ok) {
      setDevices(result.value);
      setLinked(true);
    } else if (result.error === "unlinked") {
      setLinked(false);
      setDevices([]);
    }
  }, [isWeb]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (code === null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);

  const onMakeCode = async () => {
    setBusy(true);
    setStatus(null);
    const result = await startPairing();
    setBusy(false);
    if (result.ok) {
      setCode({ code: result.value.code, expiresAt: result.value.expires_at });
      setNow(Date.now());
    } else setStatus(message(result.error));
  };

  const onClaim = async () => {
    setBusy(true);
    setStatus(null);
    const result = await claimPairing(input);
    setBusy(false);
    if (result.ok) {
      setInput("");
      setStatus("Linked! Your progress is on its way.");
      await refresh();
    } else setStatus(message(result.error));
  };

  const onUnlink = async (device: LinkedDevice) => {
    setBusy(true);
    const result = await unlinkDevice(device.id);
    setBusy(false);
    if (!result.ok) setStatus(message(result.error));
    await refresh();
  };

  const secondsLeft =
    code === null ? 0 : Math.max(0, Math.round((code.expiresAt - now) / 1000));
  const shownCode =
    code === null ? "" : `${code.code.slice(0, 4)}-${code.code.slice(4)}`;

  return (
    <GameBackground variant="home">
      <SafeAreaView
        style={styles.container}
        edges={["top", "left", "right", "bottom"]}
      >
        <ScreenHeader title={isWeb ? "Link to phone" : "Link a browser"} />
        <ScrollView contentContainerStyle={styles.content}>
          {isWeb && linked === false ? (
            <GlassCard style={styles.card}>
              <Text style={styles.body}>
                On your phone, open Settings → “Link a browser” and type the
                code here.
              </Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="ABCD-EFGH"
                placeholderTextColor={colors.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={9}
                style={styles.input}
                accessibilityLabel="Pairing code"
                onSubmitEditing={() => void onClaim()}
              />
              <GameButton
                label={busy ? "LINKING…" : "LINK"}
                variant="primary"
                size="md"
                disabled={busy || input.replace(/[^0-9a-z]/gi, "").length !== 8}
                onPress={() => void onClaim()}
              />
            </GlassCard>
          ) : null}

          {!isWeb ? (
            <GlassCard style={styles.card}>
              <Text style={styles.body}>
                Open the web app on your computer, choose “Link to phone” and
                type this code.
              </Text>
              {code !== null && secondsLeft > 0 ? (
                <>
                  <Text
                    style={styles.code}
                    selectable
                    accessibilityLabel={`Code ${code.code}`}
                  >
                    {shownCode}
                  </Text>
                  <Text style={styles.muted}>
                    Expires in {Math.floor(secondsLeft / 60)}:
                    {String(secondsLeft % 60).padStart(2, "0")}
                  </Text>
                </>
              ) : null}
              <GameButton
                label={
                  busy ? "WAIT…" : code === null ? "SHOW A CODE" : "NEW CODE"
                }
                variant="secondary"
                size="md"
                disabled={busy}
                onPress={() => void onMakeCode()}
              />
            </GlassCard>
          ) : null}

          {devices.length > 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.heading}>Linked devices</Text>
              {devices.map((device) => (
                <View key={device.id} style={styles.deviceRow}>
                  <View style={styles.deviceText}>
                    <Text style={styles.body}>
                      {device.kind === "phone" ? "Phone" : "Browser"}
                      {device.current ? " (this device)" : ""}
                    </Text>
                    <Text style={styles.muted}>
                      Linked {new Date(device.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {(isWeb ? device.current : device.kind === "web") ? (
                    <GameButton
                      label="UNLINK"
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onPress={() => void onUnlink(device)}
                    />
                  ) : null}
                </View>
              ))}
            </GlassCard>
          ) : null}

          {status === null ? null : (
            <Text style={styles.muted} accessibilityLiveRegion="polite">
              {status}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontFamily: fonts.title, fontSize: 18 },
  body: { color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  muted: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  code: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 40,
    letterSpacing: 4,
    textAlign: "center",
  },
  input: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 28,
    letterSpacing: 3,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.button,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  deviceText: { flex: 1 },
});
