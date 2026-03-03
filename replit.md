# LIBARTIN — Fibonacci XAUUSD Trading Analysis App

## Project Overview
A professional mobile trading analysis app built with Expo (React Native) that performs real-time Fibonacci retracement analysis on XAUUSD (Gold/USD) using live data from Deriv WebSocket. All trading decisions are purely mathematical — no random, no visual assumptions.

## Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo Router (file-based routing)
- **State**: React Context (`TradingContext`) for all trading engine state
- **Font**: Inter (Google Fonts via @expo-google-fonts/inter)
- **Theme**: Dark navy trading terminal (#0A0E17 bg, #F0B429 gold accent)
- **Navigation**: 3-tab layout (Dashboard, Signals, Settings)

### Backend (Express)
- Port 5000
- Serves landing page + static Expo assets
- No custom API routes needed (all data comes from Deriv WebSocket directly in the app)

### Data Source
- **WebSocket**: `wss://ws.derivws.com/websockets/v3?app_id=114791`
- **Pair**: XAUUSD (frxXAUUSD)
- **Timeframe**: M5 (300 second granularity)
- **Buffer**: 200 candles
- **Auto-reconnect**: 3 second delay on disconnect

## Key Files

| File | Purpose |
|------|---------|
| `contexts/TradingContext.tsx` | Core trading engine: WebSocket, EMA, ATR, Fibonacci, signals |
| `app/(tabs)/index.tsx` | Dashboard: live price, trend, Fibonacci levels, active signal |
| `app/(tabs)/signals.tsx` | Signal history list with full signal details |
| `app/(tabs)/settings.tsx` | Balance input, risk params, strategy reference |
| `app/(tabs)/_layout.tsx` | Tab navigation (NativeTabs for iOS 26 liquid glass, Tabs fallback) |
| `constants/colors.ts` | Design token colors |

## Trading Strategy Implementation

### 1. Data: Deriv WebSocket M5 candles, 200 candle buffer, auto-reconnect
### 2. Trend Detection: EMA50 and EMA200
- Bullish: close > EMA200 AND EMA50 > EMA200
- Bearish: close < EMA200 AND EMA50 < EMA200
- Otherwise: No Trade
### 3. Swing Detection: 5-candle fractal (2 left + pivot + 2 right)
### 4. Fibonacci Calculation:
- Bullish: from Swing Low → Swing High
- Bearish: from Swing High → Swing Low
- Levels: 61.8%, 78.6%, -27% extension
### 5. Entry: Price in 61.8%–78.6% band + candle confirmation (wick > body)
### 6. Stop Loss: 78.6% ± (0.5 × ATR14)
### 7. Take Profit: -27% Fibonacci extension
### 8. Position Sizing: Lot = (1% × Balance) / SL distance
### 9. Filters: Min SL distance (spread×3), min ATR, max 1 active signal

## Signal Output Fields
- Pair, Timeframe, Trend, Entry Price, Stop Loss, Take Profit
- Risk:Reward Ratio, Lot Size, Timestamp UTC
- Fibonacci Levels (High, Low, 61.8%, 78.6%, -27%)

## Fibonacci Chart (FibChart component)

Located at `components/FibChart.tsx`. Uses `react-native-svg` to render:
- Last 50 M5 candlesticks (green/red bodies + wicks)
- EMA50 line (purple) and EMA200 line (orange)
- Dashed horizontal Fibonacci lines: Swing High (green), 61.8% (gold), 78.6% (gold), Swing Low (red), -27% extension (blue)
- Golden zone shading between 61.8% and 78.6%
- Current price label box (live, colored by direction)
- Entry (solid), SL (red dashed), TP (green dashed) lines when signal is active
- Loading overlay while waiting for candles/WebSocket
- Price legend labels on right axis
- Always visible — shows loading state when no data yet

## Auto-Install Script

`scripts/install-deps.sh` — fast dependency installer. Run: `bash scripts/install-deps.sh`

## Market Hours
- `forexMarketOpen()` in TradingContext checks UTC day/time to determine if XAUUSD is trading
- Market open: Mon 00:00 UTC → Fri 22:00 UTC; Sunday open after 22:00 UTC
- When closed: WebSocket disconnects, signal detection paused, candles reset
- When market re-opens (e.g. Sunday 22:00 UTC): auto-reconnects and rebuilds candle history
- 30-second polling interval (`marketCheckTimer`) detects open/close transitions
- Dashboard shows "Pasar Tutup — Weekend" banner with time-until-open countdown
- Connection badge shows "CLOSED" when market is closed

## Signal Candle Marker
- `TradingSignal.signalCandleEpoch` stores the epoch of the candle that triggered the signal
- FibChart draws a colored ▲ BUY or ▼ SELL flag directly on that candle (above for BUY, below for SELL)
- Flag is a filled rectangle with stem line from candle wick tip

## Persistence
- Signal history: AsyncStorage — unlimited (no cap), key: `fibo_signals_v2`
- Account balance: AsyncStorage

## Caching Strategy (Startup Performance)
- M15 candles cached in AsyncStorage (`fibo_m15_candles_v1`) — 200 candles for instant EMA/Fibonacci on boot
- M5 candles cached in AsyncStorage (`fibo_m5_candles_v1`) — for instant chart render
- On startup: cached data loads first, then WebSocket updates in background
- Loading pill badge shows "M15: X/200" when data streaming in
- Market transitions (open/close) keep cached candles visible instead of clearing

## Build APK (Android Production)
- Package name: `com.fibotrader.app`
- EAS config: `eas.json` — all profiles use `buildType: "apk"` (not AAB)
- See BUILD GUIDE section in replit.md for full commands

## Build Guide — Produksi APK

### 1. Install EAS CLI
```
npm install -g eas-cli
```

### 2. Login ke Expo Account
```
eas login
```
Masukkan username/email dan password akun expo.dev kamu.

### 3. Link project ke EAS (pertama kali saja)
```
eas init
```

### 4. Build APK Production (Upload ke cloud EAS)
```
eas build --platform android --profile production
```

### 5. Build APK Lokal (tanpa upload, butuh Android SDK)
```
eas build --platform android --profile production --local
```

### 6. Download APK
Setelah build selesai, EAS akan berikan link download APK-nya.
Atau cek di: https://expo.dev/accounts/[username]/projects/fibotrader/builds

### Notes:
- `production` profile = APK siap install langsung di HP
- Tidak perlu Google Play — APK langsung install (Enable "Install from unknown sources" di Android)
- Build cloud gratis 30 build/bulan di Expo free tier

## Workflows
- **Start Backend**: `npm run server:dev` (port 5000)
- **Start Frontend**: `npm run expo:dev` (port 8081)

## Dependencies
- expo, expo-router, expo-blur, expo-haptics, expo-glass-effect
- @tanstack/react-query, @react-native-async-storage/async-storage
- @expo-google-fonts/inter, @expo/vector-icons
- react-native-reanimated, react-native-safe-area-context
- react-native-keyboard-controller, react-native-gesture-handler
