
-- 1. Ensure the publication exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Safely add tables to the publication.
-- PostgreSQL 14 and earlier do not support DROP TABLE IF EXISTS in ALTER PUBLICATION.
-- We use a simpler block that ignores "already exists" errors.
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
    EXCEPTION WHEN duplicate_object THEN
        NULL; -- Table already exists, do nothing
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_conversations;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_participants;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- 3. Set replica identity to FULL
-- This ensures that update/delete events contain all column data, 
-- which is critical for Realtime filters and state updates.
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_calls REPLICA IDENTITY FULL;
ALTER TABLE public.dm_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.dm_participants REPLICA IDENTITY FULL;
