-- MASTER PROJECT FIX (Run this in Supabase SQL Editor)
-- This fixes Notifications, Voice States, and Call Signaling

-- 1. NOTIFICATIONS ENUM & TABLE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM ('friend_request', 'mention', 'server_invite', 'system', 'message', 'dm');
    ELSE
        -- Ensure all values exist
        BEGIN
            ALTER TYPE public.notification_type ADD VALUE 'message';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE public.notification_type ADD VALUE 'dm';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  content TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ENABLE REALTIME FOR ALL CRITICAL TABLES
-- We use REPLICA IDENTITY FULL to ensure we get Old and New data for all changes
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.dm_calls REPLICA IDENTITY FULL;
ALTER TABLE public.server_voice_states REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;

-- Ensure Publication exists and includes tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END$$;

-- Add tables to publication (ignore errors if already added)
BEGIN;
EXCEPTION WHEN OTHERS THEN ROLLBACK;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
COMMIT;

-- 3. FIX RLS POLICIES (Resetting them to be sure)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
CREATE POLICY "Users can manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- 4. MESSAGE TRIGGERS (CENTRALIZED NOTIFICATIONS)
-- This ensures every message creates a notification record

CREATE OR REPLACE FUNCTION public.handle_new_notification()
RETURNS TRIGGER AS $$
DECLARE
    server_id_val UUID;
    server_name_val TEXT;
    chan_name_val TEXT;
    sender_name_val TEXT;
    target_uid UUID;
    member_rec RECORD;
BEGIN
    -- Get sender name
    SELECT username INTO sender_name_val FROM public.profiles WHERE id = NEW.user_id;

    -- CASE 1: Server Message
    IF (TG_TABLE_NAME = 'messages') THEN
        SELECT server_id, name INTO server_id_val, chan_name_val FROM public.channels WHERE id = NEW.channel_id;
        SELECT name INTO server_name_val FROM public.servers WHERE id = server_id_val;

        FOR member_rec IN SELECT user_id FROM public.server_members WHERE server_id = server_id_val AND user_id != NEW.user_id LOOP
            INSERT INTO public.notifications (user_id, actor_id, type, content, link)
            VALUES (member_rec.user_id, NEW.user_id, 'message', 'sent a message in #' || chan_name_val || ' (' || server_name_val || ')', '/server/' || server_id_val || '/' || NEW.channel_id);
        END LOOP;

    -- CASE 2: DM Message
    ELSIF (TG_TABLE_NAME = 'dm_messages') THEN
        SELECT user_id INTO target_uid FROM public.dm_participants WHERE conversation_id = NEW.conversation_id AND user_id != NEW.user_id;
        IF target_uid IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, actor_id, type, content, link)
            VALUES (target_uid, NEW.user_id, 'dm', 'sent you a direct message', '/dm/' || NEW.conversation_id);
        END IF;

    -- CASE 3: Friend Request
    ELSIF (TG_TABLE_NAME = 'friend_requests') THEN
        IF (NEW.status = 'pending') THEN
            INSERT INTO public.notifications (user_id, actor_id, type, content, link)
            VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', 'sent you a friend request', '/dm');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply Triggers
DROP TRIGGER IF EXISTS on_msg_notif ON public.messages;
CREATE TRIGGER on_msg_notif AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_notification();

DROP TRIGGER IF EXISTS on_dm_msg_notif ON public.dm_messages;
CREATE TRIGGER on_dm_msg_notif AFTER INSERT ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_notification();

DROP TRIGGER IF EXISTS on_freq_notif ON public.friend_requests;
CREATE TRIGGER on_freq_notif AFTER INSERT ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.handle_new_notification();
