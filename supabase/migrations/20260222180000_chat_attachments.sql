-- Add attachments to dm_messages
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create storage bucket for chat attachments if it doesn't exist
-- Note: Supabase storage buckets are managed via the storage schema
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for chat-attachments bucket
-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- Allow users to view attachments
CREATE POLICY "Allow public viewing of attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- Allow users to delete their own attachments
CREATE POLICY "Allow individual deletion"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid() = owner);

-- Refine voice states upsert behavior by adding a constraint-based policy if needed
-- Actually, let's just make sure the unique constraint name is clear
ALTER TABLE public.server_voice_states DROP CONSTRAINT IF EXISTS server_voice_states_user_id_key;
ALTER TABLE public.server_voice_states ADD CONSTRAINT server_voice_states_user_id_key UNIQUE (user_id);
