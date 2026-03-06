-- Create server categories table
CREATE TABLE IF NOT EXISTS public.server_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add category_id to channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.server_categories(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.server_categories ENABLE ROW LEVEL SECURITY;

-- Policies for server_categories
CREATE POLICY "Users can view categories in servers they are members of"
ON public.server_categories FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.server_members
        WHERE server_id = server_categories.server_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Owners and admins can manage categories"
ON public.server_categories FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.servers
        WHERE id = server_categories.server_id
        AND (owner_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.server_members
            WHERE server_id = server_categories.server_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        ))
    )
);

-- Update Realtime
ALTER TABLE public.server_categories REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_categories;

-- Function to handle server initialization
CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Add owner to server_members
    INSERT INTO public.server_members (server_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');

    -- 2. Create default category "TEXT CHANNELS"
    INSERT INTO public.server_categories (server_id, name, position)
    VALUES (NEW.id, 'Text Channels', 0);

    -- 3. Create default channel "general"
    INSERT INTO public.channels (server_id, name, type, position, category_id)
    SELECT NEW.id, 'general', 'text', 0, id
    FROM public.server_categories
    WHERE server_id = NEW.id AND name = 'Text Channels'
    LIMIT 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for server initialization
DROP TRIGGER IF EXISTS on_server_created ON public.servers;
CREATE TRIGGER on_server_created
    AFTER INSERT ON public.servers
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();
