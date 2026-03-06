import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Server } from '@/pages/MainApp';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Camera, Plus, Trash2, Users, Shield, Crown, ShieldCheck, UserPlus, Link2, Hash, Mic, Lock, Unlock, Eye, EyeOff, ChevronRight, Palette, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket } from 'lucide-react';

import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const copyToClipboard = async (text: string) => {
  try {
    // @ts-ignore
    if (window.electron?.copyToClipboard) {
      // @ts-ignore
      window.electron.copyToClipboard(text);
      toast.success('Copied to clipboard!');
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy: ', err);
    toast.error('Failed to copy to clipboard');
  }
};

interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  category_id: string | null;
}

interface CustomRole {
  id: string;
  server_id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  permissions: Record<string, boolean>;
}

const PERMISSIONS = [
  { id: 'MANAGE_CHANNELS', label: 'Manage Channels', description: 'Create and delete channels or categories' },
  { id: 'MANAGE_ROLES', label: 'Manage Roles', description: 'Create, delete and edit server roles' },
  { id: 'MANAGE_SERVER', label: 'Manage Server', description: 'Change name, icon, and banner' },
  { id: 'KICK_MEMBERS', label: 'Kick Members', description: 'Remove members from the server' },
  { id: 'SEND_MESSAGES', label: 'Send Messages', description: 'Ability to post in text channels' }
];

interface Member {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  custom_role_id: string | null;
  username: string;
  avatar_url: string | null;
  user_tag: string | null;
}

const AVAILABLE_ICONS: Record<string, any> = {
  Shield, Crown, ShieldCheck, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: Server;
  categories: Category[];
  channels: Channel[];
  onServerUpdate: () => void;
  onChannelsUpdate: () => void;
}

type Tab = 'overview' | 'channels' | 'roles' | 'members' | 'invites' | 'danger' | 'audit';

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3.5 h-3.5 text-warning" />,
  admin: <ShieldCheck className="w-3.5 h-3.5 text-primary" />,
  moderator: <Shield className="w-3.5 h-3.5 text-success" />,
  member: null,
};

