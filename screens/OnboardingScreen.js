import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LABELS } from '../constants/i18n';

const { width } = Dimensions.get('window');
const L = LABELS.es;

const SLIDES = [
  {
    icon: '💸',
    title: L.ob1Title,
    subtitle: L.ob1Sub,
    accent: '#16a34a',
  },
  {
    icon: '🎯',
    title: L.ob2Title,
    subtitle: L.ob2Sub,
    accent: '#0f5132',
  },
  {
    icon: '✨',
    title: L.ob3Title,
    subtitle: L.ob3Sub,
    accent: '#166534',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', '1');
    navigation.replace('Login');
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: '#f6fbf8' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6fbf8" />

      <TouchableOpacity style={s.skipBtn} onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={s.skipText}>{L.ob_skip}</Text>
      </TouchableOpacity>

      <View style={s.content}>
        <View style={[s.iconWrap, { backgroundColor: slide.accent + '18' }]}>
          <Text style={s.icon}>{slide.icon}</Text>
        </View>
        <Text style={s.title}>{slide.title}</Text>
        <Text style={s.subtitle}>{slide.subtitle}</Text>
      </View>

      <View style={s.footer}>
        <View style={s.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.icon}
              style={[
                s.dot,
                { backgroundColor: i === index ? '#16a34a' : '#d4e8dc' },
                i === index && s.dotActive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[s.btn, { backgroundColor: '#16a34a' }]}
          onPress={() => (isLast ? finish() : setIndex(i => i + 1))}
          activeOpacity={0.85}
        >
          <Text style={s.btnText}>{isLast ? L.ob_start : L.ob_next}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 32,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    color: '#5a7a67',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  icon: {
    fontSize: 58,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f2318',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#5a7a67',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    alignItems: 'center',
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
  },
  btn: {
    width: width - 56,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
