-- ============================================================
-- Spendly — Schema snapshot reproducible
-- ============================================================
--
-- Refleja el state real de la DB live (`gvycerdibwxxpaybwebd`) al 20/05/2026,
-- inventariado vía MCP Supabase. Si la DB se pierde, copiar/pegar este
-- archivo en Supabase Dashboard → SQL Editor → New query y ejecutar.
-- Idempotente: aplicar 2 veces no rompe nada.
--
-- Las migrations incrementales futuras viven en `supabase/migrations/`.
-- Cuando se aplique una migration, también hay que actualizar este archivo
-- para que siga reflejando el state real.
--
-- Orden de aplicación:
--   1. Extensions
--   2. Tablas (en orden de dependencia)
--   3. Índices
--   4. Helper function `is_household_member`
--   5. RLS habilitado + policies
--   6. RPCs SECURITY DEFINER
--   7. REVOKE/GRANT en RPCs
-- ============================================================


-- ============================================================
-- 1. Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
  -- gen_random_uuid() + gen_random_bytes() (códigos de invitación)


-- ============================================================
-- 2. Tablas
-- ============================================================

-- 2.1 households (un grupo compartido — 1 dueño + N miembros)
CREATE TABLE IF NOT EXISTS public.households (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 60),
  invite_code        TEXT NOT NULL,
  invite_expires_at  TIMESTAMPTZ NOT NULL,
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 household_members (membresía: composite PK + unique en user_id → 1 hogar por user)
CREATE TABLE IF NOT EXISTS public.household_members (
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL CHECK (length(display_name) >= 1 AND length(display_name) <= 30),
  color         TEXT NOT NULL DEFAULT '#16a34a',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

-- 2.3 recurring_transactions (reglas mensuales — privadas o de hogar)
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        NUMERIC(12, 2) NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'expense',
  day_of_month  INTEGER NOT NULL DEFAULT 1
                  CHECK (day_of_month >= 1 AND day_of_month <= 28),
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  household_id  UUID REFERENCES public.households(id) ON DELETE SET NULL
);

-- 2.4 transactions (gastos e ingresos — privadas o de hogar)
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description   TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category      TEXT NOT NULL DEFAULT 'other',
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  recurring_id  UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
  household_id  UUID REFERENCES public.households(id) ON DELETE SET NULL
);

