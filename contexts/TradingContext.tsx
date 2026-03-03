import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

export interface FibLevels {
  swingHigh: number;
  swingLow: number;
  level618: number;
  level786: number;
  extensionNeg27: number;
}

export interface TradingSignal {
  id: string;
  pair: string;
  timeframe: string;
  trend: "Bullish" | "Bearish";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  lotSize: number;
  timestampUTC: string;
  fibLevels: FibLevels;
  status: "active" | "closed";
}

export type TrendState = "Bullish" | "Bearish" | "No Trade" | "Loading";

interface TradingContextValue {
  candles: Candle[];
  currentPrice: number | null;
  ema50: number | null;
  ema200: number | null;
  trend: TrendState;
  fibLevels: FibLevels | null;
  currentSignal: TradingSignal | null;
  signalHistory: TradingSignal[];
  atr: number | null;
  connectionStatus: "connecting" | "connected" | "disconnected";
  balance: number;
  setBalance: (b: number) => void;
  inZone: boolean;
  clearHistory: () => void;
}

const TradingContext = createContext<TradingContextValue | null>(null);

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=114791";
const SYMBOL = "frxXAUUSD";
const GRANULARITY = 300;
const CANDLE_COUNT = 200;
const ATR_PERIOD = 14;
const EMA50_PERIOD = 50;
const EMA200_PERIOD = 200;
const STORAGE_KEY_SIGNALS = "fibo_signals_v1";
const STORAGE_KEY_BALANCE = "fibo_balance_v1";

export function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcEMAFull(closes: number[], period: number): number[] {
  if (closes.length < period) return new Array(closes.length).fill(NaN);
  const k = 2 / (period + 1);
  const result: number[] = new Array(period - 1).fill(NaN);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcATR(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function findSwingHigh(candles: Candle[]): number | null {
  for (let i = candles.length - 3; i >= 2; i--) {
    const c = candles[i];
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) {
      return c.high;
    }
  }
  return null;
}

function findSwingLow(candles: Candle[]): number | null {
  for (let i = candles.length - 3; i >= 2; i--) {
    const c = candles[i];
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low
    ) {
      return c.low;
    }
  }
  return null;
}

function calcFib(
  swingHigh: number,
  swingLow: number,
  trend: "Bullish" | "Bearish"
): FibLevels {
  const range = swingHigh - swingLow;
  if (trend === "Bullish") {
    return {
      swingHigh,
      swingLow,
      level618: swingHigh - range * 0.618,
      level786: swingHigh - range * 0.786,
      extensionNeg27: swingHigh + range * 0.27,
    };
  } else {
    return {
      swingHigh,
      swingLow,
      level618: swingLow + range * 0.618,
      level786: swingLow + range * 0.786,
      extensionNeg27: swingLow - range * 0.27,
    };
  }
}

function checkCandleConfirmation(
  candle: Candle,
  trend: "Bullish" | "Bearish"
): boolean {
  const body = Math.abs(candle.close - candle.open);
  if (body === 0) return false;
  if (trend === "Bullish") {
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    return candle.close > candle.open && lowerWick > body;
  } else {
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return candle.close < candle.open && upperWick > body;
  }
}

// Deterministic signal key: same key for same 5-min window + trend + entry zone
function makeSignalKey(
  price: number,
  trend: string,
  epochMs: number
): string {
  const fiveMinBucket = Math.floor(epochMs / (5 * 60 * 1000));
  const priceZone = Math.round(price * 2) / 2; // round to 0.5 steps
  return `${priceZone}_${trend}_${fiveMinBucket}`;
}

