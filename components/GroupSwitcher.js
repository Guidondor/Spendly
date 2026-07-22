import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useTheme } from '../services/theme';
import { LABELS } from '../constants/i18n';
import { useHousehold } from './HouseholdProvider';

// Switcher de grupo activo. Se muestra solo si el user pertenece a >= 1 grupo.
// Cambiar el activo re-scopea toda la app (las pantallas leen `household` del
// provider). El item "Personal" (null) muestra solo los datos privados.
export default function GroupSwitcher() {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const { groups, activeGroupId, setActiveGroup, household } = useHousehold();
  const [open, setOpen] = useState(false);

  if (!groups || groups.length === 0) return null;

  const s = createStyles(theme);
  const activeName = household ? household.name : L.personalView;
  const activeColor = household?.self?.color || theme.subtext;

  async function pick(id) {
    setOpen(false);
    await setActiveGroup(id);
  }

  return (
    <>
      <View style={s.bar}>
        <TouchableOpacity
          style={s.chip}
          onPress={() => setOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={L.switchGroupA11y}
        >
          <View style={[s.dot, { backgroundColor: activeColor }]} />
          <Text style={[s.chipText, { color: theme.text }]} numberOfLines={1}>{activeName}</Text>
          <Text style={[s.chevron, { color: theme.subtext }]}>▾</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[s.sheetTitle, { color: theme.subtext }]}>{L.yourGroups.toUpperCase()}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {/* Personal */}
              <Row
                s={s} theme={theme}
                label={L.personalView}
                sub={L.personalSub}
                color={theme.subtext}
                active={activeGroupId === null}
                onPress={() => pick(null)}
                activeLabel={L.activeLabel}
              />
              {groups.map(g => (
                <Row
                  key={g.id}
                  s={s} theme={theme}
                  label={g.name}
                  color={g.self?.color || theme.accent}
                  active={activeGroupId === g.id}
                  onPress={() => pick(g.id)}
                  activeLabel={L.activeLabel}
                />
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function Row({ s, theme, label, sub, color, active, onPress, activeLabel }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rowText, { color: theme.text }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={[s.rowSub, { color: theme.subtext }]}>{sub}</Text> : null}
      </View>
      {active && (
        <Text style={[s.rowActive, { color: theme.accent }]}>✓ {activeLabel}</Text>
      )}
    </TouchableOpacity>
  );
}

function createStyles(t) {
  return StyleSheet.create({
    bar: { paddingHorizontal: 16, paddingTop: 10, alignItems: 'center' },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
      backgroundColor: t.card, borderWidth: t.dark ? 1 : 0, borderColor: t.cardBorder,
      maxWidth: '80%',
    },
    dot: { width: 12, height: 12, borderRadius: 6 },
    chipText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
    chevron: { fontSize: 12, fontWeight: '900' },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 28 },
    sheet: { borderRadius: 18, padding: 16, borderWidth: 1 },
    sheetTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowText: { fontSize: 16, fontWeight: '700' },
    rowSub: { fontSize: 12, marginTop: 1 },
    rowActive: { fontSize: 13, fontWeight: '800' },
  });
}
