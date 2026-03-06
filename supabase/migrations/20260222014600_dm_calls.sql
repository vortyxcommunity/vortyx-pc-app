-- Voice Calls Table
CREATE TABLE IF NOT EXISTS public.dm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ringing', -- ringing, active, ended, declined
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dm_calls ENABLE ROW LEVEL SECURITY;

-- Users can view calls they are part of
CREATE POLICY "Users can view their own calls"
  ON public.dm_calls FOR SELECT
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Users can start a call
CREATE POLICY "Users can start calls"
  ON public.dm_calls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = caller_id);

-- Users can update status (accept, decline, end)
CREATE POLICY "Users can update their calls"
  ON public.dm_calls FOR UPDATE
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;
