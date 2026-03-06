
-- Add permission columns to channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS view_role public.app_role DEFAULT 'member';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS send_role public.app_role DEFAULT 'member';

-- Update channel view policy to respect view_role
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
CREATE POLICY "Members can view channels" ON public.channels FOR SELECT USING (
  public.is_server_member(auth.uid(), server_id) AND (
    -- Owner always sees everything
    public.get_server_role(auth.uid(), server_id) = 'owner' OR
    -- Admin sees everything
    public.get_server_role(auth.uid(), server_id) = 'admin' OR
    -- If view_role is member, everyone can see
    view_role = 'member' OR
    -- If view_role is moderator, admins and moderators can see
    (view_role = 'moderator' AND public.get_server_role(auth.uid(), server_id) IN ('admin', 'moderator')) OR
    -- If view_role is admin, only admins can see (covered by second condition above, but being explicit)
    (view_role = 'admin' AND public.get_server_role(auth.uid(), server_id) = 'admin')
  )
);

-- Update message send policy to respect send_role
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND 
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_id AND (
      public.get_server_role(auth.uid(), server_id) = 'owner' OR
      public.get_server_role(auth.uid(), server_id) = 'admin' OR
      c.send_role = 'member' OR
      (c.send_role = 'moderator' AND public.get_server_role(auth.uid(), server_id) IN ('admin', 'moderator')) OR
      (c.send_role = 'admin' AND public.get_server_role(auth.uid(), server_id) = 'admin')
    )
  )
);

-- Ensure members can view messages only if they can view the channel
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
CREATE POLICY "Members can view messages" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = messages.channel_id
  )
);
