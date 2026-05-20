import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAlert } from '../components/AppAlert';
import { addTransaction, updateTransaction } from '../services/transactions';
import { addRecurring } from '../services/recurring';
import { categorizeTransaction } from '../services/ai';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryByKey, CategoryIcon } from '../services/categories';
import { useTheme } from '../services/theme';
import { useHousehold } from '../components/HouseholdProvider';
import { LABELS } from '../constants/i18n';


function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

export default function AddTransactionModal({ visible, onClose, onSaved, userId, editTransaction }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert } = useAlert();
  const { household } = useHousehold();
  const isEditing = !!editTransaction;

  const [type, setType]                 = useState('expense');
  const [amount, setAmount]             = useState('');
  const [description, setDescription]   = useState('');
  const [category, setCategory]         = useState('other');
  const [saving, setSaving]             = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [aiSuggested, setAiSuggested]   = useState(false);
  const [isRecurring, setIsRecurring]   = useState(false);
  const [dayOfMonth, setDayOfMonth]     = useState(new Date().getDate());
  const [txDate, setTxDate]             = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isShared, setIsShared]         = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(String(editTransaction.amount));
      setDescription(editTransaction.description);
      setCategory(editTransaction.category);
      setAiSuggested(false);
      setTxDate(new Date(editTransaction.date + 'T12:00:00'));
      setIsShared(!!editTransaction.household_id);
    } else {
      setType('expense');
      setAmount('');
      setDescription('');
      setCategory('other');
      setAiSuggested(false);
      setIsRecurring(false);
      setDayOfMonth(new Date().getDate());
      setTxDate(new Date());
      setIsShared(false);
    }
    setShowDatePicker(false);
  }, [visible, editTransaction]);

  useEffect(() => {
    if (isEditing) return;
    if (saving) return;
    if (!description.trim() || description.length < 3) return;
    const timer = setTimeout(async () => {
      setCategorizing(true);
      const suggested = await categorizeTransaction(description, type);
      if (suggested) { setCategory(suggested); setAiSuggested(true); }
      setCategorizing(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [description, type, isEditing, saving]);

  function handleTypeChange(newType) {
    setType(newType);
    setCategory(newType === 'income' ? 'income' : 'other');
    setAiSuggested(false);
  }

  async function handleSave() {
    const cleaned = amount.trim().replace(/[^\d,.]/g, '');
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
    const parsed = parseFloat(normalized);
    if (!cleaned || isNaN(parsed) || parsed <= 0) {
      alert(L.invalidAmount, L.amountRequired);
      return;
    }
    if (!description.trim()) {
      alert(L.descEmpty, L.descRequired);
      return;
    }
    setSaving(true);
    try {
      let result;
      const dateStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      const householdId = (household && isShared) ? household.id : null;

      if (isEditing) {
        result = await updateTransaction(editTransaction.id, {
          amount: parsed, description: description.trim(), type, category,
          date: dateStr,
          household_id: householdId,
        });
      } else {
        let recurringId = null;
        if (isRecurring) {
          const rule = await addRecurring({
            userId, amount: parsed, description: description.trim(), type, category,
            day_of_month: dayOfMonth,
            householdId,
          });
          recurringId = rule.id;
        }
        result = await addTransaction({
          userId, amount: parsed, description: description.trim(), type, category,
          date: dateStr,
          recurring_id: recurringId,
          household_id: householdId,
        });
      }
      onSaved(result);
    } catch (e) {
      console.error('AddTransactionModal save error:', e);
      alert('Error', L.saveError);
    } finally {
      setSaving(false);
    }
  }

  const visibleCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <View style={s.handle} />
          <View style={s.titleRow}>
            <Text style={s.title}>{isEditing ? L.editTx : L.newTx}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Toggle gasto / ingreso */}
          <View style={s.typeToggle}>
            <TouchableOpacity
              style={[s.typeBtn, type === 'expense' && s.typeBtnExpense]}
              onPress={() => handleTypeChange('expense')}
            >
              <Text style={[s.typeBtnText, type === 'expense' && s.typeBtnTextActive]}>
                {L.expenseBtn}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, type === 'income' && s.typeBtnIncome]}
              onPress={() => handleTypeChange('income')}
            >
              <Text style={[s.typeBtnText, type === 'income' && s.typeBtnTextActive]}>
                {L.incomeBtn}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollContent}>
            {/* Monto */}
            <TextInput
              style={[s.amountInput, { borderBottomColor: type === 'expense' ? '#e11d48' : '#16a34a' }]}
              placeholder="0,00"
              placeholderTextColor={theme.placeholderText}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={text => setAmount(text.replace(/[^\d,.]/g, ''))}
              editable={!saving}
            />

            {/* Descripción */}
            <Text style={s.label}>{L.description}</Text>
            <View style={s.descRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="ej: McDonald's, sueldo, SUBE..."
                placeholderTextColor={theme.subtext}
                value={description}
                onChangeText={setDescription}
                returnKeyType="done"
                editable={!saving}
              />
              {categorizing && <ActivityIndicator size="small" color={theme.accent} style={{ marginLeft: 10 }} />}
            </View>
            {aiSuggested && <Text style={s.aiHint}>{L.aiHint}</Text>}

            {/* Categorías */}
            <Text style={s.label}>{L.category}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.catScroll}
              contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
            >
              {visibleCategories.map(cat => {
                const selected = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      s.chip,
                      selected && { backgroundColor: cat.color, borderColor: cat.color },
                    ]}
                    onPress={() => { setCategory(cat.key); setAiSuggested(false); }}
                  >
                    <CategoryIcon catKey={cat.key} size={16} color={selected ? '#fff' : cat.color} />
                    <Text style={[s.chipText, selected && s.chipTextActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Fecha */}
            <TouchableOpacity
              style={s.dateRow}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 16 }}>📅</Text>
              <Text style={s.dateText}>{formatDate(txDate)}</Text>
              <Text style={[s.dateText, { marginLeft: 'auto', fontSize: 13 }]}>›</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={txDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selected) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (event.type === 'dismissed') return;
                  if (selected) setTxDate(selected);
                }}
              />
            )}

            {/* Compartir con el grupo */}
            {household && (
              <View style={[s.recurringSection, { marginBottom: 12 }]}>
                <View style={s.recurringRow}>
                  <Text style={s.recurringIcon}>👥</Text>
                  <Text style={[s.recurringLabel, { color: theme.text }]}>
                    {L.shareWithGroup} {household.name}
                  </Text>
                  <Switch
                    value={isShared}
                    onValueChange={setIsShared}
                    trackColor={{ false: theme.input, true: theme.accent + '66' }}
                    thumbColor={isShared ? theme.accent : theme.subtext}
                  />
                </View>
              </View>
            )}

            {/* Recurrente */}
            {!isEditing && (
              <View style={s.recurringSection}>
                <View style={s.recurringRow}>
                  <Text style={s.recurringIcon}>🔄</Text>
                  <Text style={[s.recurringLabel, { color: theme.text }]}>{L.repeatMonthly}</Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{ false: theme.input, true: theme.accent + '66' }}
                    thumbColor={isRecurring ? theme.accent : theme.subtext}
                  />
                </View>
                {isRecurring && (
                  <View style={s.dayPickerWrap}>
                    <Text style={[s.dayPickerLabel, { color: theme.subtext }]}>{L.dayOfMonth}</Text>
                    <View style={s.dayPicker}>
                      {[1, 5, 10, 15, 20, 25, 28].map(d => (
                        <TouchableOpacity
                          key={d}
                          style={[s.dayBtn, dayOfMonth === d && { backgroundColor: theme.accent }]}
                          onPress={() => setDayOfMonth(d)}
                        >
                          <Text style={[s.dayBtnText, { color: dayOfMonth === d ? '#fff' : theme.text }]}>
                            {d}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Guardar */}
            {!isEditing && isRecurring && (
              <Text style={[s.recurringWarning, { color: theme.accent }]}>
                Se repetirá automáticamente el día {dayOfMonth} de cada mes
              </Text>
            )}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: type === 'income' ? theme.income : theme.accentBtn }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.saveBtnText}>
                    {isEditing ? L.saveChanges : isRecurring ? `Guardar como recurrente (día ${dayOfMonth})` : L.save}
                  </Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: {
      flex: 1, backgroundColor: t.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 20, paddingTop: 12,
    },
    handle: {
      alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
      backgroundColor: t.divider, marginBottom: 16,
    },
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: '800', color: t.text },
    closeBtn: { fontSize: 18, color: t.subtext },
    typeToggle: {
      flexDirection: 'row', backgroundColor: t.toggleBg,
      borderRadius: 12, padding: 4, marginBottom: 24,
    },
    typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
    typeBtnExpense: { backgroundColor: '#e11d48' },
    typeBtnIncome: { backgroundColor: '#16a34a' },
    typeBtnText: { fontSize: 15, fontWeight: '600', color: t.subtext },
    typeBtnTextActive: { color: '#fff' },
    scrollContent: { paddingBottom: 40 },
    label: { fontSize: 13, fontWeight: '700', color: t.label, marginBottom: 8, marginTop: 4 },
    amountInput: {
      fontSize: 36, fontWeight: '800', color: t.text,
      borderBottomWidth: 2,
      paddingBottom: 8, marginBottom: 20,
    },
    descRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    input: {
      backgroundColor: t.input, borderRadius: 12, borderWidth: 1,
      borderColor: t.inputBorder, padding: 14,
      fontSize: 15, color: t.inputText, marginBottom: 4,
    },
    aiHint: { fontSize: 12, color: t.accent, marginBottom: 16, fontWeight: '500' },
    catScroll: { marginBottom: 20 },
    chip: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 20, borderWidth: 1.5,
      borderColor: t.chipBorder, backgroundColor: t.chipBg, gap: 6,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: t.chipText },
    chipTextActive: { color: '#fff' },
    dateRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.input, borderRadius: 12,
      padding: 14, marginBottom: 24, gap: 8,
      borderWidth: 1, borderColor: t.inputBorder,
    },
    dateText: { fontSize: 15, color: t.subtext, fontWeight: '500' },
    saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
    recurringSection: {
      borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder,
      backgroundColor: t.input, marginBottom: 20, overflow: 'hidden',
    },
    recurringRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    },
    recurringIcon: { fontSize: 16 },
    recurringLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
    dayPickerWrap: {
      borderTopWidth: 1, borderTopColor: t.inputBorder,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    dayPickerLabel: { fontSize: 12, fontWeight: '600', marginBottom: 10 },
    dayPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    dayBtn: {
      width: 38, height: 38, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.card, borderWidth: 1, borderColor: t.inputBorder,
    },
    dayBtnText: { fontSize: 13, fontWeight: '700' },
    recurringWarning: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  });
}
