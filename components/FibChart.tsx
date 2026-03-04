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

const LOT_SIZE = 0.01;
const CONTRACT_SIZE = 100;

function calcFloatingPnL(
  trend: "Bullish" | "Bearish",
  entryPrice: number,
  currentPrice: number
): number {
  const diff = trend === "Bullish"
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  return diff * CONTRACT_SIZE * LOT_SIZE;
}

export function FibChart() {
  const {
    candles,
    m15Candles,
    fibLevels,
    currentPrice,
    currentSignal,
    activeSignal,
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

    // Only include fib zone if it is very close to the candle range.
    // Max expansion: 1× the current candle height — prevents zone far below/above
    // from squishing candles. Lines outside this view are clipped by FibLine.
    if (fibLevels) {
      const candleH = hiV - loV;
      const zoneHi = Math.max(fibLevels.level618, fibLevels.level786);
      const zoneLo = Math.min(fibLevels.level618, fibLevels.level786);
      // Only pull chart UP if zone top is above candles but within 1× candle height
      if (zoneHi > hiV && zoneHi - hiV < candleH) hiV = zoneHi;
      // Only pull chart DOWN if zone bottom is below candles but within 1× candle height
      if (zoneLo < loV && loV - zoneLo < candleH) loV = zoneLo;
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
            // Color system — consistent, trader-friendly:
            //   Swing extreme (origin of move) → Purple
            //   61.8% zone boundary            → Gold
            //   78.6% zone boundary            → Orange
            //   SL reference (swing opposite)  → Red
            //   TP target (-27% extension)      → Green
            const SWING_ORIGIN_COLOR = "#C084FC"; // Purple — start of the swing
            const ZONE_618_COLOR     = "#F0B429"; // Gold — primary entry zone
            const ZONE_786_COLOR     = "#F97316"; // Orange — deep retracement zone
            const SL_REF_COLOR       = "#EF4444"; // Red — SL reference level
            const TP_TARGET_COLOR    = "#22C55E"; // Green — take profit target
            return (
              <>
                {/* Swing High (Bearish: origin of move / Bullish: opposite extreme) */}
                <FibLine
                  label={trendUp
                    ? "Swing High · Origin"
                    : "Swing High · Origin (SL Ref)"}
                  price={fibLevels.swingHigh}
                  color={trendUp ? SWING_ORIGIN_COLOR : SL_REF_COLOR}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed={false}
                  strokeWidth={1.5}
                />

                {/* 61.8% — Golden Retracement */}
                <FibLine
                  label="61.8% · Entry Zone (Atas)"
                  price={fibLevels.level618}
                  color={ZONE_618_COLOR}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.3}
                />

                {/* 78.6% — Deep Retracement */}
                <FibLine
                  label="78.6% · Entry Zone (Bawah)"
                  price={fibLevels.level786}
                  color={ZONE_786_COLOR}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.3}
                />

                {/* Swing Low (Bullish: origin / Bearish: opposite extreme) */}
                <FibLine
                  label={trendUp
                    ? "Swing Low · Origin (SL Ref)"
                    : "Swing Low · Origin"}
                  price={fibLevels.swingLow}
                  color={trendUp ? SL_REF_COLOR : SWING_ORIGIN_COLOR}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed={false}
                  strokeWidth={1.5}
                />

                {/* -27% Extension — Take Profit Target (always GREEN) */}
                <FibLine
                  label="TP · -27% Extension"
                  price={fibLevels.extensionNeg27}
                  color={TP_TARGET_COLOR}
                  lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                  dashed
                  strokeWidth={1.8}
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

          {/* ── Signal confirmation label (BUY / SELL badge) ── */}
          {currentSignal && (() => {
            const idx = visibleCandles.findIndex((c) => c.epoch === currentSignal.signalCandleEpoch);
            const signalIsBull = currentSignal.trend === "Bullish";
            const col = signalIsBull ? C.green : C.red;
            const badgeLabel = signalIsBull ? "▲ BUY" : "▼ SELL";
            const confirmLabel = currentSignal.confirmationType === "rejection" ? "Pin Bar" : "Engulfing";

            const cx = idx >= 0 ? idx * candleW + candleW / 2 : plotW - 50;
            const refCandle = idx >= 0 ? visibleCandles[idx] : null;
            const badgeW = 72;
            const badgeH = 30;

            if (signalIsBull) {
              const tipY = refCandle
                ? priceToY(refCandle.high, lo, hi, plotH) - 5
                : priceToY(currentSignal.entryPrice, lo, hi, plotH) - 5;
              const labelY = Math.max(TOP_PAD, tipY - badgeH - 8);
              const lx = Math.min(Math.max(cx - badgeW / 2, 2), plotW - badgeW - 4);
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY + badgeH} stroke={col} strokeWidth={1.2} opacity={0.8} />
                  <Polygon
                    points={`${cx - 5},${tipY} ${cx + 5},${tipY} ${cx},${tipY - 7}`}
                    fill={col} opacity={1}
                  />
                  <Rect x={lx} y={labelY} width={badgeW} height={badgeH} fill={col} rx={5} opacity={1} />
                  <Rect x={lx + 1} y={labelY + 1} width={badgeW - 2} height={badgeH - 2} fill="none"
                    stroke="#ffffff" strokeWidth={0.5} rx={4} opacity={0.4} />
                  <SvgText x={lx + badgeW / 2} y={labelY + 13} fill="#fff" fontSize={11} fontWeight="bold" textAnchor="middle">{badgeLabel}</SvgText>
                  <SvgText x={lx + badgeW / 2} y={labelY + 25} fill="#fff" fontSize={7.5} textAnchor="middle" opacity={0.9}>{confirmLabel}</SvgText>
                </G>
              );
            } else {
              const tipY = refCandle
                ? priceToY(refCandle.low, lo, hi, plotH) + 5
                : priceToY(currentSignal.entryPrice, lo, hi, plotH) + 5;
              const labelY = Math.min(tipY + 8, TOP_PAD + plotH - badgeH - 2);
              const lx = Math.min(Math.max(cx - badgeW / 2, 2), plotW - badgeW - 4);
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY} stroke={col} strokeWidth={1.2} opacity={0.8} />
                  <Polygon
                    points={`${cx - 5},${tipY} ${cx + 5},${tipY} ${cx},${tipY + 7}`}
                    fill={col} opacity={1}
                  />
                  <Rect x={lx} y={labelY} width={badgeW} height={badgeH} fill={col} rx={5} opacity={1} />
                  <Rect x={lx + 1} y={labelY + 1} width={badgeW - 2} height={badgeH - 2} fill="none"
                    stroke="#ffffff" strokeWidth={0.5} rx={4} opacity={0.4} />
                  <SvgText x={lx + badgeW / 2} y={labelY + 13} fill="#fff" fontSize={11} fontWeight="bold" textAnchor="middle">{badgeLabel}</SvgText>
                  <SvgText x={lx + badgeW / 2} y={labelY + 25} fill="#fff" fontSize={7.5} textAnchor="middle" opacity={0.9}>{confirmLabel}</SvgText>
                </G>
              );
            }
          })()}

          {/* ── Signal levels (Entry / SL / TP) ── */}
          {currentSignal && (
            <>
              {/* ENTRY — White/Yellow, solid, thick */}
              <FibLine
                label={`⬤ ENTRY ${currentSignal.trend === "Bullish" ? "BUY" : "SELL"}`}
                price={currentSignal.entryPrice}
                color="#FACC15"
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed={false}
                strokeWidth={2.5}
                labelSide="right"
              />
              {/* STOP LOSS — always Red */}
              <FibLine
                label="✕ STOP LOSS"
                price={currentSignal.stopLoss}
                color="#EF4444"
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed
                strokeWidth={2}
                labelSide="right"
              />
              {/* TAKE PROFIT — always Green */}
              <FibLine
                label="✓ TAKE PROFIT"
                price={currentSignal.takeProfit}
                color="#22C55E"
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed
                strokeWidth={2}
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
        <LegItem color="#C084FC" label="Swing" line />
        <LegItem color="#F0B429" label="61.8%" box />
        <LegItem color="#F97316" label="78.6%" box />
        <LegItem color="#22C55E" label="TP Target" />
        <LegItem color="#EF4444" label="SL Ref" />
        <LegItem color="#A78BFA" label="EMA50" line />
        <LegItem color="#F97316" label="EMA200" line />
      </View>

      {/* ── Real-time PnL Panel ── */}
      {activeSignal && currentPrice !== null && (() => {
        const pnl = calcFloatingPnL(activeSignal.trend, activeSignal.entryPrice, currentPrice);
        const isProfit = pnl >= 0;
        const isBull = activeSignal.trend === "Bullish";
        const dirColor = isBull ? C.green : C.red;
        const pnlColor = isProfit ? C.green : C.red;
        const pnlBg = isProfit ? C.green + "18" : C.red + "18";
        const priceDiff = isBull
          ? currentPrice - activeSignal.entryPrice
          : activeSignal.entryPrice - currentPrice;
        return (
          <View style={[styles.pnlPanel, { borderColor: pnlColor + "50", backgroundColor: pnlBg }]}>
            <View style={styles.pnlLeft}>
              <View style={[styles.pnlBadge, { backgroundColor: dirColor }]}>
                <Text style={styles.pnlBadgeText}>{isBull ? "▲ BUY" : "▼ SELL"}</Text>
              </View>
              <View style={styles.pnlPriceCol}>
                <Text style={styles.pnlPriceLabel}>Entry</Text>
                <Text style={[styles.pnlPriceVal, { color: dirColor }]}>{activeSignal.entryPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.pnlPriceCol}>
                <Text style={styles.pnlPriceLabel}>Now</Text>
                <Text style={styles.pnlPriceVal}>{currentPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.pnlPriceCol}>
                <Text style={styles.pnlPriceLabel}>Δ Pts</Text>
                <Text style={[styles.pnlPriceVal, { color: pnlColor }]}>
                  {priceDiff >= 0 ? "+" : ""}{priceDiff.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.pnlRight}>
              <Text style={styles.pnlLabel}>PnL · 0.01 lot</Text>
              <Text style={[styles.pnlValue, { color: pnlColor }]}>
                {isProfit ? "+" : ""}${pnl.toFixed(2)}
              </Text>
              <Text style={[styles.pnlStatus, { color: pnlColor }]}>
                {isProfit ? "● PROFIT" : "● LOSS"}
              </Text>
            </View>
          </View>
        );
      })()}

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
  pnlPanel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pnlLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  pnlBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pnlBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.4,
  },
  pnlPriceCol: {
    alignItems: "center",
  },
  pnlPriceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    color: C.textDim,
    marginBottom: 1,
  },
  pnlPriceVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: C.text,
  },
  pnlRight: {
    alignItems: "flex-end",
  },
  pnlLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    color: C.textDim,
    marginBottom: 2,
  },
  pnlValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 0.3,
  },
  pnlStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    marginTop: 1,
    letterSpacing: 0.5,
  },
});
