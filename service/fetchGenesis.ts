import { Http } from 'fadroma';

// Genesis block hash cache - constant for a given network.
let genesisCache: string | null = null;

export default async function fetchGenesis (esplora: string): Promise<string> {
  const url = `${esplora}/block-height/0`;
  return genesisCache ||= await Http.fetchText(url).then(s => s.trim());
}