-- 2.5 budgets (límites mensuales — privados o de hogar)
CREATE TABLE IF NOT EXISTS public.budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,
  month         INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year          INTEGER NOT NULL,
  household_id  UUID REFERENCES public.households(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.6 goals (metas de ahorro — privadas o de hogar)
CREATE TABLE IF NOT EXISTS public.goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icon          TEXT DEFAULT '🎯',
  color         TEXT DEFAULT '#16a34a',
  target        NUMERIC(12, 2) NOT NULL,
  saved         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  household_id  UUID REFERENCES public.households(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);


-- ============================================================
-- 3. Índices
-- ============================================================

-- households
CREATE UNIQUE INDEX IF NOT EXISTS households_invite_code_uniq
  ON public.households (invite_code);

-- household_members: un usuario puede pertenecer a UN solo hogar (V1)
CREATE UNIQUE INDEX IF NOT EXISTS household_members_user_unique
  ON public.household_members (user_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_household_date
  ON public.transactions (household_id, date DESC)
  WHERE household_id IS NOT NULL;

-- Una sola tx generada por una regla recurrente por mes (previene duplicados
-- cuando varios miembros del hogar disparan applyRecurring en paralelo).
-- Usa date::timestamp (no timestamptz) para que la función date_trunc sea
-- IMMUTABLE — necesario para que Postgres acepte el índice funcional.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recurring_per_month
  ON public.transactions (recurring_id, date_trunc('month'::text, date::timestamp))
  WHERE recurring_id IS NOT NULL;

-- budgets: partial uniques para permitir coexistencia de budget privado y
-- de hogar para la misma categoría/mes/año.
CREATE UNIQUE INDEX IF NOT EXISTS budgets_private_uniq
  ON public.budgets (user_id, category, month, year)
  WHERE household_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS budgets_shared_uniq
  ON public.budgets (household_id, category, month, year)
  WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_household_month
  ON public.budgets (household_id, month, year)
  WHERE household_id IS NOT NULL;

-- goals
CREATE INDEX IF NOT EXISTS idx_goals_household
  ON public.goals (household_id)
  WHERE household_id IS NOT NULL;

-- recurring_transactions
CREATE INDEX IF NOT EXISTS idx_recurring_household
  ON public.recurring_transactions (household_id)
  WHERE household_id IS NOT NULL;


-- ============================================================
-- 4. Helper function `is_household_member`
-- ============================================================
--
-- Usada por todas las policies que filtran data del hogar. Se llama desde RLS
-- por lo que necesita ser STABLE y SECURITY DEFINER para no recurrir contra
-- la misma policy que la invoca.
CREATE OR REPLACE FUNCTION public.is_household_member(h_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id AND user_id = auth.uid()
  );
$$;


-- ============================================================
-- 5. RLS habilitado + policies
-- ============================================================

ALTER TABLE public.transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members      ENABLE ROW LEVEL SECURITY;


-- 5.1 transactions
DROP POLICY IF EXISTS tx_select ON public.transactions;
CREATE POLICY tx_select ON public.transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY IF EXISTS tx_insert ON public.transactions;
CREATE POLICY tx_insert ON public.transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS tx_update ON public.transactions;
CREATE POLICY tx_update ON public.transactions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS tx_delete ON public.transactions;
CREATE POLICY tx_delete ON public.transactions FOR DELETE
  USING (user_id = auth.uid());


-- 5.2 budgets (cualquier miembro del hogar puede crear/editar/borrar)
DROP POLICY IF EXISTS budgets_select ON public.budgets;
CREATE POLICY budgets_select ON public.budgets FOR SELECT
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY IF EXISTS budgets_insert ON public.budgets;
CREATE POLICY budgets_insert ON public.budgets FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS budgets_update ON public.budgets;
CREATE POLICY budgets_update ON public.budgets FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  )
  WITH CHECK (
    (user_id = auth.uid() OR (household_id IS NOT NULL AND is_household_member(household_id)))
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS budgets_delete ON public.budgets;
CREATE POLICY budgets_delete ON public.budgets FOR DELETE
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );


-- 5.3 goals (cualquier miembro del hogar puede crear/editar/borrar)
DROP POLICY IF EXISTS goals_select ON public.goals;
CREATE POLICY goals_select ON public.goals FOR SELECT
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY IF EXISTS goals_insert ON public.goals;
CREATE POLICY goals_insert ON public.goals FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS goals_update ON public.goals;
CREATE POLICY goals_update ON public.goals FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  )
  WITH CHECK (
    (user_id = auth.uid() OR (household_id IS NOT NULL AND is_household_member(household_id)))
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS goals_delete ON public.goals;
CREATE POLICY goals_delete ON public.goals FOR DELETE
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );


-- 5.4 recurring_transactions (DELETE solo el autor — para no destruir
-- reglas ajenas)
DROP POLICY IF EXISTS recurring_select ON public.recurring_transactions;
CREATE POLICY recurring_select ON public.recurring_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR (household_id IS NOT NULL AND is_household_member(household_id))
  );

DROP POLICY IF EXISTS recurring_insert ON public.recurring_transactions;
CREATE POLICY recurring_insert ON public.recurring_transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS recurring_update ON public.recurring_transactions;
CREATE POLICY recurring_update ON public.recurring_transactions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR is_household_member(household_id))
  );

DROP POLICY IF EXISTS recurring_delete ON public.recurring_transactions;
CREATE POLICY recurring_delete ON public.recurring_transactions FOR DELETE
  USING (user_id = auth.uid());


