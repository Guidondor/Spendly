import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { useAlert } from '../components/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../services/theme';
import { getTransactions } from '../services/transactions';
import { getCategoryByKey } from '../services/categories';
import { CategoryIcon } from '../services/categories';
import { LABELS, MONTHS, MONTHS_SHORT } from '../constants/i18n';
import { formatMoney } from '../services/format';
import { useHousehold } from '../components/HouseholdProvider';


function formatCompact(n) {
  if (n === 0) return '';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function donutSegmentPath(cx, cy, r, ri, startAngle, endAngle) {
  const toRad = a => (a * Math.PI) / 180;
  const sa = toRad(startAngle - 90);
  const ea = toRad(endAngle - 90);
  const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
  const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
  const ix1 = cx + ri * Math.cos(ea), iy1 = cy + ri * Math.sin(ea);
  const ix2 = cx + ri * Math.cos(sa), iy2 = cy + ri * Math.sin(sa);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ri} ${ri} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

function DonutChart({ data, total, size = 180, theme }) {
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 8, ri = r - 36;

  if (!total || data.length === 0) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={theme.input} strokeWidth="2" fill="none" />
        <Circle cx={cx} cy={cy} r={ri - 4} fill={theme.card} />
      </Svg>
    );
  }

  let currentAngle = 0;
  const segments = data.map(item => {
    const angle = (item.amount / total) * 360;
    const start = currentAngle;
    currentAngle += angle;
    return { ...item, startAngle: start, endAngle: currentAngle };
  });

  return (
    <Svg width={size} height={size}>
      {segments.map((seg) => (
        <Path
          key={seg.key}
          d={donutSegmentPath(cx, cy, r, ri, seg.startAngle, seg.endAngle)}
          fill={seg.color}
        />
      ))}
      <Circle cx={cx} cy={cy} r={ri - 2} fill={theme.card} />
    </Svg>
  );
}

