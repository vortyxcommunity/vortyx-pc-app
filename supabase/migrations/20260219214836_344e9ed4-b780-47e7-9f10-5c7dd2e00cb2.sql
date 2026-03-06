
-- Backfill user_tags for existing profiles that don't have one
UPDATE public.profiles 
SET user_tag = '#' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0') || SUBSTRING(id::text, 1, 4)
WHERE user_tag IS NULL;

-- Ensure the trigger exists for new users
DROP TRIGGER IF EXISTS generate_user_tag_trigger ON public.profiles;
CREATE TRIGGER generate_user_tag_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_user_tag();
