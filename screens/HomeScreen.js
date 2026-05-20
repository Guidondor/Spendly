import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, StatusBar, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { getTransactions, deleteTransaction } from '../services/transactions';
import { getCategoryByKey, CategoryIcon } from '../services/categories';
import { useTheme } from '../services/theme';
import { LABELS, MONTHS, MONTHS_SHORT } from '../constants/i18n';
import AddTransactionModal from './AddTransactionModal';
import HistoryModal from './HistoryModal';
import RecurringModal from './RecurringModal';
import SettingsModal from './SettingsModal';
import HouseholdModal from './HouseholdModal';
import { applyRecurring, deleteRecurring } from '../services/recurring';
import { formatMoney } from '../services/format';
import { useAlert } from '../components/AppAlert';
import { useHousehold } from '../components/HouseholdProvider';
import AuthorBadge from '../components/AuthorBadge';


function formatSectionDate(dateStr, L, lang) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return L.today;
  if (date.toDateString() === yesterday.toDateString()) return L.yesterday;
  const d = String(day).padStart(2, '0');
  const m = MONTHS_SHORT[lang][month - 1].toUpperCase();
  return `${d} ${m}`;
}

function groupByDate(transactions, L, lang) {
  const groups = {};
  transactions.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, data]) => ({ date, label: formatSectionDate(date, L, lang), data }));
}

// ─── Transaction item ─────────────────────────────────────────────────────────

function TransactionItem({ transaction, onDelete, onEdit, theme, L, lang, author, canEdit }) {
  const cat = getCategoryByKey(transaction.category, lang);
  const isIncome = transaction.type === 'income';
  const isShared = !!transaction.household_id;
  const { confirm } = useAlert();

  function showMenu() {
    const buttons = [];
    if (canEdit) {
      buttons.push({ text: 'Editar', onPress: onEdit });
      buttons.push({
        text: 'Eliminar', style: 'destructive',
        onPress: () => confirm({
          title: L.deleteTitle,
          message: `¿Eliminás "${transaction.description}"?`,
          buttons: [
            { text: L.cancel, style: 'cancel' },
            { text: L.deleteConfirm, style: 'destructive', onPress: onDelete },
          ],
        }),
      });
    }
    buttons.push({ text: L.cancel, style: 'cancel' });

    confirm({
      title: transaction.description,
      message: canEdit ? 'Seleccioná una opción' : L.txOfAnotherMember,
      buttons,
    });
  }

  return (
    <Pressable
      style={({ pressed }) => [
        txStyle.item,
        { backgroundColor: theme.card, borderColor: theme.cardBorder, borderWidth: theme.dark ? 1 : 0 },
        pressed && { opacity: 0.75 },
      ]}
      onPress={showMenu}
    >
      <View style={[txStyle.iconWrap, { backgroundColor: cat.color + '20' }]}>
        <CategoryIcon catKey={transaction.category} size={20} color={cat.color} />
      </View>
      <View style={txStyle.info}>
        <Text style={[txStyle.description, { color: theme.text }]} numberOfLines={1}>
          {transaction.description}
        </Text>
        <View style={txStyle.metaRow}>
          {isShared && author && (
            <>
              <AuthorBadge member={author} size="sm" style={{ marginRight: 4 }} />
              <Text style={[txStyle.metaName, { color: theme.text }]}>
                {author.display_name}
              </Text>
              <Text style={[txStyle.metaSep, { color: theme.subtext }]}>·</Text>
            </>
          )}
          <Text style={[txStyle.category, { color: theme.subtext }]}>
            {isShared ? L.pillHh : cat.name}
          </Text>
        </View>
      </View>
      <Text style={[txStyle.amount, { color: isIncome ? theme.income : theme.expense }]}>
        {isIncome ? '+' : '-'}{formatMoney(transaction.amount)}
      </Text>
    </Pressable>
  );
}

