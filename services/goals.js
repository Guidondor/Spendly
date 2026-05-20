import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

// Devuelve metas privadas + del hogar (RLS filtra por visibilidad).
export async function getGoals(userId, householdId = null) {
  let q = supabase
    .from('goals')
    .select('*')
    .order('created_at', { ascending: false });

  if (householdId) {
    q = q.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
  } else {
    q = q.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data ?? [];
}

export async function addGoal({ userId, name, icon, color, target, householdId = null }) {
  const row = {
    user_id: userId,
    name,
    icon,
    color,
    target,
    saved: 0,
    household_id: householdId || null,
  };
  const { data, error } = await withTimeout(
    supabase
      .from('goals')
      .insert([row])
      .select()
      .single()
  );
  if (error) throw error;
  return data;
}

export async function updateGoalSaved(id, saved) {
  const { data, error } = await withTimeout(
    supabase
      .from('goals')
      .update({ saved })
      .eq('id', id)
      .select()
      .single()
  );
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  const { error } = await withTimeout(
    supabase.from('goals').delete().eq('id', id)
  );
  if (error) throw error;
}
