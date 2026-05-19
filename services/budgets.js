import { supabase } from './supabase';

// Devuelve TODOS los budgets que el user puede ver (los suyos privados +
// los de su hogar). RLS hace el filtrado por visibilidad.
export async function getBudgets(userId, month, year, householdId = null) {
  let q = supabase
    .from('budgets')
    .select('*')
    .eq('month', month)
    .eq('year', year);

  // Privados del user
  if (householdId) {
    // user_id = userId (privados) OR household_id = householdId (compartidos)
    q = q.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
  } else {
    q = q.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Set budget — si household_id va, es shared; sino privado.
// Upsert con onConflict según scope. Los unique partials del schema garantizan
// que (user_id, cat, m, y) WHERE household_id IS NULL y
// (household_id, cat, m, y) WHERE household_id IS NOT NULL no choquen.
export async function setBudget({ userId, category, amount, month, year, householdId = null }) {
  const row = {
    user_id: userId,
    category,
    amount,
    month,
    year,
    household_id: householdId || null,
  };

  // Buscar si ya existe (no podemos upsert con onConflict dinámico)
  let existQ = supabase
    .from('budgets')
    .select('id')
    .eq('category', category)
    .eq('month', month)
    .eq('year', year);
  if (householdId) {
    existQ = existQ.eq('household_id', householdId);
  } else {
    existQ = existQ.eq('user_id', userId).is('household_id', null);
  }
  const { data: existing, error: findErr } = await existQ.maybeSingle();
  if (findErr) throw findErr;

  if (existing?.id) {
    const { data, error } = await supabase
      .from('budgets')
      .update({ amount })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}
