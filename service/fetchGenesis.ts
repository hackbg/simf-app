import { Http } from 'fadroma';

// Genesis block hash cache - constant for a given network.
let genesisCache: string | null = null;

export default async function fetchGenesis(esplora: string): Promise<string> {
  if (!genesisCache) {
    genesisCache = await Http.fetchText(`${esplora}/block-height/0`).then(s => s.trim());
  }
  return genesisCache;
}
