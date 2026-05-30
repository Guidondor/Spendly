import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, StatusBar, Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../services/supabase';
import { withTimeout } from '../services/withTimeout';
import { useTheme } from '../services/theme';
import { LABELS } from '../constants/i18n';

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

const PRIVACY_URL = 'https://guidondor.github.io/Spendly/privacy.html';

const ACCENT = '#16a34a';
const HEADER = '#0f5132';
const BG = '#f6fbf8';

export default function RegisterScreen({ navigation }) {
  const { lang } = useTheme();
  const L = LABELS[lang];

  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    let linkSub = null;
    let urlFromLink = null;
    try {
      const WebBrowser = require('expo-web-browser');
      const { makeRedirectUri } = require('expo-auth-session');
      const redirectUri = makeRedirectUri({ scheme: 'spendly' });
      linkSub = Linking.addEventListener('url', ({ url }) => { urlFromLink = url; });
      const { data, error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectUri, skipBrowserRedirect: true },
        }),
        15000
      );
      if (oauthError || !data.url) {
        if (__DEV__) console.warn('[Register] signInWithOAuth:', oauthError);
        setError(L.googleError);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      let url = result.url;
      if (!url) {
        for (let i = 0; i < 30 && !urlFromLink; i++) await new Promise(r => setTimeout(r, 100));
        url = urlFromLink;
      }
      if (!url) {
        const { data: sd } = await withTimeout(supabase.auth.getSession(), 10000);
        if (sd?.session) return;
        if (__DEV__) console.warn('[Register] Google: no url, result.type=', result.type);
        setError(L.googleError);
        return;
      }
      const codeMatch = /[?&]code=([^&]+)/.exec(url);
      if (codeMatch) {
        const code = decodeURIComponent(codeMatch[1]);
        const { data: exData, error: exchangeError } = await withTimeout(
          supabase.auth.exchangeCodeForSession(code),
          15000
        );
        if (exchangeError) {
          if (__DEV__) console.warn('[Register] exchangeCodeForSession:', exchangeError);
          setError(L.googleError);
          return;
        }
        if (!exData?.session && __DEV__) console.warn('[Register] exchange ok but no session');
        return;
      }
      const hashIdx = url.indexOf('#');
      if (hashIdx !== -1) {
        const params = new URLSearchParams(url.slice(hashIdx + 1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { data: sData, error: setErr } = await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            10000
          );
          if (setErr) {
            if (__DEV__) console.warn('[Register] setSession:', setErr);
            setError(L.googleError);
            return;
          }
          if (!sData?.session && __DEV__) console.warn('[Register] setSession ok but no session');
          return;
        }
      }
      if (__DEV__) console.warn('[Register] no code/token in url', url.slice(0, 80));
      setError(L.googleError);
    } catch (err) {
      if (__DEV__) console.warn('[Register] handleGoogleLogin error:', err?.message || err);
      setError(L.googleError);
    } finally {
      linkSub?.remove();
      setLoading(false);
    }
  }

  async function handleRegister() {
    setError('');
    if (!email || !password || !confirmPassword) { setError(L.requiredFields); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(L.invalidEmail); return; }
    if (password !== confirmPassword) { setError(L.passwordsNoMatch); return; }
    if (password.length < 6) { setError(L.passwordTooShort); return; }

    setLoading(true);
    try {
      const { error: authError } = await withTimeout(
        supabase.auth.signUp({ email, password }),
        15000
      );
      if (authError) { setError(authError.message); return; }
      setSuccess(true);
    } catch (e) {
      if (__DEV__) console.warn('[Register] signUp failed:', e?.message || e);
      setError(L.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={s.successContainer}>
        <Text style={s.successEmoji}>✉️</Text>
        <Text style={s.successTitle}>{L.registerSuccess}</Text>
        <Text style={s.successMsg}>{L.registerSuccessMsg}</Text>
        <TouchableOpacity style={s.button} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
          <Text style={s.buttonText}>{L.goToLogin}</Text>
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
              {L.haveAccount}{' '}
              <Text style={s.link}>{L.login}</Text>
            </Text>
          </TouchableOpacity>

          <View style={s.separator}>
            <View style={s.separatorLine} />
            <Text style={s.separatorText}>{L.orWith}</Text>
            <View style={s.separatorLine} />
          </View>

          <TouchableOpacity
            style={[s.googleButton, loading && s.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <GoogleIcon />
            <Text style={s.googleButtonText}>{L.googleLogin}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} style={{ marginTop: 16 }}>
            <Text style={s.privacyText}>
              {L.privacyAcceptText}{' '}
              <Text style={s.link}>{L.privacyPolicyLink}</Text>
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
