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

export type ConfirmationType = "rejection" | "engulfing";

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
  signalCandleEpoch: number;
  confirmationType: ConfirmationType;
}

export type TrendState = "Bullish" | "Bearish" | "No Trade" | "Loading";
export type MarketState = "open" | "closed";

interface TradingContextValue {
  // M5 candles — shown in chart for precision entry view
  candles: Candle[];
  // M15 candles — used for structure (EMA, swing, Fibonacci)
  m15Candles: Candle[];
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
  marketState: MarketState;
  marketNextOpen: string;
}

const TradingContext = createContext<TradingContextValue | null>(null);

const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=114791";
const SYMBOL = "frxXAUUSD";

// M15 — structure: EMA50/200, swing detection, Fibonacci zones
const M15_GRAN = 900;
const M15_COUNT = 200;

// M5 — precision entry: rejection/engulfing confirmation
const M5_GRAN = 300;
const M5_COUNT = 50;

const ATR_PERIOD = 14;
const EMA50_PERIOD = 50;
const EMA200_PERIOD = 200;
const STORAGE_KEY_SIGNALS = "fibo_signals_v2";
const STORAGE_KEY_BALANCE = "fibo_balance_v1";
const STORAGE_KEY_M15 = "fibo_m15_candles_v1";
const STORAGE_KEY_M5 = "fibo_m5_candles_v1";

// ─── Market hours ───────────────────────────────────────────────────────────
function forexMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0) return mins >= 22 * 60;
  if (day === 5) return mins < 22 * 60;
  return true;
}

function nextOpenDesc(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) {
    const minsLeft = 22 * 60 + (7 - 6) * 24 * 60 - mins;
    return `Buka Minggu ~${Math.floor(minsLeft / 60)}j ${minsLeft % 60}m lagi`;
  }
  if (day === 0 && mins < 22 * 60) {
    const minsLeft = 22 * 60 - mins;
    return `Buka hari ini ${Math.floor(minsLeft / 60)}j ${minsLeft % 60}m lagi (~22:00 UTC)`;
  }
  if (day === 5 && mins >= 22 * 60) return "Buka Minggu ~22:00 UTC";
  return "";
}

// ─── EMA helpers ─────────────────────────────────────────────────────────────
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
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findSwingHigh(candles: Candle[]): number | null {
  for (let i = candles.length - 3; i >= 2; i--) {
    const c = candles[i];
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high
    ) return c.high;
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
    ) return c.low;
  }
  return null;
}

function calcFib(swingHigh: number, swingLow: number, trend: "Bullish" | "Bearish"): FibLevels {
  const range = swingHigh - swingLow;
  if (trend === "Bullish") {
    return {
      swingHigh, swingLow,
      level618: swingHigh - range * 0.618,
      level786: swingHigh - range * 0.786,
      extensionNeg27: swingHigh + range * 0.27,
    };
  }
  return {
    swingHigh, swingLow,
    level618: swingLow + range * 0.618,
    level786: swingLow + range * 0.786,
    extensionNeg27: swingLow - range * 0.27,
  };
}

// ─── M5 Entry confirmation ───────────────────────────────────────────────────
// Checks latest M5 candle for rejection (pin bar) pattern
function checkRejection(candle: Candle, trend: "Bullish" | "Bearish"): boolean {
  const body = Math.abs(candle.close - candle.open);
  if (body === 0) return false;
  if (trend === "Bullish") {
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    return candle.close > candle.open && lowerWick >= body * 1.5;
  }
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return candle.close < candle.open && upperWick >= body * 1.5;
}

// Checks last two M5 candles for engulfing pattern
function checkEngulfing(prev: Candle, curr: Candle, trend: "Bullish" | "Bearish"): boolean {
  const prevBody = Math.abs(prev.close - prev.open);
  const currBody = Math.abs(curr.close - curr.open);
  if (prevBody === 0 || currBody === 0) return false;
  if (trend === "Bullish") {
    const prevBear = prev.close < prev.open;
    const currBull = curr.close > curr.open;
    return prevBear && currBull && curr.close > prev.open && curr.open < prev.close;
  }
  const prevBull = prev.close > prev.open;
  const currBear = curr.close < curr.open;
  return prevBull && currBear && curr.close < prev.open && curr.open > prev.close;
}

