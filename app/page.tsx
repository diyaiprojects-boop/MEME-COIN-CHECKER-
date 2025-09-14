"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle as DialogT,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Info,
  Rocket,
  TrendingUp,
  RefreshCcw,
  Gauge,
  Settings,
} from "lucide-react";

/** -----------------------------------------------------------------------
 *  App logic + scoring (typed + TS/Next-safe)
 * ---------------------------------------------------------------------- */

const defaultSettings = {
  birdeyeKey: "",
  heliusKey: "",
  solRpcUrl: "",
  ignoreProgramOwnedInTop10: true,
};

const weights = {
  // Flow & Liquidity
  vol24h: 0.16,
  liquidityUsd: 0.12,
  trades24h: 0.05,
  vql: 0.06,

  // Momentum & Trend
  momentum1h: 0.12,
  momentum6h: 0.10,
  momentum24h: 0.04,

  // Distribution & Safety
  mcapToLiq: 0.05,
  holders: 0.08,

  // Market Structure & Pattern signals (from candles)
  structure: 0.13,
  patterns: 0.09,
  discoveryAge: 0.10,
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function pickBestPair(pairs: any[]) {
  if (!pairs?.length) return null;
  return [...pairs].sort(
    (a, b) =>
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0) ||
      (b.volume?.h24 || 0) - (a.volume?.h24 || 0)
  )[0];
}

function scoreFromFeature(
  x: any,
  lo: number,
  hi: number,
  invert = false
): number {
  if (x == null || Number.isNaN(Number(x))) return 0;
  const v = Number(x);
  let s = 0;
  if (v <= lo) s = 0;
  else if (v >= hi) s = 1;
  else s = (v - lo) / (hi - lo);
  return invert ? 1 - s : s;
}

/* ---------------- Candles & Holders (optional APIs) ---------------- */

async function fetchBirdeyeCandles(
  address: string,
  chain: string,
  settings: any
) {
  try {
    if (!settings?.birdeyeKey) return null;
    const res = await fetch(
      `https://public-api.birdeye.so/defi/ohlcv?address=${address}&type=15m&time_from=${Math.floor(
        Date.now() / 1000 - 60 * 60 * 24 * 7
      )}&time_to=${Math.floor(Date.now() / 1000)}`,
      {
        headers: {
          "X-API-KEY": settings.birdeyeKey,
          "x-chain": chain?.toLowerCase?.() || "solana",
        },
      }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const rows = j?.data?.items || j?.data || [];
    return rows
      .map((r: any) => ({
        t: (r.startTime || r.t) * 1000,
        o: +(r.o || r.open),
        h: +(r.h || r.high),
        l: +(r.l || r.low),
        c: +(r.c || r.close),
        v: +(r.v || r.volume),
      }))
      .filter((x: any) => x.t && !Number.isNaN(x.c));
  } catch {
    return null;
  }
}

async function fetchSolHoldersTop10Pct(mint: string, settings: any) {
  try {
    const rpc =
      settings?.solRpcUrl ||
      (settings?.heliusKey
        ? `https://mainnet.helius-rpc.com/?api-key=${settings.heliusKey}`
        : "");
    if (!rpc) return null;
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenLargestAccounts",
      params: [mint, { commitment: "finalized" }],
    };
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const vals = j?.result?.value || [];
    const total = vals.reduce(
      (a: number, b: any) => a + Number(b.amount || 0),
      0
    );
    const top10 = vals
      .slice(0, 10)
      .reduce((a: number, b: any) => a + Number(b.amount || 0), 0);
    const top10Pct = total > 0 ? (top10 / total) * 100 : null;
    return { top10Pct, programOwnedInTop10: null };
  } catch {
    return null;
  }
}

/* ---------------- Chart signals (lightweight) ---------------- */

