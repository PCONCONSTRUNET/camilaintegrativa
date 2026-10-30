ALTER TABLE appointments
  ADD COLUMN booking_kind TEXT NOT NULL DEFAULT 'regular'
  CHECK (booking_kind IN ('regular', 'encaixe'));

ALTER TABLE appointments
  ADD COLUMN fit_in_reason TEXT;

CREATE INDEX IF NOT EXISTS availability_exceptions_lookup_idx
  ON availability_exceptions (professional_id, date, available, start_time, end_time);

CREATE INDEX IF NOT EXISTS working_hours_lookup_idx
  ON working_hours (professional_id, weekday, public_booking, start_time, end_time);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('002_smart_agenda');
