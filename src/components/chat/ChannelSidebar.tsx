import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronDown, ChevronRight, Hash, Volume2, Plus, Settings, Link2, MicOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import ServerSettings from './ServerSettings';
import { motion } from 'framer-motion';
import ChannelSettings from './ChannelSettings';

interface Props {
  server: any;
  categories: any[];
  channels: any[];
  selectedChannel: any | null;
  onSelectChannel: (c: any) => void;
  onChannelsUpdate: () => void;
}

const ChannelSidebar: React.FC<Props> = ({ server, categories, channels, selectedChannel, onSelectChannel, onChannelsUpdate }) => {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice'>('text');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [voiceStates, setVoiceStates] = useState<Record<string, any[]>>({});
  const [editingChannel, setEditingChannel] = useState<any | null>(null);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);

  useEffect(() => {
    if (!server.id) return;
    const fetchRole = async () => {
      const { data } = await supabase.from('server_members').select('role').eq('server_id', server.id).eq('user_id', user?.id).single();
      setUserRole((data as any)?.role || null);
    };
    fetchRole();
  }, [user, server.id]);

  useEffect(() => {
    if (!server.id) return;
    const fetchVoiceStates = async () => {
      const { data } = await supabase.from('server_voice_states' as any).select('user_id, channel_id, is_muted');
      if (data) {
        const userIds = [...new Set(data.map((s: any) => s.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
        const profileMap: Record<string, any> = {};
        profiles?.forEach(p => profileMap[p.id] = p);
        const map: Record<string, any[]> = {};
        data.forEach((s: any) => {
          if (!map[s.channel_id]) map[s.channel_id] = [];
          map[s.channel_id].push({ ...s, profile: profileMap[s.user_id] });
        });
        setVoiceStates(map);
      }
    };
    fetchVoiceStates();
    const sub = supabase.channel(`voice_states_${server.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_states' }, fetchVoiceStates)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [server.id]);

  const createChannel = async () => {
    if (!channelName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from('channels').insert({
      server_id: server.id,
      name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
      type: channelType,
      position: channels.length,
      category_id: selectedCategoryId || null,
    });
    if (!error) {
      setChannelName('');
      setCreateOpen(false);
      onChannelsUpdate();
      toast.success('Channel created!');
    }
    setCreating(false);
  };

  const isOwner = user?.id === server.owner_id;
  const canAccessSettings = isOwner || userRole === 'admin';
  const canCreateChannels = isOwner || userRole === 'admin' || userRole === 'moderator';
  const uncategorizedChannels = channels.filter(c => !c.category_id);

  return (
    <div className="w-60 h-full bg-background/20 flex flex-col border-r border-white/5 backdrop-blur-3xl inner-glow shrink-0 overflow-hidden">
      {/* Server Header with Banner */}
      <div className="relative group/banner overflow-hidden border-b border-white/5">
        {server.banner_url ? (
          <div className="h-28 w-full relative">
            <img
              src={server.banner_url}
              alt=""
              className="w-full h-full object-cover transition-transform duration-700 group-hover/banner:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          </div>
        ) : (
          <div className="h-12 w-full bg-gradient-to-br from-primary/5 to-transparent" />
        )}

        <div className={`absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between ${server.banner_url ? 'bg-gradient-to-t from-black/60 to-transparent pt-8' : ''}`}>
          <div className="flex items-center gap-2 min-w-0">
            {server.icon_url && (
              <img src={server.icon_url} alt="" className="w-5 h-5 rounded-md object-cover shadow-2xl border border-white/10" />
            )}
            <h2 className="font-bold text-foreground/90 truncate text-sm drop-shadow-lg">
              {server.name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {canAccessSettings && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all backdrop-blur-md border border-transparent hover:border-white/5"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>


      <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
        {uncategorizedChannels.map(ch => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            selected={selectedChannel?.id === ch.id}
            onClick={() => onSelectChannel(ch)}
            voiceParticipants={voiceStates[ch.id]}
            canManageChannel={canAccessSettings}
            onSettingsClick={() => { setEditingChannel(ch); setChannelSettingsOpen(true); }}
          />
        ))}
        {categories.map(cat => {
          const catChannels = channels.filter(c => c.category_id === cat.id);
          const isExpanded = expandedCategories[cat.id] !== false;
          return (
            <div key={cat.id} className="pt-2">
              <div className="group flex items-center justify-between px-1 mb-1 cursor-pointer">
                <button onClick={() => setExpandedCategories(p => ({ ...p, [cat.id]: !isExpanded }))} className="flex items-center gap-1 text-[10px] font-black text-muted-foreground/40 hover:text-foreground/80 uppercase tracking-widest transition-all">
                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="truncate">{cat.name}</span>
                </button>
                {canCreateChannels && (
                  <button onClick={() => { setSelectedCategoryId(cat.id); setCreateOpen(true); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isExpanded && catChannels.map(ch => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  selected={selectedChannel?.id === ch.id}
                  onClick={() => onSelectChannel(ch)}
                  voiceParticipants={voiceStates[ch.id]}
                  canManageChannel={canAccessSettings}
                  onSettingsClick={() => { setEditingChannel(ch); setChannelSettingsOpen(true); }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card/90 backdrop-blur-3xl border-white/10 shadow-2xl">
          <DialogHeader><DialogTitle>Create Channel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="channel-name" value={channelName} onChange={(e) => setChannelName(e.target.value)} className="bg-white/5 border-white/5 h-11" />
            <Select value={channelType} onValueChange={(v: any) => setChannelType(v)}>
              <SelectTrigger className="bg-white/5 border-white/5 h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="voice">Voice</SelectItem></SelectContent>
            </Select>
            <Button onClick={createChannel} disabled={creating} className="w-full h-11 shadow-xl shadow-primary/10">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
      {canAccessSettings && <ServerSettings open={settingsOpen} onOpenChange={setSettingsOpen} server={server} categories={categories} channels={channels} onServerUpdate={onChannelsUpdate} onChannelsUpdate={onChannelsUpdate} />}
      {editingChannel && (
        <ChannelSettings
          open={channelSettingsOpen}
          onOpenChange={setChannelSettingsOpen}
          channel={editingChannel}
          onChannelUpdate={onChannelsUpdate}
          server={server}
        />
      )}
    </div>
  );
};

const ChannelItem: React.FC<{ channel: any; selected: boolean; onClick: () => void; voiceParticipants?: any[]; canManageChannel?: boolean; onSettingsClick?: () => void }> = ({ channel, selected, onClick, voiceParticipants, canManageChannel, onSettingsClick }) => {
  return (
    <div className="flex flex-col gap-0.5">
      <motion.button whileTap={{ scale: 0.98 }} onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all group border ${selected ? 'bg-white/5 border-white/10 text-primary font-bold shadow-lg inner-glow' : 'text-muted-foreground/60 border-transparent hover:text-foreground hover:bg-white/5 hover:border-white/5'}`}>
        {channel.type === 'text' ? <Hash className="w-4 h-4 opacity-40 group-hover:opacity-80 transition-opacity" /> : <Volume2 className="w-4 h-4 opacity-40 group-hover:opacity-80 transition-opacity" />}
        <span className="truncate flex-1 text-left">{channel.name}</span>
        {canManageChannel && (
          <Settings
            className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 hover:opacity-100 transition-all cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onSettingsClick?.(); }}
          />
        )}
      </motion.button>
      {channel.type === 'voice' && voiceParticipants && voiceParticipants.map(p => (
        <div key={p.user_id} className="flex items-center gap-2 ml-7 py-0.5">
          <div className="w-5 h-5 rounded-lg bg-secondary overflow-hidden shrink-0 border border-white/5 shadow-sm">
            {p.profile?.avatar_url ? <img src={p.profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] opacity-30 font-bold">{p.profile?.username?.charAt(0).toUpperCase()}</div>}
          </div>
          <span className="text-[11px] text-muted-foreground/80 truncate font-medium">{p.profile?.username}</span>
          {p.is_muted && <MicOff className="w-3 h-3 text-destructive opacity-50 ml-auto mr-2" />}
        </div>
      ))}
    </div>
  );
};

export default ChannelSidebar;
