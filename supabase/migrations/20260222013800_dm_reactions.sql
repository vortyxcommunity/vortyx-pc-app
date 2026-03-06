
-- DM Message Reactions
CREATE TABLE public.dm_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.dm_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions in their DM conversations"
  ON public.dm_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_messages m
      JOIN public.dm_participants p ON p.conversation_id = m.conversation_id
      WHERE m.id = message_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add reactions to their DM messages"
  ON public.dm_message_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.dm_messages m
      JOIN public.dm_participants p ON p.conversation_id = m.conversation_id
      WHERE m.id = message_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON public.dm_message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_message_reactions;
