import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, StatusBar, Linking,
} from 'react-native';
import { supabase } from '../services/supabase';
import { LABELS } from '../constants/i18n';

const PRIVACY_URL = 'https://guidondor.github.io/Spendly/privacy.html';

const lang = 'es';
const L = LABELS[lang];

const ACCENT = '#16a34a';
const HEADER = '#0f5132';
const BG = '#f6fbf8';

export default function RegisterScreen({ navigation }) {
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);

  async function handleRegister() {
    setError('');
    if (!email || !password || !confirmPassword) { setError(L.requiredFields); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(L.invalidEmail); return; }
    if (password !== confirmPassword) { setError(L.passwordsNoMatch); return; }
    if (password.length < 6) { setError(L.passwordTooShort); return; }

    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <View style={s.successContainer}>
        <Text style={s.successEmoji}>✉️</Text>
        <Text style={s.successTitle}>{L.registerSuccess}</Text>
        <Text style={s.successMsg}>{L.registerSuccessMsg}</Text>
        <TouchableOpacity style={s.button} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
          <Text style={s.buttonText}>Ir al inicio de sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={HEADER} />
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoWrap}>
            <Text style={s.logoEmoji}>💸</Text>
          </View>
          <Text style={s.appName}>Spendly</Text>
          <Text style={s.tagline}>{L.registerTagline}</Text>
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
            placeholder={L.passwordMinHint}
            placeholderTextColor="#b0c8b8"
            value={password}
            onChangeText={v => { setPassword(v); setError(''); }}
            secureTextEntry
          />

          <Text style={s.label}>{L.confirmPassword}</Text>
          <TextInput
            style={s.input}
            placeholder={L.confirmPassword}
            placeholderTextColor="#b0c8b8"
            value={confirmPassword}
            onChangeText={v => { setConfirmPassword(v); setError(''); }}
            secureTextEntry
          />

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>{L.create}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={s.linkText}>
              ¿Ya tenés cuenta?{' '}
              <Text style={s.link}>{L.login}</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} style={{ marginTop: 16 }}>
            <Text style={s.privacyText}>
              Al registrarte aceptás nuestra{' '}
              <Text style={s.link}>Política de Privacidad</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  successContainer: {
    flex: 1, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successEmoji: { fontSize: 56, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: HEADER, marginBottom: 12, textAlign: 'center' },
  successMsg: { fontSize: 15, color: '#5a7a67', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  logoEmoji: { fontSize: 40 },
  appName: { fontSize: 34, fontWeight: '800', color: HEADER, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#5a7a67', marginTop: 6 },
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
  privacyText: { textAlign: 'center', color: '#5a7a67', fontSize: 12 },
});
