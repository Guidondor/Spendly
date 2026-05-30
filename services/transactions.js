import { supabase } from './supabase';
import { withTimeout } from './withTimeout';
import { invalidateUserTxCache } from './txCache';

// Hard cap por mes: usuarios reales rara vez superan 200-300 tx/mes; el cap
// previene OOM si alguien acumula data anómala (script, import, bug).
const MAX_TX_PER_MONTH = 1000;
const MAX_TX_PER_YEAR = 5000;

export async function getTransactions(userId, year, month, householdId = null) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${mm}-01`;
  const endDate   = `${year}-${mm}-${lastDay}`;

  let q = supabase
    .from('transactions')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_TX_PER_MONTH);

  if (householdId) {
    // Privadas del user + compartidas del hogar
    q = q.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
  } else {
    // Solo privadas del user
    q = q.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data ?? [];
}

export async function addTransaction({ userId, amount, description, type, category, date, recurring_id, household_id }) {
  const row = { user_id: userId, amount, description, type, category, date };
  if (recurring_id) row.recurring_id = recurring_id;
  if (household_id) row.household_id = household_id;
  const { data, error } = await withTimeout(
    supabase
      .from('transactions')
      .insert([row])
      .select()
      .single()
  );

  if (error) throw error;
  invalidateUserTxCache(userId);
  return data;
}

export async function deleteTransaction(id, userId = null) {
  const { error } = await withTimeout(
    supabase
      .from('transactions')
      .delete()
      .eq('id', id)
  );

  if (error) throw error;
  if (userId) invalidateUserTxCache(userId);
}

export async function updateTransaction(id, { amount, description, type, category, date, household_id, userId = null }) {
  const patch = { amount, description, type, category };
  if (date) patch.date = date;
  if (household_id !== undefined) patch.household_id = household_id;
  const { data, error } = await withTimeout(
    supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
  );

  if (error) throw error;
  if (userId) invalidateUserTxCache(userId);
  return data;
}

export async function getTransactionsByYear(userId, year, householdId = null) {
  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;

  let q = supabase
    .from('transactions')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(MAX_TX_PER_YEAR);

  if (householdId) {
    q = q.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
  } else {
    q = q.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data ?? [];
}
