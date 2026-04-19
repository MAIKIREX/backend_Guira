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

// ═══════════════════════════════════════════════════════════════════
//  CATÁLOGO FIAT_BO OFF-RAMP (bridge_wallet_to_fiat_bo)
//  Subconjunto de BRIDGE_RAMP_OFF_ROUTES filtrado a destinos PSAV
//  posibles (USDC, USDT en Solana).
//
//  Estructura: { [source_currency]: { [psav_network]: { [psav_currency]: min_amount } } }
//
//  Reglas aplicadas:
//  - EURC excluido (Etapa 1 — requiere validación EUR→BOB)
//  - Solo destinos que correspondan a divisas PSAV configurables
//  - Derivado de lista_bridge_out.md
// ═══════════════════════════════════════════════════════════════════

/** Tokens de origen excluidos para bridge_wallet_to_fiat_bo (Etapa 1) */
export const FIAT_BO_EXCLUDED_SOURCE_CURRENCIES = ['eurc'] as const;

/**
 * Rutas off-ramp válidas para bridge_wallet_to_fiat_bo.
 * Solo incluye destinos que pueden existir como PSAV crypto (USDC, USDT).
 * { [source_currency]: { [psav_network]: { [psav_currency]: min_amount } } }
 */
export const FIAT_BO_OFF_RAMP_ROUTES: Record<
  string,
  Record<string, Record<string, number>>
> = {
  usdc:  { solana: { usdc: 1 } },
  usdt:  { solana: { usdc: 2 } },
  usdb:  { solana: { usdt: 20 } },
  pyusd: { solana: { usdc: 1, usdt: 20 } },
};

/** Tokens de origen válidos para fiat_bo off-ramp */
export const FIAT_BO_OFF_RAMP_SOURCE_CURRENCIES = Object.keys(
  FIAT_BO_OFF_RAMP_ROUTES,
);

/**
 * Verifica si un token de origen tiene al menos una ruta válida
 * hacia algún PSAV en una red dada.
 */
export function isFiatBoOffRampSourceValid(
  sourceCurrency: string,
  psavNetwork: string,
  psavCurrency: string,
): boolean {
  return (
    (FIAT_BO_OFF_RAMP_ROUTES[sourceCurrency.toLowerCase()]?.[
      psavNetwork.toLowerCase()
    ]?.[psavCurrency.toLowerCase()] ?? 0) > 0
  );
}

/** Monto mínimo para una ruta fiat_bo off-ramp */
export function getFiatBoOffRampMinAmount(
  sourceCurrency: string,
  psavNetwork: string,
  psavCurrency: string,
): number {
  return (
    FIAT_BO_OFF_RAMP_ROUTES[sourceCurrency.toLowerCase()]?.[
      psavNetwork.toLowerCase()
    ]?.[psavCurrency.toLowerCase()] ?? 0
  );
}

/**
 * Dado un token de origen y una lista de cuentas PSAV activas,
 * resuelve la mejor cuenta PSAV para la transferencia.
 *
 * Prioridad:
 *  1. Same-currency (source == psav.currency) — evita cross-currency swap
 *  2. Menor monto mínimo — menor fricción para el usuario
 *
 * @returns { psavAccount, destCurrency, minAmount } o null si no hay ruta
 */
export function resolveFiatBoPsavMatch<
  T extends { currency: string; crypto_network: string },
>(
  sourceCurrency: string,
  psavAccounts: T[],
): { psavAccount: T; destCurrency: string; minAmount: number } | null {
  const srcLower = sourceCurrency.toLowerCase();
  const routes = FIAT_BO_OFF_RAMP_ROUTES[srcLower];
  if (!routes) return null;

  type Candidate = { psav: T; destCurrency: string; minAmount: number; isSameCurrency: boolean };
  const candidates: Candidate[] = [];

  for (const psav of psavAccounts) {
    const psavNetwork = (psav.crypto_network ?? '').toLowerCase();
    const psavCurrency = psav.currency.toLowerCase();
    const minAmount = routes[psavNetwork]?.[psavCurrency] ?? 0;
    if (minAmount > 0) {
      candidates.push({
        psav,
        destCurrency: psav.currency,
        minAmount,
        isSameCurrency: srcLower === psavCurrency,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: same-currency first, then by lowest minAmount
  candidates.sort((a, b) => {
    if (a.isSameCurrency !== b.isSameCurrency) return a.isSameCurrency ? -1 : 1;
    return a.minAmount - b.minAmount;
  });

  const best = candidates[0];
  return {
    psavAccount: best.psav,
    destCurrency: best.destCurrency,
    minAmount: best.minAmount,
  };
}