function extractChartSignals(candles: any[] | null) {
  if (!candles || candles.length < 50) return null;

  const closes = candles.map((c) => c.c);
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);

  const ema = (arr: number[], period: number) => {
    const k = 2 / (period + 1);
    let e = arr[0];
    const out = [e];
    for (let i = 1; i < arr.length; i++) {
      e = arr[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };

  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  let hh = 0,
    hl = 0;
  for (let i = candles.length - 10; i < candles.length - 1; i++) {
    if (highs[i + 1] > highs[i]) hh++;
    if (lows[i + 1] > lows[i]) hl++;
  }
  const uptrend = ema50.at(-1)! > ema200.at(-1)! && hh + hl >= 12;

  let sfpCount = 0;
  for (let i = 5; i < candles.length; i++) {
    const prevHigh = Math.max(...highs.slice(i - 5, i));
    const prevLow = Math.min(...lows.slice(i - 5, i));
    const c = candles[i];
    if (c.h > prevHigh && c.c < prevHigh) sfpCount++;
    if (c.l < prevLow && c.c > prevLow) sfpCount++;
  }

  let fvgCount = 0;
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2],
      c1 = candles[i - 1],
      c2 = candles[i];
    if (c1.l > c0.h && c2.l > c1.h) fvgCount++;
    if (c1.h < c0.l && c2.h < c1.l) fvgCount++;
  }

  const slope = (arr: number[], i: number, w = 5) => (arr[i] - arr[i - w]) / w;
  let roundBottom = false;
  for (let i = 55; i < ema50.length; i++) {
    const s1 = slope(ema50, i - 1),
      s2 = slope(ema50, i);
    if (s1 < 0 && s2 > 0) {
      roundBottom = true;
      break;
    }
  }

  return {
    uptrend,
    sfpCount,
    fvgCount,
    roundBottom,
    emaUp: ema50.at(-1)! > ema200.at(-1)!,
  };
}

/* ---------------- Scoring + plan ---------------- */

function computeScore(pair: any, holders: any, chart: any) {
  const h1 = +(pair?.priceChange?.h1 ?? 0);
  const h6 = +(pair?.priceChange?.h6 ?? 0);
  const h24 = +(pair?.priceChange?.h24 ?? 0);
  const vol24 = +(pair?.volume?.h24 ?? 0);
  const liq = +(pair?.liquidity?.usd ?? 0);
  const trades24 =
    +(pair?.txns?.h24?.buys ?? 0) + +(pair?.txns?.h24?.sells ?? 0);
  const fdv = +(pair?.fdv ?? 0) || +(pair?.marketCap ?? 0) || 0;
  const vql = liq > 0 ? vol24 / liq : 0;
  const mcapToLiq = liq > 0 ? fdv / liq : Infinity;
  const createdAt = +(pair?.pairCreatedAt ?? 0);
  const ageHours = createdAt ? (Date.now() - createdAt) / 36e5 : 24;

  const top10Pct = holders?.top10Pct ?? null;
  const holdersScore =
    top10Pct == null
      ? 0.5
      : scoreFromFeature(30 - Math.min(top10Pct, 30), 0, 30);

  const uptrend = chart?.uptrend ? 1 : 0;
  const emaUp = chart?.emaUp ? 1 : 0;
  const patternScore =
    clamp((chart?.sfpCount || 0) / 6, 0, 1) * 0.5 +
    clamp((chart?.fvgCount || 0) / 8, 0, 1) * 0.2 +
    (chart?.roundBottom ? 0.3 : 0);
  const structure = uptrend * 0.6 + emaUp * 0.4;

  const f: Record<string, number> = {
    vol24h: scoreFromFeature(Math.log10(Math.max(vol24, 1)), 3.7, 6.2),
    liquidityUsd: scoreFromFeature(Math.log10(Math.max(liq, 1)), 3.5, 6.0),
    trades24h: scoreFromFeature(Math.log10(Math.max(trades24, 1)), 1.3, 3.2),
    vql: scoreFromFeature(Math.log10(Math.max(vql, 1e-6)), -3, 1.2),
    momentum1h: scoreFromFeature(h1, -6, 10),
    momentum6h: scoreFromFeature(h6, -12, 22),
    momentum24h: scoreFromFeature(h24, -25, 40),
    mcapToLiq: scoreFromFeature(
      Math.log10(Math.max(mcapToLiq, 1)),
      1,
      3.3,
      true
    ),
    holders: holdersScore,
    structure,
    patterns: patternScore,
    discoveryAge: scoreFromFeature(ageHours, 6, 168),
  };

  const raw = Object.entries(weights).reduce(
    (acc, [k, w]) => acc + (w as number) * (f[k] ?? 0),
    0
  );
  const score = clamp(100 * (0.1 + 0.9 * Math.pow(raw as number, 0.9)), 0, 100);

  let colour = "Red";
  if (score >= 70) colour = "Green";
  else if (score >= 50) colour = "Yellow";

  return {
    features: { h1, h6, h24, vol24, liq, trades24, fdv, vql, mcapToLiq, ageHours, top10Pct },
    featureScores: f,
    score,
    colour,
    chart,
  };
}

