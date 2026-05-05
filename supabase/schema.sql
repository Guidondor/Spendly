-- ============================================================
-- Spendly — Schema para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Tabla de transacciones (gastos e ingresos)
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category    TEXT NOT NULL DEFAULT 'other',
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, date DESC);

-- RLS: cada usuario solo ve sus propios datos
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propias transacciones"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean sus propias transacciones"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios borran sus propias transacciones"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios actualizan sus propias transacciones"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id);
