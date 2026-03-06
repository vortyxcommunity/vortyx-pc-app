
-- Fix DM conversation creation RLS issue
-- Allow users to see conversations they are about to participate in or have just created

DROP POLICY IF EXISTS "Users can view their DM conversations" ON public.dm_conversations;

CREATE POLICY "Users can view their DM conversations"
  ON public.dm_conversations FOR SELECT
  USING (
    is_dm_participant(auth.uid(), id)
    OR
    -- Allow seeing the conversation if it was created very recently and has no participants yet
    -- This allows the INSERT ... RETURNING to work
    (NOT EXISTS (SELECT 1 FROM public.dm_participants WHERE conversation_id = id) AND created_at > now() - interval '10 seconds')
  );

-- Also ensure dm_participants permits the same
DROP POLICY IF EXISTS "Authenticated users can add DM participants" ON public.dm_participants;
CREATE POLICY "Authenticated users can add DM participants"
  ON public.dm_participants FOR INSERT
  WITH CHECK (true);
