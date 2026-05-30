// Cache in-memory para getTransactions por mes — TTL 5 min.
// Usado por ChartsScreen MonthlyBars (6 fetches paralelos en cada focus).
// Invalidación amplia: cualquier mutación de tx invalida todo el cache del user.

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function makeKey(userId, year, month, householdId) {
  return `${userId}|${year}-${month}|${householdId ?? 'null'}`;
}

export function getCachedMonth(userId, year, month, householdId) {
  const key = makeKey(userId, year, month, householdId);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export function setCachedMonth(userId, year, month, householdId, data) {
  const key = makeKey(userId, year, month, householdId);
  cache.set(key, { data, timestamp: Date.now() });
}

// Invalida todas las entries de un user (cualquier scope/mes). Llamar tras
// addTransaction / deleteTransaction / updateTransaction.
export function invalidateUserTxCache(userId) {
  if (!userId) return;
  const prefix = `${userId}|`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
