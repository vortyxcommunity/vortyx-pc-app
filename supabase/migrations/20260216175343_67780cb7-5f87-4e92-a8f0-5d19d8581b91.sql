
-- =============================================
-- FIX SECURITY ISSUES
-- =============================================

-- 1. Fix profiles: require authentication
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Fix invites: require authentication
DROP POLICY IF EXISTS "Invites viewable by code" ON public.invites;
CREATE POLICY "Authenticated users can view invites"
  ON public.invites FOR SELECT
  USING (auth.role() = 'authenticated');

-- 3. Fix message_reactions: require channel access
DROP POLICY IF EXISTS "Members can view reactions" ON public.message_reactions;
CREATE POLICY "Members can view reactions"
  ON public.message_reactions FOR SELECT
  USING (can_access_channel(auth.uid(), (SELECT channel_id FROM public.messages WHERE id = message_id)));

-- =============================================
-- DM SYSTEM TABLES
-- =============================================

-- DM conversations
CREATE TABLE public.dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

-- DM participants
CREATE TABLE public.dm_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.dm_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dm_participants_user ON public.dm_participants(user_id);
CREATE INDEX idx_dm_participants_conv ON public.dm_participants(conversation_id);

-- DM messages
CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited boolean DEFAULT false
);

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dm_messages_conv ON public.dm_messages(conversation_id);

-- Helper function: check if user is in a DM conversation
CREATE OR REPLACE FUNCTION public.is_dm_participant(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dm_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$$;

-- RLS for dm_conversations
CREATE POLICY "Users can view their DM conversations"
  ON public.dm_conversations FOR SELECT
  USING (is_dm_participant(auth.uid(), id));

CREATE POLICY "Authenticated users can create DM conversations"
  ON public.dm_conversations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- RLS for dm_participants
CREATE POLICY "Users can view DM participants in their conversations"
  ON public.dm_participants FOR SELECT
  USING (is_dm_participant(auth.uid(), conversation_id));

CREATE POLICY "Authenticated users can add DM participants"
  ON public.dm_participants FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- RLS for dm_messages
CREATE POLICY "Users can view messages in their DM conversations"
  ON public.dm_messages FOR SELECT
  USING (is_dm_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can send DM messages"
  ON public.dm_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_dm_participant(auth.uid(), conversation_id));

CREATE POLICY "Users can edit own DM messages"
  ON public.dm_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own DM messages"
  ON public.dm_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at on dm_messages
CREATE TRIGGER update_dm_messages_updated_at
  BEFORE UPDATE ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
