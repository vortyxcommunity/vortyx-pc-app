
-- Fix channel permissions for existing channels and improve policies
UPDATE public.channels SET view_role = 'member' WHERE view_role IS NULL;
UPDATE public.channels SET send_role = 'member' WHERE send_role IS NULL;

ALTER TABLE public.channels ALTER COLUMN view_role SET NOT NULL;
ALTER TABLE public.channels ALTER COLUMN send_role SET NOT NULL;

-- Improved channel view policy to handle NULL (though previously set NOT NULL) and be more robust
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
CREATE POLICY "Members can view channels" ON public.channels FOR SELECT USING (
  public.is_server_member(auth.uid(), server_id) AND (
    public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin') OR
    view_role = 'member' OR
    (view_role = 'moderator' AND public.get_server_role(auth.uid(), server_id) IN ('admin', 'moderator'))
  )
);

-- Fix voice channel entry to respect permissions
DROP POLICY IF EXISTS "Users can manage their own voice state" ON public.server_voice_states;
CREATE POLICY "Users can manage their own voice state"
ON public.server_voice_states
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id AND 
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_id AND (
      public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin') OR
      c.view_role = 'member' OR
      (c.view_role = 'moderator' AND public.get_server_role(auth.uid(), server_id) IN ('admin', 'moderator'))
    )
  )
)
WITH CHECK (
  auth.uid() = user_id AND 
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_id AND (
      public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin') OR
      c.view_role = 'member' OR
      (c.view_role = 'moderator' AND public.get_server_role(auth.uid(), server_id) IN ('admin', 'moderator'))
    )
  )
);

-- Ensure profiles can be updated (sometimes voice state upsert depends on profile check)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users for voice states explicitely again
GRANT ALL ON TABLE public.server_voice_states TO authenticated;
