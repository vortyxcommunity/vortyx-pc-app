-- MASTER NOTIFICATIONS SETUP (Run this in Supabase SQL Editor)
-- This script ensures the notifications system is fully initialized

-- 1. Create the enum type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM ('friend_request', 'mention', 'server_invite', 'system', 'message', 'dm');
    ELSE
        -- Add missing values if type already exists
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'message';
        ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'dm';
    END IF;
END$$;

-- 2. Create the notifications table
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

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can manage notifications" ON public.notifications;
CREATE POLICY "System can manage notifications" 
ON public.notifications FOR ALL 
USING (auth.uid() = user_id);

-- 4. Trigger for Friend Requests
CREATE OR REPLACE FUNCTION public.handle_friend_request_notif()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.notifications (user_id, actor_id, type, content, link)
    VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', 'sent you a friend request', '/dm');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_request_added ON public.friend_requests;
CREATE TRIGGER on_friend_request_added
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_notif();

-- 5. Trigger for Server Messages
CREATE OR REPLACE FUNCTION public.handle_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    server_id_val UUID;
    server_name TEXT;
    channel_name TEXT;
    member_record RECORD;
BEGIN
    SELECT server_id, name INTO server_id_val, channel_name FROM public.channels WHERE id = NEW.channel_id;
    SELECT name INTO server_name FROM public.servers WHERE id = server_id_val;

    FOR member_record IN 
        SELECT user_id FROM public.server_members 
        WHERE server_id = server_id_val
        AND user_id != NEW.user_id
    LOOP
        INSERT INTO public.notifications (user_id, actor_id, type, content, link)
        VALUES (
            member_record.user_id, 
            NEW.user_id, 
            'message', 
            'posted in #' || channel_name || ' (' || server_name || ')', 
            '/server/' || server_id_val || '/' || NEW.channel_id
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_notification();

-- 6. Trigger for DM Messages
CREATE OR REPLACE FUNCTION public.handle_dm_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT user_id INTO target_user_id 
    FROM public.dm_participants 
    WHERE conversation_id = NEW.conversation_id 
    AND user_id != NEW.user_id;

    IF target_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, actor_id, type, content, link)
        VALUES (target_user_id, NEW.user_id, 'dm', 'sent you a direct message', '/dm/' || NEW.conversation_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_dm_message_created ON public.dm_messages;
CREATE TRIGGER on_dm_message_created
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_dm_message_notification();

-- 7. Ensure Realtime is enabled
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- Note: If it's already there, this might error, but the SQL editor will usually handle it or you can ignore the error.
