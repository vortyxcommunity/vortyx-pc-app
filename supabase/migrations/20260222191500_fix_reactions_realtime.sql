
-- Ensure message_reactions and dm_message_reactions are in the realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'dm_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END $$;

-- Fix RLS for message_reactions (server)
DROP POLICY IF EXISTS "Members can view reactions" ON public.message_reactions;
CREATE POLICY "Members can view reactions" ON public.message_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove reactions" ON public.message_reactions;
CREATE POLICY "Users can remove reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- Fix RLS for dm_message_reactions (DMs)
DROP POLICY IF EXISTS "Users can view dm reactions" ON public.dm_message_reactions;
CREATE POLICY "Users can view dm reactions" ON public.dm_message_reactions FOR SELECT USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.dm_messages m 
  JOIN public.dm_participants p ON p.conversation_id = m.conversation_id
  WHERE m.id = dm_message_reactions.message_id AND p.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Users can add dm reactions" ON public.dm_message_reactions;
CREATE POLICY "Users can add dm reactions" ON public.dm_message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove dm reactions" ON public.dm_message_reactions;
CREATE POLICY "Users can remove dm reactions" ON public.dm_message_reactions FOR DELETE USING (auth.uid() = user_id);
