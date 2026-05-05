import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { supabase } from '../services/supabase';
import { LABELS } from '../constants/i18n';

const lang = 'es';
const L = LABELS[lang];

const ACCENT = '#16a34a';
const HEADER = '#0f5132';
const BG = '#f6fbf8';

export default function LoginScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin() {
    setError('');
    if (!email || !password) { setError(L.requiredFields); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(L.invalidEmail); return; }
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) setError(authError.message);
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={HEADER} />
      <View style={s.inner}>
        <View style={s.header}>
          <View style={s.logoWrap}>
            <Text style={s.logoEmoji}>💸</Text>
          </View>
          <Text style={s.appName}>Spendly</Text>
          <Text style={s.tagline}>{L.loginTitle}</Text>
        </View>

        <View style={s.form}>
          <Text style={s.label}>{L.email}</Text>
          <TextInput
            style={s.input}
            placeholder="tu@email.com"
            placeholderTextColor="#b0c8b8"
            value={email}
            onChangeText={v => { setEmail(v); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={s.label}>{L.password}</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor="#b0c8b8"
            value={password}
            onChangeText={v => { setPassword(v); setError(''); }}
            secureTextEntry
          />

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>{L.enter}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={s.linkText}>
              ¿No tenés cuenta?{' '}
              <Text style={s.link}>{L.register}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 34, fontWeight: '800', color: HEADER, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#5a7a67', marginTop: 6, textAlign: 'center' },
  form: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e4ede8',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#3d6652', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#f0f7f3',
    borderWidth: 1,
    borderColor: '#d4e8dc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f2318',
  },
  errorText: { color: '#e11d48', fontSize: 13, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  linkText: { textAlign: 'center', color: '#5a7a67', fontSize: 14 },
  link: { color: ACCENT, fontWeight: '700' },
});