const ServerSettings: React.FC<Props> = ({ open, onOpenChange, server, categories, channels, onServerUpdate, onChannelsUpdate }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [serverName, setServerName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [iconUrl, setIconUrl] = useState(server.icon_url);
  const [bannerUrl, setBannerUrl] = useState(server.banner_url);
  const [saving, setSaving] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [isPrivate, setIsPrivate] = useState(server.is_private);
  const [pin, setPin] = useState(server.pin || '');
  const [showPin, setShowPin] = useState(false);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLeaving, setIsLeaving] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const isOwner = user?.id === server.owner_id;

  useEffect(() => {
    if (open) {
      if (tab === 'members') fetchMembers();
      if (tab === 'roles' || tab === 'members') fetchCustomRoles();
      if (tab === 'audit') fetchAuditLogs();
    }
  }, [open, tab]);

  useEffect(() => {
    setServerName(server.name);
    setDescription(server.description || '');
    setIconUrl(server.icon_url);
    setBannerUrl(server.banner_url);
    setIsPrivate(server.is_private);
    setPin(server.pin || '');
  }, [server]);

  useEffect(() => {
    if (!user || !open) return;
    supabase.from('server_members').select('role').eq('server_id', server.id).eq('user_id', user.id).single().then(({ data }) => {
      setUserRole((data as any)?.role || null);
    });
  }, [user, open, server.id]);

  const fetchMembers = async () => {
    const { data } = await supabase.from('server_members').select('id, user_id, role, custom_role_id').eq('server_id', server.id);
    if (!data) return;
    const userIds = data.map((m: any) => m.user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, user_tag').in('id', userIds);
    const profileMap: Record<string, any> = {};
    profiles?.forEach((p: any) => { profileMap[p.id] = p; });
    setMembers(data.map((m: any) => ({
      ...m,
      username: profileMap[m.user_id]?.username || 'Unknown',
      avatar_url: profileMap[m.user_id]?.avatar_url || null,
      user_tag: profileMap[m.user_id]?.user_tag || null,
    })));
  };

  const fetchCustomRoles = async () => {
    const { data } = await supabase.from('server_roles' as any).select('*').eq('server_id', server.id).order('position', { ascending: true });
    if (data) setCustomRoles(data as any);
  };

  const uploadFile = async (file: File, bucket: string) => {
    const ext = file.name.split('.').pop();
    const path = `${server.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { toast.error('Upload failed: ' + error.message); return null; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, 'server-icons');
    if (url) setIconUrl(url);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, 'server-banners');
    if (url) setBannerUrl(url);
  };

  const saveServer = async () => {
    if (!serverName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('servers' as any).update({
      name: serverName.trim(),
      description: description.trim(),
      icon_url: iconUrl,
      banner_url: bannerUrl,
      is_private: isPrivate,
      pin: isPrivate ? pin : null
    }).eq('id', server.id);
    if (!error) {
      toast.success('Server updated!');
      onServerUpdate();
    } else {
      toast.error('Failed to update server');
    }
    setSaving(false);
  };

  const generatePIN = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pin = '';
    for (let i = 0; i < 8; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  };

  const regeneratePin = async () => {
    const newPin = generatePIN();
    const { error } = await supabase.from('servers' as any).update({ pin: newPin }).eq('id', server.id);
    if (!error) {
      setPin(newPin);
      toast.success('PIN regenerated!');
      onServerUpdate();
    } else {
      toast.error('Failed to regenerate PIN');
    }
  };

  const copyPin = () => {
    copyToClipboard(pin);
  };

  const createCustomRole = async () => {
    if (!newRoleName.trim()) return;
    setCreatingRole(true);
    const { error } = await supabase.from('server_roles' as any).insert({
      server_id: server.id,
      name: newRoleName.trim(),
      position: customRoles.length,
    });
    if (!error) {
      setNewRoleName('');
      fetchCustomRoles();
      toast.success('Role created!');
      logAction('CREATE_ROLE', newRoleName);
    } else {
      console.error('Create Role Error:', error);
      toast.error(`Failed to create role: ${error.message}`);
    }
    setCreatingRole(false);
  };

  const deleteCustomRole = async (id: string) => {
    if (!confirm('Are you sure? This will unassign this role from all members.')) return;
    const { error } = await supabase.from('server_roles' as any).delete().eq('id', id);
    if (!error) {
      fetchCustomRoles();
      toast.success('Role deleted');
    }
  };

  const updateRoleMetadata = async (roleId: string, updates: Partial<CustomRole>) => {
    const { error } = await supabase.from('server_roles' as any).update(updates).eq('id', roleId);
    if (!error) {
      fetchCustomRoles();
    }
  };

  const createChannel = async (categoryId: string | null = null) => {
    if (!newChannelName.trim()) return;
    setCreatingChannel(true);
    const { error } = await supabase.from('channels').insert({
      server_id: server.id,
      name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
      type: newChannelType,
      position: channels.length,
      category_id: categoryId,
    });
    if (!error) {
      setNewChannelName('');
      onChannelsUpdate();
      toast.success('Channel created!');
    } else {
      toast.error('Failed to create channel');
    }
    setCreatingChannel(false);
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    const { error } = await supabase.from('server_categories' as any).insert({
      server_id: server.id,
      name: newCategoryName.trim(),
      position: categories.length,
    });
    if (!error) {
      setNewCategoryName('');
      onChannelsUpdate();
      toast.success('Category created!');
    } else {
      console.error('Create Category Error:', error);
      toast.error(`Failed to create category: ${error.message}`);
    }
    setCreatingCategory(false);
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Are you sure? This will not delete channels, but they will become uncategorized.')) return;
    const { error } = await supabase.from('server_categories' as any).delete().eq('id', id);
    if (!error) { onChannelsUpdate(); toast.success('Category removed'); }
  };

  const updateChannelCategory = async (channelId: string, categoryId: string | null) => {
    const { error } = await supabase.from('channels' as any).update({ category_id: categoryId }).eq('id', channelId);
    if (!error) onChannelsUpdate();
  };

  const deleteChannel = async (channelId: string) => {
    const { error } = await supabase.from('channels').delete().eq('id', channelId);
    if (!error) { onChannelsUpdate(); toast.success('Channel deleted'); }
  };

  const updateMemberRole = async (memberUserId: string, newRole: string) => {
    const { error } = await supabase.from('server_members').update({ role: newRole as any }).eq('id', memberUserId);
    if (!error) { toast.success('Role updated'); fetchMembers(); }
  };

  const updateMemberCustomRole = async (memberId: string, customRoleId: string | null) => {
    const { error } = await supabase.from('server_members').update({ custom_role_id: customRoleId } as any).eq('id', memberId);
    if (!error) { fetchMembers(); }
  };

  const addMemberByUsername = async () => {
    if (!addUsername.trim()) return;
    setAddingMember(true);
    const { data: profile } = await supabase.from('profiles').select('id, username').or(`username.ilike.${addUsername.trim()},user_tag.ilike.${addUsername.trim()}`).limit(1).maybeSingle();
    if (!profile) { toast.error('User not found'); setAddingMember(false); return; }

    const { data: existing } = await supabase.from('server_members').select('id').eq('server_id', server.id).eq('user_id', (profile as any).id).maybeSingle();
    if (existing) { toast.error('User is already a member'); setAddingMember(false); return; }

    const { error } = await supabase.from('server_members').insert({
      server_id: server.id,
      user_id: (profile as any).id,
      role: 'member' as any,
    });
    if (!error) {
      toast.success(`${(profile as any).username} added!`);
      setAddUsername('');
      fetchMembers();
    } else {
      toast.error('Failed to add member');
    }
    setAddingMember(false);
  };

  const generateInvite = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('invites').insert({ server_id: server.id, created_by: user.id }).select('code').single();
    if (data) {
      let origin = window.location.origin;
      if (origin.startsWith('file://')) origin = 'https://vortyx.app';
      const link = `${origin}/invite/${(data as any).code}`;
      copyToClipboard(link);
    } else if (error) {
      toast.error('Failed to generate invite');
    }
  };

  const deleteServer = async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    const { error } = await supabase.from('servers').delete().eq('id', server.id);
    if (!error) { toast.success('Server deleted'); onOpenChange(false); onServerUpdate(); }
  };

  const leaveServer = async () => {
    if (!user || isOwner) return;
    if (!confirm('Are you sure?')) return;
    setIsLeaving(true);
    const { error } = await supabase.from('server_members').delete().eq('server_id', server.id).eq('user_id', user.id);
    if (!error) {
      toast.success('You left the server');
      onOpenChange(false);
      onServerUpdate();
    }
    setIsLeaving(false);
  };

  const kickMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to kick ${memberName}?`)) return;
    const { error } = await supabase.from('server_members').delete().eq('id', memberId);
    if (!error) {
      toast.success(`${memberName} kicked`);
      fetchMembers();
      logAction('KICK', memberName);
    }
  };

  const fetchAuditLogs = async () => {
    const { data } = await supabase.from('server_audit_logs' as any).select('*, actor:profiles(username)').eq('server_id', server.id).order('created_at', { ascending: false }).limit(50);
    if (data) setAuditLogs(data);
  };

  const logAction = async (action: string, target: string = '') => {
    if (!user) return;
    await supabase.from('server_audit_logs' as any).insert({
      server_id: server.id,
      actor_id: user.id,
      action,
      target_name: target
    });
  };

  const canManageMembers = isOwner || userRole === 'admin';

  const tabs = [
    { id: 'overview' as Tab, label: 'Overview', icon: Camera },
    { id: 'channels' as Tab, label: 'Channels', icon: Plus },
    { id: 'roles' as Tab, label: 'Roles', icon: Shield },
    { id: 'members' as Tab, label: 'Members', icon: Users },
    { id: 'invites' as Tab, label: 'Invites', icon: Link2 },
    { id: 'audit' as Tab, label: 'Audit Log', icon: Hash },
    ...(isOwner ? [{ id: 'danger' as Tab, label: 'Danger Zone', icon: Trash2 }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-hidden p-0">
        <div className="flex h-full min-h-[400px]">
          <div className="w-44 border-r border-border p-3 space-y-1 bg-background/50">
            <DialogHeader className="p-2 mb-2">
              <DialogTitle className="text-sm font-semibold text-foreground truncate">{server.name}</DialogTitle>
            </DialogHeader>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  } ${t.id === 'danger' ? 'text-destructive' : ''}`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              {tab === 'overview' && (
                <motion.div key="overview" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground">Server Overview</h3>
                  <div
                    className="relative h-28 rounded-lg bg-accent overflow-hidden cursor-pointer group"
                    onClick={() => bannerInputRef.current?.click()}
                    style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                  >
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-foreground" />
                    </div>
                    <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-accent overflow-hidden cursor-pointer group relative shrink-0" onClick={() => iconInputRef.current?.click()}>
                      {iconUrl ? (
                        <img src={iconUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary font-bold text-2xl">{serverName.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-5 h-5 text-foreground" />
                      </div>
                      <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Server Name</label>
                      <Input value={serverName} onChange={(e) => setServerName(e.target.value)} className="bg-background border-border" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Description</label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background border-border resize-none" rows={3} />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      Privacy & Security
                    </h4>

                    <div className="flex items-center justify-between p-4 bg-accent/20 rounded-xl border border-border">
                      <div className="space-y-0.5">
                        <label className="text-sm font-bold flex items-center gap-2">
                          {isPrivate ? <Lock className="w-4 h-4 text-primary" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                          Private Server
                        </label>
                        <p className="text-xs text-muted-foreground">Require a PIN to join via invite code.</p>
                      </div>
                      <Switch
                        checked={isPrivate}
                        onCheckedChange={(val) => {
                          setIsPrivate(val);
                          if (val && !pin) setPin(generatePIN());
                        }}
                        disabled={!isOwner}
                      />
                    </div>

                    {isPrivate && (
                      <div className="space-y-3 p-4 bg-accent/20 rounded-xl border border-border">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Join PIN</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showPin ? "text" : "password"}
                              value={pin}
                              readOnly
                              className="bg-background border-border font-mono tracking-widest text-center text-lg h-12"
                            />
                            <button onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <Button variant="secondary" onClick={copyPin} disabled={!pin} className="h-12 px-4 shadow-sm">
                            <Link2 className="w-4 h-4 mr-2" /> Copy
                          </Button>
                        </div>
                        {isOwner && (
                          <Button variant="outline" size="sm" onClick={regeneratePin} className="w-full text-[10px] uppercase font-black tracking-widest h-8">
                            Regenerate PIN
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <Button onClick={saveServer} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </motion.div>
              )}

              {tab === 'channels' && (
                <motion.div key="channels" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-6">
                  <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">Channels & Categories</h3>
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Categories</label>
                    <div className="flex gap-2">
                      <Input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="bg-background border-border flex-1" onKeyDown={(e) => e.key === 'Enter' && createCategory()} />
                      <Button onClick={createCategory} disabled={creatingCategory || !newCategoryName.trim()} size="sm" variant="secondary"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                    </div>
                    <div className="space-y-1 mt-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="flex items-center justify-between px-3 py-2 bg-background/40 rounded-md border border-border/50 group">
                          <span className="text-sm font-medium text-foreground">{cat.name}</span>
                          <button onClick={() => deleteCategory(cat.id)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Channels</label>
                    <div className="flex gap-2">
                      <Input placeholder="New channel name" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} className="bg-background border-border flex-1" onKeyDown={(e) => e.key === 'Enter' && createChannel()} />
                      <Select value={newChannelType} onValueChange={(v) => setNewChannelType(v as any)}>
                        <SelectTrigger className="bg-background border-border w-24 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="voice">Voice</SelectItem></SelectContent>
                      </Select>
                      <Button onClick={() => createChannel()} disabled={creatingChannel || !newChannelName.trim()} size="sm" className="bg-primary text-primary-foreground">Add</Button>
                    </div>
                    <div className="space-y-1.5 mt-4">
                      {channels.map(ch => (
                        <div key={ch.id} className="flex items-center justify-between px-3 py-2.5 bg-background border border-border rounded-lg group">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground flex items-center gap-1.5">{ch.type === 'text' ? <Hash className="w-3.5 h-3.5 opacity-50" /> : <Mic className="w-3.5 h-3.5 opacity-50" />}{ch.name}</span>
                            <Select value={ch.category_id || "none"} onValueChange={(v) => updateChannelCategory(ch.id, v === "none" ? null : v)}>
                              <SelectTrigger className="h-6 border-none bg-accent/50 text-[10px] w-28 px-1.5 gap-1 focus:ring-0"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                              <SelectContent className="text-xs"><SelectItem value="none">Uncategorized</SelectItem>{categories.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                            </Select>
                          </div>
                          <button onClick={() => deleteChannel(ch.id)} className="bg-destructive/10 hover:bg-destructive/20 text-destructive p-1.5 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {tab === 'roles' && (
                <motion.div key="roles" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-6">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-base font-semibold text-foreground">Custom Roles</h3>
                    <div className="flex gap-2">
                      <Input placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="bg-background border-border h-8 text-xs w-32" />
                      <Button onClick={createCustomRole} disabled={creatingRole || !newRoleName.trim()} size="sm" className="h-8">{creatingRole ? '...' : <Plus className="w-3.5 h-3.5" />}</Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {customRoles.map((role) => (
                      <div key={role.id} className="p-4 bg-accent/20 rounded-2xl border border-border space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/10" style={{ backgroundColor: role.color }}>
                              {role.icon && AVAILABLE_ICONS[role.icon] ? React.createElement(AVAILABLE_ICONS[role.icon], { className: "w-5 h-5" }) : <span>{role.name.charAt(0).toUpperCase()}</span>}
                            </div>
                            <Input value={role.name} onChange={(e) => updateRoleMetadata(role.id, { name: e.target.value })} className="h-7 text-sm font-bold bg-transparent border-none p-0 focus-visible:ring-0 w-32" />
                          </div>
                          <button onClick={() => deleteCustomRole(role.id)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-4 pt-2 border-t border-white/5">
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-black text-muted-foreground"><Palette className="w-3 h-3 inline mr-1" /> Color</label>
                            <input type="color" value={role.color} onChange={(e) => updateRoleMetadata(role.id, { color: e.target.value })} className="w-12 h-8 rounded-lg cursor-pointer bg-background border border-border" />
                          </div>
                          <div className="space-y-1.5 flex-1 min-w-[200px]">
                            <label className="text-[10px] uppercase font-black text-muted-foreground"><Shield className="w-3 h-3 inline mr-1" /> Icon</label>
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => updateRoleMetadata(role.id, { icon: null })} className={`w-7 h-7 rounded border text-[10px] ${!role.icon ? 'border-primary bg-primary/10' : 'border-border'}`}>None</button>
                              {Object.keys(AVAILABLE_ICONS).map(name => (
                                <button key={name} onClick={() => updateRoleMetadata(role.id, { icon: name })} className={`w-7 h-7 rounded flex items-center justify-center border transition-all ${role.icon === name ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{React.createElement(AVAILABLE_ICONS[name], { className: "w-3.5 h-3.5" })}</button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-3">
                          <label className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Permissions</label>
                          <div className="grid grid-cols-1 gap-2">
                            {PERMISSIONS.map(p => (
                              <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-background/30 border border-white/5">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold">{p.label}</p>
                                  <p className="text-[9px] text-muted-foreground">{p.description}</p>
                                </div>
                                <Switch
                                  checked={!!role.permissions?.[p.id]}
                                  onCheckedChange={(val) => {
                                    const newPerms = { ...(role.permissions || {}), [p.id]: val };
                                    updateRoleMetadata(role.id, { permissions: newPerms });
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {tab === 'members' && (
                <motion.div key="members" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-foreground">Members</h3>{!isOwner && <Button variant="outline" size="sm" onClick={leaveServer} disabled={isLeaving} className="text-destructive">{isLeaving ? 'Leaving...' : 'Leave Server'}</Button>}</div>
                  {canManageMembers && (
                    <div className="space-y-2 p-3 bg-background rounded-lg border border-border">
                      <label className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Add Member</label>
                      <div className="flex gap-2">
                        <Input placeholder="Username..." value={addUsername} onChange={(e) => setAddUsername(e.target.value)} className="bg-card border-border flex-1" onKeyDown={(e) => e.key === 'Enter' && addMemberByUsername()} />
                        <Button onClick={addMemberByUsername} disabled={addingMember || !addUsername.trim()} size="sm" variant="secondary">{addingMember ? '...' : 'Add'}</Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {members.map((m) => {
                      const customRole = customRoles.find(r => r.id === m.custom_role_id);
                      return (
                        <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-background/50 hover:bg-background rounded-lg transition-all border border-transparent hover:border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-xs" style={{ backgroundColor: customRole?.color || '#94a3b8' }}>
                              {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-10 h-10 rounded-lg object-cover" /> : m.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5"><span className="text-sm font-bold" style={{ color: customRole?.color || 'inherit' }}>{m.username}</span>{customRole?.icon && AVAILABLE_ICONS[customRole.icon] ? React.createElement(AVAILABLE_ICONS[customRole.icon], { className: "w-3 h-3" }) : ROLE_ICONS[m.role]}</div>
                              <div className="flex items-center gap-2">{m.user_id === server.owner_id && <span className="text-[9px] font-black text-primary uppercase">Owner</span>}{customRole && <span className="text-[9px] font-bold opacity-70" style={{ color: customRole.color }}>{customRole.name}</span>}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canManageMembers && m.user_id !== server.owner_id && (
                              <div className="flex items-center gap-2">
                                <Select value={m.custom_role_id || "none"} onValueChange={(v) => updateMemberCustomRole(m.id, v === "none" ? null : v)}>
                                  <SelectTrigger className="h-8 text-[10px] w-28 bg-card/50"><SelectValue placeholder="Identity" /></SelectTrigger>
                                  <SelectContent><SelectItem value="none">No Identity</SelectItem>{customRoles.map(r => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}</SelectContent>
                                </Select>
                                <Select value={m.role} onValueChange={(v) => updateMemberRole(m.id, v)}>
                                  <SelectTrigger className="h-8 text-[10px] w-24 bg-card/50"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="moderator">Moderator</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent>
                                </Select>
                                <button onClick={() => kickMember(m.id, m.username)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {tab === 'invites' && (
                <motion.div key="invites" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground">Invites</h3>
                  <p className="text-sm text-muted-foreground">Generate invite links for others to join this server.</p>
                  <Button onClick={generateInvite} className="bg-primary text-primary-foreground hover:bg-primary/90"><Link2 className="w-4 h-4 mr-2" /> Generate Invite Link</Button>
                </motion.div>
              )}

              {tab === 'audit' && (
                <motion.div key="audit" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">Audit Log</h3>
                  <div className="space-y-2">
                    {auditLogs.length === 0 && <p className="text-center py-10 text-muted-foreground text-sm opacity-50 italic">Nothing has happened yet...</p>}
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-3 bg-secondary/10 rounded-xl border border-white/5">
                        <div className="flex flex-col"><span className="text-xs font-black text-primary uppercase tracking-widest">{log.action}</span><span className="text-sm text-foreground"><strong className="text-primary-foreground">{log.actor?.username}</strong> {log.action === 'KICK' ? 'kicked' : 'updated'} <strong className="text-foreground">{log.target_name}</strong></span></div>
                        <span className="text-[10px] text-muted-foreground opacity-50">{new Date(log.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {tab === 'danger' && isOwner && (
                <motion.div key="danger" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-4">
                  <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
                  <div className="p-4 border border-destructive/30 rounded-lg space-y-3"><h4 className="text-sm font-semibold text-foreground">Delete Server</h4><p className="text-xs text-muted-foreground">Permanently delete this server.</p><Button onClick={deleteServer} variant="destructive" size="sm">Delete Server</Button></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServerSettings;
