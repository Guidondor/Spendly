-- 2026-07-02 — Hardening: restringir UPDATE column-level en household_members
--
-- Vuln (detectada por /rls-audit pre-build): la policy `hm_update_self` valida
-- solo `user_id = auth.uid()` en el WITH CHECK. Eso controla la FILA, no las
-- COLUMNAS. Un miembro podia UPDATE-ear su propia fila y cambiar:
--   - joined_at    -> backdatearse para robar la sucesion automatica de ownership
--                     (leave_household / delete_user_account transfieren al mas antiguo)
--   - household_id -> intento de moverse de grupo
--
-- Confirmado empiricamente: backdate de joined_at PERMITIDO antes del fix.
-- Todas las mutaciones legitimas de membresia van por RPCs SECURITY DEFINER
-- (corren como owner, no sujetos a estos grants). El cliente solo edita su
-- propio display_name/color.

REVOKE UPDATE ON public.household_members FROM authenticated, anon;
GRANT  UPDATE (display_name, color) ON public.household_members TO authenticated;
