import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

// Devuelve recurring privados + del hogar (RLS filtra por visibilidad).
export async function getRecurring(userId, householdId = null) {
  let q = supabase
    .from('recurring_transactions')
    .select('*')
    .eq('active', true)
    .order('day_of_month', { ascending: true });

  if (householdId) {
    q = q.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
  } else {
    q = q.eq('user_id', userId).is('household_id', null);
  }

  const { data, error } = await withTimeout(q);
  if (error) throw error;
  return data || [];
}

export async function addRecurring({ userId, amount, description, category, type, day_of_month, householdId = null }) {
  if (day_of_month < 1 || day_of_month > 28) throw new Error('day_of_month must be between 1 and 28');
  const row = {
    user_id: userId,
    amount,
    description,
    category,
    type,
    day_of_month,
    household_id: householdId || null,
  };
  const { data, error } = await withTimeout(
    supabase
      .from('recurring_transactions')
      .insert(row)
      .select()
      .single()
  );
  if (error) throw error;
  return data;
}

export async function deleteRecurring(id) {
  const { error } = await withTimeout(
    supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
  );
  if (error) throw error;
}

// Corre las recurring del user (privadas) Y las del hogar al que pertenece.
// Si el caller es miembro de un hogar, también ejecuta las reglas con household_id.
// Cada tx generada tiene user_id = caller (autor = quien gatilla), y mantiene el
// household_id si corresponde. El índice único uniq_recurring_per_month previene
// duplicados cuando otro miembro ya ejecutó.
export async function applyRecurring(userId, householdId = null) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();

  const recurring = await getRecurring(userId, householdId);
  if (recurring.length === 0) return [];

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const created = [];

  for (const rec of recurring) {
    if (today < rec.day_of_month) continue;

    try {
      const { data: existing } = await withTimeout(
        supabase
          .from('transactions')
          .select('id')
          .eq('recurring_id', rec.id)
          .gte('date', monthStart)
          .lt('date', monthEnd)
          .limit(1)
      );

      if (existing && existing.length > 0) continue;

      const date = `${year}-${String(month).padStart(2, '0')}-${String(rec.day_of_month).padStart(2, '0')}`;
      const insertRow = {
        user_id: userId,
        amount: rec.amount,
        description: rec.description,
        category: rec.category,
        type: rec.type,
        date,
        recurring_id: rec.id,
      };
      if (rec.household_id) insertRow.household_id = rec.household_id;

      const { data: newTx, error } = await withTimeout(
        supabase
          .from('transactions')
          .insert(insertRow)
          .select()
          .single()
      );

      if (newTx) {
        created.push(newTx);
      } else if (error) {
        // Postgres 23505 = unique_violation (otro miembro del hogar ya creó esta
        // tx para el mes). Es esperado y se ignora. Cualquier otro error se
        // loguea para no perder señales de RLS/red/schema.
        if (error.code !== '23505') {
          console.warn('[applyRecurring] insert failed for rec', rec.id, error);
        }
      }
    } catch (e) {
      // Timeout o error de red — no abortar el resto del loop.
      console.warn('[applyRecurring] iteration failed for rec', rec.id, e?.message || e);
    }
  }

  return created;
}
