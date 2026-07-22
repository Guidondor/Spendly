import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getHouseholds, getHouseholdMembers } from '../services/households';

// Multi-grupo: el provider guarda TODOS los grupos del user + cuál está "activo".
// `household` = grupo activo (misma forma que antes, o null = vista Personal), así
// las pantallas siguen leyendo `household`/`household.id` sin cambios. Un switcher
// llama setActiveGroup para re-scopear toda la app.

const HouseholdContext = createContext({
  household: null,
  members: [],
  groups: [],
  activeGroupId: null,
  setActiveGroup: async () => {},
  loading: false,
  reload: async () => {},
  clear: () => {},
  isOwner: false,
  getMemberById: () => null,
});

const activeKey = (userId) => `spendly_active_group_${userId}`;

export function HouseholdProvider({ session, children }) {
  const [groups, setGroups]         = useState([]);
  const [activeGroupId, setActiveId] = useState(null);
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const cancelled = useRef(false);

  const userId = session?.user?.id ?? null;

  // Resuelve el grupo activo por defecto: persistido si sigue válido; si no,
  // el único grupo (preserva el comportamiento single-group); si no, null.
  const resolveActiveId = useCallback(async (list) => {
    let persisted = null;
    try { persisted = await AsyncStorage.getItem(activeKey(userId)); } catch {}
    if (persisted && list.some(g => g.id === persisted)) return persisted;
    if (list.length === 1) return list[0].id;
    return null;
  }, [userId]);

  const loadMembers = useCallback(async (gid) => {
    if (!gid) { setMembers([]); return; }
    try {
      const m = await getHouseholdMembers(gid);
      if (!cancelled.current) setMembers(m);
    } catch (e) {
      if (__DEV__) console.warn('[HouseholdProvider loadMembers]', e?.message || e);
      // No resetear ante error de red — mantener lo que había.
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setGroups([]); setActiveId(null); setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const list = await getHouseholds(userId);
      if (cancelled.current) return;
      setGroups(list);
      const active = await resolveActiveId(list);
      if (cancelled.current) return;
      setActiveId(active);
      await loadMembers(active);
    } catch (e) {
      if (__DEV__) console.warn('[HouseholdProvider load]', e?.message || e);
      // RLS no tira errores (devuelve filas vacías); resetear solo ante error
      // claro de auth. Ante red/timeout NO resetear (el user sigue en sus grupos).
      const isAuthError = e?.code === 'PGRST301' || e?.code === '401' || e?.status === 401;
      if (isAuthError) { setGroups([]); setActiveId(null); setMembers([]); }
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [userId, resolveActiveId, loadMembers]);

  // Reload on userId change
  useEffect(() => {
    cancelled.current = false;
    load();
    return () => { cancelled.current = true; };
  }, [load]);

  // Cleanup explícito al SIGNED_OUT (aprendizaje Mundial — no leak cross-user)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setGroups([]); setActiveId(null); setMembers([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const setActiveGroup = useCallback(async (gid) => {
    // gid null = vista Personal. Validar contra los grupos conocidos.
    const next = (gid && groups.some(g => g.id === gid)) ? gid : null;
    setActiveId(next);
    try {
      if (next) await AsyncStorage.setItem(activeKey(userId), next);
      else await AsyncStorage.removeItem(activeKey(userId));
    } catch {}
    await loadMembers(next);
  }, [groups, userId, loadMembers]);

  const clear = useCallback(() => {
    setGroups([]); setActiveId(null); setMembers([]);
  }, []);

  const getMemberById = useCallback(
    (id) => members.find(m => m.user_id === id) || null,
    [members]
  );

  const household = groups.find(g => g.id === activeGroupId) || null;
  const isOwner = !!(household && userId && household.owner_id === userId);

  return (
    <HouseholdContext.Provider value={{
      household,
      members,
      groups,
      activeGroupId,
      setActiveGroup,
      loading,
      reload: load,
      clear,
      isOwner,
      getMemberById,
    }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
