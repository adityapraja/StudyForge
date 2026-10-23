DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'friendships_not_self'
      AND conrelid = 'public.friendships'::regclass
  ) THEN
    ALTER TABLE friendships
      ADD CONSTRAINT friendships_not_self
      CHECK (requester_id <> receiver_id) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blocks_not_self'
      AND conrelid = 'public.blocks'::regclass
  ) THEN
    ALTER TABLE blocks
      ADD CONSTRAINT blocks_not_self
      CHECK (blocker_id <> blocked_id) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE friendships VALIDATE CONSTRAINT friendships_not_self;
ALTER TABLE blocks VALIDATE CONSTRAINT blocks_not_self;

CREATE INDEX IF NOT EXISTS idx_friendships_pending_receiver
  ON friendships(receiver_id, created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_accepted_pair
  ON friendships(LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))
  WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id, blocker_id);
