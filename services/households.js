import { supabase } from './supabase';
import { withTimeout } from './withTimeout';
import { clearAIInsightCache } from './aiInsightCache';

// ─── Queries ──────────────────────────────────────────────────────────────────

// Multi-grupo: devuelve TODOS los grupos del user (array), ordenados por antigüedad
// de membresía. Reemplaza al viejo getHousehold (que usaba .maybeSingle() y
// explotaba con 2+ membresías).
export async function getHouseholds(userId) {
  if (!userId) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('household_members')
      .select('household_id, display_name, color, joined_at, households!inner(id, name, invite_code, invite_expires_at, owner_id, created_at)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
  );
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.households.id,
    name: row.households.name,
    invite_code: row.households.invite_code,
    invite_expires_at: row.households.invite_expires_at,
    owner_id: row.households.owner_id,
    created_at: row.households.created_at,
    self: {
      display_name: row.display_name,
      color: row.color,
      joined_at: row.joined_at,
    },
  }));
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

export async function rotateInviteCode(householdId) {
  const { data, error } = await withTimeout(
    supabase.rpc('rotate_invite_code', { p_household_id: householdId }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function leaveHousehold(householdId) {
  const { data, error } = await withTimeout(
    supabase.rpc('leave_household', { p_household_id: householdId }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

// Solo dueño. Elimina a otro miembro del grupo (no permite auto-removerse).
export async function removeHouseholdMember(householdId, targetUserId) {
  const { data, error } = await withTimeout(
    supabase.rpc('remove_household_member', { p_household_id: householdId, p_target_user_id: targetUserId }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

// Solo dueño. Borra el grupo entero. Los registros con household_id quedan
// privados gracias a ON DELETE SET NULL.
export async function deleteHousehold(householdId) {
  const { data, error } = await withTimeout(
    supabase.rpc('delete_household', { p_household_id: householdId }),
    15000
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  await clearAIInsightCache();
  return data;
}

// ─── Settle-up: cálculo cliente (no requiere RPC) ──────────────────────────────

// Dado el conjunto de transacciones del mes y los miembros del grupo, devuelve
// el estado del settle-up con `state` siempre presente:
//   'no_members'  → grupo con 1 solo miembro (todavía no aplica equilibrar)
//   'no_expenses' → 2+ miembros pero sin gastos compartidos
//   'even'        → 2+ miembros con gastos parejos (no hace falta transferir)
//   'unbalanced'  → 2+ miembros con desequilibrio (transfers tiene datos)
//
// Algoritmo greedy: el creditor con más a cobrar recibe del debtor con más
// a pagar, iterativamente, hasta dejar todos los balances en 0.
export function computeSettlement(transactions, members, householdId) {
  if (!householdId || !Array.isArray(members) || members.length === 0) return null;
  if (members.length < 2) {
    return { state: 'no_members', total: 0, fairShare: 0, balances: [], transfers: [] };
  }

  const sharedExp = transactions.filter(
    tx => tx.type === 'expense' && tx.household_id === householdId
  );
  const totalSpent = sharedExp.reduce((s, tx) => s + Number(tx.amount), 0);
  if (totalSpent === 0) {
    return { state: 'no_expenses', total: 0, fairShare: 0, balances: [], transfers: [] };
  }

  const fairShare = totalSpent / members.length;
  const balances = members.map(m => {
    const spent = sharedExp
      .filter(tx => tx.user_id === m.user_id)
      .reduce((s, tx) => s + Number(tx.amount), 0);
    return { member: m, spent, balance: spent - fairShare };
  });

  const creditors = balances
    .filter(b => b.balance > 0.01)
    .map(b => ({ ...b, remaining: b.balance }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = balances
    .filter(b => b.balance < -0.01)
    .map(b => ({ ...b, remaining: -b.balance }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].remaining, creditors[j].remaining);
    transfers.push({ from: debtors[i].member, to: creditors[j].member, amount });
    debtors[i].remaining -= amount;
    creditors[j].remaining -= amount;
    if (debtors[i].remaining < 0.01) i++;
    if (creditors[j].remaining < 0.01) j++;
  }

  if (transfers.length === 0) {
    return { state: 'even', total: totalSpent, fairShare, balances, transfers: [] };
  }
  return { state: 'unbalanced', total: totalSpent, fairShare, balances, transfers };
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
