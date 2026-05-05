import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, StatusBar, Platform,
} from 'react-native';
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
import { applyRecurring, deleteRecurring } from '../services/recurring';
import { formatMoney } from '../services/format';


function formatSectionDate(dateStr) {
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

function groupByDate(transactions) {
  const groups = {};
  transactions.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, data]) => ({ date, label: formatSectionDate(date), data }));
}

// ─── Transaction item ─────────────────────────────────────────────────────────

function TransactionItem({ transaction, onDelete, onEdit, theme }) {
  const cat = getCategoryByKey(transaction.category, lang);
  const isIncome = transaction.type === 'income';

  function showMenu() {
    if (Platform.OS === 'web') {
      const edit = window.confirm(`${transaction.description}\n\nOK = Editar · Cancelar = Eliminar`);
      if (edit) {
        onEdit();
      } else {
        if (window.confirm(`¿Eliminás "${transaction.description}"?`)) onDelete();
      }
      return;
    }
    Alert.alert(
      transaction.description,
      'Seleccioná una opción',
      [
        { text: 'Editar', onPress: onEdit },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: () => Alert.alert(
            L.deleteTitle,
            `¿Eliminás "${transaction.description}"?`,
            [
              { text: L.cancel, style: 'cancel' },
              { text: L.deleteConfirm, style: 'destructive', onPress: onDelete },
            ]
          ),
        },
        { text: L.cancel, style: 'cancel' },
      ]
    );
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
        <Text style={[txStyle.category, { color: theme.subtext }]}>{cat.name}</Text>
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
  amount: { fontSize: 15, fontWeight: '700' },
});

// ─── AI Insights card ─────────────────────────────────────────────────────────

function AIInsightCard({ theme, userId, transactions }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || transactions.length === 0) return;
    const controller = new AbortController();
    loadInsight(controller.signal);
    return () => controller.abort();
  }, [userId, transactions.length]);

  async function loadInsight(signal) {
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
        setInsight(data.insight);
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

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [modalVisible, setModalVisible]     = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [recurringVisible, setRecurringVisible] = useState(false);
  const [settingsVisible, setSettingsVisible]   = useState(false);
  const [editingTx, setEditingTx]           = useState(null);

  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const userId = session?.user?.id;

  const loadTransactions = useCallback(async () => {
    if (!userId) return;
    try {
      await applyRecurring(userId);
      const data = await getTransactions(userId, viewDate.getFullYear(), viewDate.getMonth() + 1);
      setTransactions(data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los movimientos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, viewDate]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTransactions();
    }, [loadTransactions])
  );

  async function handleDelete(tx) {
    try {
      await deleteTransaction(tx.id);
      setTransactions(prev => prev.filter(t => t.id !== tx.id));

      if (tx.recurring_id) {
        const msg = '¿Querés eliminar también la regla para que no se recree el mes que viene?';
        if (Platform.OS === 'web') {
          if (window.confirm(msg)) await deleteRecurring(tx.recurring_id);
        } else {
          Alert.alert('Gasto recurrente', msg, [
            { text: 'No, solo este mes', style: 'cancel' },
            {
              text: 'Eliminar regla', style: 'destructive',
              onPress: async () => {
                try { await deleteRecurring(tx.recurring_id); }
                catch { Alert.alert('Error', 'No se pudo eliminar la regla recurrente.'); }
              },
            },
          ]);
        }
      }
    } catch {
      Alert.alert('Error', 'No se pudo eliminar.');
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


  const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const balance  = income - expenses;
  const sections = useMemo(() => groupByDate(transactions), [transactions]);
  const s = useMemo(() => createStyles(theme), [theme]);

  const ListHeader = (
    <>
      {/* Balance card */}
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>{L.balance.toUpperCase()}</Text>
        <Text style={[s.balanceAmount, { color: balance >= 0 ? theme.income : theme.expense }]}>
          {balance >= 0 ? '' : '-'}{formatMoney(balance)}
        </Text>
        {/* Green decorative bar */}
        <View style={s.balanceBar}>
          <View style={[s.balanceBarFill, { backgroundColor: theme.income }]} />
        </View>

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

      <AIInsightCard theme={theme} userId={userId} transactions={transactions} />
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

        <TouchableOpacity style={s.headerIconBtn} onPress={() => setHistoryVisible(true)}>
          <Text style={s.headerIconText}>📅</Text>
        </TouchableOpacity>
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
              {section.data.map(tx => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  theme={theme}
                  onDelete={() => handleDelete(tx)}
                  onEdit={() => { setEditingTx(tx); setModalVisible(true); }}
                />
              ))}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadTransactions(); }}
              tintColor={theme.accent}
            />
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