function baseBestEntryFDV(features: any) {
  const { liq, h1, h6, vql, ageHours } = features;
  const L = Math.max(liq, 1);
  let target = 10 * L;
  if (L < 50_000) target = 8 * L;
  if (L > 400_000) target = 12 * L;

  let lo = 120_000,
    hi = 1_200_000;
  if (L < 50_000) {
    lo = 120_000;
    hi = 250_000;
  } else if (L < 150_000) {
    lo = 150_000;
    hi = 350_000;
  } else if (L < 400_000) {
    lo = 250_000;
    hi = 600_000;
  }
  target = clamp(target, lo, hi);

  if (h6 > 15) target *= 1.25;
  if (h1 < -3 && (vql || 0) > 1) target *= 0.9;
  if ((vql || 0) > 5) target *= 1.15;
  if (ageHours < 3) target *= 0.85;
  if (ageHours > 24 && ageHours < 120) target *= 1.1;

  return target;
}

function decideTrafficLight(currentFDV: number, bestFDV: number, features: any) {
  const { h6, vql, liq } = features;
  const ratio = currentFDV / Math.max(bestFDV, 1);

  let light = "Red";
  if (ratio <= 1.05 && (vql || 0) >= 2 && h6 > -8 && h6 < 12) light = "Green";
  else if (ratio <= 1.35 && ((vql || 0) >= 1 || h6 <= 12)) light = "Yellow";

  let rev = "Low";
  if (h6 > 30 || (vql || 0) < 1 || liq < 30_000) rev = "High";
  else if (h6 > 18 || (vql || 0) < 1.5 || liq < 60_000) rev = "Medium";

  const gapPct = (ratio - 1) * 100;
  return { light, ratio, gapPct, reversion: rev };
}

function chooseExitPercent(score: number, features: any, chart: any) {
  const { vql, fdv, h6 } = features;
  let pct: number;

  if (score < 50) pct = 15;
  else if (score < 70) pct = 40;
  else if (score < 85) pct = 120;
  else if (score < 95) pct = 280;
  else pct = 400;

  const flowCap = clamp(50 * Math.max(vql || 0, 0.2), 10, 500);
  pct = Math.min(pct, flowCap);
  if (fdv > 5_000_000) pct *= 0.7;
  if (h6 > 30) pct *= 0.6;

  if (chart) {
    if (!chart.uptrend && !chart.roundBottom) pct = Math.max(10, pct * 0.7);
    if (chart.sfpCount < 2 && chart.fvgCount < 2) pct = Math.max(10, pct * 0.85);
  }
  return clamp(pct, 10, 500);
}

function priceFromFDV(
  currentPrice: number | null,
  currentFDV: number | null,
  targetFDV: number | null
) {
  if (!currentPrice || !currentFDV || !targetFDV) return null;
  return currentPrice * (targetFDV / currentFDV);
}

function buildEntryExit(pair: any, scorePack: any) {
  const { features, score, chart } = scorePack;
  const currentPrice = pair.priceUsd ? Number(pair.priceUsd) : null;
  const currentFDV = features.fdv || null;

  const bestEntryFDV = baseBestEntryFDV(features);
  const tl = decideTrafficLight(currentFDV!, bestEntryFDV, features);

  const entryMid = priceFromFDV(currentPrice, currentFDV, bestEntryFDV);
  const entryBand = entryMid ? { lo: entryMid * 0.97, hi: entryMid * 1.03 } : null;

  let exitPct = chooseExitPercent(score, features, chart);
  const exitFDV = currentFDV ? currentFDV * (1 + exitPct / 100) : null;
  const exitPrice = priceFromFDV(currentPrice, currentFDV, exitFDV);

  return { bestEntryFDV, entryBand, traffic: tl, exitPct, exitFDV, exitPrice };
}