-- 5.5 households (SELECT solo si soy miembro; INSERT/UPDATE/DELETE via RPCs)
DROP POLICY IF EXISTS hh_select ON public.households;
CREATE POLICY hh_select ON public.households FOR SELECT
  USING (is_household_member(id));


-- 5.6 household_members (SELECT si soy miembro; UPDATE solo self —
-- para cambiar display_name/color propio; INSERT/DELETE via RPCs)
DROP POLICY IF EXISTS hm_select ON public.household_members;
CREATE POLICY hm_select ON public.household_members FOR SELECT
  USING (is_household_member(household_id));

DROP POLICY IF EXISTS hm_update_self ON public.household_members;
CREATE POLICY hm_update_self ON public.household_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- 6. RPCs SECURITY DEFINER
-- ============================================================

-- 6.1 create_household — crea grupo + agrega caller como dueño + miembro
CREATE OR REPLACE FUNCTION public.create_household(
  p_name TEXT,
  p_display_name TEXT,
  p_color TEXT DEFAULT '#16a34a'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_code          TEXT;
  v_household_id  UUID;
  v_expires_at    TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('error', 'already_in_household');
  END IF;

  -- Generate unique 6-char alphanumeric code
  LOOP
    v_code := upper(
      translate(
        substring(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 6),
        '+/=',
        'XYZ'
      )
    );
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.households WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO public.households (name, invite_code, invite_expires_at, owner_id)
  VALUES (p_name, v_code, v_expires_at, v_uid)
  RETURNING id INTO v_household_id;

  INSERT INTO public.household_members (household_id, user_id, display_name, color)
  VALUES (v_household_id, v_uid, p_display_name, COALESCE(p_color, '#16a34a'));

  RETURN jsonb_build_object(
    'household_id', v_household_id,
    'invite_code', v_code,
    'expires_at', v_expires_at,
    'name', p_name
  );
END;
$$;


-- 6.2 join_household — caller se suma a un grupo existente vía código
CREATE OR REPLACE FUNCTION public.join_household(
  p_code TEXT,
  p_display_name TEXT,
  p_color TEXT DEFAULT '#16a34a'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_household RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RETURN jsonb_build_object('error', 'already_in_household');
  END IF;

  SELECT * INTO v_household
  FROM public.households
  WHERE invite_code = upper(trim(p_code))
    AND invite_expires_at > NOW();

  IF v_household IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_code');
  END IF;

  INSERT INTO public.household_members (household_id, user_id, display_name, color)
  VALUES (v_household.id, v_uid, p_display_name, COALESCE(p_color, '#16a34a'));

  RETURN jsonb_build_object(
    'household_id', v_household.id,
    'name', v_household.name
  );
END;
$$;


-- 6.3 rotate_invite_code — solo dueño. Invalida invitaciones previas.
CREATE OR REPLACE FUNCTION public.rotate_invite_code()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_household  RECORD;
  v_code       TEXT;
  v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT h.* INTO v_household
  FROM public.households h
  JOIN public.household_members hm ON hm.household_id = h.id
  WHERE hm.user_id = v_uid;

  IF v_household IS NULL THEN
    RETURN jsonb_build_object('error', 'no_household');
  END IF;

  IF v_household.owner_id <> v_uid THEN
    RETURN jsonb_build_object('error', 'not_owner');
  END IF;

  LOOP
    v_code := upper(
      translate(
        substring(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 6),
        '+/=',
        'XYZ'
      )
    );
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.households
      WHERE invite_code = v_code AND id <> v_household.id
    );
  END LOOP;

  UPDATE public.households
  SET invite_code = v_code, invite_expires_at = v_expires_at
  WHERE id = v_household.id;

  RETURN jsonb_build_object('invite_code', v_code, 'expires_at', v_expires_at);
END;
$$;


-- 6.4 leave_household — caller se va. Si era único miembro borra el grupo.
-- Si era dueño con otros miembros, transfiere ownership al miembro con
-- joined_at más viejo.
CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_household_id  UUID;
  v_owner_id      UUID;
  v_member_count  INT;
  v_next_owner    UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT hm.household_id, h.owner_id
  INTO v_household_id, v_owner_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = v_uid;

  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_household');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.household_members
  WHERE household_id = v_household_id;

  -- Case: sole member → delete entire household (cascade members,
  -- transactions/budgets/goals/recurring become private via ON DELETE SET NULL).
  IF v_member_count <= 1 THEN
    DELETE FROM public.households WHERE id = v_household_id;
    RETURN jsonb_build_object('ok', true, 'household_deleted', true);
  END IF;

  -- Case: caller is owner but there are other members → transfer to oldest.
  IF v_owner_id = v_uid THEN
    SELECT user_id INTO v_next_owner
    FROM public.household_members
    WHERE household_id = v_household_id AND user_id <> v_uid
    ORDER BY joined_at ASC
    LIMIT 1;

    UPDATE public.households
    SET owner_id = v_next_owner
    WHERE id = v_household_id;
  END IF;

  DELETE FROM public.household_members
  WHERE household_id = v_household_id AND user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'household_deleted', false);
