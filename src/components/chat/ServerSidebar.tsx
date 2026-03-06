import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Server } from '@/pages/MainApp';
import { Plus, LogOut, MessageSquare, Bell, Link2, UserPlus, AtSign, Globe, Check, Trash2, X, UserCheck, UserX, MessageCircle, Lock, Unlock, ArrowDownCircle } from 'lucide-react';

declare global {
  interface Window {
    electron?: {
      windowControl: (action: string) => void;
      sendNotification: (payload: any) => void;
      copyToClipboard: (text: string) => void;
      checkForUpdates: () => void;
      installUpdate: () => void;
      onUpdateMessage: (callback: (info: any) => void) => void;
    };
  }
}
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import ProfileSettings from './ProfileSettings';
import { motion, AnimatePresence } from 'framer-motion';
import vortyxLogo from '@/assets/vortyx-logo.png';
import { voiceSounds } from '@/utils/sounds';

interface Notification {
  id: string;
  type: 'friend_request' | 'mention' | 'server_invite' | 'system' | 'message' | 'dm';
  content: string;
  is_read: boolean;
  created_at: string;
  actor_id?: string;
  actor?: { id: string; username: string; avatar_url: string | null };
}

interface Props {
  servers: Server[];
  selectedServer: Server | null;
  onSelectServer: (s: Server) => void;
  onServersUpdate: () => void;
  onDMClick: () => void;
  isDMView: boolean;
  notifications: any[];
  onMarkAsRead: (id: string) => void;
  onDeleteNotif: (id: string) => void;
  onClearAll: () => void;
  onHandleFriendRequest: (notif: any, accept: boolean) => void;
}

