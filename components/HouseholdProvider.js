import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { getHousehold, getHouseholdMembers } from '../services/households';

const HouseholdContext = createContext({
  household: null,
  members: [],
  loading: false,
  reload: async () => {},
  clear: () => {},
  isOwner: false,
  getMemberById: () => null,
});

export function HouseholdProvider({ session, children }) {
  const [household, setHousehold] = useState(null);
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const cancelled = useRef(false);

  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setHousehold(null);
      setMembers([]);
      return;
    }
    setLoading(true);
    try {
      const h = await getHousehold(userId);
      if (cancelled.current) return;
      setHousehold(h);
      if (h?.id) {
        const m = await getHouseholdMembers(h.id);
        if (cancelled.current) return;
        setMembers(m);
      } else {
        setMembers([]);
      }
    } catch (e) {
      if (__DEV__) console.error('[HouseholdProvider load]', e);
      setHousehold(null);
      setMembers([]);
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, [userId]);

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
        setHousehold(null);
        setMembers([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const clear = useCallback(() => {
    setHousehold(null);
    setMembers([]);
  }, []);

  const getMemberById = useCallback(
    (id) => members.find(m => m.user_id === id) || null,
    [members]
  );

  const isOwner = !!(household && userId && household.owner_id === userId);

  return (
    <HouseholdContext.Provider value={{
      household,
      members,
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