END;
$$;


-- 6.5 delete_household — solo dueño. Borra el grupo entero. Las txs/budgets/
-- goals/recurring quedan privadas del autor (via ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.delete_household()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  DELETE FROM public.households WHERE id = hh_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- 6.6 remove_household_member — solo dueño. No permite self-remove (usar leave).
CREATE OR REPLACE FUNCTION public.remove_household_member(p_target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  DELETE FROM public.household_members
  WHERE household_id = hh_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- 6.7 delete_user_account — cleanup membership con transferencia automática
-- de ownership si el caller era dueño; luego borra TODA su data + auth.users.
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_household_id UUID;
  v_owner_id     UUID;
  v_member_count INT;
  v_next_owner   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cleanup household membership con misma lógica que leave_household
  SELECT hm.household_id, h.owner_id INTO v_household_id, v_owner_id
  FROM public.household_members hm
  JOIN public.households h ON h.id = hm.household_id
  WHERE hm.user_id = v_uid;

  IF v_household_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count
    FROM public.household_members WHERE household_id = v_household_id;

    IF v_member_count <= 1 THEN
      DELETE FROM public.households WHERE id = v_household_id;
    ELSE
      IF v_owner_id = v_uid THEN
        SELECT user_id INTO v_next_owner
        FROM public.household_members
        WHERE household_id = v_household_id AND user_id <> v_uid
        ORDER BY joined_at ASC LIMIT 1;
        UPDATE public.households SET owner_id = v_next_owner WHERE id = v_household_id;
      END IF;
      DELETE FROM public.household_members
      WHERE household_id = v_household_id AND user_id = v_uid;
    END IF;
  END IF;

  -- Borrar TODA la data del user (privada + compartida). El cascade del
  -- auth.users también lo haría, pero hacerlo explícito hace el orden
  -- predecible y respeta la cascada de FK.
  DELETE FROM public.transactions           WHERE user_id = v_uid;
  DELETE FROM public.budgets                WHERE user_id = v_uid;
  DELETE FROM public.goals                  WHERE user_id = v_uid;
  DELETE FROM public.recurring_transactions WHERE user_id = v_uid;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;


-- ============================================================
-- 7. GRANT / REVOKE en RPCs
-- ============================================================

-- Helper se ejecuta dentro de policies — accesible para authenticated.
REVOKE EXECUTE ON FUNCTION public.is_household_member(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.is_household_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_household(TEXT, TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_household(TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.join_household(TEXT, TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.join_household(TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rotate_invite_code() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rotate_invite_code() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.leave_household() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.leave_household() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_household() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.delete_household() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_household_member(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.remove_household_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
