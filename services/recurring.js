import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

// Throttle: la lógica de "aplicar recurrentes pendientes este mes" no necesita
// correr en cada focus de la app — basta con 1x cada 24h. El índice único
// `uniq_recurring_per_month` previene duplicados, así que el throttle solo
// ahorra latencia/red, no impone correctness.
const APPLY_RECURRING_TTL_MS = 24 * 60 * 60 * 1000;

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

// Multi-grupo: una sola pasada por usuario que aplica TODAS las reglas visibles
// — privadas + de TODOS los grupos a los que pertenece (no solo el activo). La RLS
// de recurring_transactions ya devuelve private + shared de todos sus grupos, así
// que basta con traer todas las activas sin filtrar por household. Cada tx generada
// tiene user_id = caller y mantiene el household_id de la regla. El índice único
// uniq_recurring_per_month previene duplicados si otro miembro ya ejecutó.
export async function applyRecurring(userId) {
  // Throttle: una clave por user (no por scope). Si ya corrimos en las últimas
  // 24h, saltar. El índice único garantiza correctness aunque se saltee.
  const lastKey = `spendly_recurring_last_${userId}`;
  try {
    const last = await AsyncStorage.getItem(lastKey);
    if (last && Date.now() - Number(last) < APPLY_RECURRING_TTL_MS) {
      return [];
    }
  } catch {}

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();

  // Todas las recurring activas visibles (privadas + de todos los grupos vía RLS).
  const { data: recurring, error: recErr } = await withTimeout(
    supabase
      .from('recurring_transactions')
      .select('*')
      .eq('active', true)
      .order('day_of_month', { ascending: true })
  );
  if (recErr) throw recErr;
  if (!recurring || recurring.length === 0) {
    try { await AsyncStorage.setItem(lastKey, String(Date.now())); } catch {}
    return [];
  }

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

  // Marcar como aplicado solo si el loop terminó (incluso si individualmente
  // hubo errores). Sin esto, errores transitorios harían reintentar en cada focus.
  try { await AsyncStorage.setItem(lastKey, String(Date.now())); } catch {}

  return created;
}
