-- Create a table for voice channel states
CREATE TABLE IF NOT EXISTS public.server_voice_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_muted BOOLEAN DEFAULT false,
    is_deafened BOOLEAN DEFAULT false,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id) -- A user can only be in one voice channel at a time
);

-- Enable RLS
ALTER TABLE public.server_voice_states ENABLE ROW LEVEL SECURITY;

-- Policies for server_voice_states
CREATE POLICY "Users can view voice states in their servers"
ON public.server_voice_states FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = server_voice_states.server_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their own voice state"
ON public.server_voice_states FOR ALL
USING (auth.uid() = user_id);

-- Update Realtime
ALTER TABLE public.server_voice_states REPLICA IDENTITY FULL;
IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'server_voice_states'
) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_states;
END IF;
