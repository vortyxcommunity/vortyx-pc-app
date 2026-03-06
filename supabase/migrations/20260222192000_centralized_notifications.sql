
-- Global Notifications Table
CREATE TYPE public.notification_type AS ENUM ('friend_request', 'mention', 'server_invite', 'system');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  content TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can manage notifications" 
ON public.notifications FOR ALL 
USING (auth.uid() = user_id);

-- Trigger to create notification on friend request
CREATE OR REPLACE FUNCTION public.handle_friend_request_notif()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.notifications (user_id, actor_id, type, content, Link)
    VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', 'sent you a friend request', '/dm');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friend_request_added
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_notif();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
