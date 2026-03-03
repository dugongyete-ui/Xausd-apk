import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import C from "@/constants/colors";
import { useTrading } from "@/contexts/TradingContext";

function InfoRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <MaterialCommunityIcons name={icon as any} size={18} color={C.gold} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>
        {value}
      </Text>
    </View>
  );
}

function StrategyRule({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleDot} />
      <View style={styles.ruleContent}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 60;
  const { balance, setBalance, atr, connectionStatus, candles } = useTrading();
  const [inputBalance, setInputBalance] = useState(String(balance));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const val = parseFloat(inputBalance.replace(/,/g, ""));
    if (isNaN(val) || val <= 0) {
      Alert.alert("Invalid Balance", "Please enter a valid positive number.");
      return;
    }
    setBalance(val);
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 2000);
  };

  const riskAmount = balance * 0.01;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: botPad + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>Risk Management & Strategy</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT BALANCE</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceInputRow}>
              <View style={styles.currencyTag}>
                <Text style={styles.currencyText}>USD</Text>
              </View>
              <TextInput
                style={styles.balanceInput}
                value={inputBalance}
                onChangeText={setInputBalance}
                keyboardType="decimal-pad"
                placeholderTextColor={C.textDim}
                placeholder="10000"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.saveBtn,
                { opacity: pressed ? 0.8 : 1, backgroundColor: saved ? C.green : C.gold },
              ]}
            >
              <Ionicons
                name={saved ? "checkmark" : "save-outline"}
                size={18}
                color={C.bg}
              />
              <Text style={styles.saveBtnText}>{saved ? "Saved!" : "Save Balance"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RISK PARAMETERS</Text>
          <View style={styles.card}>
            <InfoRow
              icon="percent"
              label="Risk per Trade"
              value="1.00%"
              valueColor={C.gold}
            />
            <View style={styles.divider} />
            <InfoRow
              icon="currency-usd"
              label="Risk Amount"
              value={`$${riskAmount.toFixed(2)}`}
              valueColor={C.green}
            />
            <View style={styles.divider} />
            <InfoRow
              icon="sigma"
              label="ATR (14)"
              value={atr !== null ? atr.toFixed(3) : "—"}
            />
            <View style={styles.divider} />
            <InfoRow
              icon="database"
              label="Candles Loaded"
              value={`${candles.length} / 200`}
              valueColor={candles.length >= 200 ? C.green : C.gold}
            />
            <View style={styles.divider} />
            <InfoRow
              icon="wifi"
              label="WebSocket"
              value={
                connectionStatus === "connected"
                  ? "Connected"
                  : connectionStatus === "connecting"
                  ? "Connecting..."
                  : "Disconnected"
              }
              valueColor={
                connectionStatus === "connected"
                  ? C.green
                  : connectionStatus === "connecting"
                  ? C.gold
                  : C.red
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STRATEGY RULES</Text>
          <View style={styles.card}>
            <StrategyRule
              title="Data Source"
              detail="Deriv WebSocket · XAUUSD M5 · 200 candles buffer"
            />
            <StrategyRule
              title="Trend Filter"
              detail="EMA50 > EMA200 = Bullish · EMA50 < EMA200 = Bearish"
            />
            <StrategyRule
              title="Swing Detection"
              detail="Fractal method: 5-candle fractal (2L + pivot + 2R)"
            />
            <StrategyRule
              title="Entry Zone"
              detail="Price must be within 61.8% — 78.6% Fibonacci band"
            />
            <StrategyRule
              title="Candle Confirmation"
              detail="BUY: Bullish close + lower wick > body · SELL: Bearish close + upper wick > body"
            />
            <StrategyRule
              title="Stop Loss"
              detail="SL = 78.6% ± (0.5 × ATR). Min distance: spread × 3"
            />
            <StrategyRule
              title="Take Profit"
              detail="-27% Fibonacci extension (beyond the swing)"
            />
            <StrategyRule
              title="Position Size"
              detail="Lot = (1% × Balance) / SL distance"
            />
            <StrategyRule
              title="Trade Filter"
              detail="Max 1 active signal · No entry on low ATR or extreme spread"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <MaterialCommunityIcons name="finance" size={24} color={C.gold} />
              <View style={styles.aboutText}>
                <Text style={styles.aboutTitle}>FiboTrader</Text>
                <Text style={styles.aboutSub}>
                  Deterministic Fibonacci strategy · All decisions are purely mathematical · No random, no visual assumptions
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: C.text,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSub,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: C.textDim,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: C.text,
  },
  infoValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: C.textSub,
  },
  balanceCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  balanceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  currencyTag: {
    backgroundColor: C.goldBg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  currencyText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: C.gold,
    letterSpacing: 1,
  },
  balanceInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: C.text,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: C.bg,
  },
  ruleRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.gold,
    marginTop: 6,
  },
  ruleContent: { flex: 1 },
  ruleTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: C.text,
    marginBottom: 2,
  },
  ruleDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSub,
    lineHeight: 18,
  },
  aboutRow: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    alignItems: "flex-start",
  },
  aboutText: { flex: 1 },
  aboutTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: C.text,
    marginBottom: 4,
  },
  aboutSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSub,
    lineHeight: 18,
  },
});
