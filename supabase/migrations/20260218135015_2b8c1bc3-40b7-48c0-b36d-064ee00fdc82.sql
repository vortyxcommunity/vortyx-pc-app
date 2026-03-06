
-- 1. Add user_tag column (auto-generated unique ID for easy finding)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_tag text UNIQUE;

-- Generate user_tag for existing profiles
UPDATE public.profiles SET user_tag = '#' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0') || SUBSTRING(id::text, 1, 4) WHERE user_tag IS NULL;

-- Function to auto-generate user_tag on new profiles
CREATE OR REPLACE FUNCTION public.generate_user_tag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_tag IS NULL THEN
    NEW.user_tag := '#' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0') || SUBSTRING(NEW.id::text, 1, 4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER generate_user_tag_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_user_tag();

-- 2. Storage policies for user-avatars bucket
CREATE POLICY "Anyone can view user avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'user-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'user-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'user-avatars' AND auth.role() = 'authenticated');

-- 3. Storage policies for server-icons bucket
CREATE POLICY "Anyone can view server icons"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'server-icons');

CREATE POLICY "Authenticated users can upload server icons"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'server-icons' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update server icons"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'server-icons' AND auth.role() = 'authenticated');

-- 4. Storage policies for server-banners bucket
CREATE POLICY "Anyone can view server banners"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'server-banners');

CREATE POLICY "Authenticated users can upload server banners"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'server-banners' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update server banners"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'server-banners' AND auth.role() = 'authenticated');

-- 5. Storage policies for message-files bucket
CREATE POLICY "Anyone can view message files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'message-files');

CREATE POLICY "Authenticated users can upload message files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'message-files' AND auth.role() = 'authenticated');
