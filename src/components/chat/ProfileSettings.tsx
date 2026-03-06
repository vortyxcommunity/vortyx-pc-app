import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, THEMES, ThemeName } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, User, Palette, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: 'online', label: '🟢 Online' },
  { value: 'idle', label: '🌙 Idle' },
  { value: 'do_not_disturb', label: '🔴 Do Not Disturb' },
  { value: 'invisible', label: '⚫ Invisible' },
];

type Tab = 'profile' | 'appearance';

const ProfileSettings: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('profile');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('online');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [userTag, setUserTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !open) return;
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setUsername(data.username || '');
        setDisplayName(data.global_display_name || '');
        setBio(data.bio || '');
        setStatus(data.status || 'online');
        setAvatarUrl(data.avatar_url);
        setBannerUrl(data.banner_url);
        setUserTag((data as any).user_tag || null);
      }
    };
    fetchProfile();
  }, [user, open]);

  const uploadFile = async (file: File, bucket: string) => {
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { toast.error('Upload failed: ' + error.message); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file, 'user-avatars');
    if (url) setAvatarUrl(url);
    setUploading(false);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file, 'user-avatars');
    if (url) setBannerUrl(url);
    setUploading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      username: username.trim(),
      global_display_name: displayName.trim() || null,
      bio: bio.trim(),
      status: status as any,
      avatar_url: avatarUrl,
      banner_url: bannerUrl,
    }).eq('id', user.id);
    if (!error) {
      toast.success('Profile updated!');
      onOpenChange(false);
    } else {
      toast.error('Failed to save: ' + error.message);
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: UserCircle },
    { id: 'appearance' as Tab, label: 'Appearance', icon: Palette },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-auto p-0">
        <div className="flex h-full">
          <div className="w-44 border-r border-border p-3 space-y-1 bg-background/50">
            <DialogHeader className="p-2 mb-2">
              <DialogTitle className="text-sm font-semibold text-foreground">Settings</DialogTitle>
            </DialogHeader>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              {tab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }} className="space-y-5">
                  <h3 className="text-base font-semibold text-foreground">Profile</h3>

                  <div className="relative h-24 rounded-lg bg-accent overflow-hidden cursor-pointer group" onClick={() => bannerInputRef.current?.click()} style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-foreground" />
                    </div>
                    <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </div>

                  <div className="flex items-end -mt-10 ml-4 relative z-10">
                    <div className="w-16 h-16 rounded-full bg-accent border-4 border-card overflow-hidden cursor-pointer group relative" onClick={() => avatarInputRef.current?.click()}>
                      {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex items-center justify-center text-primary"><User className="w-7 h-7" /></div>
                      )}
                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                        <Camera className="w-4 h-4 text-foreground" />
                      </div>
                      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {userTag && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Your ID</label>
                        <div className="px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground font-mono">{userTag}</div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Username</label>
                      <Input value={username} onChange={(e) => setUsername(e.target.value)} className="bg-background border-border" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Display Name</label>
                      <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="bg-background border-border" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Bio</label>
                      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="bg-background border-border resize-none" rows={3} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Status</label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button onClick={saveProfile} disabled={saving || uploading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </motion.div>
              )}

              {tab === 'appearance' && (
                <motion.div key="appearance" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }} className="space-y-5">
                  <h3 className="text-base font-semibold text-foreground">Appearance</h3>
                  <p className="text-sm text-muted-foreground">Choose a theme that suits your style</p>
                  <div className="grid grid-cols-2 gap-3">
                    {THEMES.map((t) => (
                      <button key={t.value} onClick={() => setTheme(t.value)} className={`p-3 rounded-lg border-2 text-left transition-all ${theme === t.value ? 'border-primary bg-accent' : 'border-border hover:border-muted-foreground/30 bg-background'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3 h-3 rounded-full ${t.value === 'midnight' ? 'bg-blue-500' : t.value === 'charcoal' ? 'bg-zinc-400' : t.value === 'abyss' ? 'bg-purple-500' : 'bg-emerald-500'}`} />
                          <span className="text-sm font-medium text-foreground">{t.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileSettings;
