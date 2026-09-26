-- Recorded pronunciation audio was dropped (docs/DECISIONS.md, 2026-09-27);
-- diktat reads sentences with the device's speech synthesis.
DROP TABLE audio;
ALTER TABLE sentence DROP COLUMN audio_url;