const ServerSidebar: React.FC<Props> = ({
  servers,
  selectedServer,
  onSelectServer,
  onServersUpdate,
  onDMClick,
  isDMView,
  notifications,
  onMarkAsRead,
  onDeleteNotif,
  onClearAll,
  onHandleFriendRequest
}) => {
  console.log('Sidebar Notifications:', notifications);
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Create Server State
  const [isPrivate, setIsPrivate] = useState(false);

  // Join Server State
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinPin, setJoinPin] = useState('');
  const [requiresPin, setRequiresPin] = useState(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  useEffect(() => {
    // Listen for update messages from Electron
    if (window.electron?.onUpdateMessage) {
      window.electron.onUpdateMessage((info: any) => {
        console.log('Update Message:', info);
        if (info.text === 'Update available.') {
          setUpdateAvailable(true);
          toast.info('A new update is available and downloading...');
        } else if (info.text === 'Update downloaded') {
          setUpdateDownloaded(true);
          toast.success('Update downloaded! Click the arrow icon to install and restart.');
        }
      });
    }
  }, []);

  const handleInstallUpdate = () => {
    if (window.electron?.installUpdate) {
      window.electron.installUpdate();
    }
  };

  const generatePIN = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pin = '';
    for (let i = 0; i < 8; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  };

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single().then(({ data }) => {
      if (data) setProfile(data as any);
    });
  }, [user]);

  const createServer = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);
    const pin = isPrivate ? generatePIN() : null;
    const { error } = await supabase.from('servers' as any).insert({
      name: name.trim(),
      owner_id: user.id,
      is_private: isPrivate,
      pin: pin
    });
    if (!error) {
      setName('');
      setIsPrivate(false);
      setOpen(false);
      onServersUpdate();
      toast.success(isPrivate ? `Server created! PIN: ${pin}` : 'Server created!');
    } else {
      console.error('Server creation error:', error);
      toast.error(`Failed to create server: ${error.message}`);
    }
    setCreating(false);
  };

  const joinServerByCode = async () => {
    let cleanCode = inviteCode.trim();
    if (cleanCode.includes('/invite/')) {
      cleanCode = cleanCode.split('/invite/').pop() || cleanCode;
    }

    if (!cleanCode || !user) return;
    setJoining(true);

    const { data: invite, error: inviteErr } = await supabase
      .from('invites')
      .select('server_id, servers(name, is_private, pin)')
      .eq('code', cleanCode)
      .single();

    if (inviteErr || !invite) {
      console.error('Invite error:', inviteErr);
      setJoining(false);
      toast.error('Invalid invite code');
      return;
    }

    const serverInfo = (invite as any).servers;

    if (serverInfo.is_private) {
      if (!requiresPin) {
        setRequiresPin(true);
        setJoining(false);
        toast.info('This server is private. Please enter the 8-character PIN.');
        return;
      }

      if (joinPin.trim() !== serverInfo.pin) {
        toast.error('Incorrect PIN');
        setJoining(false);
        return;
      }
    }

    const { error: joinErr } = await supabase.from('server_members').insert({
      server_id: (invite as any).server_id,
      user_id: user.id,
      role: 'member'
    });

    if (!joinErr) {
      toast.success('Joined server!');
      setInviteCode('');
      setJoinPin('');
      setRequiresPin(false);
      setJoinOpen(false);
      onServersUpdate();
    } else {
      toast.error('Failed to join server');
    }
    setJoining(false);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="w-[72px] h-full bg-background/80 backdrop-blur-xl flex flex-col items-center py-4 gap-2 border-r border-white/5 shadow-2xl z-50 overflow-hidden select-none shrink-0">
      {/* Home / Logo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-12 h-12 rounded-[18px] overflow-hidden flex items-center justify-center hover:rounded-xl transition-all duration-300 shadow-lg shadow-black/20 shrink-0">
            <img src={vortyxLogo} alt="Vortyx" className="w-full h-full object-cover" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-bold">Vortyx Home</TooltipContent>
      </Tooltip>

      <div className="w-8 h-[2px] bg-white/5 rounded-full my-1 shrink-0" />

      {/* DM */}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onDMClick}
            className={`w-12 h-12 shrink-0 rounded-[18px] flex items-center justify-center transition-all duration-300 hover:rounded-xl ${isDMView ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-secondary/40 text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-bold">Direct Messages</TooltipContent>
      </Tooltip>

      {/* Middle Servers Section - Scrollable but with hidden scrollbar */}
      <div className="flex-1 w-full overflow-y-auto scrollbar-hide px-3 py-2 flex flex-col items-center gap-2">
        {servers.map((server, i) => (
          <Tooltip key={server.id}>
            <TooltipTrigger asChild>
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelectServer(server)}
                className={`w-12 h-12 rounded-[18px] flex items-center justify-center transition-all duration-300 hover:rounded-xl text-sm font-bold shrink-0 ${selectedServer?.id === server.id ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-secondary/40 text-foreground hover:bg-white/10'}`}
              >
                {server.icon_url ? <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover rounded-inherit" /> : server.name.charAt(0).toUpperCase()}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-bold">{server.name}</TooltipContent>
          </Tooltip>
        ))}

        <button onClick={() => setOpen(true)} className="w-12 h-12 shrink-0 rounded-[18px] bg-secondary/20 flex items-center justify-center hover:bg-success/20 hover:text-success hover:rounded-xl transition-all duration-300 text-muted-foreground group">
          <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
        <button onClick={() => setJoinOpen(true)} className="w-12 h-12 shrink-0 rounded-[18px] bg-secondary/20 flex items-center justify-center hover:bg-primary/20 hover:text-primary hover:rounded-xl transition-all duration-300 text-muted-foreground group">
          <Link2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <div className="w-8 h-[2px] bg-white/5 rounded-full my-1 shrink-0" />

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-2 pb-4 shrink-0">
        <div className="relative group">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setProfileOpen(true)}
            className="w-12 h-12 rounded-[18px] overflow-hidden bg-secondary flex items-center justify-center hover:rounded-xl transition-all duration-300 shadow-xl"
          >
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="font-bold text-sm">{profile?.username?.charAt(0)?.toUpperCase()}</span>}
          </motion.button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setNotifOpen(true)}
                className="w-10 h-10 rounded-[14px] bg-secondary/40 flex items-center justify-center hover:bg-white/10 transition-all duration-300 group"
              >
                <Bell className={`w-5 h-5 transition-colors ${unreadCount > 0 ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
              </motion.button>
              {unreadCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute left-full ml-2 px-2 py-0.5 bg-destructive text-destructive-foreground text-[10px] font-black rounded-full shadow-lg border border-background whitespace-nowrap z-[100]"
                >
                  {unreadCount}
                </motion.div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-bold">Notifications ({unreadCount})</TooltipContent>
        </Tooltip>

        {updateDownloaded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.1, y: 2 }}
                onClick={handleInstallUpdate}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                <ArrowDownCircle className="w-6 h-6 animate-bounce" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-bold">Update Available & Downloaded! Click to Install.</TooltipContent>
          </Tooltip>
        )}

        <button onClick={signOut} className="w-10 h-10 rounded-[14px] bg-secondary/20 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive hover:rounded-xl transition-all duration-300 text-muted-foreground group">
          <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-2xl border-white/10 max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
          <DialogHeader className="p-8 border-b border-white/5 bg-white/5">
            <DialogTitle className="text-2xl font-black flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-primary/20 rounded-xl text-primary"><Bell className="w-6 h-6" /></div>
              Activity Hub
              {unreadCount > 0 && <span className="text-[10px] uppercase font-black bg-primary text-primary-foreground px-2.5 py-1 rounded-lg ml-2">{unreadCount} Pending</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground opacity-30">
                <Bell className="w-16 h-16 mb-4 stroke-1" />
                <p className="font-black uppercase tracking-[0.2em] text-[10px]">Nothing to report</p>
              </div>
            )}
            <AnimatePresence>
              {notifications.map((n) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`relative p-5 rounded-[1.5rem] transition-all group border ${n.is_read ? 'bg-white/[0.01] border-transparent' : 'bg-primary/5 border-primary/20 shadow-xl shadow-primary/5'} hover:bg-white/[0.03]`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0 shadow-xl overflow-hidden ring-1 ring-white/5">
                      {n.actor?.avatar_url ? (
                        <img src={n.actor.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary text-primary text-xl font-black">
                          {n.type === 'message' ? <MessageCircle className="w-6 h-6" /> : (n.actor?.username?.charAt(0).toUpperCase() || <Globe className="w-6 h-6" />)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-xs truncate uppercase tracking-wide text-foreground/70">
                          {n.actor?.username || (n.type === 'system' ? 'System' : 'Unknown User')}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-black opacity-30">{formatTime(new Date(n.created_at))}</span>
                      </div>
                      <p className="text-sm text-foreground/90 font-medium leading-relaxed">{n.content}</p>

                      {n.type === 'friend_request' && (
                        <div className="flex items-center gap-2 mt-4">
                          <Button size="sm" onClick={() => onHandleFriendRequest(n, true)} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 h-9 font-black text-[10px] uppercase tracking-widest"><UserCheck className="w-3.5 h-3.5 mr-2" /> Accept</Button>
                          <Button size="sm" variant="ghost" onClick={() => onHandleFriendRequest(n, false)} className="bg-white/5 hover:bg-destructive/20 hover:text-destructive rounded-xl px-4 h-9 font-black text-[10px] uppercase tracking-widest transition-colors"><UserX className="w-3.5 h-3.5 mr-2" /> Decline</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    {!n.is_read && <button onClick={() => onMarkAsRead(n.id)} className="p-2 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-colors shadow-lg"><Check className="w-4 h-4" /></button>}
                    <button onClick={() => onDeleteNotif(n.id)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shadow-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {notifications.length > 0 && (
            <div className="p-6 border-t border-white/5 bg-white/5 text-center flex items-center justify-center gap-6">
              <button onClick={() => notifications.forEach(n => !n.is_read && onMarkAsRead(n.id))} className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:text-white transition-colors">Mark All Read</button>
              <button onClick={onClearAll} className="text-[10px] font-black text-destructive/60 uppercase tracking-[0.2em] hover:text-destructive transition-colors">Clear All</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setIsPrivate(false); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Create Server</DialogTitle></DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Server Name</Label>
              <Input placeholder="Enter server name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-xl border border-white/5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {isPrivate ? <Lock className="w-4 h-4 text-primary" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                  <Label className="text-sm font-bold">Private Server</Label>
                </div>
                <p className="text-xs text-muted-foreground">Private servers require a PIN to join.</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>

            <Button onClick={createServer} disabled={creating || !name.trim()} className="w-full">
              {creating ? 'Creating...' : 'Create Server'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={(val) => { setJoinOpen(val); if (!val) { setRequiresPin(false); setJoinPin(''); } }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Join Server</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <Input placeholder="Enter invite code" value={inviteCode} onChange={(e) => { setInviteCode(e.target.value); setRequiresPin(false); }} disabled={requiresPin} />
            </div>

            {requiresPin && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <Label>Server PIN</Label>
                <Input placeholder="8-character PIN" value={joinPin} onChange={(e) => setJoinPin(e.target.value.toUpperCase())} maxLength={8} />
              </motion.div>
            )}

            <Button onClick={joinServerByCode} disabled={joining || !inviteCode.trim() || (requiresPin && joinPin.length < 8)} className="w-full">
              {joining ? 'Joining...' : requiresPin ? 'Verify & Join' : 'Join Server'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ProfileSettings open={profileOpen} onOpenChange={setProfileOpen} />

    </div>
  );
};

const formatTime = (date: Date) => {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

export default ServerSidebar;
