
-- Enable realtime for DM tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_participants;

-- Fix alignment logic: ensure profiles are loaded for all participants
-- (Already handled in React, but ensuring DB consistency)