export default function ChartsScreen({ route }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert } = useAlert();
  const { household } = useHousehold();
  const userId = route?.params?.userId;
  const householdId = household?.id ?? null;

  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setLoading(true);
      getTransactions(userId, viewDate.getFullYear(), viewDate.getMonth() + 1, householdId)
        .then(data => setTransactions(data))
        .catch(() => alert('Error', 'No se pudieron cargar los movimientos.'))
        .finally(() => setLoading(false));
    }, [userId, viewDate, householdId])
  );

  const expenses = transactions.filter(t => t.type === 'expense');
  const totalExpense = expenses.reduce((s, t) => s + Number(t.amount), 0);

  const byCategory = useMemo(() => {
    const map = {};
    expenses.forEach(t => {
      if (!map[t.category]) map[t.category] = 0;
      map[t.category] += Number(t.amount);
    });
    return Object.entries(map)
      .map(([key, amount]) => {
        const cat = getCategoryByKey(key, lang);
        return { key, name: cat.name, color: cat.color, amount };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.header} />

      <View style={s.header}>
        <Text style={s.headerTitle}>{L.chartsTitle}</Text>
      </View>

      {/* Month selector */}
      <View style={[s.monthRow, { backgroundColor: theme.header }]}>
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>

          {/* By Category card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>{L.byCategory.toUpperCase()}</Text>
            {totalExpense === 0 ? (
              <Text style={s.emptyText}>{L.noExpenses}</Text>
            ) : (
              <>
                {/* Donut + legend */}
                <View style={s.donutRow}>
                  <DonutChart data={byCategory} total={totalExpense} size={160} theme={theme} />
                  <View style={s.legend}>
                    {byCategory.slice(0, 6).map(item => (
                      <View key={item.key} style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: item.color }]} />
                        <Text style={[s.legendName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[s.legendPct, { color: theme.subtext }]}>
                          {Math.round((item.amount / totalExpense) * 100)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                {/* Total below donut */}
                <View style={s.expensesTotal}>
                  <Text style={s.expensesTotalLabel}>{L.expenses.toUpperCase()}</Text>
                  <Text style={s.expensesTotalAmount}>{formatMoney(totalExpense)}</Text>
                </View>

                {/* Category breakdown list */}
                <View style={[s.divider, { backgroundColor: theme.divider }]} />
                {byCategory.map(item => {
                  const pct = (item.amount / totalExpense) * 100;
                  return (
                    <View key={item.key} style={s.catRow}>
                      <View style={[s.catIconWrap, { backgroundColor: item.color + '20' }]}>
                        <CategoryIcon catKey={item.key} size={16} color={item.color} />
                      </View>
                      <View style={s.catInfo}>
                        <View style={s.catHeader}>
                          <Text style={[s.catName, { color: theme.text }]}>{item.name}</Text>
                          <Text style={[s.catAmount, { color: theme.expense }]}>{formatMoney(item.amount)}</Text>
                        </View>
                        <View style={[s.progressTrack, { backgroundColor: theme.input }]}>
                          <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* Monthly trend */}
          <MonthlyBars userId={userId} householdId={householdId} theme={theme} currentDate={viewDate} lang={lang} />
        </ScrollView>
      )}
    </View>
  );
}

function MonthlyBars({ userId, householdId, theme, currentDate, lang }) {
  const L = LABELS[lang];
  const { alert } = useAlert();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS_SHORT[lang][d.getMonth()].toUpperCase() });
      }
      setLoading(true);
      Promise.all(months.map(m => getTransactions(userId, m.year, m.month, householdId)))
        .then(results => {
          setData(months.map((m, i) => {
            const txs = results[i];
            const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
            const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
            return { ...m, income: inc, expense: exp };
          }));
        })
        .catch(() => alert('Error', 'No se pudieron cargar los datos mensuales.'))
        .finally(() => setLoading(false));
    }, [userId, householdId, currentDate])
  );

  if (loading) return <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 16 }} />;
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
  const BAR_H = 100;
  const s = createStyles(theme);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{L.monthlyTrend.toUpperCase()}</Text>
      <View style={s.barChart}>
        {data.map((item) => (
          <View key={`${item.year}-${item.month}`} style={s.barGroup}>
            <View style={s.barPair}>
              <View style={s.barColumn}>
                {item.income > 0 && (
                  <Text style={[s.barValue, { color: theme.income }]}>{formatCompact(item.income)}</Text>
                )}
                <View style={[s.bar, {
                  height: Math.max(4, (item.income / maxVal) * BAR_H),
                  backgroundColor: theme.income + 'cc',
                }]} />
              </View>
              <View style={s.barColumn}>
                {item.expense > 0 && (
                  <Text style={[s.barValue, { color: theme.expense }]}>{formatCompact(item.expense)}</Text>
                )}
                <View style={[s.bar, {
                  height: Math.max(4, (item.expense / maxVal) * BAR_H),
                  backgroundColor: theme.expense + 'cc',
                }]} />
              </View>
            </View>
            <Text style={[s.barLabel, { color: theme.subtext }]}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={s.barLegend}>
        <View style={s.barLegendItem}>
          <View style={[s.barLegendDot, { backgroundColor: theme.income }]} />
          <Text style={[s.barLegendText, { color: theme.subtext }]}>{L.income}</Text>
        </View>
        <View style={s.barLegendItem}>
          <View style={[s.barLegendDot, { backgroundColor: theme.expense }]} />
          <Text style={[s.barLegendText, { color: theme.subtext }]}>{L.expenses}</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      backgroundColor: t.header, paddingTop: 52,
      paddingHorizontal: 20, paddingBottom: 8,
    },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 16,
    },
    monthBtn: { padding: 6 },
    monthArrow: { color: 'rgba(255,255,255,0.7)', fontSize: 28, lineHeight: 30, fontWeight: '300' },
    monthLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
    card: {
      backgroundColor: t.card, borderRadius: 20, padding: 16,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: t.dark ? 0 : 0.06, shadowRadius: 8, elevation: t.dark ? 0 : 2,
    },
    cardTitle: {
      fontSize: 11, fontWeight: '800', letterSpacing: 1,
      color: t.subtext, marginBottom: 14,
    },
    emptyText: { color: t.emptyText, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    legend: { flex: 1, gap: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    legendName: { flex: 1, fontSize: 12, fontWeight: '600' },
    legendPct: { fontSize: 12, fontWeight: '600', minWidth: 30, textAlign: 'right' },
    expensesTotal: { alignItems: 'center', marginTop: 10, marginBottom: 4 },
    expensesTotalLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: t.subtext },
    expensesTotalAmount: { fontSize: 22, fontWeight: '800', color: t.expense, marginTop: 2 },
    divider: { height: 1, marginVertical: 14 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    catIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    catInfo: { flex: 1 },
    catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    catName: { fontSize: 14, fontWeight: '600' },
    catAmount: { fontSize: 14, fontWeight: '700' },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    barChart: {
      flexDirection: 'row', alignItems: 'flex-end',
      justifyContent: 'space-between', height: 140, paddingTop: 8,
    },
    barGroup: { flex: 1, alignItems: 'center' },
    barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    barColumn: { alignItems: 'center', justifyContent: 'flex-end' },
    barValue: { fontSize: 7, fontWeight: '700', marginBottom: 2 },
    bar: { width: 12, borderRadius: 6 },
    barLabel: { fontSize: 10, marginTop: 6, fontWeight: '700' },
    barLegend: { flexDirection: 'row', gap: 20, marginTop: 12 },
    barLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    barLegendDot: { width: 10, height: 10, borderRadius: 5 },
    barLegendText: { fontSize: 12, fontWeight: '600' },
  });
}
