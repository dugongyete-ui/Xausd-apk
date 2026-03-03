import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice && Platform.OS !== "android") {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("trading-signals", {
      name: "Trading Signals",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F0B429",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync("tp-sl-alerts", {
      name: "TP / SL Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 100, 100, 400],
      lightColor: "#22C55E",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }

  return true;
}

export async function sendSignalNotification(params: {
  trend: "Bullish" | "Bearish";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  lotSize: number;
  confirmationType: "rejection" | "engulfing";
}): Promise<void> {
  const isBull = params.trend === "Bullish";
  const dirEmoji = isBull ? "🟢" : "🔴";
  const dirLabel = isBull ? "BUY" : "SELL";
  const confirmLabel =
    params.confirmationType === "engulfing" ? "Engulfing M5" : "Rejection M5";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${dirEmoji} LIBARTIN — SINYAL ${dirLabel} XAUUSD`,
      body: `Entry: ${params.entryPrice.toFixed(2)} | SL: ${params.stopLoss.toFixed(2)} | TP: ${params.takeProfit.toFixed(2)} | R:R 1:${params.riskReward} | Lot: ${params.lotSize.toFixed(2)} | ${confirmLabel}`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: "signal", trend: params.trend },
      ...(Platform.OS === "android" && { channelId: "trading-signals" }),
    },
    trigger: null,
  });
}

export async function sendTPAlert(params: {
  trend: "Bullish" | "Bearish";
  entryPrice: number;
  takeProfit: number;
  currentPrice: number;
}): Promise<void> {
  const isBull = params.trend === "Bullish";
  const pnlPips = isBull
    ? params.currentPrice - params.entryPrice
    : params.entryPrice - params.currentPrice;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `✅ LIBARTIN — TAKE PROFIT TERCAPAI!`,
      body: `Harga ${params.currentPrice.toFixed(2)} mencapai TP ${params.takeProfit.toFixed(2)} | P&L: +${pnlPips.toFixed(2)} pips | ${isBull ? "BUY" : "SELL"} XAUUSD`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: "tp", trend: params.trend },
      ...(Platform.OS === "android" && { channelId: "tp-sl-alerts" }),
    },
    trigger: null,
  });
}

export async function sendSLAlert(params: {
  trend: "Bullish" | "Bearish";
  entryPrice: number;
  stopLoss: number;
  currentPrice: number;
}): Promise<void> {
  const isBull = params.trend === "Bullish";
  const lossPrice = isBull
    ? params.entryPrice - params.currentPrice
    : params.currentPrice - params.entryPrice;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛑 LIBARTIN — STOP LOSS KENA!`,
      body: `Harga ${params.currentPrice.toFixed(2)} menyentuh SL ${params.stopLoss.toFixed(2)} | Loss: -${lossPrice.toFixed(2)} pips | ${isBull ? "BUY" : "SELL"} XAUUSD`,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: "sl", trend: params.trend },
      ...(Platform.OS === "android" && { channelId: "tp-sl-alerts" }),
    },
    trigger: null,
  });
}

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}
