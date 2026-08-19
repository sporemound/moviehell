CREATE TRIGGER IF NOT EXISTS websocket_tickets_cleanup
AFTER INSERT ON websocket_tickets
BEGIN
  DELETE FROM websocket_tickets
  WHERE ticket_hash IN (
    SELECT ticket_hash FROM websocket_tickets
    WHERE ticket_hash <> NEW.ticket_hash AND expires_at <= unixepoch() * 1000
    ORDER BY expires_at
    LIMIT 100
  );
END;
