import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import Svg, { Path, G, Rect } from 'react-native-svg';
import { supabase } from '../services/supabase';
import { LABELS } from '../constants/i18n';

const lang = 'es';
const L = LABELS[lang];

function GoogleIcon() {
  return (
    <Svg width="20" height="20" viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <Path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.4 4.2-4.4 5.5l6.2 5.2C36.9 36.2 44 31 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </Svg>
  );
}

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

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      const WebBrowser = require('expo-web-browser');
      const { makeRedirectUri } = require('expo-auth-session');
      const redirectUri = makeRedirectUri({ scheme: 'spendly' });
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });
      if (oauthError || !data.url) { setError(oauthError?.message ?? 'Error con Google'); return; }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') setError('Google: ' + result.type);
        return;
      }
      const codeMatch = /[?&]code=([^&]+)/.exec(result.url);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
      if (!code) { setError('No se recibió code de Google'); return; }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) setError('Exchange: ' + exchangeError.message);
    } catch (err) {
      setError('Google: ' + (err?.message ?? 'desconocido'));
    } finally {
      setLoading(false);
    }
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

          <View style={s.separator}>
            <View style={s.separatorLine} />
            <Text style={s.separatorText}>o continuá con</Text>
            <View style={s.separatorLine} />
          </View>

          <TouchableOpacity
            style={[s.googleButton, loading && s.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <GoogleIcon />
            <Text style={s.googleButtonText}>Continuar con Google</Text>
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
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#d4e8dc' },
  separatorText: { color: '#9db8a8', fontSize: 12 },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#d4e8dc',
    borderRadius: 14, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  googleButtonText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
});
