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

const CHART_HEIGHT = 320;
const RIGHT_W = 58;
const TOP_PAD = 14;
const BOT_PAD = 14;
const VISIBLE_CANDLES = 40;

type TF = "M5" | "M15";

function priceToY(p: number, lo: number, hi: number, plotH: number): number {
  if (hi === lo) return plotH / 2;
  return TOP_PAD + ((hi - p) / (hi - lo)) * plotH;
}

function dashes(x1: number, y: number, x2: number, dash = 5, gap = 3): string {
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

interface LabeledLineProps {
  label: string;
  sublabel?: string;
  price: number;
  color: string;
  lo: number;
  hi: number;
  plotH: number;
  plotW: number;
  dashed?: boolean;
  strokeWidth?: number;
  showArrow?: "up" | "down";
  labelOffset?: number;
}
function LabeledLine({
  label,
  sublabel,
  price,
  color,
  lo,
  hi,
  plotH,
  plotW,
  dashed = true,
  strokeWidth = 1,
  showArrow,
  labelOffset = 0,
}: LabeledLineProps) {
  const y = priceToY(price, lo, hi, plotH);
  if (y < TOP_PAD - 4 || y > TOP_PAD + plotH + 4) return null;
  const ly = y + labelOffset;
  return (
    <G>
      {dashed ? (
        <Path d={dashes(0, y, plotW - 1)} stroke={color} strokeWidth={strokeWidth} opacity={0.75} />
      ) : (
        <Line x1={0} y1={y} x2={plotW - 1} y2={y} stroke={color} strokeWidth={strokeWidth} opacity={0.9} />
      )}
      {showArrow === "up" && (
        <Polygon
          points={`${plotW - 16},${y + 6} ${plotW - 10},${y - 2} ${plotW - 4},${y + 6}`}
          fill={color} opacity={0.95}
        />
      )}
      {showArrow === "down" && (
        <Polygon
          points={`${plotW - 16},${y - 6} ${plotW - 10},${y + 2} ${plotW - 4},${y - 6}`}
          fill={color} opacity={0.95}
        />
      )}
      <Rect x={2} y={ly - 9} width={sublabel ? 82 : 72} height={sublabel ? 20 : 12} fill="#0A0E17" opacity={0.72} rx={3} />
      <SvgText x={5} y={ly} fill={color} fontSize={8.5} fontWeight="bold">{label}</SvgText>
      {sublabel && (
        <SvgText x={5} y={ly + 9} fill={color} fontSize={7} opacity={0.75}>{sublabel}</SvgText>
      )}
      <SvgText x={plotW + 2} y={y + 4} fill={color} fontSize={8} fontWeight="bold">
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

  const visibleCandles = useMemo(() => {
    const src = selectedTF === "M15" ? m15Candles : candles;
    return src.length === 0 ? [] : src.slice(-VISIBLE_CANDLES);
  }, [selectedTF, candles, m15Candles]);

  const ema50FromM15 = useMemo(() => {
    if (m15Candles.length < 50) return [];
    return calcEMAFull(m15Candles.map((c) => c.close), 50);
  }, [m15Candles]);

  const ema200FromM15 = useMemo(() => {
    if (m15Candles.length < 200) return [];
    return calcEMAFull(m15Candles.map((c) => c.close), 200);
  }, [m15Candles]);

  const ema50Series = useMemo(() => {
    if (selectedTF === "M15") return ema50FromM15.slice(-VISIBLE_CANDLES);
    if (candles.length < 50) return [];
    return calcEMAFull(candles.map((c) => c.close), 50).slice(-VISIBLE_CANDLES);
  }, [selectedTF, ema50FromM15, candles]);

  const ema200Series = useMemo(() => {
    if (selectedTF === "M15") return ema200FromM15.slice(-VISIBLE_CANDLES);
    return [];
  }, [selectedTF, ema200FromM15]);

  const m15Ema50Val = useMemo(() => {
    if (ema50FromM15.length === 0) return null;
    return ema50FromM15[ema50FromM15.length - 1];
  }, [ema50FromM15]);

  const m15Ema200Val = useMemo(() => {
    if (ema200FromM15.length === 0) return null;
    return ema200FromM15[ema200FromM15.length - 1];
  }, [ema200FromM15]);

  const { lo, hi } = useMemo(() => {
    let loV = visibleCandles.length > 0 ? Math.min(...visibleCandles.map((c) => c.low)) : 3200;
    let hiV = visibleCandles.length > 0 ? Math.max(...visibleCandles.map((c) => c.high)) : 3300;
    if (fibLevels) {
      loV = Math.min(loV, fibLevels.swingLow, fibLevels.extensionNeg27);
      hiV = Math.max(hiV, fibLevels.swingHigh);
    }
    if (currentSignal) {
      loV = Math.min(loV, currentSignal.stopLoss, currentSignal.takeProfit);
      hiV = Math.max(hiV, currentSignal.stopLoss, currentSignal.takeProfit);
    }
    if (selectedTF === "M5" && m15Ema50Val) {
      loV = Math.min(loV, m15Ema50Val);
      hiV = Math.max(hiV, m15Ema50Val);
    }
    if (selectedTF === "M5" && m15Ema200Val) {
      loV = Math.min(loV, m15Ema200Val);
      hiV = Math.max(hiV, m15Ema200Val);
    }
    const pad = (hiV - loV) * 0.10;
    return { lo: loV - pad, hi: hiV + pad };
  }, [visibleCandles, fibLevels, currentSignal, selectedTF, m15Ema50Val, m15Ema200Val]);

  const plotW = chartW - RIGHT_W;
  const plotH = CHART_HEIGHT - TOP_PAD - BOT_PAD;
  const candleW = visibleCandles.length > 0 ? plotW / visibleCandles.length : 8;
  const bodyW = Math.max(1, candleW - 1.5);

  function emaPath(series: number[], totalCandles: number): string {
    let d = "";
    let started = false;
    const step = plotW / totalCandles;
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

  const zoneY1 = fibLevels ? Math.min(priceToY(fibLevels.level618, lo, hi, plotH), priceToY(fibLevels.level786, lo, hi, plotH)) : null;
  const zoneY2 = fibLevels ? Math.max(priceToY(fibLevels.level618, lo, hi, plotH), priceToY(fibLevels.level786, lo, hi, plotH)) : null;

  const trendLabel =
    trend === "Bullish" ? "▲ BULLISH" :
    trend === "Bearish" ? "▼ BEARISH" :
    trend === "Loading" ? `LOADING ${m15Candles.length}/300` : "NO TREND";
  const trendColor =
    trend === "Bullish" ? C.green :
    trend === "Bearish" ? C.red : C.textDim;

  const hasNoData = candles.length === 0 && m15Candles.length === 0;

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>XAUUSD  ·  ANALISIS FIBONACCI</Text>
        </View>
        <Text style={[styles.trendLabel, { color: trendColor }]}>{trendLabel}</Text>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.tfRow}>
        {(["M5", "M15"] as TF[]).map((tf) => (
          <TouchableOpacity
            key={tf}
            style={[styles.tfBtn, selectedTF === tf && styles.tfBtnActive]}
            onPress={() => setSelectedTF(tf)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tfBtnText, selectedTF === tf && styles.tfBtnTextActive]}>
              {tf}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.tfSubtitle}>
          {selectedTF === "M15"
            ? `${m15Candles.length} candle · Zona Fibonacci`
            : `${candles.length} candle · Entry Presisi`}
        </Text>
      </View>

      {chartW > 0 && (
        <Svg width={chartW} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="zoneGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.gold} stopOpacity={0.18} />
              <Stop offset="1" stopColor={C.gold} stopOpacity={0.04} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((pct, i) => {
            const price = lo + (hi - lo) * (1 - pct);
            const y = priceToY(price, lo, hi, plotH);
            return (
              <Line key={i} x1={0} y1={y} x2={plotW} y2={y}
                stroke={C.border} strokeWidth={1} opacity={0.25} />
            );
          })}

          {/* Fibonacci zone gold shading */}
          {fibLevels && zoneY1 !== null && zoneY2 !== null && (
            <G>
              <Rect x={0} y={zoneY1} width={plotW} height={Math.max(2, zoneY2 - zoneY1)} fill="url(#zoneGrad)" />
              {(zoneY2 - zoneY1) > 14 && (
                <G>
                  <Rect x={plotW / 2 - 45} y={(zoneY1 + zoneY2) / 2 - 8} width={90} height={14} fill="#0A0E17" opacity={0.65} rx={4} />
                  <SvgText x={plotW / 2} y={(zoneY1 + zoneY2) / 2 + 4} fill={C.gold} fontSize={8.5} fontWeight="bold" textAnchor="middle">
                    ZONA ENTRY (61.8–78.6%)
                  </SvgText>
                </G>
              )}
            </G>
          )}

          {/* EMA lines (M15 chart — calculated from M15 candles) */}
          {selectedTF === "M15" && ema200Series.length > 0 && (
            <Path d={emaPath(ema200Series, ema200Series.length)} stroke="#F97316" strokeWidth={1.5} fill="none" opacity={0.85} />
          )}
          {selectedTF === "M15" && ema50Series.length > 0 && (
            <Path d={emaPath(ema50Series, ema50Series.length)} stroke="#A78BFA" strokeWidth={1.5} fill="none" opacity={0.85} />
          )}

          {/* EMA lines (M5 chart — drawn as horizontal M15 EMA reference lines) */}
          {selectedTF === "M5" && m15Ema200Val !== null && (
            <LabeledLine
              label="M15 EMA200"
              sublabel={m15Ema200Val.toFixed(1)}
              price={m15Ema200Val}
              color="#F97316"
              lo={lo} hi={hi} plotH={plotH} plotW={plotW}
              dashed strokeWidth={1.5}
            />
          )}
          {selectedTF === "M5" && m15Ema50Val !== null && (
            <LabeledLine
              label="M15 EMA50"
              sublabel={m15Ema50Val.toFixed(1)}
              price={m15Ema50Val}
              color="#A78BFA"
              lo={lo} hi={hi} plotH={plotH} plotW={plotW}
              dashed strokeWidth={1.5}
            />
          )}
          {selectedTF === "M5" && ema50Series.length > 0 && (
            <Path d={emaPath(ema50Series, ema50Series.length)} stroke="#A78BFA" strokeWidth={1} fill="none" opacity={0.5} strokeDasharray="4,2" />
          )}

          {/* Candlesticks */}
          {visibleCandles.map((c, i) => {
            const isBull = c.close >= c.open;
            const col = isBull ? C.green : C.red;
            const cx = i * candleW + candleW / 2;
            const bTop = priceToY(Math.max(c.open, c.close), lo, hi, plotH);
            const bBot = priceToY(Math.min(c.open, c.close), lo, hi, plotH);
            const wTop = priceToY(c.high, lo, hi, plotH);
            const wBot = priceToY(c.low, lo, hi, plotH);
            const bh = Math.max(1, bBot - bTop);
            return (
              <G key={c.epoch}>
                <Line x1={cx} y1={wTop} x2={cx} y2={wBot} stroke={col} strokeWidth={1} opacity={0.75} />
                <Rect x={cx - bodyW / 2} y={bTop} width={bodyW} height={bh} fill={col} opacity={0.9} />
              </G>
            );
          })}

          {/* BUY/SELL signal flag */}
          {currentSignal && (() => {
            const idx = visibleCandles.findIndex((c) => c.epoch === currentSignal.signalCandleEpoch);
            if (idx < 0) return null;
            const isBull = currentSignal.trend === "Bullish";
            const col = isBull ? C.green : C.red;
            const cx = idx * candleW + candleW / 2;
            const candle = visibleCandles[idx];
            const flagLabel = isBull ? "▲ BUY" : "▼ SELL";
            const flagW = 36;
            const flagH = 16;
            if (isBull) {
              const tipY = priceToY(candle.high, lo, hi, plotH) - 4;
              const labelY = tipY - flagH - 4;
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY + flagH} stroke={col} strokeWidth={1} opacity={0.7} />
                  <Rect x={cx - flagW / 2} y={labelY} width={flagW} height={flagH} fill={col} rx={4} opacity={0.92} />
                  <SvgText x={cx} y={labelY + flagH - 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="middle">{flagLabel}</SvgText>
                </G>
              );
            } else {
              const tipY = priceToY(candle.low, lo, hi, plotH) + 4;
              const labelY = tipY + 4;
              return (
                <G>
                  <Line x1={cx} y1={tipY} x2={cx} y2={labelY} stroke={col} strokeWidth={1} opacity={0.7} />
                  <Rect x={cx - flagW / 2} y={labelY} width={flagW} height={flagH} fill={col} rx={4} opacity={0.92} />
                  <SvgText x={cx} y={labelY + flagH - 4} fill="#fff" fontSize={9} fontWeight="bold" textAnchor="middle">{flagLabel}</SvgText>
                </G>
              );
            }
          })()}

          {/* Fibonacci lines */}
          {fibLevels && (
            <>
              <LabeledLine
                label="▲ SWING HIGH"
                sublabel={`${fibLevels.swingHigh.toFixed(2)}`}
                price={fibLevels.swingHigh}
                color={C.green}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed={false} strokeWidth={1.5} showArrow="up"
              />
              <LabeledLine
                label="61.8% ZONA ATAS"
                price={fibLevels.level618}
                color={C.gold}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed strokeWidth={1}
              />
              <LabeledLine
                label="78.6% ZONA BAWAH"
                price={fibLevels.level786}
                color={C.gold}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed strokeWidth={1}
              />
              <LabeledLine
                label="▼ SWING LOW"
                sublabel={`${fibLevels.swingLow.toFixed(2)}`}
                price={fibLevels.swingLow}
                color={C.red}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed={false} strokeWidth={1.5} showArrow="down"
              />
              <LabeledLine
                label="★ TARGET -27%"
                sublabel="Take Profit Fibonacci"
                price={fibLevels.extensionNeg27}
                color={C.blue}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed strokeWidth={1.5}
              />
            </>
          )}

          {/* Signal lines */}
          {currentSignal && (
            <>
              <LabeledLine
                label={`✦ ENTRY ${currentSignal.trend === "Bullish" ? "BUY" : "SELL"}`}
                sublabel={`${currentSignal.entryPrice.toFixed(2)}`}
                price={currentSignal.entryPrice}
                color={currentSignal.trend === "Bullish" ? C.green : C.red}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed={false} strokeWidth={2}
              />
              <LabeledLine
                label="✕ STOP LOSS"
                sublabel={`${currentSignal.stopLoss.toFixed(2)}`}
                price={currentSignal.stopLoss}
                color={C.red}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed strokeWidth={1.5}
              />
              <LabeledLine
                label="✓ TAKE PROFIT"
                sublabel={`${currentSignal.takeProfit.toFixed(2)}`}
                price={currentSignal.takeProfit}
                color={C.green}
                lo={lo} hi={hi} plotH={plotH} plotW={plotW}
                dashed strokeWidth={1.5}
              />
            </>
          )}

          {/* Current price badge */}
          {currentPrice !== null && (() => {
            const y = priceToY(currentPrice, lo, hi, plotH);
            const lastC = visibleCandles[visibleCandles.length - 1];
            const isBull = !lastC || currentPrice >= lastC.open;
            const lc = isBull ? C.green : C.red;
            return (
              <G>
                <Line x1={0} y1={y} x2={plotW} y2={y} stroke={lc} strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
                <Polygon points={`${plotW},${y - 5} ${plotW + 6},${y} ${plotW},${y + 5}`} fill={lc} />
                <Rect x={plotW + 6} y={y - 8} width={RIGHT_W - 8} height={16} fill={lc} rx={3} />
                <SvgText x={plotW + 9} y={y + 4} fill="#fff" fontSize={8.5} fontWeight="bold">
                  {currentPrice.toFixed(2)}
                </SvgText>
              </G>
            );
          })()}
        </Svg>
      )}

      {/* Bottom legend */}
      <View style={styles.legend}>
        <LegItem color={C.green} label="Swing H ▲" />
        <LegItem color={C.red} label="Swing L ▼" />
        <LegItem color={C.gold} label="Zona Entry" box />
        <LegItem color={C.blue} label="-27% Target" />
        <LegItem color="#A78BFA" label="EMA50" line />
        <LegItem color="#F97316" label="EMA200" line />
        {currentSignal && <LegItem color={C.red} label="Stop Loss" />}
        {currentSignal && <LegItem color={C.green} label="Take Profit" />}
      </View>

      {/* No data overlay */}
      {hasNoData && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>Menghubungkan ke Deriv WebSocket...</Text>
          <Text style={[styles.overlayText, { fontSize: 10, marginTop: 4, opacity: 0.7 }]}>
            Memuat data candle historis...
          </Text>
        </View>
      )}
    </View>
  );
}

function LegItem({ color, label, line = false, box = false }: {
  color: string; label: string; line?: boolean; box?: boolean;
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
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headerLeft: { flex: 1 },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: C.textDim,
    letterSpacing: 1.2,
  },
  trendLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tfRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tfBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    fontSize: 12,
    color: C.textDim,
  },
  tfBtnTextActive: {
    color: C.gold,
  },
  tfSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: C.textDim,
    marginLeft: 4,
    flex: 1,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
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
    left: 0, right: 0, bottom: 32,
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
