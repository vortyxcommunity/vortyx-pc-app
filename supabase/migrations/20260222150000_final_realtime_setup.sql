
-- 1. SET REPLICA IDENTITY TO FULL (CRITICAL)
-- These should always be run to ensure data flow
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_calls REPLICA IDENTITY FULL;
ALTER TABLE public.dm_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.dm_participants REPLICA IDENTITY FULL;

-- 2. ENSURE TABLES ARE IN THE PUBLICATION
-- Running these individually. If you see "already member" error, it's GOOD news.
-- It means the table is already correctly set up for Realtime.
-- You can ignore the errors for the lines below if they happen.

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_participants;
