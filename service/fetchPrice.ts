import { Http } from 'fadroma';

// Price cache - shared across requests, refreshed every PRICE_TTL_MS.
let priceCache: { price: number; fetchedAt: number } | null = null;

const PRICE_TTL_MS = 5_000;

export default async function fetchPrice(): Promise<number> {
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_TTL_MS) {
    return priceCache.price;
  }
  try {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';
    const { price } = await Http.fetchJson(url);
    priceCache = { price: parseFloat(price), fetchedAt: Date.now() };
  } catch {
    // Fallback to CoinGecko
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
    const { data } = await Http.fetchJson(url);
    priceCache = { price: data.bitcoin.usd, fetchedAt: Date.now() };
  }
  return priceCache!.price;
}
