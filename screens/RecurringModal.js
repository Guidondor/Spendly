import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, StatusBar,
} from 'react-native';
import { useAlert } from '../components/AppAlert';
import { useTheme } from '../services/theme';
import { getRecurring, deleteRecurring } from '../services/recurring';
import { getCategoryByKey, CategoryIcon } from '../services/categories';
import { LABELS } from '../constants/i18n';
import { formatMoney } from '../services/format';
import { useHousehold } from '../components/HouseholdProvider';


export default function RecurringModal({ visible, onClose, userId }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { alert, confirm } = useAlert();
  const { household, getMemberById } = useHousehold();
  const householdId = household?.id ?? null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getRecurring(userId, householdId);
      setItems(data);
    } catch (e) {
      console.error('RecurringModal load error:', e);
      alert('Error', L.recurringLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [userId, householdId, alert, L]);

  React.useEffect(() => { if (visible) load(); }, [visible, load]);

  function confirmDelete(item) {
    confirm({
      title: L.deleteRecurringTitle,
      message: L.deleteRecurringConfirmTpl.replace('{description}', item.description),
      buttons: [
        { text: L.cancel, style: 'cancel' },
        {
          text: L.deleteBtn, style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecurring(item.id);
              setItems(prev => prev.filter(i => i.id !== item.id));
            } catch {
              alert('Error', L.deleteFailed);
            }
          },
        },
      ],
    });
  }

  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: theme.card }]}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>🔄 {L.recurringHeaderTitle}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[s.closeBtn, { color: theme.subtext }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.subtitle, { color: theme.subtext }]}>
          {L.recurringHeaderSub}
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.accent} />
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48 }}>🔄</Text>
            <Text style={[s.emptyText, { color: theme.subtext }]}>
              {L.recurringEmptyText}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => {
              const cat = getCategoryByKey(item.category, lang);
              const isIncome = item.type === 'income';
              const isShared = !!item.household_id;
              const owner = isShared ? getMemberById(item.user_id) : null;
              const canDelete = item.user_id === userId; // solo autor borra la regla
              return (
                <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.cardBorder, borderWidth: theme.dark ? 1 : 0 }]}>
                  <View style={[s.iconWrap, { backgroundColor: cat.color + '20' }]}>
                    <CategoryIcon catKey={item.category} size={18} color={cat.color} />
                  </View>
                  <View style={s.info}>
                    <Text style={[s.desc, { color: theme.text }]} numberOfLines={1}>{item.description}</Text>
                    <Text style={[s.meta, { color: theme.subtext }]} numberOfLines={1}>
                      {isShared ? `👥 ${L.pillHh} · ` : ''}{cat.name} · {L.recurringDayLabelTpl.replace('{day}', item.day_of_month)}
                      {isShared && owner ? ` · ${owner.display_name}` : ''}
                    </Text>
                  </View>
                  <Text style={[s.amount, { color: isIncome ? theme.income : theme.expense }]}>
                    {isIncome ? '+' : '-'}{formatMoney(item.amount)}
                  </Text>
                  {canDelete && (
                    <TouchableOpacity
                      onPress={() => confirmDelete(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={s.deleteBtn}
                    >
                      <Text style={{ fontSize: 16, color: theme.subtext }}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    container: { flex: 1, paddingTop: 12 },
    handle: {
      alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
      backgroundColor: t.divider, marginBottom: 20,
    },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, marginBottom: 4,
    },
    title: { fontSize: 18, fontWeight: '800', color: t.text },
    closeBtn: { fontSize: 18 },
    subtitle: { fontSize: 13, paddingHorizontal: 20, marginBottom: 4 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 14, padding: 14,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    info: { flex: 1, minWidth: 0 },
    desc: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    meta: { fontSize: 11, fontWeight: '500' },
    amount: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
    deleteBtn: { padding: 4, flexShrink: 0 },
  });
}