/** -----------------------------------------------------------------------
 *  Page component
 * ---------------------------------------------------------------------- */

export default function Page() {
  const [ca, setCa] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pair, setPair] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null); // ✅ fixed (single "=")
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(defaultSettings);

  const reset = () => {
    setPair(null);
    setResult(null);
    setPlan(null);
    setError("");
  };

  async function handleCheck() {
    setLoading(true);
    setError("");
    setResult(null);
    setPlan(null);

    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(
        ca.trim()
      )}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
      const json = await res.json();
      const best = pickBestPair(json?.pairs);
      if (!best) throw new Error("No markets found for this contract address.");

      // Optional: candles & holders
      let chart: any = null,
        holders: any = null;
      try {
        chart = await fetchBirdeyeCandles(
          best?.baseToken?.address || ca.trim(),
          best?.chainId,
          settings
        ).then(extractChartSignals);
      } catch {}
      try {
        if ((best?.chainId || "").toLowerCase() === "solana") {
          holders = await fetchSolHoldersTop10Pct(
            best?.baseToken?.address || ca.trim(),
            settings
          );
        }
      } catch {}

      setPair(best);
      const scored = computeScore(best, holders, chart);
      setResult(scored);
      const pe = buildEntryExit(best, scored);
      setPlan(pe);
      setCheckedAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const pairInfo = useMemo(() => {
    if (!pair) return null;
    const base = pair.baseToken?.symbol || "Token";
    const dex = pair.dexId || "-";
    const chain = pair.chainId || "-";
    const priceUsd = pair.priceUsd ? Number(pair.priceUsd) : null;
    return { base, dex, chain, priceUsd };
  }, [pair]);

  const badgeColor = useMemo(() => {
    if (!result) return "bg-gray-200 text-gray-700";
    if (result.colour === "Green") return "bg-green-100 text-green-800";
    if (result.colour === "Yellow") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }, [result]);

  const trafficPill = useMemo(() => {
    if (!plan) return "bg-gray-200 text-gray-700";
    if (plan.traffic.light === "Green") return "bg-green-100 text-green-800";
    if (plan.traffic.light === "Yellow") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }, [plan]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <div className="max-w-3xl mx-auto p-6">
        <header className="flex items-center gap-3 mb-6">
          <Rocket className="w-8 h-8" />
          <h1 className="text-2xl font-bold">
            Meme Coin Likelihood & Entry/Exit Planner
          </h1>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="ml-auto inline-flex items-center gap-2" variant="ghost">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogT>APIs & Options</DialogT>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Birdeye API Key</Label>
                  <Input
                    value={settings.birdeyeKey}
                    onChange={(e) =>
                      setSettings((s: any) => ({
                        ...s,
                        birdeyeKey: e.target.value,
                      }))
                    }
                    placeholder="optional"
                  />
                </div>
                <div>
                  <Label>Helius API Key</Label>
                  <Input
                    value={settings.heliusKey}
                    onChange={(e) =>
                      setSettings((s: any) => ({
                        ...s,
                        heliusKey: e.target.value,
                      }))
                    }
                    placeholder="optional"
                  />
                </div>
                <div>
                  <Label>Solana RPC URL</Label>
                  <Input
                    value={settings.solRpcUrl}
                    onChange={(e) =>
                      setSettings((s: any) => ({
                        ...s,
                        solRpcUrl: e.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="ignoreProgramOwned"
                    type="checkbox"
                    checked={settings.ignoreProgramOwnedInTop10}
                    onChange={(e) =>
                      setSettings((s: any) => ({
                        ...s,
                        ignoreProgramOwnedInTop10: e.target.checked,
                      }))
                    }
                  />
                  <Label htmlFor="ignoreProgramOwned">
                    Ignore program-owned wallets in Top 10
                  </Label>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Paste Contract Address</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="e.g. So1111... (SOL) or 0x... (EVM)"
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCheck();
              }}
            />
            <Button onClick={handleCheck} disabled={!ca || loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Checking...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Check
                </span>
              )}
            </Button>
            {result && <Button onClick={reset} variant="secondary">Reset</Button>}
          </CardContent>
        </Card>

        {error && (
          <Alert className="mb-4">
            <AlertTitle>Cannot evaluate this token</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pair && result && plan && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex flex-col gap-1">
                <span className="text-lg">
                  {pairInfo?.base} on {pairInfo?.dex} ({pairInfo?.chain})
                </span>
                <span className="text-sm text-gray-500">
                  Price:{" "}
                  {pairInfo?.priceUsd ? `$${fmt.format(pairInfo.priceUsd)}` : "-"}
                </span>
              </CardTitle>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`text-sm px-3 py-1 rounded-full ${badgeColor}`}
                >
                  {result.colour} (Score {fmt0.format(result.score)}/100)
                </span>
                <span
                  className={`text-xs px-3 py-1 rounded-full ${trafficPill}`}
                >
                  Signal: {plan.traffic.light}{" "}
                  {plan.traffic.gapPct > 0
                    ? `(over by ${fmt.format(plan.traffic.gapPct)}%)`
                    : ""}
                </span>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border bg-white shadow-sm">
                  <div className="text-xs text-gray-500">Best Entry (FDV)</div>
                  <div className="text-lg font-semibold">
                    ${fmt0.format(plan.bestEntryFDV)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Entry Price Band:{" "}
                    {plan.entryBand && plan.entryBand.lo && plan.entryBand.hi
                      ? `$${fmt.format(plan.entryBand.lo)} – $${fmt.format(
                          plan.entryBand.hi
                        )}`
                      : "-"}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Reversion Likelihood: {plan.traffic.reversion}
                  </div>
                </div>

                <div className="p-4 rounded-2xl border bg-white shadow-sm">
                  <div className="text-xs text-gray-500">Target Exit</div>
                  <div className="text-lg font-semibold">
                    +{fmt0.format(plan.exitPct)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    Exit FDV ≈ ${fmt0.format(plan.exitFDV || 0)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Exit Price ≈{" "}
                    {plan.exitPrice ? `$${fmt.format(plan.exitPrice)}` : "-"}
                  </div>
                </div>
              </div>

              <GaugeBar score={result.score} />

              <div className="text-sm text-gray-700 space-y-1">
                <div className="inline-flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span className="font-medium">Why this plan</span>
                </div>
                <ul className="list-disc ml-5">
                  <li>
                    Flow/Liquidity: ${fmt0.format(result.features.vol24)} vol / $
                    {fmt0.format(result.features.liq)} liq (v/liq{" "}
                    {fmt.format(result.features.vql || 0)})
                  </li>
                  <li>
                    Momentum: 1h {fmt.format(result.features.h1)}%, 6h{" "}
                    {fmt.format(result.features.h6)}%, 24h{" "}
                    {fmt.format(result.features.h24)}%
                  </li>
                  <li>
                    Size & risk: FDV ${fmt0.format(result.features.fdv || 0)},
                    mcap/liq{" "}
                    {result.features.mcapToLiq === Infinity
                      ? "∞"
                      : fmt.format(result.features.mcapToLiq)}
                  </li>
                  <li>Age: {fmt.format(result.features.ageHours)}h</li>
                  {result.features.top10Pct != null && (
                    <li>Top-10 holders: {fmt.format(result.features.top10Pct)}%</li>
                  )}
                  {result.chart && (
                    <li>
                      Chart: {result.chart.uptrend ? "uptrend" : "no clear trend"}
                      , SFPs {result.chart.sfpCount || 0}, FVGs{" "}
                      {result.chart.fvgCount || 0},{" "}
                      {result.chart.roundBottom ? "round-bottom" : "no round-bottom"}
                    </li>
                  )}
                </ul>
              </div>

              <div className="text-xs text-gray-500 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5" />
                <p>
                  Provide Birdeye/Helius keys in Settings for candles/holders.
                  Without keys, the app uses DexScreener-only proxies.
                </p>
              </div>

              {checkedAt && (
                <p className="text-xs text-gray-400">
                  Checked at: {new Date(checkedAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------- Small gauge component ---------------- */

function GaugeBar({ score }: { score: number }) {
  const pct = clamp(score || 0, 0, 100);
  return (
    <div className="p-4 rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          <span className="font-semibold">Score (0–100)</span>
        </div>
        <span className="text-sm text-gray-500">{Math.round(pct)}</span>
      </div>
      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
