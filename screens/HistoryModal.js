import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, StatusBar,
} from 'react-native';
import { getTransactionsByYear } from '../services/transactions';
import { useTheme } from '../services/theme';
import { formatMoney } from '../services/format';

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function groupByMonth(transactions) {
  const byMonth = {};
  transactions.forEach(tx => {
    const m = parseInt(tx.date.split('-')[1], 10);
    if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 };
    if (tx.type === 'income') byMonth[m].income += Number(tx.amount);
    else                      byMonth[m].expense += Number(tx.amount);
  });

  const result = [];
  for (let m = 12; m >= 1; m--) {
    if (byMonth[m]) {
      result.push({
        month: m,
        label: MONTHS_ES[m - 1],
        income:  byMonth[m].income,
        expense: byMonth[m].expense,
        balance: byMonth[m].income - byMonth[m].expense,
      });
    }
  }
  return result;
}

export default function HistoryModal({ visible, onClose, userId }) {
  const { theme } = useTheme();
  const currentYear = new Date().getFullYear();
  const [year, setYear]           = useState(currentYear);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    load();
  }, [visible, year, userId]);

  async function load() {
    setLoading(true);
    setTransactions([]);
    try {
      const data = await getTransactionsByYear(userId, year);
      setTransactions(data);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  const monthlyData = useMemo(() => groupByMonth(transactions), [transactions]);

  const totalIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const totalBalance = totalIncome - totalExpense;

  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.header} />
      <View style={s.container}>
        <View style={s.handle} />

        {/* Cabecera */}
        <View style={s.titleRow}>
          <Text style={s.title}>📊 Resumen histórico</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Selector de año */}
        <View style={s.yearRow}>
          <TouchableOpacity onPress={() => setYear(y => y - 1)} style={s.yearBtn}>
            <Text style={s.yearArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={s.yearLabel}>{year}</Text>
          <TouchableOpacity
            onPress={() => setYear(y => y + 1)}
            style={s.yearBtn}
            disabled={year >= currentYear}
          >
            <Text style={[s.yearArrow, year >= currentYear && s.yearArrowDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Totales anuales */}
        {!loading && transactions.length > 0 && (
          <View style={s.annualCard}>
            <Text style={s.annualTitle}>Total {year}</Text>
            <Text style={[s.annualBalance, { color: totalBalance >= 0 ? theme.income : theme.expense }]}>
              {totalBalance >= 0 ? '' : '-'}{formatMoney(totalBalance)}
            </Text>
            <View style={s.annualRow}>
              <View style={s.annualItem}>
                <Text style={[s.annualArrow, { color: theme.income }]}>↑</Text>
                <Text style={s.annualSub}>Ingresos</Text>
                <Text style={[s.annualVal, { color: theme.income }]}>{formatMoney(totalIncome)}</Text>
              </View>
              <View style={[s.annualDivider]} />
              <View style={s.annualItem}>
                <Text style={[s.annualArrow, { color: theme.expense }]}>↓</Text>
                <Text style={s.annualSub}>Gastos</Text>
                <Text style={[s.annualVal, { color: theme.expense }]}>{formatMoney(totalExpense)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Lista mensual */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.accent} />
        ) : monthlyData.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🗓️</Text>
            <Text style={s.emptyText}>Sin movimientos en {year}</Text>
          </View>
        ) : (
          <FlatList
            data={monthlyData}
            keyExtractor={item => String(item.month)}
            contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, paddingTop: 8 }}
            renderItem={({ item }) => (
              <View style={s.monthCard}>
                <View style={s.monthHeader}>
                  <Text style={s.monthName}>{item.label}</Text>
                  <Text style={[s.monthBalance, { color: item.balance >= 0 ? theme.income : theme.expense }]}>
                    {item.balance >= 0 ? '+' : '-'}{formatMoney(item.balance)}
                  </Text>
                </View>
                <View style={s.monthDetail}>
                  <View style={s.monthDetailItem}>
                    <Text style={[s.detailArrow, { color: theme.income }]}>↑</Text>
                    <Text style={[s.detailVal, { color: theme.income }]}>{formatMoney(item.income)}</Text>
                  </View>
                  <View style={s.monthDetailItem}>
                    <Text style={[s.detailArrow, { color: theme.expense }]}>↓</Text>
                    <Text style={[s.detailVal, { color: theme.expense }]}>{formatMoney(item.expense)}</Text>
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.divider,
      marginBottom: 16,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    title: { fontSize: 20, fontWeight: '800', color: t.text },
    closeBtn: { fontSize: 18, color: t.subtext },

    // Año
    yearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      gap: 16,
    },
    yearBtn: { padding: 8 },
    yearArrow: { fontSize: 30, color: t.accent, lineHeight: 32 },
    yearArrowDisabled: { color: t.divider },
    yearLabel: { fontSize: 22, fontWeight: '800', color: t.text, minWidth: 70, textAlign: 'center' },

    // Card anual
    annualCard: {
      backgroundColor: t.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: t.dark ? 1 : 0,
      borderColor: t.cardBorder,
    },
    annualTitle: { color: t.subtext, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
    annualBalance: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
    annualRow: { flexDirection: 'row' },
    annualItem: { flex: 1, alignItems: 'center' },
    annualDivider: { width: 1, backgroundColor: t.divider },
    annualArrow: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
    annualSub: { color: t.subtext, fontSize: 11, fontWeight: '600' },
    annualVal: { fontSize: 14, fontWeight: '700', marginTop: 2 },

    // Vacío
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 56, marginBottom: 12 },
    emptyText: { fontSize: 16, color: t.emptyText, fontWeight: '600' },

    // Card mensual
    monthCard: {
      backgroundColor: t.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      borderWidth: t.dark ? 1 : 0,
      borderColor: t.cardBorder,
    },
    monthHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    monthName: { fontSize: 16, fontWeight: '700', color: t.text },
    monthBalance: { fontSize: 16, fontWeight: '800' },
    monthDetail: { flexDirection: 'row', gap: 16 },
    monthDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    detailArrow: { fontSize: 14, fontWeight: '800' },
    detailVal: { fontSize: 13, fontWeight: '600' },
  });
}
