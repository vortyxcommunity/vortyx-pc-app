-- VOICE PERMISSIONS FIX
-- Run this if you get "permission denied for table server_voice_states"

-- 1. Ensure the table exists and RLS is enabled
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

-- 2. Explicitly Grant Table Permissions
-- This ensures the authenticated role has basic DB access to the table
GRANT ALL ON TABLE public.server_voice_states TO authenticated;
GRANT ALL ON TABLE public.server_voice_states TO service_role;
GRANT ALL ON TABLE public.server_voice_states TO postgres;

-- 3. Surgical Policy Fix
-- Drop existing and recreate with both USING and WITH CHECK
DROP POLICY IF EXISTS "Users can manage their own voice state" ON public.server_voice_states;
CREATE POLICY "Users can manage their own voice state"
ON public.server_voice_states
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view voice states in their servers" ON public.server_voice_states;
CREATE POLICY "Users can view voice states in their servers"
ON public.server_voice_states
FOR SELECT
TO authenticated
USING (public.is_server_member(auth.uid(), server_id));

-- 5. Storage Fix (Icons, Banners, Attachments)
-- Ensure buckets exist
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('server-icons', 'server-icons', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('server-banners', 'server-banners', true) ON CONFLICT (id) DO NOTHING;

-- Surgical Storage Policies (Delete and Recreate)
DROP POLICY IF EXISTS "Allow authenticated uploads to chat" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to chat" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'chat-attachments') WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Allow public viewing of chat attachments" ON storage.objects;
CREATE POLICY "Allow public viewing of chat attachments" ON storage.objects FOR SELECT TO public USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Allow authenticated uploads to server icons" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to server icons" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'server-icons') WITH CHECK (bucket_id = 'server-icons');

DROP POLICY IF EXISTS "Allow public viewing of server icons" ON storage.objects;
CREATE POLICY "Allow public viewing of server icons" ON storage.objects FOR SELECT TO public USING (bucket_id = 'server-icons');

DROP POLICY IF EXISTS "Allow authenticated uploads to server banners" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to server banners" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'server-banners') WITH CHECK (bucket_id = 'server-banners');

DROP POLICY IF EXISTS "Allow public viewing of server banners" ON storage.objects;
CREATE POLICY "Allow public viewing of server banners" ON storage.objects FOR SELECT TO public USING (bucket_id = 'server-banners');

-- 6. Realtime Publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'server_voice_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_states;
    END IF;
EXCEPTION WHEN others THEN 
    -- Publication might not exist yet which is fine
END $$;

-- 7. Reload Cache
NOTIFY pgrst, 'reload schema';

