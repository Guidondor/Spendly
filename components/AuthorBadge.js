import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Tamaños predefinidos
const SIZES = {
  sm: { box: 22, font: 11 },
  md: { box: 28, font: 13 },
  lg: { box: 40, font: 18 },
};

export default function AuthorBadge({ member, size = 'sm', style }) {
  const { box, font } = SIZES[size] || SIZES.sm;
  const initial = (member?.display_name || '?').trim().charAt(0).toUpperCase();
  const color = member?.color || '#16a34a';

  return (
    <View
      style={[
        styles.badge,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: color },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: font }]} numberOfLines={1}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
