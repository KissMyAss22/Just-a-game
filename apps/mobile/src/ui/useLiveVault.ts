import { accrueIncome, type AccrualResult } from '@game/shared';
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/useGame';

/**
 * De kluis loopt tussen twee serververzoeken door gewoon vol. In plaats van
 * elke seconde de server te bevragen, voorspelt de app het met exact dezelfde
 * formule als de server. Bij de volgende /state komt de echte waarde binnen —
 * de client raadt, de server beslist.
 *
 * Er wordt gerekend met servertijd (Date.now() + clockOffset), zodat de klok
 * van de telefoon niets uitmaakt.
 */
export function useLiveVault(): AccrualResult | null {
  const state = useGame((s) => s.state);
  const clockOffset = useGame((s) => s.clockOffset);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!state) return null;
    return accrueIncome({
      ratePerHour: state.vault.ratePerHour,
      accruedAt: state.vault.accruedAt,
      now: tick + clockOffset,
      offlineCapHours: state.stats.offlineCapHours,
      vaultBalance: state.vault.balance,
      vaultCapacity: state.vault.capacity,
    });
  }, [state, tick, clockOffset]);
}
