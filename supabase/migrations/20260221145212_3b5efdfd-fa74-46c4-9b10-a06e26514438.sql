
-- Fix profiles policies: drop restrictive, create permissive
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_all" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Fix servers policies: drop restrictive, create permissive
DROP POLICY IF EXISTS "Authenticated users can create servers" ON public.servers;
DROP POLICY IF EXISTS "Members can view servers" ON public.servers;
DROP POLICY IF EXISTS "Owner can delete server" ON public.servers;
DROP POLICY IF EXISTS "Owner can update server" ON public.servers;
DROP POLICY IF EXISTS "servers_all" ON public.servers;

CREATE POLICY "Authenticated users can create servers" ON public.servers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Members can view servers" ON public.servers FOR SELECT TO authenticated USING (is_server_member(auth.uid(), id));
CREATE POLICY "Owner can update server" ON public.servers FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete server" ON public.servers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Fix server_members policies
DROP POLICY IF EXISTS "Members can view members" ON public.server_members;
DROP POLICY IF EXISTS "Can join server" ON public.server_members;
DROP POLICY IF EXISTS "Admins can update members" ON public.server_members;
DROP POLICY IF EXISTS "Owner can manage members" ON public.server_members;
DROP POLICY IF EXISTS "server_members_all" ON public.server_members;

CREATE POLICY "Members can view members" ON public.server_members FOR SELECT TO authenticated USING (is_server_member(auth.uid(), server_id));
CREATE POLICY "Can join server" ON public.server_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update members" ON public.server_members FOR UPDATE TO authenticated USING (get_server_role(auth.uid(), server_id) = ANY (ARRAY['owner'::app_role, 'admin'::app_role]));
CREATE POLICY "Owner can manage members" ON public.server_members FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR (get_server_role(auth.uid(), server_id) = ANY (ARRAY['owner'::app_role, 'admin'::app_role])));

-- Fix channels policies
DROP POLICY IF EXISTS "Members can view channels" ON public.channels;
DROP POLICY IF EXISTS "Admins can create channels" ON public.channels;
DROP POLICY IF EXISTS "Admins can update channels" ON public.channels;
DROP POLICY IF EXISTS "Admins can delete channels" ON public.channels;
DROP POLICY IF EXISTS "channels_all" ON public.channels;

CREATE POLICY "Members can view channels" ON public.channels FOR SELECT TO authenticated USING (is_server_member(auth.uid(), server_id));
CREATE POLICY "Admins can create channels" ON public.channels FOR INSERT TO authenticated WITH CHECK (get_server_role(auth.uid(), server_id) = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'moderator'::app_role]));
CREATE POLICY "Admins can update channels" ON public.channels FOR UPDATE TO authenticated USING (get_server_role(auth.uid(), server_id) = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'moderator'::app_role]));
CREATE POLICY "Admins can delete channels" ON public.channels FOR DELETE TO authenticated USING (get_server_role(auth.uid(), server_id) = ANY (ARRAY['owner'::app_role, 'admin'::app_role]));

-- Fix messages policies
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
DROP POLICY IF EXISTS "Authors can edit messages" ON public.messages;
DROP POLICY IF EXISTS "Authors and admins can delete messages" ON public.messages;
DROP POLICY IF EXISTS "messages_all" ON public.messages;

CREATE POLICY "Members can view messages" ON public.messages FOR SELECT TO authenticated USING (can_access_channel(auth.uid(), channel_id));
CREATE POLICY "Members can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND can_access_channel(auth.uid(), channel_id));
CREATE POLICY "Authors can edit messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authors and admins can delete messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix DM policies
DROP POLICY IF EXISTS "Users can view their DM conversations" ON public.dm_conversations;
DROP POLICY IF EXISTS "Authenticated users can create DM conversations" ON public.dm_conversations;
DROP POLICY IF EXISTS "dm_conversations_all" ON public.dm_conversations;

CREATE POLICY "Users can view their DM conversations" ON public.dm_conversations FOR SELECT TO authenticated USING (is_dm_participant(auth.uid(), id));
CREATE POLICY "Authenticated users can create DM conversations" ON public.dm_conversations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view DM participants in their conversations" ON public.dm_participants;
DROP POLICY IF EXISTS "Authenticated users can add DM participants" ON public.dm_participants;
DROP POLICY IF EXISTS "dm_participants_all" ON public.dm_participants;

CREATE POLICY "Users can view DM participants" ON public.dm_participants FOR SELECT TO authenticated USING (is_dm_participant(auth.uid(), conversation_id));
CREATE POLICY "Authenticated users can add DM participants" ON public.dm_participants FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view messages in their DM conversations" ON public.dm_messages;
DROP POLICY IF EXISTS "Users can send DM messages" ON public.dm_messages;
DROP POLICY IF EXISTS "Users can edit own DM messages" ON public.dm_messages;
DROP POLICY IF EXISTS "Users can delete own DM messages" ON public.dm_messages;
DROP POLICY IF EXISTS "dm_messages_all" ON public.dm_messages;

CREATE POLICY "Users can view DM messages" ON public.dm_messages FOR SELECT TO authenticated USING (is_dm_participant(auth.uid(), conversation_id));
CREATE POLICY "Users can send DM messages" ON public.dm_messages FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id) AND is_dm_participant(auth.uid(), conversation_id));
CREATE POLICY "Users can edit own DM messages" ON public.dm_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own DM messages" ON public.dm_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix invites policies
DROP POLICY IF EXISTS "Authenticated users can view invites" ON public.invites;
DROP POLICY IF EXISTS "Members can view invites" ON public.invites;
DROP POLICY IF EXISTS "Members can create invites" ON public.invites;
DROP POLICY IF EXISTS "invites_all" ON public.invites;

CREATE POLICY "Authenticated users can view invites" ON public.invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can create invites" ON public.invites FOR INSERT TO authenticated WITH CHECK (is_server_member(auth.uid(), server_id));

-- Fix friend_requests policies
DROP POLICY IF EXISTS "friend_requests_all" ON public.friend_requests;

CREATE POLICY "Users can view their friend requests" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send friend requests" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update received requests" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id);
CREATE POLICY "Users can delete own requests" ON public.friend_requests FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Fix friendships policies
DROP POLICY IF EXISTS "friendships_all" ON public.friendships;

CREATE POLICY "Users can view their friendships" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can create friendships" ON public.friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
CREATE POLICY "Users can delete friendships" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
