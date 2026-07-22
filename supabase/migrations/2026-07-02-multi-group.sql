-- 2026-07-02 — Multi-grupo: un usuario puede pertenecer a N grupos.
--
-- Cambios:
--   1. Quitar el índice único household_members_user_unique (1 grupo/user).
--   2. create_household / join_household: sacar el guard `already_in_household`.
--   3. rotate_invite_code / leave_household / delete_household /
--      remove_household_member: pasan a recibir p_household_id (antes resolvían
--      el grupo por la única membresía del user). CREATE OR REPLACE no cambia
--      la firma → DROP de la firma vieja primero.
--   4. delete_user_account: loop sobre TODAS las membresías.
--   RLS e is_household_member sin cambios (ya operan por household_id).

-- 1. Índice único fuera
DROP INDEX IF EXISTS public.household_members_user_unique;

-- 2. create_household — sin guard already_in_household
CREATE OR REPLACE FUNCTION public.create_household(p_name TEXT, p_display_name TEXT, p_color TEXT DEFAULT '#16a34a')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_uid UUID := auth.uid(); v_code TEXT; v_household_id UUID; v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  LOOP
    v_code := upper(translate(substring(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 6), '+/=', 'XYZ'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.households WHERE invite_code = v_code);
  END LOOP;
  INSERT INTO public.households (name, invite_code, invite_expires_at, owner_id) VALUES (p_name, v_code, v_expires_at, v_uid) RETURNING id INTO v_household_id;
  INSERT INTO public.household_members (household_id, user_id, display_name, color) VALUES (v_household_id, v_uid, p_display_name, COALESCE(p_color, '#16a34a'));
  RETURN jsonb_build_object('household_id', v_household_id, 'invite_code', v_code, 'expires_at', v_expires_at, 'name', p_name);
END; $$;

-- 3. join_household — sin guard; la PK evita doble-join al mismo grupo
CREATE OR REPLACE FUNCTION public.join_household(p_code TEXT, p_display_name TEXT, p_color TEXT DEFAULT '#16a34a')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid UUID := auth.uid(); v_household RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  SELECT * INTO v_household FROM public.households WHERE invite_code = upper(trim(p_code)) AND invite_expires_at > NOW();
  IF v_household IS NULL THEN RETURN jsonb_build_object('error', 'invalid_or_expired_code'); END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_household.id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('error', 'already_in_this_group');
  END IF;
  INSERT INTO public.household_members (household_id, user_id, display_name, color) VALUES (v_household.id, v_uid, p_display_name, COALESCE(p_color, '#16a34a'));
  RETURN jsonb_build_object('household_id', v_household.id, 'name', v_household.name);
END; $$;

-- 4. rotate_invite_code(p_household_id)
DROP FUNCTION IF EXISTS public.rotate_invite_code();
CREATE OR REPLACE FUNCTION public.rotate_invite_code(p_household_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_uid UUID := auth.uid(); v_owner UUID; v_code TEXT; v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  SELECT h.owner_id INTO v_owner
  FROM public.households h JOIN public.household_members hm ON hm.household_id = h.id
  WHERE h.id = p_household_id AND hm.user_id = v_uid;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('error', 'no_household'); END IF;
  IF v_owner <> v_uid THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  LOOP
    v_code := upper(translate(substring(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 6), '+/=', 'XYZ'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.households WHERE invite_code = v_code AND id <> p_household_id);
  END LOOP;
  UPDATE public.households SET invite_code = v_code, invite_expires_at = v_expires_at WHERE id = p_household_id;
  RETURN jsonb_build_object('invite_code', v_code, 'expires_at', v_expires_at);
END; $$;

-- 5. leave_household(p_household_id)
DROP FUNCTION IF EXISTS public.leave_household();
CREATE OR REPLACE FUNCTION public.leave_household(p_household_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid UUID := auth.uid(); v_owner_id UUID; v_is_member BOOLEAN; v_member_count INT; v_next_owner UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  SELECT h.owner_id, EXISTS(SELECT 1 FROM public.household_members hm WHERE hm.household_id = p_household_id AND hm.user_id = v_uid)
    INTO v_owner_id, v_is_member
  FROM public.households h WHERE h.id = p_household_id;
  IF NOT COALESCE(v_is_member, false) THEN RETURN jsonb_build_object('error', 'no_household'); END IF;
  SELECT COUNT(*) INTO v_member_count FROM public.household_members WHERE household_id = p_household_id;
  IF v_member_count <= 1 THEN
    DELETE FROM public.households WHERE id = p_household_id;
    RETURN jsonb_build_object('ok', true, 'household_deleted', true);
  END IF;
  IF v_owner_id = v_uid THEN
    SELECT user_id INTO v_next_owner FROM public.household_members WHERE household_id = p_household_id AND user_id <> v_uid ORDER BY joined_at ASC LIMIT 1;
    UPDATE public.households SET owner_id = v_next_owner WHERE id = p_household_id;
  END IF;
  DELETE FROM public.household_members WHERE household_id = p_household_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'household_deleted', false);
END; $$;

-- 6. delete_household(p_household_id)
DROP FUNCTION IF EXISTS public.delete_household();
CREATE OR REPLACE FUNCTION public.delete_household(p_household_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller UUID := auth.uid(); v_owner UUID; v_is_member BOOLEAN;
BEGIN
  IF caller IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  SELECT h.owner_id, EXISTS(SELECT 1 FROM public.household_members hm WHERE hm.household_id = p_household_id AND hm.user_id = caller)
    INTO v_owner, v_is_member
  FROM public.households h WHERE h.id = p_household_id;
  IF NOT COALESCE(v_is_member, false) THEN RETURN jsonb_build_object('error', 'no_household'); END IF;
  IF v_owner <> caller THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  DELETE FROM public.households WHERE id = p_household_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 7. remove_household_member(p_household_id, p_target_user_id)
DROP FUNCTION IF EXISTS public.remove_household_member(UUID);
CREATE OR REPLACE FUNCTION public.remove_household_member(p_household_id UUID, p_target_user_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller UUID := auth.uid(); v_owner UUID;
BEGIN
  IF caller IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF caller = p_target_user_id THEN RETURN jsonb_build_object('error', 'cant_remove_self'); END IF;
  SELECT h.owner_id INTO v_owner
  FROM public.households h JOIN public.household_members hm ON hm.household_id = h.id
  WHERE h.id = p_household_id AND hm.user_id = caller;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('error', 'no_household'); END IF;
  IF v_owner <> caller THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = p_household_id AND user_id = p_target_user_id) THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;
  DELETE FROM public.household_members WHERE household_id = p_household_id AND user_id = p_target_user_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 8. delete_user_account — loop sobre TODAS las membresías
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid UUID := auth.uid(); r RECORD; v_member_count INT; v_next_owner UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  FOR r IN
    SELECT hm.household_id, h.owner_id
    FROM public.household_members hm JOIN public.households h ON h.id = hm.household_id
    WHERE hm.user_id = v_uid
  LOOP
    SELECT COUNT(*) INTO v_member_count FROM public.household_members WHERE household_id = r.household_id;
    IF v_member_count <= 1 THEN
      DELETE FROM public.households WHERE id = r.household_id;
    ELSE
      IF r.owner_id = v_uid THEN
        SELECT user_id INTO v_next_owner FROM public.household_members WHERE household_id = r.household_id AND user_id <> v_uid ORDER BY joined_at ASC LIMIT 1;
        UPDATE public.households SET owner_id = v_next_owner WHERE id = r.household_id;
      END IF;
      DELETE FROM public.household_members WHERE household_id = r.household_id AND user_id = v_uid;
    END IF;
  END LOOP;
  DELETE FROM public.transactions           WHERE user_id = v_uid;
  DELETE FROM public.budgets                WHERE user_id = v_uid;
  DELETE FROM public.goals                  WHERE user_id = v_uid;
  DELETE FROM public.recurring_transactions WHERE user_id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
END; $$;

-- 9. Grants (re-aplicar; las firmas nuevas necesitan su GRANT explícito)
REVOKE EXECUTE ON FUNCTION public.rotate_invite_code(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rotate_invite_code(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_household(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.leave_household(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_household(UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.delete_household(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_household_member(UUID, UUID) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.remove_household_member(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_household(TEXT, TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_household(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_household(TEXT, TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.join_household(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
