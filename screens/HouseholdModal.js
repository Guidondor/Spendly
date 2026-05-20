import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useTheme } from '../services/theme';
import { useAlert } from '../components/AppAlert';
import { useHousehold } from '../components/HouseholdProvider';
import AuthorBadge from '../components/AuthorBadge';
import { LABELS } from '../constants/i18n';
import {
  createHousehold,
  joinHousehold,
  rotateInviteCode,
  leaveHousehold,
  removeHouseholdMember,
  deleteHousehold,
  computeSettlement,
  MEMBER_COLORS,
} from '../services/households';
import { getTransactions } from '../services/transactions';
import { formatMoney } from '../services/format';

function buildErrorMap(L) {
  return {
    unauthorized:            L.errorUnauthorized,
    already_in_household:    L.errorAlreadyInGroup,
    invalid_or_expired_code: L.errorInvalidCode,
    no_household:            L.errorNoGroup,
    not_owner:               L.errorNotOwner,
    cant_remove_self:        L.errorCantRemoveSelf,
    not_a_member:            L.errorNotMember,
  };
}

function humanizeError(msg, L) {
  const map = buildErrorMap(L);
  return map[msg] || msg || (L.networkError || 'Algo salió mal');
}

export default function HouseholdModal({ visible, onClose, defaultName = '', currentUserId = null }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
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

  // Settle-up: txs del mes en curso del grupo
  const [monthTxs, setMonthTxs] = useState([]);
  const [showSettleDetail, setShowSettleDetail] = useState(false);

  useEffect(() => {
    if (!visible || !household?.id || !currentUserId) {
      setMonthTxs([]);
      return;
    }
    let cancelled = false;
    const now = new Date();
    getTransactions(currentUserId, now.getFullYear(), now.getMonth() + 1, household.id)
      .then(txs => { if (!cancelled) setMonthTxs(txs); })
      .catch(e => { if (__DEV__) console.warn('[HouseholdModal] load txs:', e?.message || e); });
    return () => { cancelled = true; };
  }, [visible, household?.id, currentUserId]);

  const settlement = useMemo(
    () => household?.id ? computeSettlement(monthTxs, members, household.id) : null,
    [monthTxs, members, household?.id]
  );

  const s = useMemo(() => createStyles(theme), [theme]);

  function close() {
    setView('menu');
    setSubmitting(false);
    onClose();
  }

  async function handleCreate() {
    if (!hhName.trim()) { alert('Error', lang === 'es' ? 'Poné un nombre al grupo' : 'Enter a group name'); return; }
    if (!displayName.trim()) { alert('Error', lang === 'es' ? 'Poné tu nombre' : 'Enter your name'); return; }
    setSubmitting(true);
    try {
      await createHousehold({ name: hhName.trim(), displayName: displayName.trim(), color });
      await reload();
      setView('menu');
    } catch (e) {
      alert('Error', humanizeError(e.message, L));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { alert('Error', lang === 'es' ? 'El código tiene 6 caracteres' : 'Code is 6 characters'); return; }
    if (!joinDisplay.trim()) { alert('Error', lang === 'es' ? 'Poné tu nombre' : 'Enter your name'); return; }
    setSubmitting(true);
    try {
      await joinHousehold({ code: c, displayName: joinDisplay.trim(), color: joinColor });
      await reload();
      setView('menu');
    } catch (e) {
      alert('Error', humanizeError(e.message, L));
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
      alert('Error', humanizeError(e.message, L));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShareCode() {
    if (!household?.invite_code) return;
    try {
      await Share.share({
        message: L.shareCodeMessage.replace('{code}', household.invite_code),
      });
    } catch {}
  }

  async function handleRemoveMember(member) {
    confirm({
      title: L.removeMember,
      message: L.removeMemberConfirm.replace('{name}', member.display_name),
      buttons: [
        { text: L.cancel, style: 'cancel' },
        {
          text: L.removeMemberOk, style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await removeHouseholdMember(member.user_id);
              await reload();
            } catch (e) {
              alert('Error', humanizeError(e.message, L));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    });
  }

  async function handleDeleteGroup() {
    confirm({
      title: L.deleteGroup,
      message: L.deleteGroupConfirm,
      buttons: [
        { text: L.cancel, style: 'cancel' },
        {
          text: L.deleteGroup, style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteHousehold();
              await reload();
              close();
            } catch (e) {
              alert('Error', humanizeError(e.message, L));
              setSubmitting(false);
            }
          },
        },
      ],
    });
  }

  async function handleLeave() {
    confirm({
      title: L.leaveGroupConfirmTitle,
      message: L.leaveGroupConfirmMsg,
      buttons: [
        { text: L.cancel, style: 'cancel' },
        {
          text: lang === 'es' ? 'Salir' : 'Leave', style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await leaveHousehold();
              await reload();
            } catch (e) {
              alert('Error', humanizeError(e.message, L));
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
    if (ms <= 0) return lang === 'es' ? 'Expirado' : 'Expired';
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs >= 1) return lang === 'es' ? `Expira en ${hrs}h ${mins}m` : `Expires in ${hrs}h ${mins}m`;
    return lang === 'es' ? `Expira en ${mins}m` : `Expires in ${mins}m`;
  }

  function renderActiveHousehold() {
    const expired = household.invite_expires_at && new Date(household.invite_expires_at) < new Date();
    return (
      <>
        <Text style={s.sectionLabel}>{L.groupSection}</Text>
        <View style={s.card}>
          <Text style={s.hhName}>{household.name}</Text>
          <Text style={s.hhMeta}>
            {members.length} {lang === 'es'
              ? (members.length === 1 ? 'miembro' : 'miembros')
              : (members.length === 1 ? 'member' : 'members')}
          </Text>
        </View>

        <Text style={s.sectionLabel}>{lang === 'es' ? 'MIEMBROS' : 'MEMBERS'}</Text>
        <View style={s.card}>
          {members.map((m, idx) => {
            const canRemove = isOwner && currentUserId && m.user_id !== currentUserId;
            return (
              <View
                key={m.user_id}
                style={[s.memberRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
              >
                <AuthorBadge member={m} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={s.memberName}>
                    {m.display_name}
                    {m.user_id === household.owner_id && (
                      <Text style={s.ownerTag}>  · {L.groupOwner}</Text>
                    )}
                  </Text>
                </View>
                {canRemove && (
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(m)}
                    disabled={submitting}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={s.removeMemberBtn}
                  >
                    <Text style={s.removeMemberIcon}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Settle-up: solo si hay >1 miembro y hay txs compartidas con balances */}
        {settlement && settlement.transfers.length > 0 && (
          <>
            <Text style={s.sectionLabel}>⚖️ {L.settleUp.toUpperCase()}</Text>
            <View style={s.card}>
              <View style={s.settleHeader}>
                <Text style={[s.settleHeaderLabel, { color: theme.subtext }]}>{L.settleTotal}</Text>
                <Text style={s.settleHeaderValue}>{formatMoney(settlement.total)}</Text>
              </View>
              {settlement.transfers.map((tr, i) => (
                <View key={`${tr.from.user_id}-${tr.to.user_id}-${i}`} style={s.transferRow}>
                  <AuthorBadge member={tr.from} size="sm" />
                  <Text style={[s.transferName, { color: theme.text }]} numberOfLines={1}>
                    {tr.from.display_name}
                  </Text>
                  <Text style={[s.transferArrow, { color: theme.subtext }]}>→</Text>
                  <Text style={[s.transferAmount, { color: theme.accent }]}>{formatMoney(tr.amount)}</Text>
                  <Text style={[s.transferArrow, { color: theme.subtext }]}>→</Text>
                  <Text style={[s.transferName, { color: theme.text }]} numberOfLines={1}>
                    {tr.to.display_name}
                  </Text>
                  <AuthorBadge member={tr.to} size="sm" />
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setShowSettleDetail(v => !v)}
                style={s.settleDetailBtn}
              >
                <Text style={[s.settleDetailBtnText, { color: theme.accent }]}>
                  {showSettleDetail ? L.settleHide : L.settleDetail}
                </Text>
              </TouchableOpacity>
              {showSettleDetail && (
                <View style={s.settleDetail}>
                  <Text style={[s.settleDetailLine, { color: theme.subtext }]}>
                    {L.settleFairShare}: <Text style={{ color: theme.text, fontWeight: '700' }}>
                      {formatMoney(settlement.fairShare)}
                    </Text>
                  </Text>
                  {settlement.balances.map(b => (
                    <View key={b.member.user_id} style={s.balanceRow}>
                      <AuthorBadge member={b.member} size="sm" />
                      <Text style={[s.balanceName, { color: theme.text }]} numberOfLines={1}>
                        {b.member.display_name}
                      </Text>
                      <Text style={[s.balanceSpent, { color: theme.subtext }]}>{formatMoney(b.spent)}</Text>
                      <Text style={[
                        s.balanceDelta,
                        { color: b.balance > 0 ? theme.income : (b.balance < 0 ? theme.expense : theme.subtext) },
                      ]}>
                        {b.balance > 0 ? '+' : b.balance < 0 ? '-' : ''}{formatMoney(Math.abs(b.balance))}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        <Text style={s.sectionLabel}>{L.inviteCode.toUpperCase()}</Text>
        <View style={s.card}>
          <Text style={[s.code, expired && { color: theme.expense }]}>{household.invite_code}</Text>
          <Text style={s.codeMeta}>{expiryLabel()}</Text>
          <View style={s.codeBtnRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.accent }]}
              onPress={handleShareCode}
              disabled={submitting || expired}
            >
              <Text style={s.actionBtnText}>{lang === 'es' ? 'Compartir' : 'Share'}</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.input, borderWidth: 1, borderColor: theme.inputBorder }]}
                onPress={handleRotate}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color={theme.text} /> : (
                  <Text style={[s.actionBtnText, { color: theme.text }]}>
                    {expired
                      ? (lang === 'es' ? 'Generar nuevo' : 'Generate new')
                      : (lang === 'es' ? 'Rotar' : 'Rotate')}
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
          <Text style={s.leaveBtnText}>🚪  {L.leaveGroup}</Text>
        </TouchableOpacity>

        {isOwner && (
          <TouchableOpacity
            style={[s.deleteGroupBtn, submitting && { opacity: 0.5 }]}
            onPress={handleDeleteGroup}
            disabled={submitting}
          >
            <Text style={s.deleteGroupBtnText}>🗑️  {L.deleteGroup}</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }

  function renderMenu() {
    if (household) return renderActiveHousehold();

    return (
      <>
        <Text style={s.helpText}>{L.groupHelpText}</Text>
        <TouchableOpacity
          style={[s.bigBtn, { backgroundColor: theme.accent }]}
          onPress={() => setView('create')}
        >
          <Text style={s.bigBtnIcon}>👥</Text>
          <Text style={s.bigBtnText}>{L.createGroupBtn}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.bigBtn, { backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.accent }]}
          onPress={() => setView('join')}
        >
          <Text style={s.bigBtnIcon}>🔑</Text>
          <Text style={[s.bigBtnText, { color: theme.accent }]}>{L.joinGroupBtn}</Text>
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
          <Text style={s.backText}>‹ {lang === 'es' ? 'Volver' : 'Back'}</Text>
        </TouchableOpacity>

        <Text style={s.label}>{L.groupName}</Text>
        <TextInput
          style={s.input}
          placeholder={L.groupNamePlaceholder}
          placeholderTextColor={theme.placeholderText}
          value={hhName}
          onChangeText={setHhName}
          maxLength={60}
        />

        <Text style={s.label}>{L.yourNameInGroup}</Text>
        <TextInput
          style={s.input}
          placeholder={lang === 'es' ? 'ej: Guido' : 'e.g. Guido'}
          placeholderTextColor={theme.placeholderText}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
        />

        <Text style={s.label}>{L.yourColor}</Text>
        {renderColorPicker(color, setColor)}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.accent, marginTop: 24 }, submitting && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>{L.createGroupSubmit}</Text>}
        </TouchableOpacity>
      </>
    );
  }

  function renderJoin() {
    return (
      <>
        <TouchableOpacity onPress={() => setView('menu')} style={s.backRow}>
          <Text style={s.backText}>‹ {lang === 'es' ? 'Volver' : 'Back'}</Text>
        </TouchableOpacity>

        <Text style={s.label}>{L.groupCodeLabel}</Text>
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

        <Text style={s.label}>{L.yourNameInGroup}</Text>
        <TextInput
          style={s.input}
          placeholder={lang === 'es' ? 'ej: Estefi' : 'e.g. Steph'}
          placeholderTextColor={theme.placeholderText}
          value={joinDisplay}
          onChangeText={setJoinDisplay}
          maxLength={30}
        />

        <Text style={s.label}>{L.yourColor}</Text>
        {renderColorPicker(joinColor, setJoinColor)}

        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.accent, marginTop: 24 }, submitting && { opacity: 0.6 }]}
          onPress={handleJoin}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>{L.joinGroupSubmit}</Text>}
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
            <Text style={s.title}>{L.sharedGroup}</Text>
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
    deleteGroupBtn: {
      borderRadius: 16, paddingVertical: 14, alignItems: 'center',
      backgroundColor: '#e11d48',
      marginTop: 10,
    },
    deleteGroupBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    removeMemberBtn: {
      width: 32, height: 32, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
    },
    removeMemberIcon: { fontSize: 14 },

    // Settle-up
    settleHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 12,
    },
    settleHeaderLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    settleHeaderValue: { fontSize: 18, fontWeight: '800', color: t.text },
    transferRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 8,
      borderTopWidth: 1, borderTopColor: t.divider,
    },
    transferName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
    transferArrow: { fontSize: 12, fontWeight: '700' },
    transferAmount: { fontSize: 13, fontWeight: '800' },
    settleDetailBtn: {
      marginTop: 12, paddingVertical: 6, alignItems: 'center',
    },
    settleDetailBtnText: { fontSize: 13, fontWeight: '700' },
    settleDetail: {
      marginTop: 8, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: t.divider,
    },
    settleDetailLine: { fontSize: 13, marginBottom: 10 },
    balanceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 6,
    },
    balanceName: { flex: 1, fontSize: 13, fontWeight: '600' },
    balanceSpent: { fontSize: 12, fontWeight: '600' },
    balanceDelta: { fontSize: 13, fontWeight: '800', minWidth: 70, textAlign: 'right' },

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
