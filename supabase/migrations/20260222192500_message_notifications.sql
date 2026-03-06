
-- Update notification type enum
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'message';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'dm';

-- Trigger for Server Messages
CREATE OR REPLACE FUNCTION public.handle_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    server_name TEXT;
    channel_name TEXT;
    member_record RECORD;
BEGIN
    SELECT name INTO server_name FROM public.servers WHERE id = (SELECT server_id FROM public.channels WHERE id = NEW.channel_id);
    SELECT name INTO channel_name FROM public.channels WHERE id = NEW.channel_id;

    -- Create notification for all other members of the server
    FOR member_record IN 
        SELECT user_id FROM public.server_members 
        WHERE server_id = (SELECT server_id FROM public.channels WHERE id = NEW.channel_id)
        AND user_id != NEW.user_id
    LOOP
        INSERT INTO public.notifications (user_id, actor_id, type, content, link)
        VALUES (
            member_record.user_id, 
            NEW.user_id, 
            'message', 
            'posted in #' || channel_name || ' (' || server_name || ')', 
            '/server/' || (SELECT server_id FROM public.channels WHERE id = NEW.channel_id) || '/' || NEW.channel_id
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_notification();

-- Trigger for DM Messages
CREATE OR REPLACE FUNCTION public.handle_dm_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT user_id INTO target_user_id 
    FROM public.dm_participants 
    WHERE conversation_id = NEW.conversation_id 
    AND user_id != NEW.user_id;

    INSERT INTO public.notifications (user_id, actor_id, type, content, link)
    VALUES (target_user_id, NEW.user_id, 'dm', 'sent you a direct message', '/dm/' || NEW.conversation_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_dm_message_created ON public.dm_messages;
CREATE TRIGGER on_dm_message_created
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_dm_message_notification();
