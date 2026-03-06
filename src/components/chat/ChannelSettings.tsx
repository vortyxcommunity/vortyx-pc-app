import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Hash, Mic, Trash2, Eye, MessageSquare, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channel: any;
    onChannelUpdate: () => void;
    server: any;
}

type Tab = 'overview' | 'permissions';

const ChannelSettings: React.FC<Props> = ({ open, onOpenChange, channel, onChannelUpdate, server }) => {
    const { user } = useAuth();
    const [tab, setTab] = useState<Tab>('overview');
    const [name, setName] = useState(channel.name);
    const [viewRole, setViewRole] = useState(channel.view_role || 'member');
    const [sendRole, setSendRole] = useState(channel.send_role || 'member');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setName(channel.name);
        setViewRole(channel.view_role || 'member');
        setSendRole(channel.send_role || 'member');
    }, [channel]);

    const saveSettings = async () => {
        if (!name.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('channels').update({
            name: name.trim().toLowerCase().replace(/\s+/g, '-'),
            view_role: viewRole,
            send_role: sendRole
        }).eq('id', channel.id);

        if (!error) {
            toast.success('Channel updated!');
            onChannelUpdate();
            onOpenChange(false);
        } else {
            toast.error('Failed to update channel');
        }
        setSaving(false);
    };

    const deleteChannel = async () => {
        if (!confirm('Are you sure you want to delete this channel? This cannot be undone.')) return;
        const { error } = await supabase.from('channels').delete().eq('id', channel.id);
        if (!error) {
            toast.success('Channel deleted');
            onChannelUpdate();
            onOpenChange(false);
        } else {
            toast.error('Failed to delete channel');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-lg overflow-hidden p-0 shadow-2xl">
                <div className="flex h-full min-h-[400px]">
                    <div className="w-40 border-r border-border p-3 space-y-1 bg-background/50">
                        <DialogHeader className="p-2 mb-2">
                            <DialogTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                {channel.type === 'text' ? <Hash className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                                Settings
                            </DialogTitle>
                        </DialogHeader>
                        <button
                            onClick={() => setTab('overview')}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === 'overview' ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setTab('permissions')}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${tab === 'permissions' ? 'bg-primary/20 text-primary font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                        >
                            Permissions
                        </button>
                        <div className="pt-4 mt-4 border-t border-border">
                            <button
                                onClick={deleteChannel}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
                        <AnimatePresence mode="wait">
                            {tab === 'overview' && (
                                <motion.div key="overview" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                                    <h3 className="text-base font-semibold text-foreground">Channel Overview</h3>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Channel Name</label>
                                        <div className="relative">
                                            {channel.type === 'text' && <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
                                            {channel.type === 'voice' && <Mic className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
                                            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border pl-10" placeholder="channel-name" />
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <Button onClick={saveSettings} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            {tab === 'permissions' && (
                                <motion.div key="permissions" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
                                    <h3 className="text-base font-semibold text-foreground">Channel Permissions</h3>

                                    <div className="space-y-4">
                                        <div className="bg-accent/10 rounded-xl p-4 border border-border space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                                <Eye className="w-4 h-4 text-primary" />
                                                Who can view this channel?
                                            </div>
                                            <p className="text-xs text-muted-foreground">Select the minimum role required to see and access this channel.</p>
                                            <Select value={viewRole} onValueChange={(v: any) => setViewRole(v)}>
                                                <SelectTrigger className="bg-background border-border">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="member">Everyone (Member)</SelectItem>
                                                    <SelectItem value="moderator">Moderators & Above</SelectItem>
                                                    <SelectItem value="admin">Admins & Above</SelectItem>
                                                    <SelectItem value="owner">Owner Only</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {channel.type === 'text' ? (
                                            <div className="bg-accent/10 rounded-xl p-4 border border-border space-y-3">
                                                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                                    <MessageSquare className="w-4 h-4 text-primary" />
                                                    Who can send messages?
                                                </div>
                                                <p className="text-xs text-muted-foreground">Select the minimum role required to send messages in this channel.</p>
                                                <Select value={sendRole} onValueChange={(v: any) => setSendRole(v)}>
                                                    <SelectTrigger className="bg-background border-border">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="member">Everyone (Member)</SelectItem>
                                                        <SelectItem value="moderator">Moderators & Above</SelectItem>
                                                        <SelectItem value="admin">Admins & Above</SelectItem>
                                                        <SelectItem value="owner">Owner Only</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        ) : (
                                            <div className="bg-accent/10 rounded-xl p-4 border border-border space-y-3">
                                                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                                    <Mic className="w-4 h-4 text-primary" />
                                                    Who can speak?
                                                </div>
                                                <p className="text-xs text-muted-foreground">Select the minimum role required to speak in this channel.</p>
                                                <Select value={sendRole} onValueChange={(v: any) => setSendRole(v)}>
                                                    <SelectTrigger className="bg-background border-border">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="member">Everyone (Member)</SelectItem>
                                                        <SelectItem value="moderator">Moderators & Above</SelectItem>
                                                        <SelectItem value="admin">Admins & Above</SelectItem>
                                                        <SelectItem value="owner">Owner Only</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                                            <Shield className="w-5 h-5 text-primary shrink-0" />
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                <strong>Note:</strong> Server owners and admins always have full access to all channels regardless of these settings.
                                            </p>
                                        </div>
                                    </div>

                                    <Button onClick={saveSettings} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ChannelSettings;
