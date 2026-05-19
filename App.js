import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import * as NavigationBar from 'expo-navigation-bar';

import { supabase } from './services/supabase';
import { ThemeProvider, useTheme } from './services/theme';
import { AlertProvider } from './components/AppAlert';
import { HouseholdProvider } from './components/HouseholdProvider';

import OnboardingScreen from './screens/OnboardingScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import ChartsScreen from './screens/ChartsScreen';
import BudgetsScreen from './screens/BudgetsScreen';
import GoalsScreen from './screens/GoalsScreen';

import { LABELS } from './constants/i18n';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Tab icons ────────────────────────────────────────────────────────────────

function IconHome({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <Polyline points="9,22 9,12 15,12 15,22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function IconCharts({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="18" y1="20" x2="18" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Line x1="12" y1="20" x2="12" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <Line x1="6" y1="20" x2="6" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </Svg>
  );
}

function IconBudgets({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="2"/>
      <Circle cx="12" cy="12" r="2" stroke={color} strokeWidth="2"/>
    </Svg>
  );
}

function IconGoals({ color, size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Tab Navigator ────────────────────────────────────────────────────────────

function MainTabs({ session }) {
  const { theme, lang } = useTheme();
  const L = LABELS[lang];
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.navBorder,
          borderTopWidth: 1,
          paddingTop: 4,
          paddingBottom: 8 + insets.bottom,
          height: 60 + insets.bottom,
        },
        tabBarActiveTintColor: theme.navActive,
        tabBarInactiveTintColor: theme.navInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: L.navHome,
          tabBarIcon: ({ color, size }) => <IconHome color={color} size={size - 2} />,
        }}
      >
        {() => <HomeScreen session={session} />}
      </Tab.Screen>

      <Tab.Screen
        name="Charts"
        options={{
          tabBarLabel: L.navCharts,
          tabBarIcon: ({ color, size }) => <IconCharts color={color} size={size - 2} />,
        }}
      >
        {() => <ChartsScreen route={{ params: { userId } }} />}
      </Tab.Screen>

      <Tab.Screen
        name="Budgets"
        options={{
          tabBarLabel: L.navBudgets,
          tabBarIcon: ({ color, size }) => <IconBudgets color={color} size={size - 2} />,
        }}
      >
        {() => <BudgetsScreen route={{ params: { userId } }} />}
      </Tab.Screen>

      <Tab.Screen
        name="Goals"
        options={{
          tabBarLabel: L.navGoals,
          tabBarIcon: ({ color, size }) => <IconGoals color={color} size={size - 2} />,
        }}
      >
        {() => <GoalsScreen route={{ params: { userId } }} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

function RootNavigator() {
  const [session, setSession]             = useState(undefined);
  const [onboardingDone, setOnboardingDone] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    AsyncStorage.getItem('onboarding_done').then(val => setOnboardingDone(val === '1'));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
  }, []);

  if (session === undefined || onboardingDone === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6fbf8' }}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <HouseholdProvider session={session}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {session ? (
            <Stack.Screen name="Main">
              {() => <MainTabs session={session} />}
            </Stack.Screen>
          ) : onboardingDone ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </HouseholdProvider>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AlertProvider>
          <RootNavigator />
        </AlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
