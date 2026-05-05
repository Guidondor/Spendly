# Spendly — App de Control de Gastos con IA

## Estado actual
**Versión:** 0.9.5 — Auditoría técnica completa + fixes (Mayo 2026)

### Testing en dispositivo
Sin módulos nativos pesados → usar Expo Go:
```bash
npx expo start   # escanear QR con Expo Go
```
Para APK real: configurar EAS (agregar `package` en app.json + `eas init` + `eas build`)

Rebrand completo de tema azul → verde. App con 4 tabs funcionales, onboarding, categorías SVG, i18n, y todas las pantallas implementadas y alineadas al prototipo visual. Feature de gastos recurrentes completa. Auditoría completa de 16 archivos con 10 bugs/mejoras corregidos. Fix recurrentes: al borrar una transacción recurrente ahora se ofrece borrar también la regla. UX: advertencia visible + texto en botón guardar cuando el toggle recurrente está activo.

---

## Stack Tecnológico
- **Frontend:** React Native + Expo SDK 55
- **Backend:** Python + FastAPI (Railway)
- **Base datos:** Supabase (auth + database)
- **IA:** Claude Haiku API (categorización + consejos vía backend)
- **Ads:** Google AdMob (pendiente integrar)
- **Pagos:** RevenueCat (pendiente integrar)
- **Deploy:** Railway (backend)

---

## Estructura de Carpetas
```
Spendly/
├── App.js                    ← Navegación: Stack + BottomTabs (íconos SVG)
├── screens/
│   ├── OnboardingScreen.js
│   ├── LoginScreen.js
│   ├── RegisterScreen.js
│   ├── HomeScreen.js         ← Balance + AI insights + lista + applyRecurring
│   ├── ChartsScreen.js       ← Donut + barras mensuales con labels de valor
│   ├── BudgetsScreen.js      ← Presupuestos con barra bicolor al exceder
│   ├── GoalsScreen.js        ← Metas de ahorro
│   ├── AddTransactionModal.js ← Toggle recurrente + selector día
│   ├── HistoryModal.js
│   └── RecurringModal.js     ← NUEVO: gestión de gastos recurrentes
├── services/
│   ├── supabase.js
│   ├── theme.js              ← Tema verde (LIGHT + DARK)
│   ├── categories.js         ← 9 categorías con íconos SVG
│   ├── transactions.js
│   ├── budgets.js
│   ├── goals.js
│   ├── recurring.js          ← NUEVO: CRUD + applyRecurring
│   └── ai.js
├── constants/
│   └── i18n.js               ← ES + EN (lang='es' en todas las pantallas)
└── context.md
```

---

## Navegación
```
Stack:
  Onboarding (1x, AsyncStorage flag)
  → Login / Register
  → Main (BottomTabs):
       Inicio | Gráficos | Presupuestos | Metas
```

Tab icons (SVG): casa | barras | bullseye (3 círculos) | estrella

---

## Base de Datos Supabase (proyecto: gvycerdibwxxpaybwebd)
Tablas: `transactions`, `budgets`, `goals`, `recurring_transactions`

### recurring_transactions
- id, user_id, amount, description, category, type, day_of_month (1-28), active, created_at
- RLS: users only manage their own rows

### transactions (columna agregada)
- `recurring_id uuid` → FK a recurring_transactions (SET NULL on delete)
- Permite detectar si una transacción ya fue creada este mes para una regla dada
- **Índice único:** `uniq_recurring_per_month` sobre `(recurring_id, date_trunc('month', date::timestamp)) WHERE recurring_id IS NOT NULL` — previene duplicados en `applyRecurring` a nivel DB

---

## Lógica de Recurrentes
- `applyRecurring(userId)` corre al abrir la app (en `loadTransactions` de HomeScreen)
- Por cada regla activa: si hoy >= day_of_month y no existe tx con ese recurring_id en el mes actual → crea la transacción
- El usuario activa el toggle "🔄 Repetir cada mes" al guardar un movimiento nuevo
- Selector de día rápido: 1, 5, 10, 15, 20, 25, 28
- Gestión (ver/eliminar) desde botón 🔄 en el header del Home
- Eliminar una regla NO borra los movimientos ya creados

---

## Colores del rebranding
- Accent: `#16a34a` (verde)
- Header: `#0f5132` (verde oscuro)
- Background: `#f6fbf8`
- Income: `#16a34a` / `#22c55e` (dark)
- Expense: `#e11d48` / `#f43f5e` (dark)

---

## Variables de entorno necesarias (`.env`)
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## Próximos pasos / Pendientes
1. Testear en Android físico
2. Integrar AdMob (banner en HomeScreen para usuarios free)
3. Integrar RevenueCat para plan premium
4. Assets de Play Store (icon 1024px, feature graphic, screenshots)
5. Exportar reportes CSV/PDF (botón en HistoryModal)
6. Multi-cuentas / billeteras

