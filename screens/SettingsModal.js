import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Switch, Platform, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlert } from '../components/AppAlert';
import { useTheme } from '../services/theme';
import { supabase } from '../services/supabase';
import { withTimeout } from '../services/withTimeout';
import { LABELS } from '../constants/i18n';
import { useHousehold } from '../components/HouseholdProvider';
import HouseholdModal from './HouseholdModal';
import { AI_INSIGHT_CACHE_PREFIX } from './HomeScreen';

const PRIVACY_URL = 'https://guidondor.github.io/Spendly/privacy.html';

async function clearAIInsightCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter(k => k.startsWith(AI_INSIGHT_CACHE_PREFIX));
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch (e) {
    console.error('clearAIInsightCache error:', e);
  }
}

export default function SettingsModal({ visible, onClose, session }) {
  const { theme, isDark, toggleTheme, lang, setLang } = useTheme();
  const { confirm } = useAlert();
  const { household, members } = useHousehold();
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [householdVisible, setHouseholdVisible] = useState(false);
  const s = createStyles(theme);

  const email = session?.user?.email ?? '';
  const displayName = email.split('@')[0] || 'Usuario';
  const initial = displayName[0]?.toUpperCase() ?? 'U';

  function handleLogout() {
    onClose();
    confirm({
      title: lang === 'es' ? 'Cerrar sesión' : 'Sign out',
      message: lang === 'es' ? '¿Seguro que querés salir?' : 'Are you sure you want to sign out?',
      buttons: [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        { text: lang === 'es' ? 'Salir' : 'Sign out', style: 'destructive', onPress: async () => {
          await clearAIInsightCache();
          await supabase.auth.signOut({ scope: 'local' });
        } },
      ],
    });
  }

  async function handleDeleteAccount() {
    const msg = lang === 'es'
      ? '¿Eliminar tu cuenta y todos tus datos? Esta acción es irreversible.'
      : 'Delete your account and all data? This action cannot be undone.';

    const confirmed = await new Promise(resolve =>
      confirm({
        title: lang === 'es' ? 'Eliminar cuenta' : 'Delete account',
        message: msg,
        buttons: [
          { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: lang === 'es' ? 'Eliminar' : 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ],
      })
    );

    if (!confirmed) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await withTimeout(supabase.rpc('delete_user_account'), 20000);
      if (error) throw error;
      await clearAIInsightCache();
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      if (__DEV__) console.warn('[SettingsModal] delete_user_account failed:', e?.message || e);
      const L = LABELS[lang] || LABELS.es;
      setDeleteError(L.deleteAccountError);
      setDeleting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.handle} />

        {/* Header */}
        <View style={s.titleRow}>
          <Text style={s.title}>{lang === 'es' ? 'Ajustes' : 'Settings'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Cuenta */}
        <Text style={s.sectionLabel}>{lang === 'es' ? 'CUENTA' : 'ACCOUNT'}</Text>
        <View style={s.accountRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.displayName}>{displayName}</Text>
            <Text style={s.email}>{email}</Text>
          </View>
        </View>

        {/* Apariencia */}
        <Text style={s.sectionLabel}>{lang === 'es' ? 'APARIENCIA' : 'APPEARANCE'}</Text>
        <View style={s.row}>
          <Text style={s.rowIcon}>🌙</Text>
          <Text style={s.rowLabel}>{lang === 'es' ? 'Modo oscuro' : 'Dark mode'}</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.input, true: theme.accent + '66' }}
            thumbColor={isDark ? theme.accent : theme.subtext}
          />
        </View>

        {/* Hogar compartido */}
        <Text style={s.sectionLabel}>{lang === 'es' ? 'HOGAR COMPARTIDO' : 'SHARED HOUSEHOLD'}</Text>
        <TouchableOpacity
          style={s.row}
          onPress={() => setHouseholdVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={s.rowIcon}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>
              {household
                ? household.name
                : (lang === 'es' ? 'Crear o unirse a un hogar' : 'Create or join a household')}
            </Text>
            {household && (
              <Text style={{ fontSize: 12, color: theme.subtext, marginTop: 2 }}>
                {members.length} {lang === 'es'
                  ? (members.length === 1 ? 'miembro' : 'miembros')
                  : (members.length === 1 ? 'member' : 'members')}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 18, color: theme.subtext }}>›</Text>
        </TouchableOpacity>

        {/* Idioma */}
        <Text style={s.sectionLabel}>{lang === 'es' ? 'IDIOMA' : 'LANGUAGE'}</Text>
        <View style={s.langRow}>
          <TouchableOpacity
            style={[s.langBtn, lang === 'es' && s.langBtnActive]}
            onPress={() => setLang('es')}
          >
            <Text style={[s.langBtnText, lang === 'es' && s.langBtnTextActive]}>AR Español</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.langBtn, lang === 'en' && s.langBtnActive]}
            onPress={() => setLang('en')}
          >
            <Text style={[s.langBtnText, lang === 'en' && s.langBtnTextActive]}>US English</Text>
          </TouchableOpacity>
        </View>

        {/* Cerrar sesión */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutIcon}>🚪</Text>
          <Text style={s.logoutText}>{lang === 'es' ? 'Cerrar sesión' : 'Sign out'}</Text>
        </TouchableOpacity>

        {/* Eliminar cuenta */}
        <TouchableOpacity
          style={[s.deleteBtn, deleting && { opacity: 0.5 }]}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.8}
        >
          <Text style={s.deleteIcon}>🗑️</Text>
          <Text style={s.deleteText}>
            {deleting
              ? (lang === 'es' ? 'Eliminando...' : 'Deleting...')
              : (lang === 'es' ? 'Eliminar cuenta' : 'Delete account')}
          </Text>
        </TouchableOpacity>
        {!!deleteError && <Text style={s.deleteError}>{deleteError}</Text>}

        {/* Privacy Policy */}
        <TouchableOpacity style={s.privacyLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={s.privacyText}>
            {lang === 'es' ? 'Política de Privacidad' : 'Privacy Policy'}
          </Text>
        </TouchableOpacity>
      </View>

      <HouseholdModal
        visible={householdVisible}
        onClose={() => setHouseholdVisible(false)}
        defaultName={displayName}
      />
    </Modal>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: {
      flex: 1, backgroundColor: t.bg,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 20, paddingTop: 12,
    },
    handle: {
      alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
      backgroundColor: t.divider, marginBottom: 16,
    },
    titleRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 24,
    },
    title: { fontSize: 22, fontWeight: '800', color: t.text },
    closeBtn: { fontSize: 18, color: t.subtext },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: t.sectionText,
      letterSpacing: 0.8, marginBottom: 8, marginTop: 8,
    },
    accountRow: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: t.card, borderRadius: 16,
      padding: 14, marginBottom: 20,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
    },
    avatar: {
      width: 48, height: 48, borderRadius: 14,
      backgroundColor: t.accent + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '800', color: t.accent },
    displayName: { fontSize: 16, fontWeight: '700', color: t.text },
    email: { fontSize: 13, color: t.subtext, marginTop: 2 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.card, borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 14,
      marginBottom: 20,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
    },
    rowIcon: { fontSize: 18 },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: t.text },
    langRow: {
      flexDirection: 'row', gap: 10,
      backgroundColor: t.card, borderRadius: 16,
      padding: 8, marginBottom: 32,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
    },
    langBtn: {
      flex: 1, paddingVertical: 10,
      borderRadius: 12, alignItems: 'center',
    },
    langBtnActive: { backgroundColor: t.accent },
    langBtnText: { fontSize: 14, fontWeight: '600', color: t.subtext },
    langBtnTextActive: { color: '#fff' },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, backgroundColor: '#fef2f2',
      borderRadius: 16, paddingVertical: 16,
      borderWidth: 1, borderColor: '#fecaca',
    },
    logoutIcon: { fontSize: 18 },
    logoutText: { fontSize: 16, fontWeight: '700', color: '#e11d48' },
    deleteBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginTop: 10,
      borderRadius: 16, paddingVertical: 14,
      borderWidth: 1, borderColor: '#fecaca', backgroundColor: 'transparent',
    },
    deleteIcon: { fontSize: 16 },
    deleteText: { fontSize: 14, fontWeight: '600', color: '#e11d48' },
    deleteError: { color: '#e11d48', fontSize: 12, textAlign: 'center', marginTop: 6 },
    privacyLink: { alignItems: 'center', marginTop: 20, paddingBottom: 8 },
    privacyText: { fontSize: 12, color: t.subtext, textDecorationLine: 'underline' },
  });
}
