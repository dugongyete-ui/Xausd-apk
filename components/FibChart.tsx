import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, {
  Rect,
  Line,
  Path,
  Text as SvgText,
  Polygon,
  Defs,
  LinearGradient,
  Stop,
  G,
} from "react-native-svg";
import C from "@/constants/colors";
import { useTrading, calcEMAFull } from "@/contexts/TradingContext";

const CHART_HEIGHT = 400;
const RIGHT_W = 62;
const TOP_PAD = 16;
const BOT_PAD = 16;

type TF = "M15" | "M5";

const VISIBLE: Record<TF, number> = { M15: 30, M5: 40 };

function priceToY(p: number, lo: number, hi: number, plotH: number): number {
  if (hi === lo) return plotH / 2;
  return TOP_PAD + ((hi - p) / (hi - lo)) * plotH;
}

function dashedPath(x1: number, y: number, x2: number, dash = 5, gap = 3): string {
  let d = "";
  let x = x1;
  let on = true;
  while (x < x2) {
    const end = Math.min(x + (on ? dash : gap), x2);
    if (on) d += `M${x.toFixed(1)},${y.toFixed(1)} L${end.toFixed(1)},${y.toFixed(1)} `;
    x = end;
    on = !on;
  }
  return d;
}

interface FibLineProps {
  label: string;
  price: number;
  color: string;
  lo: number;
  hi: number;
  plotH: number;
  plotW: number;
  dashed?: boolean;
  strokeWidth?: number;
  labelSide?: "left" | "right";
}

function FibLine({
  label,
  price,
  color,
  lo,
  hi,
  plotH,
  plotW,
  dashed = true,
  strokeWidth = 1,
  labelSide = "left",
}: FibLineProps) {
  const y = priceToY(price, lo, hi, plotH);
  if (y < TOP_PAD - 6 || y > TOP_PAD + plotH + 6) return null;

  const labelW = Math.min(label.length * 5.5 + 8, plotW - 4);
  const lx = labelSide === "left" ? 2 : plotW - labelW - 4;

  return (
    <G>
      {dashed ? (
        <Path
          d={dashedPath(0, y, plotW - 1)}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.8}
        />
      ) : (
        <Line
          x1={0}
          y1={y}
          x2={plotW - 1}
          y2={y}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.95}
        />
      )}
      <Rect
        x={lx}
        y={y - 9}
        width={labelW}
        height={13}
        fill="#0A0E17"
        opacity={0.78}
        rx={3}
      />
      <SvgText
        x={lx + 4}
        y={y + 1}
        fill={color}
        fontSize={7.5}
        fontWeight="bold"
      >
        {label}
      </SvgText>
      <SvgText
        x={plotW + 2}
        y={y + 4}
        fill={color}
        fontSize={7.5}
        fontWeight="bold"
      >
        {price.toFixed(1)}
      </SvgText>
    </G>
  );
}

