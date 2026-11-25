-- Stark Museo — the wish book (Cloudflare D1).
--
-- Only the Worker can reach this database. Nothing in it is readable from a browser except
-- through the Worker's `recent` action, which returns approved wishes alone.

CREATE TABLE IF NOT EXISTS wishes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  -- the wish itself. Anonymous by design: no name, no email, no address, no IP.
  -- If you ever add one, say so on the panel.
  text            TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 280),

  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  currency        TEXT    NOT NULL,

  -- Stripe's id for the payment. Unique, so one payment buys one wish.
  payment_intent  TEXT    NOT NULL UNIQUE,

  -- set to 1 once you have read it, if you ever display wishes publicly
  approved        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS wishes_approved_idx ON wishes (approved, created_at DESC);