function makeSignalKey(price: number, trend: string, epochMs: number): string {
  const bucket = Math.floor(epochMs / (5 * 60 * 1000));
  const zone = Math.round(price * 2) / 2;
  return `${zone}_${trend}_${bucket}`;
}

function parseCandle(c: { open: string; high: string; low: string; close: string; epoch: number }): Candle | null {
  const parsed = {
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    epoch: c.epoch,
  };
  if (isNaN(parsed.open) || isNaN(parsed.high) || isNaN(parsed.low) || isNaN(parsed.close)) return null;
  return parsed;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function TradingProvider({ children }: { children: ReactNode }) {
  // M5 candles — precision entry, shown in chart
  const [m5Candles, setM5Candles] = useState<Candle[]>([]);
  // M15 candles — structure, EMA/swing/Fibonacci
  const [m15Candles, setM15Candles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [signalHistory, setSignalHistory] = useState<TradingSignal[]>([]);
  const [balance, setBalanceState] = useState<number>(10000);
  const [marketState, setMarketState] = useState<MarketState>(forexMarketOpen() ? "open" : "closed");
  const [marketNextOpen, setMarketNextOpen] = useState(nextOpenDesc());

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marketCheckTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedSignalKeys = useRef<Set<string>>(new Set());
  const wasOpenRef = useRef<boolean>(forexMarketOpen());

  // ─── Startup: load all cached data instantly ──────────────────────────────
  useEffect(() => {
    // Signal history
    AsyncStorage.getItem(STORAGE_KEY_SIGNALS).then((v) => {
      if (v) {
        try {
          const parsed: TradingSignal[] = JSON.parse(v);
          setSignalHistory(parsed);
          parsed.forEach((s) => {
            savedSignalKeys.current.add(
              makeSignalKey(s.entryPrice, s.trend, new Date(s.timestampUTC).getTime())
            );
          });
        } catch {}
      }
    });

    // Balance
    AsyncStorage.getItem(STORAGE_KEY_BALANCE).then((v) => {
      if (v) setBalanceState(parseFloat(v) || 10000);
    });

    // M15 candles — load from cache so EMA/Fibonacci is ready before WS connects
    AsyncStorage.getItem(STORAGE_KEY_M15).then((v) => {
      if (v) {
        try {
          const cached: Candle[] = JSON.parse(v);
          if (cached.length >= EMA200_PERIOD) {
            setM15Candles(cached);
          }
        } catch {}
      }
    });

    // M5 candles — load from cache for chart
    AsyncStorage.getItem(STORAGE_KEY_M5).then((v) => {
      if (v) {
        try {
          const cached: Candle[] = JSON.parse(v);
          if (cached.length > 0) {
            setM5Candles(cached);
            setCurrentPrice(cached[cached.length - 1].close);
          }
        } catch {}
      }
    });
  }, []);

  const setBalance = useCallback((b: number) => {
    setBalanceState(b);
    AsyncStorage.setItem(STORAGE_KEY_BALANCE, String(b));
  }, []);

  // Unlimited history
  const saveSignal = useCallback((sig: TradingSignal, key: string) => {
    if (savedSignalKeys.current.has(key)) return;
    savedSignalKeys.current.add(key);
    setSignalHistory((prev) => {
      const next = [sig, ...prev];
      AsyncStorage.setItem(STORAGE_KEY_SIGNALS, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSignalHistory([]);
    savedSignalKeys.current.clear();
    AsyncStorage.setItem(STORAGE_KEY_SIGNALS, JSON.stringify([]));
  }, []);

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!forexMarketOpen()) return;
    if (wsRef.current) { try { wsRef.current.close(); } catch {} }
    setConnectionStatus("connecting");

    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");

      // Subscribe M15 — structure
      ws.send(JSON.stringify({
        ticks_history: SYMBOL,
        adjust_start_time: 1,
        count: M15_COUNT,
        end: "latest",
        granularity: M15_GRAN,
        style: "candles",
        subscribe: 1,
      }));

      // Subscribe M5 — precision entry
      ws.send(JSON.stringify({
        ticks_history: SYMBOL,
        adjust_start_time: 1,
        count: M5_COUNT,
        end: "latest",
        granularity: M5_GRAN,
        style: "candles",
        subscribe: 1,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          console.error("[WS] Error:", msg.error.message);
          return;
        }

        // Initial candle history — route by granularity in echo_req
        if (msg.msg_type === "candles" && Array.isArray(msg.candles)) {
          const gran: number = msg.echo_req?.granularity ?? 0;
          const parsed = msg.candles
            .map((c: Parameters<typeof parseCandle>[0]) => parseCandle(c))
            .filter((c: Candle | null): c is Candle => c !== null);
          if (parsed.length === 0) return;

          if (gran === M15_GRAN) {
            setM15Candles(parsed);
            // Persist so next startup is instant
            AsyncStorage.setItem(STORAGE_KEY_M15, JSON.stringify(parsed)).catch(() => {});
          } else if (gran === M5_GRAN) {
            setM5Candles(parsed);
            setCurrentPrice(parsed[parsed.length - 1].close);
            AsyncStorage.setItem(STORAGE_KEY_M5, JSON.stringify(parsed)).catch(() => {});
          }
          return;
        }

        // Live tick updates — route by ohlc.granularity
        if (msg.msg_type === "ohlc" && msg.ohlc) {
          const o = msg.ohlc;
          const gran: number = o.granularity ?? 0;
          const nc: Candle = {
            open: parseFloat(o.open),
            high: parseFloat(o.high),
            low: parseFloat(o.low),
            close: parseFloat(o.close),
            epoch: o.open_time,
          };
          if (isNaN(nc.open) || isNaN(nc.high) || isNaN(nc.low) || isNaN(nc.close)) return;

          const updater = (
            prev: Candle[],
            maxCount: number,
            storageKey: string,
            minSaveLen: number
          ): Candle[] => {
            if (prev.length === 0) return [nc];
            const last = prev[prev.length - 1];
            if (last.epoch === nc.epoch) {
              // Same candle updating (same epoch) — no save needed
              const updated = [...prev];
              updated[updated.length - 1] = nc;
              return updated;
            }
            // New completed candle — append and persist
            const next = [...prev, nc];
            if (next.length > maxCount) next.shift();
            if (next.length >= minSaveLen) {
              AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
            }
            return next;
          };

          if (gran === M15_GRAN) {
            setM15Candles((prev) =>
              updater(prev, M15_COUNT, STORAGE_KEY_M15, EMA200_PERIOD)
            );
          } else if (gran === M5_GRAN) {
            setCurrentPrice(nc.close);
            setM5Candles((prev) =>
              updater(prev, M5_COUNT, STORAGE_KEY_M5, 1)
            );
          }
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onerror = () => setConnectionStatus("disconnected");

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      if (forexMarketOpen()) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };
  }, []);

  // ─── Market hours polling ──────────────────────────────────────────────────
  useEffect(() => {
    connect();

    marketCheckTimer.current = setInterval(() => {
      const isOpen = forexMarketOpen();
      setMarketState(isOpen ? "open" : "closed");
      setMarketNextOpen(isOpen ? "" : nextOpenDesc());

      const wasOpen = wasOpenRef.current;
      wasOpenRef.current = isOpen;

      if (isOpen && !wasOpen) {
        // Market just opened — keep cached candles visible while WS reconnects
        setCurrentPrice(null);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        connect();
      } else if (!isOpen && wasOpen) {
        // Market just closed — disconnect WS, keep last candles visible
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
        setCurrentPrice(null);
      }
    }, 30_000);

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (marketCheckTimer.current) clearInterval(marketCheckTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // ─── Indicators from M15 ──────────────────────────────────────────────────
  const ema50 = useMemo(() => {
    if (m15Candles.length < EMA50_PERIOD) return null;
    const arr = calcEMA(m15Candles.map((c) => c.close), EMA50_PERIOD);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [m15Candles]);

  const ema200 = useMemo(() => {
    if (m15Candles.length < EMA200_PERIOD) return null;
    const arr = calcEMA(m15Candles.map((c) => c.close), EMA200_PERIOD);
    return arr.length > 0 ? arr[arr.length - 1] : null;
  }, [m15Candles]);

  // Trend from M15
  const trend = useMemo((): TrendState => {
    if (m15Candles.length < EMA200_PERIOD) return "Loading";
    if (ema50 === null || ema200 === null) return "Loading";
    const last = m15Candles[m15Candles.length - 1].close;
    if (last > ema200 && ema50 > ema200) return "Bullish";
    if (last < ema200 && ema50 < ema200) return "Bearish";
    return "No Trade";
  }, [m15Candles, ema50, ema200]);

  // ATR from M15
  const atr = useMemo(() => {
    if (m15Candles.length < ATR_PERIOD + 1) return null;
    return calcATR(m15Candles, ATR_PERIOD);
  }, [m15Candles]);

  // Fibonacci levels from M15 swings
  const fibLevels = useMemo((): FibLevels | null => {
    if (trend === "Loading" || trend === "No Trade") return null;
    const swingHigh = findSwingHigh(m15Candles);
    const swingLow = findSwingLow(m15Candles);
    if (swingHigh === null || swingLow === null || swingHigh <= swingLow) return null;
    return calcFib(swingHigh, swingLow, trend);
  }, [m15Candles, trend]);

  // Is current M5 price inside M15 Fibonacci zone?
  const inZone = useMemo(() => {
    if (!fibLevels || currentPrice === null) return false;
    const lo = Math.min(fibLevels.level618, fibLevels.level786);
    const hi = Math.max(fibLevels.level618, fibLevels.level786);
    return currentPrice >= lo && currentPrice <= hi;
  }, [fibLevels, currentPrice]);

  // ─── Signal detection: M15 zone + M5 confirmation ─────────────────────────
  const currentSignal = useMemo((): TradingSignal | null => {
    if (
      !fibLevels || !atr || atr <= 0 ||
      trend === "Loading" || trend === "No Trade" ||
      m5Candles.length < 2 || currentPrice === null ||
      marketState === "closed"
    ) return null;

    const lo = Math.min(fibLevels.level618, fibLevels.level786);
    const hi = Math.max(fibLevels.level618, fibLevels.level786);

    // M15 zone check — is current M5 price inside M15 Fibonacci zone?
    if (currentPrice < lo || currentPrice > hi) return null;

    const lastM5 = m5Candles[m5Candles.length - 1];
    const prevM5 = m5Candles[m5Candles.length - 2];
    const trendDir = trend as "Bullish" | "Bearish";

    // M5 confirmation: rejection pin bar OR engulfing
    const isRejection = checkRejection(lastM5, trendDir);
    const isEngulfing = checkEngulfing(prevM5, lastM5, trendDir);
    if (!isRejection && !isEngulfing) return null;

    const confirmationType: ConfirmationType = isEngulfing ? "engulfing" : "rejection";

    // SL/TP based on M15 ATR
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
    if (slDistance < atr * 0.05 * 3 || atr < 0.1) return null;

    const riskAmount = balance * 0.01;
    const lotSize = riskAmount / slDistance;
    const tpDistance = Math.abs(tp - currentPrice);
    const riskReward = tpDistance / slDistance;

    const nowMs = Date.now();
    const sigKey = makeSignalKey(currentPrice, trend, nowMs);

    return {
      id: sigKey,
      pair: "XAUUSD",
      timeframe: "M15/M5",
      trend: trendDir,
      entryPrice: currentPrice,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: Math.round(riskReward * 100) / 100,
      lotSize: Math.round(lotSize * 100) / 100,
      timestampUTC: new Date(nowMs).toUTCString(),
      fibLevels,
      status: "active",
      signalCandleEpoch: lastM5.epoch,
      confirmationType,
    };
  }, [fibLevels, atr, trend, currentPrice, m5Candles, balance, marketState]);

  useEffect(() => {
    if (currentSignal) saveSignal(currentSignal, currentSignal.id);
  }, [currentSignal?.id, saveSignal]);

  const value = useMemo(
    () => ({
      candles: m5Candles,
      m15Candles,
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
      marketState,
      marketNextOpen,
    }),
    [
      m5Candles, m15Candles, currentPrice, ema50, ema200, trend,
      fibLevels, currentSignal, signalHistory, atr, connectionStatus,
      balance, setBalance, inZone, clearHistory, marketState, marketNextOpen,
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
