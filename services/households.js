import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

// Invalida todas las keys de cache de AI insight. Se llama después de cualquier
// operación que cambie el scope del usuario (crear/unirse/salir de hogar) — el
// consejo viejo no refleja el nuevo conjunto de transacciones visibles.
async function clearAIInsightCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k => k.startsWith('spendly_insight_'));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch (e) {
    if (__DEV__) console.warn('[households] clearAIInsightCache failed:', e?.message || e);
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getHousehold(userId) {
  if (!userId) return null;
  const { data, error } = await withTimeout(
    supabase
      .from('household_members')
      .select('household_id, display_name, color, joined_at, households!inner(id, name, invite_code, invite_expires_at, owner_id, created_at)')
      .eq('user_id', userId)
      .maybeSingle()
  );
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.households.id,
    name: data.households.name,
    invite_code: data.households.invite_code,
    invite_expires_at: data.households.invite_expires_at,
    owner_id: data.households.owner_id,
    created_at: data.households.created_at,
    self: {
      display_name: data.display_name,
      color: data.color,
      joined_at: data.joined_at,
    },
  };
}

export async function getHouseholdMembers(householdId) {
  if (!householdId) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('household_members')
      .select('user_id, display_name, color, joined_at')
      .eq('household_id', householdId)
      .order('joined_at', { ascending: true })
  );
  if (error) throw error;
  return data || [];
}

// ─── RPCs ─────────────────────────────────────────────────────────────────────

export async function createHousehold({ name, displayName, color }) {
  const { data, error } = await withTimeout(
    supabase.rpc('create_household', {
      p_name: name,
      p_display_name: displayName,
      p_color: color || '#16a34a',
    }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

export async function joinHousehold({ code, displayName, color }) {
  const { data, error } = await withTimeout(
    supabase.rpc('join_household', {
      p_code: code.trim().toUpperCase(),
      p_display_name: displayName,
      p_color: color || '#16a34a',
    }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

export async function rotateInviteCode() {
  const { data, error } = await withTimeout(supabase.rpc('rotate_invite_code'), 15000);
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function leaveHousehold() {
  const { data, error } = await withTimeout(supabase.rpc('leave_household'), 15000);
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

// ─── Color palette para asignar a miembros ────────────────────────────────────

export const MEMBER_COLORS = [
  '#16a34a', // green
  '#3b82f6', // blue
  '#f97316', // orange
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#e11d48', // rose
];