export function TradingProvider({ children }: { children: ReactNode }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [signalHistory, setSignalHistory] = useState<TradingSignal[]>([]);
  const [balance, setBalanceState] = useState<number>(10000);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSignalKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_SIGNALS).then((v) => {
      if (v) {
        try {
          const parsed: TradingSignal[] = JSON.parse(v);
          setSignalHistory(parsed);
          parsed.forEach((s) => {
            const key = makeSignalKey(
              s.entryPrice,
              s.trend,
              new Date(s.timestampUTC).getTime()
            );
            savedSignalKeys.current.add(key);
          });
        } catch {}
      }
    });
    AsyncStorage.getItem(STORAGE_KEY_BALANCE).then((v) => {
      if (v) setBalanceState(parseFloat(v) || 10000);
    });
  }, []);

  const setBalance = useCallback((b: number) => {
    setBalanceState(b);
    AsyncStorage.setItem(STORAGE_KEY_BALANCE, String(b));
  }, []);

  const saveSignal = useCallback((sig: TradingSignal, key: string) => {
    if (savedSignalKeys.current.has(key)) return;
    savedSignalKeys.current.add(key);
    setSignalHistory((prev) => {
      const next = [sig, ...prev].slice(0, 100);
      AsyncStorage.setItem(STORAGE_KEY_SIGNALS, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSignalHistory([]);
    savedSignalKeys.current.clear();
    AsyncStorage.setItem(STORAGE_KEY_SIGNALS, JSON.stringify([]));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    setConnectionStatus("connecting");
    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      ws.send(
        JSON.stringify({
          ticks_history: SYMBOL,
          adjust_start_time: 1,
          count: CANDLE_COUNT,
          end: "latest",
          granularity: GRANULARITY,
          style: "candles",
          subscribe: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          console.error("[WS] Error:", msg.error.message);
          return;
        }
        if (msg.msg_type === "candles" && Array.isArray(msg.candles)) {
          const parsed: Candle[] = msg.candles
            .map(
              (c: {
                open: string;
                high: string;
                low: string;
                close: string;
                epoch: number;
              }) => ({
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                epoch: c.epoch,
              })
            )
            .filter(
              (c: Candle) =>
                !isNaN(c.open) &&
                !isNaN(c.high) &&
                !isNaN(c.low) &&
                !isNaN(c.close)
            );
          if (parsed.length > 0) {
            setCandles(parsed);
            setCurrentPrice(parsed[parsed.length - 1].close);
          }
        } else if (msg.msg_type === "ohlc" && msg.ohlc) {
          const o = msg.ohlc;
          const newCandle: Candle = {
            open: parseFloat(o.open),
            high: parseFloat(o.high),
            low: parseFloat(o.low),
            close: parseFloat(o.close),
            epoch: o.open_time,
          };
          if (
            isNaN(newCandle.open) ||
            isNaN(newCandle.high) ||
            isNaN(newCandle.low) ||
            isNaN(newCandle.close)
          )
            return;
          setCurrentPrice(newCandle.close);
          setCandles((prev) => {
            if (prev.length === 0) return [newCandle];
            const last = prev[prev.length - 1];
            if (last.epoch === newCandle.epoch) {
              const updated = [...prev];
              updated[updated.length - 1] = newCandle;
              return updated;
            } else {
              const next = [...prev, newCandle];
              if (next.length > CANDLE_COUNT) next.shift();
              return next;
            }
          });
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("disconnected");
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const ema50 = useMemo(() => {
    if (candles.length < EMA50_PERIOD) return null;
    const closes = candles.map((c) => c.close);
    const arr = calcEMA(closes, EMA50_PERIOD);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [candles]);

  const ema200 = useMemo(() => {
    if (candles.length < EMA200_PERIOD) return null;
    const closes = candles.map((c) => c.close);
    const arr = calcEMA(closes, EMA200_PERIOD);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [candles]);

  const trend = useMemo((): TrendState => {
    if (candles.length < EMA200_PERIOD) return "Loading";
    if (ema50 === null || ema200 === null) return "Loading";
    const lastClose = candles[candles.length - 1].close;
    if (lastClose > ema200 && ema50 > ema200) return "Bullish";
    if (lastClose < ema200 && ema50 < ema200) return "Bearish";
    return "No Trade";
  }, [candles, ema50, ema200]);

  const atr = useMemo(() => {
    if (candles.length < ATR_PERIOD + 1) return null;
    return calcATR(candles, ATR_PERIOD);
  }, [candles]);

  const fibLevels = useMemo((): FibLevels | null => {
    if (trend === "Loading" || trend === "No Trade") return null;
    const swingHigh = findSwingHigh(candles);
    const swingLow = findSwingLow(candles);
    if (swingHigh === null || swingLow === null) return null;
    if (swingHigh <= swingLow) return null;
    return calcFib(swingHigh, swingLow, trend);
  }, [candles, trend]);

  const inZone = useMemo(() => {
    if (!fibLevels || currentPrice === null) return false;
    const lo = Math.min(fibLevels.level618, fibLevels.level786);
    const hi = Math.max(fibLevels.level618, fibLevels.level786);
    return currentPrice >= lo && currentPrice <= hi;
  }, [fibLevels, currentPrice]);

  const currentSignal = useMemo((): TradingSignal | null => {
    if (
      !fibLevels ||
      !atr ||
      atr <= 0 ||
      trend === "Loading" ||
      trend === "No Trade" ||
      candles.length < 2 ||
      currentPrice === null
    )
      return null;

    const lastCandle = candles[candles.length - 1];
    const lo = Math.min(fibLevels.level618, fibLevels.level786);
    const hi = Math.max(fibLevels.level618, fibLevels.level786);

    if (currentPrice < lo || currentPrice > hi) return null;
    if (!checkCandleConfirmation(lastCandle, trend as "Bullish" | "Bearish"))
      return null;

    let sl: number;
    let tp: number;
    if (trend === "Bullish") {
      sl = fibLevels.level786 - 0.5 * atr;
      tp = fibLevels.extensionNeg27;
    } else {
      sl = fibLevels.level786 + 0.5 * atr;
      tp = fibLevels.extensionNeg27;
    }

    const slDistance = Math.abs(currentPrice - sl);
    const spread = atr * 0.05;
    if (slDistance < spread * 3) return null;
    if (atr < 0.1) return null;

    const riskAmount = balance * 0.01;
    const lotSize = riskAmount / slDistance;
    const tpDistance = Math.abs(tp - currentPrice);
    const riskReward = tpDistance / slDistance;

    const nowMs = Date.now();
    const sigKey = makeSignalKey(currentPrice, trend, nowMs);

    return {
      id: sigKey,
      pair: "XAUUSD",
      timeframe: "M5",
      trend: trend as "Bullish" | "Bearish",
      entryPrice: currentPrice,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: Math.round(riskReward * 100) / 100,
      lotSize: Math.round(lotSize * 100) / 100,
      timestampUTC: new Date(nowMs).toUTCString(),
      fibLevels,
      status: "active",
    };
  }, [fibLevels, atr, trend, currentPrice, candles, balance]);

  useEffect(() => {
    if (currentSignal) {
      saveSignal(currentSignal, currentSignal.id);
    }
  }, [currentSignal?.id, saveSignal]);

  const value = useMemo(
    () => ({
      candles,
      currentPrice,
      ema50,
      ema200,
      trend,
      fibLevels,
      currentSignal,
      signalHistory,
      atr,
      connectionStatus,
      balance,
      setBalance,
      inZone,
      clearHistory,
    }),
    [
      candles,
      currentPrice,
      ema50,
      ema200,
      trend,
      fibLevels,
      currentSignal,
      signalHistory,
      atr,
      connectionStatus,
      balance,
      setBalance,
      inZone,
      clearHistory,
    ]
  );

  return (
    <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
  );
}

export function useTrading() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used within TradingProvider");
  return ctx;
}