const txStyle = StyleSheet.create({
  item: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  iconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  info: { flex: 1 },
  description: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  category: { fontSize: 12, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaName: { fontSize: 12, fontWeight: '700' },
  metaSep: { fontSize: 12, fontWeight: '700' },
  amount: { fontSize: 15, fontWeight: '700' },
});

// ─── AI Insights card ─────────────────────────────────────────────────────────

export const AI_INSIGHT_CACHE_PREFIX = 'spendly_insight_v2_';
const AI_INSIGHT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function AIInsightCard({ theme, userId, transactions, L, lang, viewDate, householdId }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasTxs = transactions.length > 0;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1;
  const scope = householdId ? `hh${householdId}` : 'mine';

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    loadInsight(controller.signal);
    return () => controller.abort();
  }, [userId, lang, hasTxs, year, month, scope]);

  async function loadInsight(signal) {
    const cacheKey = `${AI_INSIGHT_CACHE_PREFIX}${userId}_${lang}_${year}_${month}_${scope}`;
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.insight && Date.now() - cached.timestamp < AI_INSIGHT_TTL_MS) {
          if (!signal.aborted) setInsight(cached.insight);
          return;
        }
      }
    } catch {}

    setInsight(null);
    if (transactions.length === 0) return;

    setLoading(true);
    try {
      const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
      const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
      const catCount = {};
      transactions.forEach(t => { catCount[t.category] = (catCount[t.category] || 0) + 1; });
      const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/insight`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ income, expenses, top_category: topCat, tx_count: transactions.length, lang }),
          signal,
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (signal.aborted) return;
        setInsight(data.insight);
        try {
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({ insight: data.insight, timestamp: Date.now() })
          );
        } catch {}
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error('AIInsightCard fetch error:', e);
    } finally { setLoading(false); }
  }

  if (!loading && !insight) return null;

  return (
    <View style={[aiStyle.card, {
      backgroundColor: theme.card,
      borderColor: theme.cardBorder,
      borderWidth: theme.dark ? 1 : 0,
    }]}>
      <View style={aiStyle.header}>
        <Text style={[aiStyle.label, { color: theme.accent }]}>✨ {L.aiTitle.toUpperCase()}</Text>
        <View style={[aiStyle.dot, { backgroundColor: theme.accent }]} />
      </View>
      {loading
        ? <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 4 }} />
        : <Text style={[aiStyle.text, { color: theme.subtext }]}>{insight}</Text>}
    </View>
  );
}

const aiStyle = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ session }) {
  const { theme, isDark, toggleTheme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert, confirm } = useAlert();
  const { household, getMemberById } = useHousehold();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [modalVisible, setModalVisible]     = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [recurringVisible, setRecurringVisible] = useState(false);
  const [settingsVisible, setSettingsVisible]   = useState(false);
  const [householdVisible, setHouseholdVisible] = useState(false);
  const [editingTx, setEditingTx]           = useState(null);
  const [scopeFilter, setScopeFilter]       = useState('all'); // 'all' | 'mine' | 'household'

  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const userId = session?.user?.id;
  const householdId = household?.id ?? null;

  // Tracks whether we've successfully loaded at least once. When true,
  // subsequent focus events do a silent refresh (no full-screen spinner).
  const hasDataRef = useRef(false);

  const loadTransactions = useCallback(async () => {
    if (!userId) return;
    try {
      await applyRecurring(userId, householdId);
      const data = await getTransactions(userId, viewDate.getFullYear(), viewDate.getMonth() + 1, householdId);
      setTransactions(data);
      hasDataRef.current = true;
    } catch {
      alert('Error', 'No se pudieron cargar los movimientos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, viewDate, householdId]);

  useFocusEffect(
    useCallback(() => {
      // Spinner gigante solo en cold start; en cada re-focus, refresh silencioso.
      if (!hasDataRef.current) setLoading(true);
      loadTransactions();
    }, [loadTransactions])
  );

  async function handleDelete(tx) {
    try {
      await deleteTransaction(tx.id);
      setTransactions(prev => prev.filter(t => t.id !== tx.id));

      if (tx.recurring_id) {
        const msg = '¿Querés eliminar también la regla para que no se recree el mes que viene?';
        confirm({
          title: 'Gasto recurrente',
          message: msg,
          buttons: [
            { text: 'No, solo este mes', style: 'cancel' },
            {
              text: 'Eliminar regla', style: 'destructive',
              onPress: async () => {
                try { await deleteRecurring(tx.recurring_id); }
                catch { alert('Error', 'No se pudo eliminar la regla recurrente.'); }
              },
            },
          ],
        });
      }
    } catch {
      alert('Error', 'No se pudo eliminar.');
    }
  }

  function handleSaved(newTx) {
    setModalVisible(false);
    setEditingTx(null);
    const tDate = new Date(newTx.date + 'T12:00:00');
    if (tDate.getFullYear() === viewDate.getFullYear() && tDate.getMonth() === viewDate.getMonth()) {
      loadTransactions();
    }
  }


  // Filtrado por scope (Todo / Mías / Grupo)
  const filteredTxs = useMemo(() => {
    if (!household) return transactions; // sin grupo todo se considera "mío"
    if (scopeFilter === 'mine')      return transactions.filter(t => !t.household_id);
    if (scopeFilter === 'household') return transactions.filter(t => !!t.household_id);
    return transactions;
  }, [transactions, scopeFilter, household]);

  // Contadores por scope (para badges de las pills)
  const counts = useMemo(() => {
    if (!household) return { all: transactions.length, mine: transactions.length, household: 0 };
    return {
      all: transactions.length,
      mine: transactions.filter(t => !t.household_id).length,
      household: transactions.filter(t => t.household_id === household.id).length,
    };
  }, [transactions, household]);

  // Label del balance según scope
  const balanceLabel = useMemo(() => {
    if (!household || scopeFilter === 'all') return L.balance;
    if (scopeFilter === 'mine')              return L.balanceMine;
    return `${L.balanceHh} — ${household.name}`;
  }, [household, scopeFilter, L]);

  // Breakdown por miembro: agrupa expenses del scope actual por user_id
  const memberBreakdown = useMemo(() => {
    if (!household) return null;
    if (scopeFilter === 'mine') return null;
    const expensesByMember = {};
    filteredTxs
      .filter(t => t.type === 'expense' && (scopeFilter === 'household' ? t.household_id === household.id : true))
      .forEach(t => {
        expensesByMember[t.user_id] = (expensesByMember[t.user_id] || 0) + Number(t.amount);
      });
    const entries = Object.entries(expensesByMember)
      .map(([mid, amt]) => ({ member: getMemberById(mid), amount: amt }))
      .filter(x => x.member && x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    if (entries.length < 2) return null;
    const total = entries.reduce((s, x) => s + x.amount, 0);
    return { entries, total };
  }, [filteredTxs, household, scopeFilter, getMemberById]);

  // Balance personal vs hogar (separados solo si hay grupo)
  const personalIncome   = transactions.filter(t => !t.household_id && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const personalExpenses = transactions.filter(t => !t.household_id && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const householdIncome   = transactions.filter(t => t.household_id && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const householdExpenses = transactions.filter(t => t.household_id && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // Income / expenses respetan el scope filter (la card de balance refleja lo que se ve)
  const income = !household || scopeFilter === 'all'
    ? personalIncome + householdIncome
    : scopeFilter === 'mine'
      ? personalIncome
      : householdIncome;
  const expenses = !household || scopeFilter === 'all'
    ? personalExpenses + householdExpenses
    : scopeFilter === 'mine'
      ? personalExpenses
      : householdExpenses;
  const balance = income - expenses;

  const sections = useMemo(() => groupByDate(filteredTxs, L, lang), [filteredTxs, L, lang]);
  const s = useMemo(() => createStyles(theme), [theme]);

  const ListHeader = (
    <>
      {/* Pills de filtro (solo si hay grupo) — con contadores */}
      {household && (
        <View style={s.pillsRow}>
          {[
            { key: 'all',       label: L.pillAll,  count: counts.all },
            { key: 'mine',      label: L.pillMine, count: counts.mine },
            { key: 'household', label: L.pillHh,   count: counts.household },
          ].map(p => {
            const active = scopeFilter === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[s.pill, active && { backgroundColor: theme.accent }]}
                onPress={() => setScopeFilter(p.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.pillText, { color: active ? '#fff' : theme.subtext }]}>
                  {p.label}
                </Text>
                <View style={[s.pillBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.input }]}>
                  <Text style={[s.pillBadgeText, { color: active ? '#fff' : theme.subtext }]}>
                    {p.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Balance card */}
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>{balanceLabel.toUpperCase()}</Text>
        <Text style={[s.balanceAmount, { color: balance >= 0 ? theme.income : theme.expense }]}>
          {balance >= 0 ? '' : '-'}{formatMoney(balance)}
        </Text>
        {/* Green decorative bar */}
        <View style={s.balanceBar}>
          <View style={[s.balanceBarFill, { backgroundColor: theme.income }]} />
        </View>

        {household && scopeFilter === 'all' && (
          <View style={s.splitRow}>
            <View style={s.splitItem}>
              <Text style={[s.splitLabel, { color: theme.subtext }]}>{L.balanceMine}</Text>
              <Text style={[s.splitValue, { color: theme.text }]}>
                {formatMoney(personalIncome - personalExpenses)}
              </Text>
            </View>
            <View style={s.splitItem}>
              <Text style={[s.splitLabel, { color: theme.subtext }]}>{L.balanceHh}</Text>
              <Text style={[s.splitValue, { color: theme.text }]}>
                {formatMoney(householdIncome - householdExpenses)}
              </Text>
            </View>
          </View>
        )}

        {/* Breakdown por miembro: stacked bar + filas */}
        {memberBreakdown && (
          <View style={s.memberBreakdown}>
            <Text style={[s.memberBreakdownTitle, { color: theme.subtext }]}>
              {L.spendingByMember.toUpperCase()}
            </Text>
            <View style={s.stackedBar}>
              {memberBreakdown.entries.map(({ member, amount }, i) => (
                <View
                  key={member.user_id}
                  style={{
                    height: '100%',
                    width: `${(amount / memberBreakdown.total) * 100}%`,
                    backgroundColor: member.color,
                    borderRightWidth: i < memberBreakdown.entries.length - 1 ? 1 : 0,
                    borderRightColor: 'rgba(255,255,255,0.5)',
                  }}
                />
              ))}
            </View>
            {memberBreakdown.entries.map(({ member, amount }) => (
              <View key={member.user_id} style={s.memberRow}>
                <AuthorBadge member={member} size="sm" />
                <Text style={[s.memberName, { color: theme.text }]} numberOfLines={1}>
                  {member.display_name}
                </Text>
                <Text style={[s.memberPct, { color: theme.subtext }]}>
                  {Math.round((amount / memberBreakdown.total) * 100)}%
                </Text>
                <Text style={[s.memberAmount, { color: theme.text }]}>
                  {formatMoney(amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <View style={s.badgeGreen}>
              <Text style={s.badgeGreenText}>↑</Text>
            </View>
            <Text style={[s.summaryLabel, { color: theme.subtext }]}>{L.income}</Text>
            <Text style={[s.summaryValue, { color: theme.income }]}>{formatMoney(income)}</Text>
          </View>
          <View style={[s.summaryDivider, { backgroundColor: theme.divider }]} />
          <View style={s.summaryItem}>
            <View style={s.badgePink}>
              <Text style={s.badgePinkText}>↓</Text>
            </View>
            <Text style={[s.summaryLabel, { color: theme.subtext }]}>{L.expenses}</Text>
            <Text style={[s.summaryValue, { color: theme.expense }]}>{formatMoney(expenses)}</Text>
          </View>
        </View>
      </View>

      <AIInsightCard
        theme={theme}
        userId={userId}
        transactions={filteredTxs}
        L={L}
        lang={lang}
        viewDate={viewDate}
        householdId={household?.id || null}
      />
    </>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.header} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => setRecurringVisible(true)}>
            <Text style={s.headerIconText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => setSettingsVisible(true)}>
            <Text style={s.headerIconText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <View style={s.headerCenter}>
          <Text style={s.headerLeaf}>🍃</Text>
          <Text style={s.headerTitle}>Spendly</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {household && (
            <TouchableOpacity
              style={[s.headerIconBtn, { backgroundColor: 'rgba(139,92,246,0.25)' }]}
              onPress={() => setHouseholdVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={s.headerIconText}>👥</Text>
              <View style={s.groupBtnDot} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.headerIconBtn} onPress={() => setHistoryVisible(true)}>
            <Text style={s.headerIconText}>📅</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Month selector */}
      <View style={s.monthRow}>
        <TouchableOpacity onPress={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={s.monthBtn}>
          <Text style={s.monthArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.monthLabel}>
          {MONTHS[lang][viewDate.getMonth()]} {viewDate.getFullYear()}
        </Text>
        <TouchableOpacity onPress={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={s.monthBtn}>
          <Text style={s.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.accent} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={item => item.date}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 56 }}>💸</Text>
              <Text style={[s.emptyTitle, { color: theme.subtext }]}>{L.emptyTitle}</Text>
              <Text style={[s.emptyHint, { color: theme.emptyText }]}>{L.emptyHint}</Text>
            </View>
          }
          renderItem={({ item: section }) => (
            <View>
              <Text style={[s.sectionHeader, { color: theme.sectionText }]}>{section.label}</Text>
              {section.data.map(tx => {
                const author = tx.household_id ? getMemberById(tx.user_id) : null;
                const canEdit = tx.user_id === userId;
                return (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    theme={theme}
                    L={L}
                    lang={lang}
                    author={author}
                    canEdit={canEdit}
                    onDelete={() => handleDelete(tx)}
                    onEdit={() => { setEditingTx(tx); setModalVisible(true); }}
                  />
                );
              })}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadTransactions(); }}
              tintColor={theme.accent}
            />
          }
          ListFooterComponent={
            filteredTxs.length > 0 ? (
              <View style={[s.allCaughtUp, { borderColor: theme.cardBorder }]}>
                <Text style={s.allCaughtUpEmoji}>🌱</Text>
                <Text style={[s.allCaughtUpTitle, { color: theme.text }]}>{L.allCaughtUp}</Text>
                <Text style={[s.allCaughtUpSub, { color: theme.subtext }]}>
                  {L.txsThisMonth.replace('{n}', filteredTxs.length)}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 110 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => { setEditingTx(null); setModalVisible(true); }}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      <AddTransactionModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingTx(null); }}
        onSaved={handleSaved}
        userId={userId}
        editTransaction={editingTx}
      />
      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        userId={userId}
      />
      <RecurringModal
        visible={recurringVisible}
        onClose={() => setRecurringVisible(false)}
        userId={userId}
      />
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        session={session}
      />
      <HouseholdModal
        visible={householdVisible}
        currentUserId={userId}
        onClose={() => setHouseholdVisible(false)}
      />
    </View>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    // Header
    header: {
      backgroundColor: t.header,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    },
    headerIconBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    headerIconText: { fontSize: 18 },
    groupBtnDot: {
      position: 'absolute', top: 6, right: 6,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: '#22c55e',
      borderWidth: 1.5, borderColor: t.header,
    },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerLeaf: { fontSize: 20 },
    headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

    // Month row
    monthRow: {
      backgroundColor: t.header,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 18,
    },
    monthBtn: { padding: 6 },
    monthArrow: { color: 'rgba(255,255,255,0.7)', fontSize: 28, lineHeight: 30, fontWeight: '300' },
    monthLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Pills filtro grupo
    pillsRow: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 16, marginTop: 12, marginBottom: 4,
    },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 18, backgroundColor: t.card,
      borderWidth: 1, borderColor: t.cardBorder,
    },
    pillText: { fontSize: 13, fontWeight: '700' },
    pillBadge: {
      borderRadius: 9, minWidth: 18, paddingHorizontal: 6, paddingVertical: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    pillBadgeText: { fontSize: 11, fontWeight: '700' },

    // Breakdown por miembro
    memberBreakdown: {
      marginTop: 14, paddingTop: 14,
      borderTopWidth: 1, borderTopColor: t.divider,
    },
    memberBreakdownTitle: {
      fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
      marginBottom: 10,
    },
    stackedBar: {
      flexDirection: 'row', height: 8, borderRadius: 4,
      overflow: 'hidden', backgroundColor: t.input,
      marginBottom: 10,
    },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 4,
    },
    memberName: { flex: 1, fontSize: 13, fontWeight: '600' },
    memberPct: { fontSize: 12, fontWeight: '700', width: 40, textAlign: 'right' },
    memberAmount: { fontSize: 13, fontWeight: '800', minWidth: 60, textAlign: 'right' },

    // Footer "estás al día"
    allCaughtUp: {
      alignSelf: 'center', alignItems: 'center',
      marginTop: 20, marginHorizontal: 20, padding: 20,
      borderRadius: 18,
      borderWidth: 1, borderStyle: 'dashed',
      backgroundColor: 'rgba(22,163,74,0.04)',
      maxWidth: 320,
    },
    allCaughtUpEmoji: { fontSize: 32, marginBottom: 8 },
    allCaughtUpTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    allCaughtUpSub: { fontSize: 12, fontWeight: '500', textAlign: 'center' },

    // Split personal/hogar dentro del balance card
    splitRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
    splitItem: {
      flex: 1, padding: 10, borderRadius: 10,
      backgroundColor: t.input, alignItems: 'center',
    },
    splitLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    splitValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },

    // Balance card
    balanceCard: {
      backgroundColor: t.card, margin: 16, borderRadius: 20, padding: 20,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: t.dark ? 0 : 0.07, shadowRadius: 10, elevation: t.dark ? 0 : 3,
    },
    balanceLabel: {
      textAlign: 'center', fontSize: 11, fontWeight: '700',
      color: t.subtext, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
    },
    balanceAmount: { fontSize: 34, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
    balanceBar: {
      height: 3, backgroundColor: t.input, borderRadius: 2,
      marginTop: 10, marginBottom: 16, overflow: 'hidden',
    },
    balanceBarFill: { height: 3, borderRadius: 2, width: '100%' },
    summaryRow: { flexDirection: 'row', alignItems: 'center' },
    summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
    summaryDivider: { width: 1, height: 48, marginHorizontal: 16 },
    summaryLabel: { fontSize: 12, fontWeight: '600' },
    summaryValue: { fontSize: 15, fontWeight: '800' },
    badgeGreen: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center',
    },
    badgeGreenText: { fontSize: 16, fontWeight: '800', color: '#16a34a', lineHeight: 20 },
    badgePink: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: '#fce7f0', alignItems: 'center', justifyContent: 'center',
    },
    badgePinkText: { fontSize: 16, fontWeight: '800', color: '#e11d48', lineHeight: 20 },

    // Section header
    sectionHeader: {
      paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
      fontSize: 11, fontWeight: '700', letterSpacing: 1,
    },

    // Empty state
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 48, gap: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700' },
    emptyHint: { fontSize: 14 },

    // FAB
    fab: {
      position: 'absolute', bottom: 28, right: 24,
      width: 58, height: 58, borderRadius: 29,
      backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#16a34a', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
    },
    fabText: { color: '#fff', fontSize: 32, lineHeight: 36, fontWeight: '300' },
  });
}
