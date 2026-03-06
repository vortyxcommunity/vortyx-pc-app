-- 1. FIX SERVER_MEMBERS INSERT POLICY
-- Allow Owners and Admins to add others.
DROP POLICY IF EXISTS "Can join server" ON public.server_members;
DROP POLICY IF EXISTS "Users can join themselves or be added by admins" ON public.server_members;
CREATE POLICY "Users can join themselves or be added by admins" 
ON public.server_members FOR INSERT 
WITH CHECK (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM public.servers
        WHERE id = server_id AND (
            owner_id = auth.uid() OR 
            EXISTS (
                SELECT 1 FROM public.server_members
                WHERE server_id = public.server_members.server_id 
                AND user_id = auth.uid() 
                AND role IN ('owner', 'admin')
            )
        )
    )
);

-- 2. FIX SERVER_CATEGORIES POLICY
DROP POLICY IF EXISTS "Owners and admins can manage categories" ON public.server_categories;
CREATE POLICY "Owners and admins can manage categories"
ON public.server_categories FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.server_members 
    WHERE public.server_members.server_id = public.server_categories.server_id 
    AND public.server_members.user_id = auth.uid() 
    AND public.server_members.role IN ('owner', 'admin', 'moderator')
  )
);

-- 3. CUSTOM ROLES SYSTEM
CREATE TABLE IF NOT EXISTS public.server_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#94a3b8',
    icon TEXT, -- Lucide icon name
    position INTEGER DEFAULT 0,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add custom_role_id to server_members
ALTER TABLE public.server_members ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.server_roles(id) ON DELETE SET NULL;

-- Enable RLS for server_roles
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;

-- Policies for server_roles
DROP POLICY IF EXISTS "Members can view roles" ON public.server_roles;
CREATE POLICY "Members can view roles"
ON public.server_roles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = public.server_roles.server_id
        AND user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Owners and admins can manage roles" ON public.server_roles;
CREATE POLICY "Owners and admins can manage roles"
ON public.server_roles FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = public.server_roles.server_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'moderator')
    )
);

-- Add to Realtime
ALTER TABLE public.server_roles REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'server_roles') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.server_roles;
    END IF;
END $$;

-- 4. FIX CHANNELS POLICY
DROP POLICY IF EXISTS "Admins can create channels" ON public.channels;
DROP POLICY IF EXISTS "Owners and admins can manage channels" ON public.channels;
CREATE POLICY "Owners and admins can manage channels" 
ON public.channels FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.server_members 
    WHERE public.server_members.server_id = public.channels.server_id 
    AND public.server_members.user_id = auth.uid() 
    AND public.server_members.role IN ('owner', 'admin', 'moderator')
  )
);
