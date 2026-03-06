-- MASTER FIX MIGRATION (v2)
-- Ensures all required tables, columns, and storage buckets exist

-- 1. Voice States Table
CREATE TABLE IF NOT EXISTS public.server_voice_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_muted BOOLEAN DEFAULT false,
    is_deafened BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

ALTER TABLE public.server_voice_states ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'server_voice_states' AND policyname = 'Users can manage their own voice state'
    ) THEN
        CREATE POLICY "Users can manage their own voice state" ON public.server_voice_states
        FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'server_voice_states' AND policyname = 'Users can view voice states in their servers'
    ) THEN
        CREATE POLICY "Users can view voice states in their servers" ON public.server_voice_states
        FOR SELECT USING (public.is_server_member(auth.uid(), server_id));
    END IF;
END $$;

-- 2. Message Attachments Columns
-- Add columns safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='attachments') THEN
        ALTER TABLE public.messages ADD COLUMN attachments JSONB DEFAULT '[]';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dm_messages' AND column_name='attachments') THEN
        ALTER TABLE public.dm_messages ADD COLUMN attachments JSONB DEFAULT '[]';
    END IF;
END $$;

-- 3. Storage Buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('server-icons', 'server-icons', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('server-banners', 'server-banners', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage Policies
-- Safe policy creation using existence checks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated uploads to chat') THEN
        CREATE POLICY "Allow authenticated uploads to chat" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public viewing of chat attachments') THEN
        CREATE POLICY "Allow public viewing of chat attachments" ON storage.objects FOR SELECT TO public USING (bucket_id = 'chat-attachments');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated uploads to server icons') THEN
        CREATE POLICY "Allow authenticated uploads to server icons" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'server-icons');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public viewing of server icons') THEN
        CREATE POLICY "Allow public viewing of server icons" ON storage.objects FOR SELECT TO public USING (bucket_id = 'server-icons');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated uploads to server banners') THEN
        CREATE POLICY "Allow authenticated uploads to server banners" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'server-banners');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public viewing of server banners') THEN
        CREATE POLICY "Allow public viewing of server banners" ON storage.objects FOR SELECT TO public USING (bucket_id = 'server-banners');
    END IF;
END $$;

-- 5. Realtime Publication
DO $$
BEGIN
    -- Check if table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'server_voice_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_states;
    END IF;
EXCEPTION
    WHEN others THEN 
        RAISE NOTICE 'Could not add table to publication. This is usually fine if the publication does not exist yet.';
END $$;

-- 6. RELOAD SCHEMA CACHE
-- This tells PostgREST to refresh its cache so the new tables/columns are visible immediately
NOTIFY pgrst, 'reload schema';
