// ═══════════════════════════════════════════════════════════════════
//  CATÁLOGO DE RUTAS TRANSFER WALLET-TO-WALLET — ETAPA 1
//  Fuente: lista_de_rieles_filtrada.md (Bridge API Transfer)
//
//  Estructura de consulta:
//  Dado un (dest_network, dest_currency) → lista de sources válidos
//  con su monto mínimo de transacción.
//
//  Notas:
//  - Todas las redes en lowercase para normalización.
//  - Monedas en lowercase para normalización.
//  - Base excluido: no aparece en la tabla de rieles soportados.
//
//  El frontend tiene su réplica en:
//  m-guira/features/payments/lib/transfer-route-catalog.ts
// ═══════════════════════════════════════════════════════════════════

export interface TransferSourceRoute {
  source_network: string;
  source_currency: string;
  min: number;
}

/**
 * Catálogo de rutas soportadas para wallet_to_wallet (Bridge Transfer API).
 * Indexado por { dest_network }->{ dest_currency }->[ sources ].
 *
 * Transcripción completa de lista_de_rieles_filtrada.md.
 */
export const TRANSFER_ROUTE_CATALOG: Record<
  string, // dest_network
  Record<
    string, // dest_currency
    TransferSourceRoute[]
  >
> = {
  // ─── Destino: Ethereum ───────────────────────────────────────────
  ethereum: {
    eurc: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'usdb', min: 1 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 2 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'polygon', source_currency: 'usdc', min: 2 },
      { source_network: 'stellar', source_currency: 'usdc', min: 2 },
    ],
    usdc: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'pyusd', min: 1 },
      { source_network: 'solana', source_currency: 'usdb', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'solana', source_currency: 'usdt', min: 2 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
    pyusd: [
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'solana', source_currency: 'usdt', min: 2 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
    usdt: [
      { source_network: 'solana', source_currency: 'usdb', min: 20 },
      { source_network: 'solana', source_currency: 'usdc', min: 20 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 20 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 20 },
      { source_network: 'tron', source_currency: 'usdt', min: 20 },
      { source_network: 'polygon', source_currency: 'usdc', min: 20 },
      { source_network: 'stellar', source_currency: 'usdc', min: 20 },
    ],
  },

  // ─── Destino: Solana ─────────────────────────────────────────────
  solana: {
    eurc: [
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 2 },
      { source_network: 'polygon', source_currency: 'usdc', min: 2 },
      { source_network: 'stellar', source_currency: 'usdc', min: 2 },
    ],
    pyusd: [
      { source_network: 'solana', source_currency: 'usdb', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
    usdb: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
    usdc: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'pyusd', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'solana', source_currency: 'usdt', min: 2 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
    usdt: [
      { source_network: 'solana', source_currency: 'pyusd', min: 20 },
      { source_network: 'solana', source_currency: 'usdb', min: 20 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 20 },
      { source_network: 'tron', source_currency: 'usdt', min: 20 },
      { source_network: 'polygon', source_currency: 'usdc', min: 20 },
      { source_network: 'stellar', source_currency: 'usdc', min: 20 },
    ],
  },

  // ─── Destino: Tron ───────────────────────────────────────────────
  tron: {
    usdt: [
      { source_network: 'solana', source_currency: 'usdb', min: 5 },
      { source_network: 'solana', source_currency: 'usdc', min: 2 },
      { source_network: 'solana', source_currency: 'usdt', min: 5 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 5 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 5 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 5 },
      { source_network: 'stellar', source_currency: 'usdc', min: 5 },
    ],
  },

  // ─── Destino: Polygon ────────────────────────────────────────────
  polygon: {
    usdc: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'pyusd', min: 1 },
      { source_network: 'solana', source_currency: 'usdb', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'solana', source_currency: 'usdt', min: 2 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
  },

  // ─── Destino: Stellar ────────────────────────────────────────────
  stellar: {
    usdc: [
      { source_network: 'solana', source_currency: 'eurc', min: 1 },
      { source_network: 'solana', source_currency: 'pyusd', min: 1 },
      { source_network: 'solana', source_currency: 'usdb', min: 1 },
      { source_network: 'solana', source_currency: 'usdc', min: 1 },
      { source_network: 'solana', source_currency: 'usdt', min: 2 },
      { source_network: 'ethereum', source_currency: 'eurc', min: 1 },
      { source_network: 'ethereum', source_currency: 'pyusd', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdc', min: 1 },
      { source_network: 'ethereum', source_currency: 'usdt', min: 2 },
      { source_network: 'tron', source_currency: 'usdt', min: 5 },
      { source_network: 'polygon', source_currency: 'usdc', min: 1 },
      { source_network: 'stellar', source_currency: 'usdc', min: 1 },
    ],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Dado un destino (red + moneda), retorna las fuentes válidas con sus mínimos.
 * Retorna array vacío si el destino no tiene rutas soportadas.
 */
export function getValidSourceRoutes(
  destNetwork: string,
  destCurrency: string,
): TransferSourceRoute[] {
  return (
    TRANSFER_ROUTE_CATALOG[destNetwork.toLowerCase()]?.[
      destCurrency.toLowerCase()
    ] ?? []
  );
}

/**
 * Valida si una combinación completa (src_net, src_cur, dst_net, dst_cur)
 * es soportada por Bridge Transfer API.
 */
export function isValidTransferRoute(
  srcNetwork: string,
  srcCurrency: string,
  dstNetwork: string,
  dstCurrency: string,
): boolean {
  const sources = getValidSourceRoutes(dstNetwork, dstCurrency);
  return sources.some(
    (s) =>
      s.source_network === srcNetwork.toLowerCase() &&
      s.source_currency === srcCurrency.toLowerCase(),
  );
}

/**
 * Retorna el monto mínimo para una ruta transfer dada.
 * Retorna 0 si la ruta no existe.
 */
export function getTransferMinAmount(
  srcNetwork: string,
  srcCurrency: string,
  dstNetwork: string,
  dstCurrency: string,
): number {
  const sources = getValidSourceRoutes(dstNetwork, dstCurrency);
  const route = sources.find(
    (s) =>
      s.source_network === srcNetwork.toLowerCase() &&
      s.source_currency === srcCurrency.toLowerCase(),
  );
  return route?.min ?? 0;
}

/**
 * Retorna las redes de origen únicas disponibles dado un destino.
 */
export function getAvailableSourceNetworks(
  dstNetwork: string,
  dstCurrency: string,
): string[] {
  const sources = getValidSourceRoutes(dstNetwork, dstCurrency);
  return [...new Set(sources.map((s) => s.source_network))];
}

/**
 * Dado un destino y una red de origen, retorna las monedas de origen válidas.
 */
export function getAvailableSourceCurrencies(
  dstNetwork: string,
  dstCurrency: string,
  srcNetwork: string,
): string[] {
  const sources = getValidSourceRoutes(dstNetwork, dstCurrency);
  return sources
    .filter((s) => s.source_network === srcNetwork.toLowerCase())
    .map((s) => s.source_currency);
}
