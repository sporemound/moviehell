CREATE TRIGGER IF NOT EXISTS rate_limits_cleanup
AFTER INSERT ON rate_limits
BEGIN
  DELETE FROM rate_limits
  WHERE rate_key IN (
    SELECT rate_key FROM rate_limits
    WHERE rate_key <> NEW.rate_key AND resets_at <= unixepoch() * 1000
    ORDER BY resets_at
    LIMIT 100
  );
END;
