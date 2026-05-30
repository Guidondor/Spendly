import AsyncStorage from '@react-native-async-storage/async-storage';

// Prefix compartido con HomeScreen.AI_INSIGHT_CACHE_PREFIX.
// Si se cambia uno, sincronizar el otro.
export const AI_INSIGHT_CACHE_PREFIX = 'spendly_insight_v2_';

// Invalida todas las keys de cache de AI insight. Se llama:
//  - tras crear/unirse/salir/eliminar/cambiar grupo (cambia el scope visible)
//  - tras logout/delete account (limpieza cross-user)
// AsyncStorage.getAllKeys() es O(n) pero con ~10-50 keys reales es <50ms.
export async function clearAIInsightCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k => k.startsWith(AI_INSIGHT_CACHE_PREFIX));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch (e) {
    if (__DEV__) console.warn('[aiInsightCache] clear failed:', e?.message || e);
  }
}
