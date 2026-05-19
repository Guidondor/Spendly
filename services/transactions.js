import { supabase } from './supabase';

export async function getTransactions(userId, year, month) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${mm}-01`;
  const endDate   = `${year}-${mm}-${lastDay}`;

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addTransaction({ userId, amount, description, type, category, date, recurring_id }) {
  const row = { user_id: userId, amount, description, type, category, date };
  if (recurring_id) row.recurring_id = recurring_id;
  const { data, error } = await supabase
    .from('transactions')
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateTransaction(id, { amount, description, type, category, date }) {
  const patch = { amount, description, type, category };
  if (date) patch.date = date;
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTransactionsByYear(userId, year) {
  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
