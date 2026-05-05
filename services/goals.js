import { supabase } from './supabase';

export async function getGoals(userId) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addGoal({ userId, name, icon, color, target }) {
  const { data, error } = await supabase
    .from('goals')
    .insert([{ user_id: userId, name, icon, color, target, saved: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoalSaved(id, saved) {
  const { data, error } = await supabase
    .from('goals')
    .update({ saved })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