export function FibChart() {
  const {
    candles,
    m15Candles,
    fibLevels,
    currentPrice,
    currentSignal,
    trend,
  } = useTrading();

  const [chartW, setChartW] = useState(0);
  const [selectedTF, setSelectedTF] = useState<TF>("M15");

  const visibleCount = VISIBLE[selectedTF];

  const visibleCandles = useMemo(() => {
    const src = selectedTF === "M15" ? m15Candles : candles;
    return src.length === 0 ? [] : src.slice(-visibleCount);
  }, [selectedTF, candles, m15Candles, visibleCount]);

  const ema50Series = useMemo(() => {
    if (selectedTF !== "M15" || m15Candles.length < 50) return [];
    return calcEMAFull(m15Candles.map((c) => c.close), 50).slice(-visibleCount);
  }, [selectedTF, m15Candles, visibleCount]);

  const ema200Series = useMemo(() => {
    if (selectedTF !== "M15" || m15Candles.length < 200) return [];
    return calcEMAFull(m15Candles.map((c) => c.close), 200).slice(-visibleCount);
  }, [selectedTF, m15Candles, visibleCount]);

  const m15Ema50Val = useMemo(() => {
    if (ema50Series.length === 0) return null;
    const v = ema50Series[ema50Series.length - 1];
    return isNaN(v) ? null : v;
  }, [ema50Series]);

  const m15Ema200Val = useMemo(() => {
    if (ema200Series.length === 0) return null;
    const v = ema200Series[ema200Series.length - 1];
    return isNaN(v) ? null : v;
  }, [ema200Series]);

  // ── Price range: based purely on visible candles + small padding ──────────
  // Do NOT expand for fib levels — that squishes candles. Lines outside are clipped.
  const { lo, hi } = useMemo(() => {
    if (visibleCandles.length === 0) {
      return { lo: 3200, hi: 3300 };
    }
    let loV = Math.min(...visibleCandles.map((c) => c.low));
    let hiV = Math.max(...visibleCandles.map((c) => c.high));

    // Only include fib zone if price is close to it (within 2× visible range)
    if (fibLevels) {
      const vRange = hiV - loV;
      const midV = (loV + hiV) / 2;
      const zoneHi = Math.max(fibLevels.level618, fibLevels.level786);
      const zoneLo = Math.min(fibLevels.level618, fibLevels.level786);
      if (Math.abs(zoneHi - midV) < vRange * 2.5) hiV = Math.max(hiV, zoneHi);
      if (Math.abs(zoneLo - midV) < vRange * 2.5) loV = Math.min(loV, zoneLo);
    }

    // Current price must always be in view
    if (currentPrice !== null) {
      loV = Math.min(loV, currentPrice);
      hiV = Math.max(hiV, currentPrice);
    }

    const pad = (hiV - loV) * 0.1;
    return { lo: loV - pad, hi: hiV + pad };
  }, [visibleCandles, fibLevels, currentPrice]);

  const plotW = chartW - RIGHT_W;
  const plotH = CHART_HEIGHT - TOP_PAD - BOT_PAD;
  const candleW = visibleCandles.length > 0 ? plotW / visibleCandles.length : 10;
  const bodyW = Math.max(2, candleW * 0.65);

  function emaPath(series: number[]): string {
    if (series.length === 0) return "";
    let d = "";
    let started = false;
    const step = plotW / series.length;
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (isNaN(v)) { started = false; continue; }
      const x = i * step + step / 2;
      const y = priceToY(v, lo, hi, plotH);
      d += started ? `L${x.toFixed(1)},${y.toFixed(1)} ` : `M${x.toFixed(1)},${y.toFixed(1)} `;
      started = true;
    }
    return d;
  }

  // Zone (61.8% – 78.6%) highlight coords
  const zoneYTop = fibLevels
    ? Math.min(priceToY(fibLevels.level618, lo, hi, plotH), priceToY(fibLevels.level786, lo, hi, plotH))
    : null;
  const zoneYBot = fibLevels
    ? Math.max(priceToY(fibLevels.level618, lo, hi, plotH), priceToY(fibLevels.level786, lo, hi, plotH))
    : null;
  const zoneH = zoneYTop !== null && zoneYBot !== null ? zoneYBot - zoneYTop : 0;

  const isBull = trend === "Bullish";
  const isBear = trend === "Bearish";
  const trendLabel =
    isBull ? "M15 BULLISH ▲" :
    isBear ? "M15 BEARISH ▼" :
    trend === "Loading" ? `LOADING ${m15Candles.length}/300` : "NO TREND";
  const trendColor = isBull ? C.green : isBear ? C.red : C.textDim;

  const hasNoData = candles.length === 0 && m15Candles.length === 0;

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>XAUUSD · Fibonacci Analysis</Text>
          <Text style={styles.headerSub}>
            {selectedTF === "M15" ? "Struktur M15 · Deep Pullback Continuation" : "Eksekusi M5 · Precision Entry"}
          </Text>
        </View>
        <View style={[styles.trendPill, { borderColor: trendColor + "50", backgroundColor: trendColor + "15" }]}>
          <Text style={[styles.trendPillText, { color: trendColor }]}>{trendLabel}</Text>
        </View>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.tfRow}>
        {(["M15", "M5"] as TF[]).map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.tfBtn, selectedTF === tf && styles.tfBtnActive]}
            onPress={() => setSelectedTF(tf)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tfBtnText, selectedTF === tf && styles.tfBtnTextActive]}>
              {tf === "M15" ? "M15 · Struktur" : "M5 · Entry"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Candle count info */}
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>
          M15: {m15Candles.length} candle · M5: {candles.length} candle
        </Text>
        {fibLevels && (
          <Text style={styles.infoText}>
            Zona: {Math.min(fibLevels.level618, fibLevels.level786).toFixed(1)}–{Math.max(fibLevels.level618, fibLevels.level786).toFixed(1)}
          </Text>
        )}
      </View>

      {chartW > 0 && (
        <Svg width={chartW} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="buyZone" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.gold} stopOpacity={0.22} />
              <Stop offset="1" stopColor={C.gold} stopOpacity={0.06} />
            </LinearGradient>
            <LinearGradient id="sellZone" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.red} stopOpacity={0.06} />
              <Stop offset="1" stopColor={C.red} stopOpacity={0.22} />
            </LinearGradient>
          </Defs>

          {/* Grid */}
          {[0.1, 0.25, 0.4, 0.6, 0.75, 0.9].map((pct, i) => {
            const price = lo + (hi - lo) * (1 - pct);
            const y = priceToY(price, lo, hi, plotH);
            return (
              <G key={i}>
                <Line x1={0} y1={y} x2={plotW} y2={y}
                  stroke={C.border} strokeWidth={1} opacity={0.2} />
                <SvgText x={plotW + 2} y={y + 3} fill={C.textDim} fontSize={6.5}>
                  {price.toFixed(0)}
                </SvgText>
              </G>
            );
          })}

          {/* Fibonacci zone highlight (61.8% – 78.6%) */}
          {fibLevels && zoneYTop !== null && zoneYBot !== null && zoneH > 0 && (
            <G>
              <Rect
                x={0}
                y={Math.max(TOP_PAD, zoneYTop)}
                width={plotW}
                height={Math.min(zoneH, plotH)}
                fill={isBull ? "url(#buyZone)" : "url(#sellZone)"}
              />
              {/* Left edge accent */}
              <Line
                x1={0} y1={zoneYTop} x2={0} y2={zoneYBot}
                stroke={C.gold} strokeWidth={2} opacity={0.5}
              />
              {/* Zone center label */}
              {zoneH > 18 && (
                <G>
                  <Rect
                    x={plotW / 2 - 70}
                    y={(zoneYTop + zoneYBot) / 2 - 9}
                    width={140}
                    height={16}
                    fill="#0A0E17"
                    opacity={0.72}
                    rx={4}
                  />
                  <SvgText
                    x={plotW / 2}
                    y={(zoneYTop + zoneYBot) / 2 + 4}
                    fill={isBull ? C.green : C.red}
                    fontSize={9}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {isBull ? "▲ BUY ZONE (M15 Structure)" : "▼ SELL ZONE (M15 Structure)"}
                  </SvgText>
                </G>
              )}
            </G>
          )}

          {/* EMA Lines — M15 view */}
          {selectedTF === "M15" && ema200Series.length > 0 && (
            <Path d={emaPath(ema200Series)} stroke="#F97316" strokeWidth={1.5} fill="none" opacity={0.85} />
          )}
          {selectedTF === "M15" && ema50Series.length > 0 && (
            <Path d={emaPath(ema50Series)} stroke="#A78BFA" strokeWidth={1.5} fill="none" opacity={0.85} />
          )}

          {/* EMA horizontal references on M5 view */}
          {selectedTF === "M5" && m15Ema200Val !== null && (
            <FibLine
              label="M15 EMA200"
              price={m15Ema200Val}
              color="#F97316"
              lo={lo} hi={hi} plotH={plotH} plotW={plotW}
              dashed strokeWidth={1.5}
              labelSide="right"
            />
          )}
          {selectedTF === "M5" && m15Ema50Val !== null && (
            <FibLine
              label="M15 EMA50"
              price={m15Ema50Val}
              color="#A78BFA"
              lo={lo} hi={hi} plotH={plotH} plotW={plotW}
              dashed strokeWidth={1.5}
              labelSide="right"
            />
          )}

          {/* ── Fibonacci Structure Lines ── */}
          {fibLevels && (() => {
            const trendUp = trend === "Bullish";
            return (
              <>
                {/* 0.0% — Swing High (Bullish) or Swing Low (Bearish) */}
                <FibLine
                  label={trendUp
                    ? "0.0% · Swing High (Resistance)"
                    : "0.0% · Swing Low (Support)"}
                  price={trendUp ? fibLevels.swingHigh : fibLevels.swingLow}
                  color={trendUp ? C.green : C.red}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed={false}
                  strokeWidth={1.5}
                />

                {/* 61.8% — Golden Retracement */}
                <FibLine
                  label="61.8% · Golden Retracement (Primary Entry Zone)"
                  price={fibLevels.level618}
                  color={C.gold}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.2}
                />

                {/* 78.6% — Deep Retracement */}
                <FibLine
                  label="78.6% · Deep Retracement (Final Defense Zone)"
                  price={fibLevels.level786}
                  color="#FBBF24"
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.2}
                />

                {/* 100% — Swing Low (Bullish) or Swing High (Bearish) */}
                <FibLine
                  label={trendUp
                    ? "100% · Swing Low (SL Reference)"
                    : "100% · Swing High (SL Reference)"}
                  price={trendUp ? fibLevels.swingLow : fibLevels.swingHigh}
                  color={trendUp ? C.red : C.green}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed={false}
                  strokeWidth={1}
                />

                {/* -27% Extension — Take Profit Target */}
                <FibLine
                  label="-27% Extension (Take Profit Target)"
                  price={fibLevels.extensionNeg27}
                  color={C.blue}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.5}
                />
              </>
            );
          })()}

          {/* ── Candlesticks ── */}
          {visibleCandles.map((c, i) => {
            const isBullCandle = c.close >= c.open;
            const col = isBullCandle ? C.green : C.red;
            const cx = i * candleW + candleW / 2;
            const bTop = priceToY(Math.max(c.open, c.close), lo, hi, plotH);
            const bBot = priceToY(Math.min(c.open, c.close), lo, hi, plotH);
            const wTop = priceToY(c.high, lo, hi, plotH);
            const wBot = priceToY(c.low, lo, hi, plotH);
            const bh = Math.max(2, bBot - bTop);
            return (
              <G key={c.epoch}>
                {/* Wick */}
                <Line
                  x1={cx} y1={wTop} x2={cx} y2={wBot}
                  stroke={col} strokeWidth={1.2} opacity={0.8}
                />
                {/* Body */}
                <Rect
                  x={cx - bodyW / 2}
                  y={bTop}
                  width={bodyW}
                  height={bh}
                  fill={col}
                  opacity={isBullCandle ? 0.92 : 0.85}
                  rx={0.5}
                />
              </G>
            );
          })}

          {/* ── Signal confirmation label ── */}
          {currentSignal && (() => {
            const idx = visibleCandles.findIndex((c) => c.epoch === currentSignal.signalCandleEpoch);
            const signalIsBull = currentSignal.trend === "Bullish";
            const col = signalIsBull ? C.green : C.red;
            const signalLabel = signalIsBull
              ? "BUY CONFIRMED"
              : "SELL CONFIRMED";
            const subLabel = "M5 Execution · M15 Zone";

            const cx = idx >= 0 ? idx * candleW + candleW / 2 : plotW - 50;
            const refCandle = idx >= 0 ? visibleCandles[idx] : null;
            const flagW = 100;
            const flagH = 28;

            if (signalIsBull) {
              const tipY = refCandle
                ? priceToY(refCandle.high, lo, hi, plotH) - 5
                : priceToY(currentSignal.entryPrice, lo, hi, plotH) - 5;
              const labelY = Math.max(TOP_PAD, tipY - flagH - 6);
              const lx = Math.min(Math.max(cx - flagW / 2, 2), plotW - flagW - 4);
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY + flagH} stroke={col} strokeWidth={1} opacity={0.7} />
                  <Polygon
                    points={`${cx - 5},${tipY} ${cx + 5},${tipY} ${cx},${tipY - 6}`}
                    fill={col} opacity={0.9}
                  />
                  <Rect x={lx} y={labelY} width={flagW} height={flagH} fill={col} rx={5} opacity={0.95} />
                  <SvgText x={lx + flagW / 2} y={labelY + 11} fill="#fff" fontSize={8.5} fontWeight="bold" textAnchor="middle">{signalLabel}</SvgText>
                  <SvgText x={lx + flagW / 2} y={labelY + 22} fill="#fff" fontSize={7} textAnchor="middle" opacity={0.85}>{subLabel}</SvgText>
                </G>
              );
            } else {
              const tipY = refCandle
                ? priceToY(refCandle.low, lo, hi, plotH) + 5
                : priceToY(currentSignal.entryPrice, lo, hi, plotH) + 5;
              const labelY = Math.min(tipY + 6, TOP_PAD + plotH - flagH - 2);
              const lx = Math.min(Math.max(cx - flagW / 2, 2), plotW - flagW - 4);
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY} stroke={col} strokeWidth={1} opacity={0.7} />
                  <Polygon
                    points={`${cx - 5},${tipY} ${cx + 5},${tipY} ${cx},${tipY + 6}`}
                    fill={col} opacity={0.9}
                  />
                  <Rect x={lx} y={labelY} width={flagW} height={flagH} fill={col} rx={5} opacity={0.95} />
                  <SvgText x={lx + flagW / 2} y={labelY + 11} fill="#fff" fontSize={8.5} fontWeight="bold" textAnchor="middle">{signalLabel}</SvgText>
                  <SvgText x={lx + flagW / 2} y={labelY + 22} fill="#fff" fontSize={7} textAnchor="middle" opacity={0.85}>{subLabel}</SvgText>
                </G>
              );
            }
          })()}

          {/* ── Signal levels (Entry / SL / TP) ── */}
          {currentSignal && (
            <>
              <FibLine
                label={`ENTRY ${currentSignal.trend === "Bullish" ? "BUY" : "SELL"}`}
                price={currentSignal.entryPrice}
                color={currentSignal.trend === "Bullish" ? C.green : C.red}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed={false}
                strokeWidth={2}
                labelSide="right"
              />
              <FibLine
                label="STOP LOSS"
                price={currentSignal.stopLoss}
                color={C.red}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed
                strokeWidth={1.5}
                labelSide="right"
              />
              <FibLine
                label="TAKE PROFIT (-27%)"
                price={currentSignal.takeProfit}
                color={C.blue}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed
                strokeWidth={1.5}
                labelSide="right"
              />
            </>
          )}

          {/* ── Live price ticker ── */}
          {currentPrice !== null && (() => {
            const y = priceToY(currentPrice, lo, hi, plotH);
            const lastC = visibleCandles[visibleCandles.length - 1];
            const priceUp = !lastC || currentPrice >= lastC.open;
            const lc = priceUp ? C.green : C.red;
            return (
              <G>
                <Path
                  d={dashedPath(0, y, plotW, 3, 3)}
                  stroke={lc}
                  strokeWidth={1}
                  opacity={0.45}
                />
                <Polygon
                  points={`${plotW},${y - 5} ${plotW + 6},${y} ${plotW},${y + 5}`}
                  fill={lc}
                />
                <Rect
                  x={plotW + 6}
                  y={y - 9}
                  width={RIGHT_W - 8}
                  height={18}
                  fill={lc}
                  rx={3}
                />
                <SvgText
                  x={plotW + 9}
                  y={y + 4}
                  fill="#fff"
                  fontSize={8}
                  fontWeight="bold"
                >
                  {currentPrice.toFixed(2)}
                </SvgText>
              </G>
            );
          })()}
        </Svg>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <LegItem color={C.gold} label="61.8% Zone" box />
        <LegItem color="#FBBF24" label="78.6% Zone" box />
        <LegItem color={C.blue} label="-27% TP" />
        <LegItem color="#A78BFA" label="EMA50" line />
        <LegItem color="#F97316" label="EMA200" line />
        {currentSignal && <LegItem color={C.red} label="Stop Loss" />}
      </View>

      {hasNoData && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Menghubungkan ke Deriv WebSocket...</Text>
          <Text style={[styles.overlayText, { fontSize: 10, marginTop: 4, opacity: 0.6 }]}>
            Memuat data candle M15 dan M5...
          </Text>
        </View>
      )}
    </View>
  );
}

function LegItem({
  color,
  label,
  line = false,
  box = false,
}: {
  color: string;
  label: string;
  line?: boolean;
  box?: boolean;
}) {
  return (
    <View style={styles.legItem}>
      {box ? (
        <View style={[styles.legBox, { backgroundColor: color + "40", borderColor: color }]} />
      ) : line ? (
        <View style={[styles.legLine, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legDot, { backgroundColor: color }]} />
      )}
      <Text style={styles.legText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: C.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: C.textDim,
    marginTop: 2,
  },
  trendPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  trendPillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  tfRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  tfBtnActive: {
    backgroundColor: C.gold + "20",
    borderColor: C.gold,
  },
  tfBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: C.textDim,
  },
  tfBtnTextActive: {
    color: C.gold,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9.5,
    color: C.textDim,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  legItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legDot: { width: 6, height: 6, borderRadius: 3 },
  legLine: { width: 14, height: 2, borderRadius: 1 },
  legBox: { width: 10, height: 8, borderRadius: 2, borderWidth: 1 },
  legText: { fontFamily: "Inter_400Regular", fontSize: 9, color: C.textDim },
  overlay: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    bottom: 32,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.card + "D0",
  },
  overlayText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: C.textSub,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
