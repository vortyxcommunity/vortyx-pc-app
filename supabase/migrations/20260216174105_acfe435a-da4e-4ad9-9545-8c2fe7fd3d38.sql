
-- Enum types
CREATE TYPE public.user_status AS ENUM ('online', 'idle', 'do_not_disturb', 'invisible', 'offline');
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'moderator', 'member');
CREATE TYPE public.channel_type AS ENUM ('text', 'voice');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  global_display_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT DEFAULT '',
  status user_status DEFAULT 'online',
  theme_color TEXT DEFAULT '#00f2ff',
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, global_display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Servers table
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  banner_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- Server members table
CREATE TABLE public.server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role DEFAULT 'member',
  nickname TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(server_id, user_id)
);

ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- Security definer function for membership check
CREATE OR REPLACE FUNCTION public.is_server_member(_user_id UUID, _server_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE user_id = _user_id AND server_id = _server_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_server_role(_user_id UUID, _server_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.server_members
  WHERE user_id = _user_id AND server_id = _server_id
$$;

-- Server policies
CREATE POLICY "Members can view servers" ON public.servers FOR SELECT USING (public.is_server_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create servers" ON public.servers FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update server" ON public.servers FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete server" ON public.servers FOR DELETE USING (auth.uid() = owner_id);

-- Server member policies
CREATE POLICY "Members can view members" ON public.server_members FOR SELECT USING (public.is_server_member(auth.uid(), server_id));
CREATE POLICY "Can join server" ON public.server_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can manage members" ON public.server_members FOR DELETE USING (
  auth.uid() = user_id OR public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin')
);
CREATE POLICY "Admins can update members" ON public.server_members FOR UPDATE USING (
  public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin')
);

-- Channels table
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type channel_type DEFAULT 'text',
  topic TEXT DEFAULT '',
  position INT DEFAULT 0,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view channels" ON public.channels FOR SELECT USING (public.is_server_member(auth.uid(), server_id));
CREATE POLICY "Admins can create channels" ON public.channels FOR INSERT WITH CHECK (
  public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin', 'moderator')
);
CREATE POLICY "Admins can update channels" ON public.channels FOR UPDATE USING (
  public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin', 'moderator')
);
CREATE POLICY "Admins can delete channels" ON public.channels FOR DELETE USING (
  public.get_server_role(auth.uid(), server_id) IN ('owner', 'admin')
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT false,
  reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Function to check channel membership through server
CREATE OR REPLACE FUNCTION public.can_access_channel(_user_id UUID, _channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE c.id = _channel_id AND sm.user_id = _user_id
  )
$$;

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT USING (public.can_access_channel(auth.uid(), channel_id));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_access_channel(auth.uid(), channel_id));
CREATE POLICY "Authors can edit messages" ON public.messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authors and admins can delete messages" ON public.messages FOR DELETE USING (auth.uid() = user_id);

-- Message reactions
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view reactions" ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- Invites table
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view invites" ON public.invites FOR SELECT USING (public.is_server_member(auth.uid(), server_id));
CREATE POLICY "Members can create invites" ON public.invites FOR INSERT WITH CHECK (public.is_server_member(auth.uid(), server_id));
CREATE POLICY "Invites viewable by code" ON public.invites FOR SELECT USING (true);

-- Auto-create default channels when server is created
CREATE OR REPLACE FUNCTION public.handle_new_server()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add owner as member
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  
  -- Create default channels
  INSERT INTO public.channels (server_id, name, type, position)
  VALUES 
    (NEW.id, 'general', 'text', 0),
    (NEW.id, 'voice', 'voice', 1);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_server_created
  AFTER INSERT ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_server_members_user ON public.server_members(user_id);
CREATE INDEX idx_server_members_server ON public.server_members(server_id);
CREATE INDEX idx_channels_server ON public.channels(server_id);
CREATE INDEX idx_messages_channel ON public.messages(channel_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_invites_code ON public.invites(code);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
