import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Channel } from '@/pages/MainApp';
import { Hash, Users, Send, Image as ImageIcon, Paperclip, X, Smile, Edit2, Trash2, Crown, Shield, ShieldCheck, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useFileUpload } from '@/hooks/useFileUpload';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3.5 h-3.5 text-warning" />,
  admin: <ShieldCheck className="w-3.5 h-3.5 text-primary" />,
  moderator: <Shield className="w-3.5 h-3.5 text-success" />,
};

const AVAILABLE_ICONS: Record<string, any> = {
  Shield, Crown, ShieldCheck, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette
};

interface CustomRole {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  edited: boolean;
  attachments: any[];
  created_at: string;
  updated_at: string;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface Props {
  channel: Channel;
  showMembers: boolean;
  onToggleMembers: () => void;
  onMemberClick?: (userId: string) => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯', '✨', '🙌'];

const ChatArea: React.FC<Props> = ({ channel, showMembers, onToggleMembers, onMemberClick }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();
  const [profiles, setProfiles] = useState<Record<string, { username: string; avatar_url: string | null }>>({});
  const [memberRoles, setMemberRoles] = useState<Record<string, { role: string; custom_role_id: string | null }>>({});
  const [roleColors, setRoleColors] = useState<Record<string, string>>({});
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRoleData = useCallback(async () => {
    console.log('Fetching role data for server:', channel.server_id);

    // Fetch custom roles
    const { data: cRoles } = await supabase.from('server_roles' as any).select('*').eq('server_id', channel.server_id);
    if (cRoles) setCustomRoles(cRoles as any);

    const { data: roles } = await supabase.from('server_members').select('user_id, role, custom_role_id' as any).eq('server_id', channel.server_id);
    if (roles) {
      console.log('Fetched roles:', roles.length);
      const roleMap: Record<string, { role: string; custom_role_id: string | null }> = {};
      roles.forEach((r: any) => roleMap[r.user_id] = { role: r.role, custom_role_id: r.custom_role_id });
      setMemberRoles(roleMap);
    }

    const { data: configs } = await supabase.from('server_role_configs' as any).select('role_name, color').eq('server_id', channel.server_id);
    if (configs) {
      console.log('Fetched role colors:', configs);
      const colorMap: Record<string, string> = {};
      configs.forEach((c: any) => colorMap[c.role_name] = c.color);
      setRoleColors(colorMap);
    }
  }, [channel.server_id]);

  const fetchMessages = useCallback(async () => {
    fetchRoleData();
    const { data: msgData } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (msgData) {
      setMessages(msgData as unknown as Message[]);

      const msgIds = msgData.map(m => m.id);
      if (msgIds.length > 0) {
        const { data: reactData } = await supabase.from('message_reactions').select('*').in('message_id', msgIds);
        if (reactData) {
          const reactMap: Record<string, Reaction[]> = {};
          reactData.forEach((r: any) => {
            if (!reactMap[r.message_id]) reactMap[r.message_id] = [];
            reactMap[r.message_id].push(r);
          });
          setReactions(reactMap);
        }
      }

      const userIds = [...new Set((msgData as unknown as Message[]).map(m => m.user_id))];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
        if (profileData) {
          const map: Record<string, { username: string; avatar_url: string | null }> = {};
          profileData.forEach((p: any) => { map[p.id] = { username: p.username, avatar_url: p.avatar_url }; });
          setProfiles(prev => ({ ...prev, ...map }));
        }
      }
    }
  }, [channel.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    const messageSub = supabase
      .channel(`messages:${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as unknown as Message;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          if (!profiles[msg.user_id]) {
            const { data } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', msg.user_id).single();
            if (data) setProfiles(prev => ({ ...prev, [data.id]: { username: data.username, avatar_url: data.avatar_url } }));
          }
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === (payload.new as unknown as Message).id ? payload.new as unknown as Message : m));
        }
      })
      .subscribe();

    const reactionSub = supabase
      .channel(`reactions:${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new as Reaction;
          setReactions(prev => ({ ...prev, [r.message_id]: [...(prev[r.message_id] || []), r] }));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old as Reaction;
          setReactions(prev => ({ ...prev, [r.message_id]: (prev[r.message_id] || []).filter(x => x.id !== (r as any).id) }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSub);
      supabase.removeChannel(reactionSub);
    };
  }, [channel.id]);

  const roleOrder = ['member', 'moderator', 'admin', 'owner'];
  const userRoleData = (user && memberRoles[user.id]);
  const userBaseRole = userRoleData?.role || 'member';
  const canSendMessages = (() => {
    if (!channel.send_role || channel.send_role === 'member') return true;
    const userRoleIdx = roleOrder.indexOf(userBaseRole);
    const requiredRoleIdx = roleOrder.indexOf(channel.send_role);
    return userRoleIdx >= requiredRoleIdx || userBaseRole === 'owner'; // Owner always can send
  })();

  const sendMessage = async () => {
    if ((!newMessage.trim() && uploadingFiles.length === 0) || !user) return;
    setSending(true);

    const attachments: any[] = [];
    if (uploadingFiles.length > 0) {
      for (const file of uploadingFiles) {
        const url = await uploadFile(file);
        if (url) attachments.push({ url, name: file.name, type: file.type, size: file.size });
      }
    }

    const { error, data: insertedMsg } = await supabase.from('messages').insert({
      channel_id: channel.id,
      user_id: user.id,
      content: newMessage.trim(),
      attachments: attachments
    }).select().single();

    if (!error && insertedMsg) {
      // Detect mentions
      const mentionRegex = /@(\w+)/g;
      const matches = [...newMessage.matchAll(mentionRegex)];
      if (matches.length > 0) {
        for (const match of matches) {
          const username = match[1];
          const { data: targetProfile } = await supabase.from('profiles').select('id').eq('username', username).single();
          if (targetProfile && targetProfile.id !== user.id) {
            await supabase.from('notifications' as any).insert({
              user_id: targetProfile.id,
              actor_id: user.id,
              type: 'mention',
              content: `mentioned you in #${channel.name}`,
              link: `/server/${channel.server_id}/${channel.id}`
            });
          }
        }
      }
      setNewMessage('');
      setUploadingFiles([]);
    } else if (error) {
      toast.error("Failed to send: " + error.message);
    }

    setSending(false);
  };

  const updateMessage = async (id: string) => {
    if (!editContent.trim()) return;
    const { error } = await supabase.from('messages').update({ content: editContent.trim(), edited: true }).eq('id', id);
    if (!error) {
      setEditingId(null);
      toast.success("Message updated");
    } else {
      toast.error("Failed to edit: " + error.message);
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (!error) toast.success("Message deleted");
    else toast.error("Failed to delete: " + error.message);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    // Optimization: Check the latest state from reactions map
    const msgReactions = reactions[messageId] || [];
    const existing = msgReactions.find(r => r.user_id === user.id && r.emoji === emoji);

    if (existing) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id);
      if (error) console.error("Reaction delete error", error);
    } else {
      const { error } = await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji
      });
      if (error) {
        toast.error("Failed to react: " + error.message);
        console.error("Reaction insert error", error);
      }
    }
  };

  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const date = format(new Date(msg.created_at), 'MMMM d, yyyy');
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else groupedMessages.push({ date, msgs: [msg] });
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground">
      {/* Header */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-white/5 bg-background/40 backdrop-blur-2xl sticky top-0 z-50 inner-glow">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary shadow-inner"><Hash className="w-4 h-4" /></div>
          <span className="font-bold text-foreground/90">{channel.name}</span>
          {channel.topic && <span className="text-xs text-muted-foreground ml-2 hidden sm:block opacity-40 italic">— {channel.topic}</span>}
        </div>
        <button onClick={onToggleMembers} className={`p-2 rounded-xl transition-all duration-300 ${showMembers ? 'bg-primary/20 text-primary shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.1)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>
          <Users className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-6">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest bg-background px-3">{group.date}</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            {group.msgs.map((msg, i) => {
              const profile = profiles[msg.user_id];
              const isMine = user && msg.user_id === user.id;
              const msgReactions = reactions[msg.id] || [];
              const reactionCounts = msgReactions.reduce((acc, curr) => {
                acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);

              const prevMsg = i > 0 ? group.msgs[i - 1] : null;
              const isConsecutive = prevMsg && prevMsg.user_id === msg.user_id &&
                (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isMine ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`group flex gap-3 ${isMine ? 'flex-row-reverse' : ''} ${isConsecutive ? 'mt-1' : 'mt-4'}`}
                >
                  {!isConsecutive ? (
                    <div
                      onClick={() => onMemberClick?.(msg.user_id)}
                      className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-foreground font-bold text-sm shrink-0 shadow-sm overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                    >
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-10 h-10 object-cover" />
                      ) : (
                        (profile?.username || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                  ) : (
                    <div className="w-10 shrink-0 self-start text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </div>
                  )}

                  <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    {!isConsecutive && (
                      <div className={`flex items-baseline gap-2 mb-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                        <div
                          className="flex items-center gap-1.5 cursor-pointer group/name"
                          onClick={() => onMemberClick?.(msg.user_id)}
                        >
                          <span
                            className="font-bold text-sm group-hover/name:underline underline-offset-2 decoration-primary/30"
                            style={{ color: customRoles.find(r => r.id === memberRoles[msg.user_id]?.custom_role_id)?.color || roleColors[memberRoles[msg.user_id]?.role || ''] || 'inherit' }}
                          >
                            {profile?.username || 'Unknown'}
                          </span>
                          {memberRoles[msg.user_id]?.custom_role_id ? (
                            AVAILABLE_ICONS[customRoles.find(r => r.id === memberRoles[msg.user_id]?.custom_role_id)?.icon || ''] ?
                              React.createElement(AVAILABLE_ICONS[customRoles.find(r => r.id === memberRoles[msg.user_id]?.custom_role_id)?.icon || ''], { className: "w-3.5 h-3.5", style: { color: customRoles.find(r => r.id === memberRoles[msg.user_id]?.custom_role_id)?.color } }) : null
                          ) : (
                            ROLE_ICONS[memberRoles[msg.user_id]?.role || '']
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground opacity-60">{format(new Date(msg.created_at), 'HH:mm')}</span>
                      </div>
                    )}

                    <div className={`relative group/bubble flex items-center gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-md break-words whitespace-pre-wrap transition-all backdrop-blur-md border inner-glow
                        ${isMine ? 'bg-primary/80 text-primary-foreground rounded-tr-none border-white/20 shadow-primary/10' : 'bg-white/[0.05] border-white/5 rounded-tl-none text-foreground shadow-black/20'}`}>
                        {editingId === msg.id ? (
                          <div className="min-w-[200px] flex flex-col gap-2">
                            <Input
                              autoFocus
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') updateMessage(msg.id); if (e.key === 'Escape') setEditingId(null); }}
                              className="bg-background/20 border-white/20 text-inherit text-sm h-8"
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingId(null)} className="p-1 hover:bg-white/10 rounded transition-colors"><X className="w-4 h-4" /></button>
                              <button onClick={() => updateMessage(msg.id)} className="px-2 py-0.5 hover:bg-white/10 rounded font-bold text-[10px] uppercase">Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.content}
                            {msg.edited && <span className="text-[10px] opacity-60 ml-1.5 italic font-medium">(edited)</span>}

                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 flex flex-col gap-2">
                                {msg.attachments.map((att: any, idx: number) => (
                                  <div key={idx} className="max-w-[260px] rounded-xl overflow-hidden border border-white/10 bg-black/10 shadow-sm">
                                    {att.type.startsWith('image/') ? (
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                        <img src={att.url} alt={att.name} className="max-h-[200px] w-full object-contain hover:opacity-80 transition-opacity" />
                                      </a>
                                    ) : (
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 hover:bg-white/5 transition-colors">
                                        <Paperclip className="w-4 h-4 text-primary" />
                                        <div className="min-w-0">
                                          <div className="text-[11px] font-bold truncate">{att.name}</div>
                                          <div className="text-[9px] opacity-60">{(att.size / 1024).toFixed(1)} KB</div>
                                        </div>
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className={`flex items-center gap-0.5 opacity-0 group-hover/bubble:opacity-100 transition-all bg-background/90 backdrop-blur-md border border-border rounded-xl p-1 shadow-xl absolute -top-10 ${isMine ? 'right-0' : 'left-0'} z-30`}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-primary transition-colors"><Smile className="w-4 h-4" /></button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1.5 grid grid-cols-5 gap-1.5 bg-card border-border shadow-2xl rounded-xl z-[60]">
                            {COMMON_EMOJIS.map(e => (
                              <button key={e} onClick={() => toggleReaction(msg.id, e)} className="p-2 hover:bg-accent rounded-lg text-xl leading-none transition-transform hover:scale-125">{e}</button>
                            ))}
                          </PopoverContent>
                        </Popover>
                        {isMine && (
                          <>
                            <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => deleteMessage(msg.id)} className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>

                    {Object.keys(reactionCounts).length > 0 && (
                      <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                        {Object.entries(reactionCounts).map(([emoji, count]) => {
                          const hasMine = msgReactions.some(r => r.user_id === user?.id && r.emoji === emoji);
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold transition-all
                                ${hasMine ? 'bg-primary/20 border-primary text-primary shadow-sm' : 'bg-card border-border hover:border-muted-foreground'}`}
                            >
                              <span>{emoji}</span>
                              <span className="opacity-80">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-2 bg-gradient-to-t from-background to-transparent sticky bottom-0">
        <AnimatePresence>
          {uploadingFiles.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-3 flex flex-wrap gap-2 overflow-hidden">
              {uploadingFiles.map((f, i) => (
                <div key={i} className="relative group px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
                  <span className="truncate max-w-[150px]">{f.name}</span>
                  <button onClick={() => setUploadingFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2 bg-white/[0.03] backdrop-blur-2xl rounded-2xl px-4 py-1.5 border border-white/10 focus-within:border-primary/50 transition-all shadow-2xl inner-glow">
          {canSendMessages ? (
            <>
              <input type="file" multiple hidden ref={fileInputRef} onChange={(e) => { if (e.target.files) setUploadingFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-primary p-2 rounded-xl hover:bg-white/5 transition-all">
                <ImageIcon className="w-5 h-5" />
              </button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder={`Message #${channel.name}`}
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground/40 text-sm h-11"
              />
              <button
                onClick={sendMessage}
                disabled={sending || uploading || (!newMessage.trim() && uploadingFiles.length === 0)}
                className="p-2.5 bg-primary/90 text-primary-foreground rounded-xl hover:bg-primary transition-all disabled:opacity-50 disabled:scale-95 shadow-lg shadow-primary/20 flex items-center justify-center min-w-[40px] inner-glow"
              >
                {sending || uploading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </>
          ) : (
            <div className="flex-1 h-11 flex items-center justify-center gap-2 text-muted-foreground/50 text-xs font-medium uppercase tracking-widest italic">
              <Shield className="w-3.5 h-3.5" />
              This channel is read-only
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