---

## Decisiones Técnicas
- React Navigation (stack + bottom tabs) en lugar de expo-router
- Íconos SVG via react-native-svg en lugar de emoji — consistencia cross-platform
- Backend proxea las llamadas a Claude — la API key nunca va al cliente
- Categorías reducidas de 14 a 9 (fallback a "other" para datos viejos)
- Recurrentes: estrategia on-app-open (sin cron) — suficiente para MVP
- `lang = 'es'` hardcodeado en todas las pantallas, i18n listo para futuro switch

---

## Learnings

### Errores cometidos
- Tema azul anterior no seguía el design system del handoff
- Renderizar componentes SVG (Circle, Path) fuera de un `<Svg>` wrapper rompe el render

### Correcciones aplicadas
- Reemplazado tema completo (LIGHT/DARK) con paleta verde del handoff
- Íconos de categorías migrados de emoji a SVG
- Navegación actualizada a Stack + BottomTabs (4 tabs)
- **QA (Mayo 2026) en AddTransactionModal:** `editable={!saving}` en inputs y guard `if (saving) return` en debouncer IA para evitar race condition en conexiones lentas
- **UI/Language audit:** eliminados todos los strings ingleses hardcodeados, reemplazados por `L.*` de i18n
- Balance card movida ANTES del AI Insights card en HomeScreen (orden correcto según prototipo)
- Texto EXPENSES movido de dentro del SVG donut a debajo del gráfico
- Íconos tab bar corregidos: Presupuestos = bullseye, Metas = estrella
- **Auditoría v0.9.3 (Mayo 2026):**
  - `App.js`: `Line` agregado al import SVG (crash en tab Gráficos)
  - `RecurringModal`: eliminado `useFocusEffect` redundante (doble request al abrir)
  - `services/ai.js`: `AbortController` + timeout 8s en fetch
  - `LoginScreen`/`RegisterScreen`: validación de formato email + strings via i18n
  - `services/supabase.js`: fail early si las env vars no están configuradas
  - `services/theme.js`: preferencia de tema persistida en AsyncStorage
  - `services/recurring.js`: validación `day_of_month` (1-28)
  - `constants/i18n.js`: 27 keys nuevos en ES + EN (errores de validación, UI strings)
  - Catches silenciosos → `console.error` en HomeScreen, ChartsScreen, GoalsScreen, BudgetsScreen
  - **Supabase DB:** índice único `uniq_recurring_per_month` elimina race condition en `applyRecurring`

### Sesión v0.9.4 (Mayo 2026)
- `HomeScreen.js`: `handleDelete` ahora recibe el `tx` completo; si tiene `recurring_id`, ofrece borrar la regla (web: `window.confirm`, mobile: `Alert.alert`). Import de `deleteRecurring` agregado.
- `AddTransactionModal.js`: cuando `isRecurring = true`, muestra texto "Se repetirá automáticamente el día X de cada mes" y el botón dice "Guardar como recurrente (día X)". Agrega estilo `recurringWarning`.

### Sesión v0.9.5 (Mayo 2026) — Auditoría técnica completa
- `services/format.js` — NUEVO: `formatMoney` centralizado. Removida de los 6 archivos donde estaba duplicada (HomeScreen, ChartsScreen, BudgetsScreen, GoalsScreen, HistoryModal, RecurringModal).
- `HomeScreen.js` (AIInsightCard): `AbortController` en useEffect → evita memory leak si el usuario navega antes de que termine el fetch.
- `HomeScreen.js` (handleDelete): `deleteRecurring` en el Alert onPress ahora está en try/catch con feedback al usuario si falla.
- `ChartsScreen.js` (MonthlyBars): loading state (`ActivityIndicator`) mientras carga los 6 meses; catch silencioso → `Alert.alert` visible.
- `ChartsScreen.js`: `Alert` agregado al import de react-native.
- `BudgetsScreen.js`: catch silencioso → `Alert.alert` visible.

### Patrones a evitar
- No renderizar componentes SVG fuera de `<Svg>` wrapper
- No crear constantes de meses hardcodeadas — usar `MONTHS` de `constants/i18n.js`
- No usar `saving` en el array de deps del useEffect del debouncer (innecesario, aunque inofensivo)
- No usar `useFocusEffect` dentro de un Modal (no es un screen de navegación — no funciona correctamente)
- No usar `date::timestamptz` en índices funcionales de Postgres — usar `date::timestamp` (timestamptz no es inmutable por conversión de timezone)
- Al borrar transacciones recurrentes: siempre ofrecer borrar la regla también, si no `applyRecurring` la recrea al próximo load
- El `Switch` en web puede tener comportamiento impreciso con taps rápidos — siempre mostrar feedback visual del estado activo
