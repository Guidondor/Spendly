import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAlert } from '../components/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../services/theme';
import { getTransactions } from '../services/transactions';
import { getBudgets, setBudget } from '../services/budgets';
import { EXPENSE_CATEGORIES, CategoryIcon, getCategoryByKey } from '../services/categories';
import { LABELS, MONTHS } from '../constants/i18n';
import { formatMoney } from '../services/format';
import { useHousehold } from '../components/HouseholdProvider';
import AuthorBadge from '../components/AuthorBadge';

// Header de sección con ícono fuerte (👤 = personal, 👥 = grupo)
function SectionHeader({ icon, title, subtitle, theme }) {
  return (
    <View style={shStyle.row}>
      <View style={[shStyle.iconWrap, { backgroundColor: theme.input }]}>
        <Text style={shStyle.icon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[shStyle.title, { color: theme.text }]}>{title.toUpperCase()}</Text>
        {subtitle ? (
          <Text style={[shStyle.subtitle, { color: theme.subtext }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const shStyle = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 4, marginBottom: 8, paddingHorizontal: 2,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 16 },
  title: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  subtitle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
});

// Helper: renderiza una card de categoría con su barra de progreso.
function renderBudgetCard({ cat, scope, spent, budget, author, onPress, s, theme, L }) {
  const budgetAmt = budget ? Number(budget.amount) : 0;
  const pct = budgetAmt > 0 ? (spent / budgetAmt) * 100 : 0;
  const isOver = budgetAmt > 0 && spent > budgetAmt;
  const isNear = budgetAmt > 0 && pct >= 80 && !isOver;
  const key = `${scope}-${cat.key}`;
  return (
    <View key={key} style={s.card}>
      <View style={s.cardRow}>
        <View style={[s.iconWrap, { backgroundColor: cat.color + '18' }]}>
          <CategoryIcon catKey={cat.key} size={20} color={cat.color} />
        </View>
        <View style={s.cardInfo}>
          <View style={s.cardTopRow}>
            <Text style={s.catName}>{cat.name}</Text>
            {isOver ? (
              <View style={s.badgeOver}><Text style={s.badgeOverText}>{L.overBudget}</Text></View>
            ) : isNear ? (
              <View style={s.badgeNear}><Text style={s.badgeNearText}>{L.nearLimit}</Text></View>
            ) : null}
          </View>
          {budgetAmt > 0 ? (
            <Text style={s.amountLine}>
              <Text style={{ color: isOver ? theme.expense : theme.text, fontWeight: '700' }}>
                {formatMoney(spent)}
              </Text>
              <Text style={{ color: theme.subtext }}> {L.budgetOf} {formatMoney(budgetAmt)}</Text>
            </Text>
          ) : (
            <Text style={s.noBudget}>
              {spent > 0 ? formatMoney(spent) + ' ' + L.spent.toLowerCase() : L.noBudget}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.editBtn, { backgroundColor: theme.input }]}
          onPress={onPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[s.editBtnText, { color: theme.subtext }]}>✏️</Text>
        </TouchableOpacity>
      </View>
      {budgetAmt > 0 && (
        <>
          <View style={[s.progressTrack, { backgroundColor: theme.input, marginTop: 12 }]}>
            {isOver ? (
              <View style={{ flexDirection: 'row', flex: 1, height: 6 }}>
                <View style={[s.progressFill, {
                  width: `${(budgetAmt / spent) * 100}%`,
                  backgroundColor: cat.color,
                }]} />
                <View style={{ width: 2, backgroundColor: '#fff' }} />
                <View style={[s.progressFill, { flex: 1, backgroundColor: theme.expense }]} />
              </View>
            ) : (
              <View style={[s.progressFill, {
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: isNear ? '#f59e0b' : cat.color,
              }]} />
            )}
          </View>
          <Text style={[s.remainingText, { color: isOver ? theme.expense : theme.subtext }]}>
            {isOver
              ? `-${formatMoney(spent - budgetAmt)} ${L.overBudget.toLowerCase()}`
              : `${formatMoney(budgetAmt - spent)} ${L.remaining}`}
          </Text>
        </>
      )}
      {scope === 'household' && author && budgetAmt > 0 && (
        <View style={s.authorFooter}>
          <AuthorBadge member={author} size="sm" />
          <Text style={[s.authorText, { color: theme.subtext }]}>
            {L.definedBy}{' '}
            <Text style={{ color: author.color, fontWeight: '700' }}>
              {author.display_name}
            </Text>
          </Text>
        </View>
      )}
    </View>
  );
}


export default function BudgetsScreen({ route }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert } = useAlert();
  const { household, members, getMemberById } = useHousehold();
  const userId = route?.params?.userId;
  const householdId = household?.id ?? null;

  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgetsList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [editScope, setEditScope] = useState('mine'); // 'mine' | 'household'
  const [budgetInput, setBudgetInput] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setLoading(true);
      const m = viewDate.getMonth() + 1;
      const y = viewDate.getFullYear();
      Promise.all([
        getTransactions(userId, y, m, householdId),
        getBudgets(userId, m, y, householdId),
      ])
        .then(([txs, bdgs]) => { setTransactions(txs); setBudgetsList(bdgs); })
        .catch(() => alert('Error', L.budgetsLoadFailed))
        .finally(() => setLoading(false));
    }, [userId, viewDate, householdId])
  );

  // Gastado por categoría — separado por scope.
  // Privado: txs con household_id NULL y user_id = userId.
  // Hogar: txs con household_id = household.id (suma de todos los miembros).
  const spentPrivateByCategory = useMemo(() => {
    const map = {};
    transactions
      .filter(t => t.type === 'expense' && !t.household_id && t.user_id === userId)
      .forEach(t => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [transactions, userId]);

  const spentSharedByCategory = useMemo(() => {
    const map = {};
    transactions
      .filter(t => t.type === 'expense' && !!t.household_id)
      .forEach(t => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [transactions]);

  // Categorías con nombre traducido al idioma actual.
  const localizedCategories = useMemo(
    () => EXPENSE_CATEGORIES.map(c => ({ ...c, name: getCategoryByKey(c.key, lang).name })),
    [lang]
  );

  function getBudgetFor(catKey, scope) {
    if (scope === 'household') {
      return budgets.find(b => b.category === catKey && b.household_id === householdId);
    }
    return budgets.find(b => b.category === catKey && !b.household_id && b.user_id === userId);
  }

  function openEdit(cat, scope) {
    const b = getBudgetFor(cat.key, scope);
    setEditCat(cat);
    setEditScope(scope);
    setBudgetInput(b ? String(b.amount) : '');
    setModalVisible(true);
  }

  async function handleSave() {
    const parsed = parseFloat(budgetInput.replace(',', '.'));
    if (!budgetInput || isNaN(parsed) || parsed <= 0) {
      alert(L.budgetInvalidAmount, L.budgetAmountRequired);
      return;
    }
    setSaving(true);
    try {
      const m = viewDate.getMonth() + 1;
      const y = viewDate.getFullYear();
      await setBudget({
        userId,
        category: editCat.key,
        amount: parsed,
        month: m,
        year: y,
        householdId: editScope === 'household' ? householdId : null,
      });
      const updated = await getBudgets(userId, m, y, householdId);
      setBudgetsList(updated);
      setModalVisible(false);
    } catch {
      alert('Error', L.budgetSaveError);
    } finally {
      setSaving(false);
    }
  }

  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.header} />

      <View style={s.header}>
        <Text style={s.headerTitle}>{L.budgetsTitle}</Text>
        <Text style={s.headerSub}>
          {MONTHS[lang][viewDate.getMonth()]} {viewDate.getFullYear()}
        </Text>
      </View>

      <View style={[s.monthRow, { backgroundColor: theme.header }]}>
        <TouchableOpacity onPress={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={s.monthBtn}>
          <Text style={s.monthArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 40 }} />
        <TouchableOpacity onPress={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={s.monthBtn}>
          <Text style={s.monthArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}>
          {/* Sección: Mis presupuestos */}
          {household ? (
            <SectionHeader icon="👤" title={L.mySection} subtitle={L.mySectionSub} theme={theme} />
          ) : (
            <Text style={s.sectionHeader}>{L.budgetsTitle.toUpperCase()}</Text>
          )}
          {localizedCategories.map(cat =>
            renderBudgetCard({
              cat, scope: 'mine',
              spent: spentPrivateByCategory[cat.key] || 0,
              budget: getBudgetFor(cat.key, 'mine'),
              author: null, // privadas no muestran autor
              onPress: () => openEdit(cat, 'mine'),
              s, theme, L,
            })
          )}

          {/* Sección: Presupuestos del grupo */}
          {household && (
            <>
              <View style={{ height: 6 }} />
              <SectionHeader icon="👥" title={L.hhSection} subtitle={household.name} theme={theme} />
              {localizedCategories.map(cat => {
                const budget = getBudgetFor(cat.key, 'household');
                const author = budget?.created_by ? getMemberById(budget.created_by) : null;
                return renderBudgetCard({
                  cat, scope: 'household',
                  spent: spentSharedByCategory[cat.key] || 0,
                  budget,
                  author,
                  onPress: () => openEdit(cat, 'household'),
                  s, theme, L,
                });
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Edit modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[s.modal, { backgroundColor: theme.card }]}>
            <View style={s.handle} />
            <View style={s.modalTitleRow}>
              {editCat && (
                <View style={[s.iconWrap, { backgroundColor: editCat.color + '18', marginRight: 12 }]}>
                  <CategoryIcon catKey={editCat?.key} size={20} color={editCat?.color} />
                </View>
              )}
              <Text style={[s.modalTitle, { color: theme.text }]}>
                {editCat?.name}
                {editScope === 'household' && household ? `  ·  ${household.name}` : ''}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[s.closeBtn, { color: theme.subtext }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.modalInput, { borderBottomColor: theme.accent, color: theme.inputText }]}
              placeholder="0,00"
              placeholderTextColor={theme.placeholderText}
              keyboardType="decimal-pad"
              value={budgetInput}
              onChangeText={setBudgetInput}
              autoFocus
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: theme.accentBtn }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>{L.save}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    sectionHeader: {
      fontSize: 11, fontWeight: '800', color: t.sectionText,
      letterSpacing: 0.8, marginBottom: 4, marginLeft: 4,
    },
    header: {
      backgroundColor: t.header,
      paddingTop: 52, paddingHorizontal: 20, paddingBottom: 4,
    },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500', marginTop: 2, marginBottom: 10 },
    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 24, paddingBottom: 14,
    },
    monthBtn: { padding: 6 },
    monthArrow: { color: 'rgba(255,255,255,0.7)', fontSize: 28, lineHeight: 30, fontWeight: '300' },
    card: {
      backgroundColor: t.card, borderRadius: 18, padding: 16,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: t.dark ? 0 : 0.05, shadowRadius: 6, elevation: t.dark ? 0 : 1,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardInfo: { flex: 1 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
    catName: { fontSize: 15, fontWeight: '700', color: t.text },
    badgeOver: {
      backgroundColor: '#fce7f0', borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 3,
    },
    badgeOverText: { fontSize: 11, fontWeight: '800', color: '#e11d48' },
    badgeNear: {
      backgroundColor: '#fef9c3', borderRadius: 20,
      paddingHorizontal: 10, paddingVertical: 3,
    },
    badgeNearText: { fontSize: 11, fontWeight: '800', color: '#a16207' },
    amountLine: { fontSize: 13 },
    noBudget: { fontSize: 13, color: t.subtext },
    editBtn: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    editBtnText: { fontSize: 14 },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 6, borderRadius: 3 },
    remainingText: { fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'right' },
    authorFooter: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 10, paddingTop: 8,
      borderTopWidth: 1, borderTopColor: t.divider,
    },
    authorText: { fontSize: 12, fontWeight: '500' },
    modal: { flex: 1, padding: 24, paddingTop: 12 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e4ede8', marginBottom: 24 },
    modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
    modalTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
    closeBtn: { fontSize: 18, marginLeft: 12 },
    modalInput: {
      fontSize: 36, fontWeight: '800',
      borderBottomWidth: 2, paddingBottom: 8, marginBottom: 36,
      color: t.inputText,
    },
    saveBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  });
}
