// ═══════════════════════════════════════════════════════════════════
//  CATÁLOGO DE RUTAS SOPORTADAS POR BRIDGE — ETAPA 1
//  Fuente: lista.md (documentación Bridge, filtrada a destino Solana)
//
//  Estructura: { [red_origen]: { [moneda_origen]: { destinations, min } } }
//
//  Reglas aplicadas:
//  - Solo destino Solana (wallet custodial actual)
//  - Solo tokens destino en ALLOWED_CRYPTO_CURRENCIES
//  - Solo tokens origen en ALLOWED_CRYPTO_CURRENCIES
//  - EURC excluido de fiat_bo_to_bridge_wallet (requiere tasa BOB_EUR)
//
//  El frontend tiene su réplica en:
//  m-guira/features/payments/lib/bridge-route-catalog.ts
// ═══════════════════════════════════════════════════════════════════

export interface BridgeRouteEntry {
  destinations: string[];
  min: number;
}

/**
 * Catálogo de rutas soportadas para on-ramp crypto_to_bridge_wallet.
 * Cada key es una red de origen; sub-keys son monedas de origen.
 */
export const BRIDGE_RAMP_ON_ROUTES: Record<
  string,
  Record<string, BridgeRouteEntry>
> = {
  ethereum: {
    usdc: { destinations: ['usdc', 'usdb', 'pyusd', 'eurc'], min: 1 },
    usdt: { destinations: ['usdc', 'usdt', 'usdb'], min: 2 },
    eurc: { destinations: ['usdc', 'usdb', 'eurc'], min: 1 },
    pyusd: { destinations: ['usdc', 'pyusd'], min: 1 },
  },
  solana: {
    usdc: { destinations: ['usdc', 'usdb', 'pyusd', 'eurc'], min: 1 },
    usdt: { destinations: ['usdc', 'usdb'], min: 2 },
    usdb: { destinations: ['pyusd', 'usdt'], min: 1 },
    eurc: { destinations: ['usdc', 'usdb', 'eurc'], min: 1 },
    pyusd: { destinations: ['usdc', 'usdt'], min: 1 },
  },
  tron: {
    usdt: { destinations: ['usdc', 'usdt', 'usdb', 'pyusd'], min: 5 },
  },
  polygon: {
    usdc: {
      destinations: ['usdc', 'usdt', 'usdb', 'pyusd', 'eurc'],
      min: 1,
    },
  },
  stellar: {
    usdc: {
      destinations: ['usdc', 'usdt', 'usdb', 'pyusd', 'eurc'],
      min: 1,
    },
  },
};

/**
 * Tokens destino permitidos para fiat_bo_to_bridge_wallet (Etapa 1).
 * EURC excluido porque requiere tasa BOB_EUR no disponible.
 */
export const FIAT_BO_ALLOWED_DESTINATION_CURRENCIES = [
  'usdc',
  'usdt',
  'usdb',
  'pyusd',
] as const;

/** Dado una red, retorna las monedas de origen válidas */
export function getSourceCurrencies(network: string): string[] {
  return Object.keys(BRIDGE_RAMP_ON_ROUTES[network] ?? {});
}

/** Dado una red + moneda origen, retorna las monedas destino válidas */
export function getDestinationCurrencies(
  network: string,
  sourceCurrency: string,
): string[] {
  return (
    BRIDGE_RAMP_ON_ROUTES[network]?.[sourceCurrency.toLowerCase()]
      ?.destinations ?? []
  );
}

/** Dado una red + moneda origen, retorna el mínimo de transacción */
export function getMinAmount(
  network: string,
  sourceCurrency: string,
): number {
  return (
    BRIDGE_RAMP_ON_ROUTES[network]?.[sourceCurrency.toLowerCase()]?.min ?? 1
  );
}

/** Valida si una combinación red/origen/destino es soportada por Bridge */
export function isValidBridgeRampRoute(
  sourceNetwork: string,
  sourceCurrency: string,
  destinationCurrency: string,
): boolean {
  const route =
    BRIDGE_RAMP_ON_ROUTES[sourceNetwork]?.[sourceCurrency.toLowerCase()];
  if (!route) return false;
  return route.destinations.includes(destinationCurrency.toLowerCase());
}

/** Valida si un token es válido como destino para fiat_bo_to_bridge_wallet */
export function isValidFiatBoDestination(currency: string): boolean {
  return (
    FIAT_BO_ALLOWED_DESTINATION_CURRENCIES as readonly string[]
  ).includes(currency.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════
//  CATÁLOGO DE RUTAS OFF-RAMP (bridge_wallet_to_crypto)
//  Fuente: lista_bridge_out.md (filtrada a tokens soportados)
//
//  Estructura: { [source_currency]: { [dest_network]: { [dest_currency]: min_amount } } }
//
//  Reglas aplicadas:
//  - Source rail siempre Solana (wallet custodial)
//  - DAI y USDG excluidos (no en ALLOWED_CRYPTO_CURRENCIES)
//  - Red Base excluida (sin rutas soportadas desde Solana)
//
//  El frontend tiene su réplica en:
//  m-guira/features/payments/lib/bridge-route-catalog.ts
// ═══════════════════════════════════════════════════════════════════

/**
 * Catálogo de rutas soportadas para off-ramp bridge_wallet_to_crypto.
 * { [source_currency]: { [dest_network]: { [dest_currency]: min_amount } } }
 */
export const BRIDGE_RAMP_OFF_ROUTES: Record<
  string,
  Record<string, Record<string, number>>
> = {
  usdc: {
    ethereum: { pyusd: 1, usdc: 1, usdt: 20 },
    solana: { eurc: 1, pyusd: 1, usdb: 1, usdc: 1 },
    tron: { usdt: 2 },
    polygon: { usdc: 1 },
    stellar: { usdc: 1 },
  },
  usdt: {
    ethereum: { pyusd: 2, usdc: 2 },
    solana: { usdb: 2, usdc: 2 },
    tron: { usdt: 5 },
    polygon: { usdc: 2 },
    stellar: { usdc: 2 },
  },
  usdb: {
    ethereum: { usdc: 1, usdt: 20 },
    solana: { pyusd: 1, usdt: 20 },
    tron: { usdt: 5 },
    polygon: { usdc: 1 },
    stellar: { usdc: 1 },
  },
  pyusd: {
    ethereum: { pyusd: 1 },
    solana: { usdc: 1, usdt: 20 },
    polygon: { usdc: 1 },
    stellar: { usdc: 1 },
  },
  eurc: {
    ethereum: { eurc: 1, usdc: 1 },
    solana: { eurc: 1, usdb: 1, usdc: 1 },
    polygon: { usdc: 1 },
    stellar: { usdc: 1 },
  },
};

/** Valida si una combinación off-ramp es soportada por Bridge */
export function isValidOffRampRoute(
  sourceCurrency: string,
  destNetwork: string,
  destCurrency: string,
): boolean {
  return (
    (BRIDGE_RAMP_OFF_ROUTES[sourceCurrency.toLowerCase()]?.[
      destNetwork.toLowerCase()
    ]?.[destCurrency.toLowerCase()] ?? 0) > 0
  );
}

/** Monto mínimo para una ruta off-ramp completa */
export function getOffRampMinAmount(
  sourceCurrency: string,
  destNetwork: string,
  destCurrency: string,
): number {
  return (
    BRIDGE_RAMP_OFF_ROUTES[sourceCurrency.toLowerCase()]?.[
      destNetwork.toLowerCase()
    ]?.[destCurrency.toLowerCase()] ?? 0
  );
}
