CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  registration_number VARCHAR(20) UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  nascimento DATE NOT NULL,
  sexo TEXT NOT NULL,
  naturalidade TEXT NOT NULL,
  bilhete TEXT NOT NULL,
  residencia TEXT NOT NULL,
  contacto TEXT NOT NULL,
  email TEXT NOT NULL,
  agrupamento TEXT NOT NULL,
  nucleo TEXT NOT NULL,
  patrulha TEXT NOT NULL,
  categoria TEXT NOT NULL,
  deficiencia TEXT NOT NULL,
  obs TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_value INTEGER NOT NULL DEFAULT 6000,
  payment_confirmed_at TIMESTAMPTZ,
  payment_method TEXT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  contacto TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_type VARCHAR(20) NOT NULL DEFAULT 'contact',
  read_at TIMESTAMPTZ,
  rating SMALLINT
);
CREATE INDEX IF NOT EXISTS registrations_name_idx ON registrations (LOWER(nome));
CREATE INDEX IF NOT EXISTS registrations_group_idx ON registrations (LOWER(agrupamento));
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at DESC);
