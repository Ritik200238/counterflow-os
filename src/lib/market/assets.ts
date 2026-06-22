import type { AssetMeta, AssetSymbol } from "@/lib/types";

// MVP tokenized-stock universe (PRD §9). Base prices are plausible 2026 levels and
// are only used to seed a *simulated* market — clearly labeled as paper/sim throughout.

export interface AssetBase extends AssetMeta {
  basePrice: number; // baseline underlying equity price
  baseVolume: number; // baseline token volume (arbitrary units)
  beta: number; // sensitivity to broad market moves
}

export const ASSETS: Record<AssetSymbol, AssetBase> = {
  NVDAx: {
    symbol: "NVDAx",
    underlying: "NVDA",
    name: "NVIDIA",
    sector: "Semiconductors / AI",
    note: "High AI narrative, high momentum, strong news sensitivity",
    basePrice: 172.4,
    baseVolume: 4_200_000,
    beta: 1.6,
  },
  TSLAx: {
    symbol: "TSLAx",
    underlying: "TSLA",
    name: "Tesla",
    sector: "EV / Auto",
    note: "Retail-heavy, volatile, crowd-prone",
    basePrice: 338.9,
    baseVolume: 3_100_000,
    beta: 1.8,
  },
  AAPLx: {
    symbol: "AAPLx",
    underlying: "AAPL",
    name: "Apple",
    sector: "Big Tech Hardware",
    note: "Large-cap benchmark, lower volatility",
    basePrice: 214.2,
    baseVolume: 2_600_000,
    beta: 1.05,
  },
  COINx: {
    symbol: "COINx",
    underlying: "COIN",
    name: "Coinbase",
    sector: "Crypto Exchange",
    note: "Crypto-equity bridge, sensitive to crypto and exchange news",
    basePrice: 252.7,
    baseVolume: 1_400_000,
    beta: 2.1,
  },
  HOODx: {
    symbol: "HOODx",
    underlying: "HOOD",
    name: "Robinhood",
    sector: "Fintech / Retail Brokerage",
    note: "Tokenization/retail trading narrative, high reflexivity",
    basePrice: 91.3,
    baseVolume: 1_900_000,
    beta: 1.9,
  },
};

export function assetMeta(symbol: AssetSymbol): AssetMeta {
  const a = ASSETS[symbol];
  return {
    symbol: a.symbol,
    underlying: a.underlying,
    name: a.name,
    sector: a.sector,
    note: a.note,
  };
}
