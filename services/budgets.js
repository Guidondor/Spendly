import { supabase } from './supabase';

export async function getBudgets(userId, month, year) {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year);
  if (error) throw error;
  return data ?? [];
}

export async function setBudget(userId, category, amount, month, year) {
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      [{ user_id: userId, category, amount, month, year }],
      { onConflict: 'user_id,category,month,year' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}
