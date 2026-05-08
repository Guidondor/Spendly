import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAlert } from '../components/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../services/theme';
import { getGoals, addGoal, updateGoalSaved, deleteGoal } from '../services/goals';
import { LABELS } from '../constants/i18n';
import { formatMoney } from '../services/format';


const GOAL_ICONS = ['🎯', '🏠', '✈️', '🚗', '💻', '📱', '🎓', '💍', '🏖️', '💰'];
const GOAL_COLORS = ['#16a34a', '#3b82f6', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#e11d48'];

function GoalCard({ goal, theme, onUpdate, onDelete, L }) {
  const pct = Math.min((goal.saved / goal.target) * 100, 100);
  const isComplete = goal.saved >= goal.target;
  const [updateModal, setUpdateModal] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [saving, setSaving] = useState(false);
  const color = goal.color || '#16a34a';
  const { alert, confirm } = useAlert();

  async function handleUpdate(delta) {
    const parsed = parseFloat(addInput.replace(',', '.'));
    if (!addInput || isNaN(parsed) || parsed <= 0) {
      alert('Monto inválido', 'Ingresá un número mayor a cero');
      return;
    }
    setSaving(true);
    const newSaved = Math.max(0, Number(goal.saved) + (delta > 0 ? parsed : -parsed));
    try {
      const updated = await updateGoalSaved(goal.id, newSaved);
      onUpdate(updated);
      setUpdateModal(false);
      setAddInput('');
    } catch {
      alert('Error', 'No se pudo actualizar la meta');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    confirm({
      title: 'Eliminar meta',
      message: `¿Eliminás "${goal.name}"?`,
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(goal.id) },
      ],
    });
  }

  const s = createStyles(theme);

  return (
    <>
      <TouchableOpacity
        style={s.card}
        onLongPress={confirmDelete}
        delayLongPress={600}
        activeOpacity={0.9}
      >
        <View style={s.cardTop}>
          <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
            <Text style={{ fontSize: 26 }}>{goal.icon || '🎯'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.goalName} numberOfLines={1}>{goal.name}</Text>
            <Text style={s.goalMeta} numberOfLines={1}>
              {formatMoney(goal.saved)} of {formatMoney(goal.target)} · {Math.round(pct)}%
            </Text>
          </View>
          <TouchableOpacity
            style={[s.updateBtn, { backgroundColor: '#dcfce7' }]}
            onPress={() => setUpdateModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[s.updateBtnText, { color: theme.income }]}>
              {isComplete ? '✓ ' + L.completed : L.updateSavings}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[s.progressTrack, { backgroundColor: theme.input, marginTop: 12 }]}>
          <View style={[s.progressFill, {
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: isComplete ? theme.income : color,
          }]} />
        </View>

        <View style={s.savedRow}>
          <Text style={[s.savedText, { color: theme.income }]}>
            {L.goalSaved}: {formatMoney(goal.saved)}
          </Text>
          <Text style={[s.remainingText, { color: theme.subtext }]}>
            {' · '}{L.goalRemaining}: {formatMoney(Math.max(0, goal.target - goal.saved))}
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={updateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setUpdateModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[s.modal, { backgroundColor: theme.card }]}>
            <View style={s.handle} />
            <View style={s.modalTitleRow}>
              <View style={[s.iconWrap, { backgroundColor: color + '22', marginRight: 12 }]}>
                <Text style={{ fontSize: 22 }}>{goal.icon || '🎯'}</Text>
              </View>
              <Text style={[s.modalTitle, { color: theme.text }]}>{goal.name}</Text>
            </View>
            <TextInput
              style={[s.modalInput, { borderBottomColor: theme.accent, color: theme.inputText }]}
              placeholder="0,00"
              placeholderTextColor={theme.placeholderText}
              keyboardType="decimal-pad"
              value={addInput}
              onChangeText={setAddInput}
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: theme.expense }]}
                onPress={() => handleUpdate(-1)}
                disabled={saving}
              >
                <Text style={s.modalBtnText}>- {L.removeMoney}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: theme.income }]}
                onPress={() => handleUpdate(1)}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>+ {L.addMoney}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default function GoalsScreen({ route }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert } = useAlert();
  const userId = route?.params?.userId;

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [selectedColor, setSelectedColor] = useState('#16a34a');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      setLoading(true);
      getGoals(userId)
        .then(data => setGoals(data))
        .catch(e => console.error('GoalsScreen load error:', e))
        .finally(() => setLoading(false));
    }, [userId])
  );

  const totalSaved = goals.reduce((s, g) => s + Number(g.saved || 0), 0);
  const totalTarget = goals.reduce((s, g) => s + Number(g.target || 0), 0);

  async function handleAdd() {
    if (!goalName.trim()) { alert('Error', 'Poné un nombre'); return; }
    const parsed = parseFloat(goalTarget.replace(',', '.'));
    if (!goalTarget || isNaN(parsed) || parsed <= 0) { alert('Error', 'Ingresá un monto mayor a cero'); return; }
    setSaving(true);
    try {
      const newGoal = await addGoal({ userId, name: goalName.trim(), icon: selectedIcon, color: selectedColor, target: parsed });
      setGoals(g => [newGoal, ...g]);
      setAddModal(false);
      setGoalName('');
      setGoalTarget('');
    } catch {
      alert('Error', 'No se pudo crear la meta');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteGoal(id);
      setGoals(g => g.filter(gl => gl.id !== id));
    } catch {
      alert('Error', 'No se pudo eliminar');
    }
  }

  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.header} />
      <View style={s.header}>
        <Text style={s.headerTitle}>{L.goalsTitle}</Text>
        {goals.length > 0 && (
          <Text style={s.headerSub}>{formatMoney(totalSaved)} / {formatMoney(totalTarget)}</Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={theme.accent} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}>
          {goals.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 56 }}>🎯</Text>
              <Text style={[s.emptyTitle, { color: theme.subtext }]}>Sin metas aún</Text>
              <Text style={[s.emptyHint, { color: theme.emptyText }]}>Agregá tu primera meta abajo</Text>
            </View>
          ) : (
            goals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                theme={theme}
                L={L}
                onUpdate={updated => setGoals(g => g.map(gl => gl.id === updated.id ? updated : gl))}
                onDelete={handleDelete}
              />
            ))
          )}

          <TouchableOpacity style={s.addGoalBtn} onPress={() => setAddModal(true)}>
            <Text style={s.addGoalBtnText}>+ {L.addGoal}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal
        visible={addModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={[s.modal, { backgroundColor: theme.card }]} keyboardShouldPersistTaps="handled">
            <View style={s.handle} />
            <View style={s.modalTitleRow}>
              <Text style={[s.modalTitle, { color: theme.text }]}>{L.newGoal}</Text>
              <TouchableOpacity onPress={() => setAddModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: 18, color: theme.subtext }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.modalLabel, { color: theme.label }]}>{L.goalName}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.inputText }]}
              placeholder="ej: Viaje a Europa"
              placeholderTextColor={theme.placeholderText}
              value={goalName}
              onChangeText={setGoalName}
            />

            <Text style={[s.modalLabel, { color: theme.label }]}>{L.goalTarget}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.inputText }]}
              placeholder="0,00"
              placeholderTextColor={theme.placeholderText}
              keyboardType="decimal-pad"
              value={goalTarget}
              onChangeText={setGoalTarget}
            />

            <Text style={[s.modalLabel, { color: theme.label }]}>Ícono</Text>
            <View style={s.iconGrid}>
              {GOAL_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[s.iconOption, { backgroundColor: theme.input }, selectedIcon === ic && { backgroundColor: theme.accent + '30', borderColor: theme.accent }]}
                  onPress={() => setSelectedIcon(ic)}
                >
                  <Text style={{ fontSize: 24 }}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.modalLabel, { color: theme.label }]}>Color</Text>
            <View style={s.colorGrid}>
              {GOAL_COLORS.map(col => (
                <TouchableOpacity
                  key={col}
                  style={[s.colorOption, { backgroundColor: col }, selectedColor === col && s.colorSelected]}
                  onPress={() => setSelectedColor(col)}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: theme.accentBtn, marginBottom: 40 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{L.addGoal}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: {
      backgroundColor: t.header,
      paddingTop: 52, paddingHorizontal: 20, paddingBottom: 16,
    },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500', marginTop: 3 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700' },
    emptyHint: { fontSize: 14 },
    card: {
      backgroundColor: t.card, borderRadius: 18, padding: 16,
      borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: t.dark ? 0 : 0.05, shadowRadius: 6, elevation: t.dark ? 0 : 1,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    goalName: { fontSize: 15, fontWeight: '700', color: t.text, marginBottom: 2 },
    goalMeta: { fontSize: 12, color: t.subtext, fontWeight: '500' },
    updateBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, flexShrink: 0 },
    updateBtnText: { fontSize: 13, fontWeight: '700' },
    progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    savedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
    savedText: { fontSize: 12, fontWeight: '700' },
    remainingText: { fontSize: 12, fontWeight: '500' },
    addGoalBtn: {
      borderWidth: 1.5, borderColor: t.accent, borderStyle: 'dashed',
      borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    },
    addGoalBtnText: { color: t.accent, fontSize: 15, fontWeight: '700' },
    modal: { flex: 1, padding: 24, paddingTop: 12 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e4ede8', marginBottom: 24 },
    modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    modalLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 4 },
    input: {
      borderRadius: 12, borderWidth: 1, padding: 14,
      fontSize: 15, marginBottom: 16,
    },
    modalInput: {
      fontSize: 36, fontWeight: '800', borderBottomWidth: 2,
      paddingBottom: 8, marginBottom: 36,
    },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    iconOption: {
      width: 52, height: 52, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: 'transparent',
    },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    colorOption: { width: 36, height: 36, borderRadius: 18 },
    colorSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
    saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  });
}
