import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import C from "@/constants/colors";
import { useTrading, TradingSignal } from "@/contexts/TradingContext";

function SignalItem({ signal }: { signal: TradingSignal }) {
  const isBull = signal.trend === "Bullish";
  const trendColor = isBull ? C.green : C.red;

  return (
    <View style={[styles.signalItem, { borderLeftColor: trendColor }]}>
      <View style={styles.signalTop}>
        <View style={styles.signalLeft}>
          <View style={styles.pillsRow}>
            <View style={[styles.trendPill, { backgroundColor: trendColor + "20" }]}>
              <Ionicons
                name={isBull ? "trending-up" : "trending-down"}
                size={12}
                color={trendColor}
              />
              <Text style={[styles.trendPillText, { color: trendColor }]}>
                {signal.trend.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.confirmPill, { backgroundColor: trendColor + "15" }]}>
              <Ionicons
                name={signal.confirmationType === "engulfing" ? "layers" : "radio-button-on"}
                size={10}
                color={trendColor}
              />
              <Text style={[styles.confirmPillText, { color: trendColor }]}>
                {signal.confirmationType === "engulfing" ? "ENGULFING" : "REJECTION"}
              </Text>
            </View>
          </View>
          <Text style={styles.pairText}>{signal.pair} · {signal.timeframe}</Text>
        </View>
        <View style={styles.rrContainer}>
          <Text style={styles.rrSmallLabel}>R:R</Text>
          <Text style={styles.rrSmallValue}>1:{signal.riskReward}</Text>
        </View>
      </View>

      <View style={styles.signalPrices}>
        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockLabel}>ENTRY</Text>
          <Text style={[styles.priceBlockValue, { color: trendColor }]}>
            {signal.entryPrice.toFixed(2)}
          </Text>
        </View>
        <View style={styles.priceDivider} />
        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockLabel}>SL</Text>
          <Text style={[styles.priceBlockValue, { color: C.red }]}>
            {signal.stopLoss.toFixed(2)}
          </Text>
        </View>
        <View style={styles.priceDivider} />
        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockLabel}>TP</Text>
          <Text style={[styles.priceBlockValue, { color: C.green }]}>
            {signal.takeProfit.toFixed(2)}
          </Text>
        </View>
        <View style={styles.priceDivider} />
        <View style={styles.priceBlock}>
          <Text style={styles.priceBlockLabel}>LOT</Text>
          <Text style={[styles.priceBlockValue, { color: C.blue }]}>
            {signal.lotSize.toFixed(2)}
          </Text>
        </View>
      </View>

      <Text style={styles.signalTime}>{signal.timestampUTC}</Text>
    </View>
  );
}

export default function SignalsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 60;
  const { signalHistory, clearHistory } = useTrading();

  const handleClear = () => {
    if (Platform.OS !== "web") {
      Alert.alert(
        "Clear History",
        "Delete all signal history?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              clearHistory();
            },
          },
        ]
      );
    } else {
      clearHistory();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Signal History</Text>
          <Text style={styles.headerSub}>{signalHistory.length} signals recorded</Text>
        </View>
        {signalHistory.length > 0 && (
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.clearBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={C.red} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={signalHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SignalItem signal={item} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: botPad + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!signalHistory.length}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bell-sleep-outline"
                size={40}
                color={C.textDim}
              />
            </View>
            <Text style={styles.emptyTitle}>No Signals Yet</Text>
            <Text style={styles.emptySub}>
              Signals appear here when all conditions are met: trend, Fibonacci zone, and candle confirmation.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.redBg,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
  },
  signalItem: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
  },
  signalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  signalLeft: {
    gap: 4,
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  confirmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  confirmPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  trendPillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  pairText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: C.textSub,
  },
  rrContainer: {
    alignItems: "flex-end",
  },
  rrSmallLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: C.textDim,
    letterSpacing: 1,
  },
  rrSmallValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: C.gold,
  },
  signalPrices: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  priceBlock: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  priceBlockLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: C.textDim,
    letterSpacing: 1.2,
  },
  priceBlockValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  priceDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 2,
  },
  signalTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: C.textDim,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.card,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: C.textSub,
  },
  emptySub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.textDim,
    textAlign: "center",
    lineHeight: 20,
  },
});
