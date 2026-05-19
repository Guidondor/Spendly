import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useTheme } from '../services/theme';
import { useAlert } from '../components/AppAlert';
import { useHousehold } from '../components/HouseholdProvider';
import AuthorBadge from '../components/AuthorBadge';
import {
  createHousehold,
  joinHousehold,
  rotateInviteCode,
  leaveHousehold,
  MEMBER_COLORS,
} from '../services/households';

const ERROR_MAP = {
  unauthorized: 'Sesión inválida, volvé a entrar.',
  already_in_household: 'Ya pertenecés a un hogar. Salí primero.',
  invalid_or_expired_code: 'Código inválido o expirado.',
  no_household: 'No estás en un hogar.',
  not_owner: 'Solo el dueño del hogar puede hacer esto.',
};

function humanizeError(msg) {
  return ERROR_MAP[msg] || msg || 'Algo salió mal';
}

export default function HouseholdModal({ visible, onClose, defaultName = '' }) {
  const { theme } = useTheme();
  const { alert, confirm } = useAlert();
  const { household, members, isOwner, reload } = useHousehold();

  // 'menu' | 'create' | 'join'
  const [view, setView] = useState('menu');
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [hhName, setHhName] = useState('Casa');
  const [displayName, setDisplayName] = useState(defaultName);
  const [color, setColor] = useState(MEMBER_COLORS[0]);

  // Join form
  const [code, setCode] = useState('');
  const [joinDisplay, setJoinDisplay] = useState(defaultName);
  const [joinColor, setJoinColor] = useState(MEMBER_COLORS[1]);

  const s = useMemo(() => createStyles(theme), [theme]);

  function close() {
    setView('menu');
    setSubmitting(false);
    onClose();
  }

  async function handleCreate() {
    if (!hhName.trim()) { alert('Error', 'Poné un nombre al hogar'); return; }
    if (!displayName.trim()) { alert('Error', 'Poné tu nombre'); return; }
    setSubmitting(true);
    try {
      await createHousehold({ name: hhName.trim(), displayName: displayName.trim(), color });
      await reload();
      setView('menu');
    } catch (e) {
      alert('Error', humanizeError(e.message));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { alert('Error', 'El código tiene 6 caracteres'); return; }
    if (!joinDisplay.trim()) { alert('Error', 'Poné tu nombre'); return; }
    setSubmitting(true);
    try {
      await joinHousehold({ code: c, displayName: joinDisplay.trim(), color: joinColor });
      await reload();
      setView('menu');
    } catch (e) {
      alert('Error', humanizeError(e.message));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotate() {
    setSubmitting(true);
    try {
      await rotateInviteCode();
      await reload();
    } catch (e) {
      alert('Error', humanizeError(e.message));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShareCode() {
    if (!household?.invite_code) return;
    try {
      await Share.share({
        message: `Sumate a mi hogar en Spendly con el código: ${household.invite_code}\n\n(Expira en 24h)`,
      });
    } catch {}
  }

  async function handleLeave() {
    confirm({
      title: 'Salir del hogar',
      message: 'Las transacciones compartidas que cargaste van a quedar visibles para el resto. ¿Continuar?',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir', style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await leaveHousehold();
              await reload();
            } catch (e) {
              alert('Error', humanizeError(e.message));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    });
  }

  function expiryLabel() {
    if (!household?.invite_expires_at) return '';
    const ms = new Date(household.invite_expires_at).getTime() - Date.now();
    if (ms <= 0) return 'Expirado';
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs >= 1) return `Expira en ${hrs}h ${mins}m`;
    return `Expira en ${mins}m`;
  }

  function renderActiveHousehold() {
    const expired = household.invite_expires_at && new Date(household.invite_expires_at) < new Date();
    return (
      <>
        <Text style={s.sectionLabel}>HOGAR</Text>
        <View style={s.card}>
          <Text style={s.hhName}>{household.name}</Text>
          <Text style={s.hhMeta}>{members.length} miembro{members.length === 1 ? '' : 's'}</Text>
        </View>

        <Text style={s.sectionLabel}>MIEMBROS</Text>
        <View style={s.card}>
          {members.map((m, idx) => (
            <View
              key={m.user_id}
              style={[s.memberRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
            >
              <AuthorBadge member={m} size="md" />
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>
                  {m.display_name}
                  {m.user_id === household.owner_id && (
                    <Text style={s.ownerTag}>  · dueño</Text>
                  )}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.sectionLabel}>CÓDIGO DE INVITACIÓN</Text>
        <View style={s.card}>
          <Text style={[s.code, expired && { color: theme.expense }]}>{household.invite_code}</Text>
          <Text style={s.codeMeta}>{expiryLabel()}</Text>
          <View style={s.codeBtnRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.accent }]}
              onPress={handleShareCode}
              disabled={submitting || expired}
            >
              <Text style={s.actionBtnText}>Compartir</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.input, borderWidth: 1, borderColor: theme.inputBorder }]}
                onPress={handleRotate}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color={theme.text} /> : (
                  <Text style={[s.actionBtnText, { color: theme.text }]}>
                    {expired ? 'Generar nuevo' : 'Rotar'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[s.leaveBtn, submitting && { opacity: 0.5 }]}
          onPress={handleLeave}
          disabled={submitting}
        >
          <Text style={s.leaveBtnText}>🚪  Salir del hogar</Text>
        </TouchableOpacity>
      </>
    );
  }

  function renderMenu() {
    if (household) return renderActiveHousehold();

    return (
      <>
        <Text style={s.helpText}>
          Compartí gastos, presupuestos y metas con otra persona. Creá un hogar nuevo o uníte con un código.
        </Text>
        <TouchableOpacity
          style={[s.bigBtn, { backgroundColor: theme.accent }]}
          onPress={() => setView('create')}
        >
          <Text style={s.bigBtnIcon}>🏠</Text>
          <Text style={s.bigBtnText}>Crear hogar nuevo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.bigBtn, { backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.accent }]}
          onPress={() => setView('join')}
        >
          <Text style={s.bigBtnIcon}>🔑</Text>
          <Text style={[s.bigBtnText, { color: theme.accent }]}>Unirme con código</Text>
        </TouchableOpacity>
      </>
    );
  }

  function renderColorPicker(selected, setSelected) {
    return (
      <View style={s.colorRow}>
        {MEMBER_COLORS.map(col => (
          <TouchableOpacity
            key={col}
            style={[
              s.colorDot,
              { backgroundColor: col },
              selected === col && s.colorDotSelected,
            ]}
            onPress={() => setSelected(col)}
          />
        ))}
      </View>
    );
  }

  function renderCreate() {
    return (
      <>
        <TouchableOpacity onPress={() => setView('menu')} style={s.backRow}>
          <Text style={s.backText}>‹ Volver</Text>
        </TouchableOpacity>

        <Text style={s.label}>Nombre del hogar</Text>
        <TextInput
          style={s.input}
          placeholder="ej: Casa Burak"
          placeholderTextColor={theme.placeholderText}
          value={hhName}
          onChangeText={setHhName}
          maxLength={60}
        />

        <Text style={s.label}>Tu nombre en este hogar</Text>
        <TextInput
          style={s.input}
          placeholder="ej: Guido"
          placeholderTextColor={theme.placeholderText}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
        />

        <Text style={s.label}>Tu color</Text>
        {renderColorPicker(color, setColor)}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.accent, marginTop: 24 }, submitting && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Crear hogar</Text>}
        </TouchableOpacity>
      </>
    );
  }

  function renderJoin() {
    return (
      <>
        <TouchableOpacity onPress={() => setView('menu')} style={s.backRow}>
          <Text style={s.backText}>‹ Volver</Text>
        </TouchableOpacity>

        <Text style={s.label}>Código del hogar (6 caracteres)</Text>
        <TextInput
          style={[s.input, s.inputCode]}
          placeholder="ABC123"
          placeholderTextColor={theme.placeholderText}
          value={code}
          onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />

        <Text style={s.label}>Tu nombre en el hogar</Text>
        <TextInput
          style={s.input}
          placeholder="ej: Estefi"
          placeholderTextColor={theme.placeholderText}
          value={joinDisplay}
          onChangeText={setJoinDisplay}
          maxLength={30}
        />

        <Text style={s.label}>Tu color</Text>
        {renderColorPicker(joinColor, setJoinColor)}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.accent, marginTop: 24 }, submitting && { opacity: 0.6 }]}
          onPress={handleJoin}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Unirme</Text>}
        </TouchableOpacity>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <View style={s.handle} />
          <View style={s.titleRow}>
            <Text style={s.title}>Hogar compartido</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {view === 'menu'   && renderMenu()}
            {view === 'create' && renderCreate()}
            {view === 'join'   && renderJoin()}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
      letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
    },
    card: {
      backgroundColor: t.card, borderRadius: 16,
      padding: 16, marginBottom: 20,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
    },
    hhName: { fontSize: 18, fontWeight: '800', color: t.text },
    hhMeta: { fontSize: 13, color: t.subtext, marginTop: 4 },

    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10,
    },
    memberName: { fontSize: 15, fontWeight: '700', color: t.text },
    ownerTag: { fontSize: 12, color: t.subtext, fontWeight: '600' },

    code: { fontSize: 32, fontWeight: '900', textAlign: 'center', color: t.accent, letterSpacing: 4, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
    codeMeta: { fontSize: 12, color: t.subtext, textAlign: 'center', marginTop: 6 },
    codeBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    actionBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

    leaveBtn: {
      borderRadius: 16, paddingVertical: 14, alignItems: 'center',
      backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
      marginTop: 8,
    },
    leaveBtnText: { color: '#e11d48', fontSize: 15, fontWeight: '700' },

    helpText: { fontSize: 14, color: t.subtext, marginBottom: 20, lineHeight: 20 },
    bigBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingVertical: 18, paddingHorizontal: 18,
      borderRadius: 16, marginBottom: 12,
    },
    bigBtnIcon: { fontSize: 24 },
    bigBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, color: t.subtext, fontWeight: '600' },

    label: { fontSize: 13, fontWeight: '700', color: t.label, marginBottom: 8, marginTop: 12 },
    input: {
      backgroundColor: t.input, borderRadius: 12, borderWidth: 1,
      borderColor: t.inputBorder, padding: 14,
      fontSize: 15, color: t.inputText,
    },
    inputCode: {
      fontSize: 24, letterSpacing: 6, fontWeight: '800', textAlign: 'center',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
    colorDot: {
      width: 40, height: 40, borderRadius: 20,
      borderWidth: 3, borderColor: 'transparent',
    },
    colorDotSelected: { borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 },

    submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  });
}
