import { supabase } from './supabase';

export async function getRecurring(userId) {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('day_of_month', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addRecurring({ userId, amount, description, category, type, day_of_month }) {
  if (day_of_month < 1 || day_of_month > 28) throw new Error('day_of_month must be between 1 and 28');
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({ user_id: userId, amount, description, category, type, day_of_month })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecurring(id) {
  const { error } = await supabase
    .from('recurring_transactions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function applyRecurring(userId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();

  const recurring = await getRecurring(userId);
  if (recurring.length === 0) return [];

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const created = [];

  for (const rec of recurring) {
    if (today < rec.day_of_month) continue;

    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('recurring_id', rec.id)
      .gte('date', monthStart)
      .lt('date', monthEnd)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const date = `${year}-${String(month).padStart(2, '0')}-${String(rec.day_of_month).padStart(2, '0')}`;
    const { data: newTx, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: rec.amount,
        description: rec.description,
        category: rec.category,
        type: rec.type,
        date,
        recurring_id: rec.id,
      })
      .select()
      .single();

    if (!error && newTx) created.push(newTx);
  }

  return created;
}
