CREATE TRIGGER IF NOT EXISTS moderation_vote_guard
BEFORE INSERT ON moderation_votes
BEGIN
  SELECT RAISE(ABORT, 'moderation action not pending') WHERE NOT EXISTS (
    SELECT 1 FROM moderation_actions WHERE id = NEW.moderation_id AND status = 'pending'
  );
  SELECT RAISE(ABORT, 'cannot vote on own moderation action') WHERE EXISTS (
    SELECT 1 FROM moderation_actions WHERE id = NEW.moderation_id AND requested_by = NEW.voter_id
  );
  SELECT RAISE(ABORT, 'approval quota exhausted') WHERE NOT EXISTS (
    SELECT 1 FROM approval_quotas
    WHERE user_id = NEW.voter_id AND used_votes < total_votes
  );
END;

CREATE TRIGGER IF NOT EXISTS moderation_vote_consume_quota
AFTER INSERT ON moderation_votes
BEGIN
  UPDATE approval_quotas SET used_votes = used_votes + 1 WHERE user_id = NEW.voter_id;
END;
