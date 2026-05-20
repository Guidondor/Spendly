-- ============================================================
-- Spendly — Migración 2026-05-20
-- Rebrand hogar→grupo + admin del grupo
-- ============================================================
--
-- Cambios:
-- 1. Columna `created_by` en `budgets` y `goals` (para mostrar "Definido por X"
--    en cards compartidas).
-- 2. RPC `remove_household_member(p_target_user_id)` — solo dueño, no permite
--    auto-removerse.
-- 3. RPC `delete_household()` — solo dueño. Borra el grupo entero; los
--    registros con household_id quedan privados gracias a ON DELETE SET NULL.
--
-- Aplicar en: Supabase Dashboard → SQL Editor → New query → Run.

-- ============================================================
-- 1. created_by en budgets y goals
-- ============================================================

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: para los registros existentes asumir created_by = user_id.
-- Esto es semánticamente correcto: el user_id de un budget/goal es siempre
-- el dueño del registro a nivel RLS, y para registros pre-feature es también
-- el autor original.
UPDATE budgets SET created_by = user_id WHERE created_by IS NULL;
UPDATE goals   SET created_by = user_id WHERE created_by IS NULL;

-- ============================================================
-- 2. RPC: remove_household_member (solo dueño, no self)
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_household_member(p_target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  hh_id UUID;
  is_caller_owner BOOLEAN;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  IF caller = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'cant_remove_self');
  END IF;

  SELECT hm.household_id, (h.owner_id = caller)
    INTO hh_id, is_caller_owner
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = caller;

  IF hh_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_household');
  END IF;
  IF NOT is_caller_owner THEN
    RETURN jsonb_build_object('error', 'not_owner');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = hh_id AND user_id = p_target_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  -- Remove membership. Las txs/budgets/goals/recurring quedan en el grupo;
  -- el miembro removido deja de verlas por RLS.
  DELETE FROM public.household_members
  WHERE household_id = hh_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_household_member(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_household_member(UUID) TO authenticated;

-- ============================================================
-- 3. RPC: delete_household (solo dueño, borra el grupo entero)
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_household()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  hh_id UUID;
  is_caller_owner BOOLEAN;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT hm.household_id, (h.owner_id = caller)
    INTO hh_id, is_caller_owner
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = caller;

  IF hh_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_household');
  END IF;
  IF NOT is_caller_owner THEN
    RETURN jsonb_build_object('error', 'not_owner');
  END IF;

  -- Cascade: borrar el household dispara ON DELETE SET NULL en
  -- transactions.household_id, budgets.household_id, goals.household_id,
  -- recurring_transactions.household_id. Los registros quedan privados
  -- del user_id que los creó. household_members tiene ON DELETE CASCADE
  -- así que las membresías se borran automáticamente.
  DELETE FROM public.households WHERE id = hh_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_household() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_household() TO authenticated;
