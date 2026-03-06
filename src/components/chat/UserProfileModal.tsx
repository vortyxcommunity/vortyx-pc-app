import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Shield, Crown, Calendar, Info, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette } from 'lucide-react';

const AVAILABLE_ICONS: Record<string, any> = {
    Shield, Crown, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette
};
import { motion, AnimatePresence } from 'framer-motion';

interface UserProfileModalProps {
    userId: string | null;
    serverId?: string;
    onOpenChange: (open: boolean) => void;
    onStartDM: (targetUserId: string) => void;
}

const statusColors: Record<string, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    do_not_disturb: 'bg-destructive',
    offline: 'bg-muted-foreground',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
    owner: <Crown className="w-4 h-4 text-warning" />,
    admin: <Shield className="w-4 h-4 text-primary" />,
    moderator: <Shield className="w-4 h-4 text-success" />,
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({ userId, serverId, onOpenChange, onStartDM }) => {
    const [profile, setProfile] = useState<any>(null);
    const [memberInfo, setMemberInfo] = useState<any>(null);
    const [customRole, setCustomRole] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!userId) return;

        const fetchProfile = async () => {
            setLoading(true);
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            setProfile(profileData);

            if (serverId) {
                const { data: memberData } = await supabase
                    .from('server_members')
                    .select('role, joined_at, nickname, custom_role_id' as any)
                    .eq('server_id', serverId)
                    .eq('user_id', userId)
                    .single();

                if (memberData) {
                    setMemberInfo(memberData);
                    if ((memberData as any).custom_role_id) {
                        const { data: roleData } = await supabase
                            .from('server_roles' as any)
                            .select('*')
                            .eq('id', (memberData as any).custom_role_id)
                            .single();
                        setCustomRole(roleData);
                    } else {
                        setCustomRole(null);
                    }
                }
            }
            setLoading(false);
        };

        fetchProfile();
    }, [userId, serverId]);

    if (!userId) return null;

    return (
        <Dialog open={!!userId} onOpenChange={(open) => !open && onOpenChange(false)}>
            <DialogContent className="max-w-md p-0 border-none bg-transparent overflow-hidden shadow-none">
                <AnimatePresence>
                    {profile && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-background/80 backdrop-blur-3xl border border-white/10 rounded-[32px] overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.5)] inner-glow"
                        >
                            {/* Banner */}
                            <div className="h-32 w-full relative group">
                                {profile.banner_url ? (
                                    <img src={profile.banner_url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/5 to-transparent" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
                            </div>

                            {/* Avatar Overlap */}
                            <div className="px-6 -mt-12 relative z-10">
                                <div className="relative inline-block group/avatar">
                                    <div className="w-24 h-24 rounded-[28px] bg-secondary flex items-center justify-center text-3xl font-bold border-4 border-background shadow-2xl overflow-hidden inner-glow transition-transform group-hover/avatar:scale-105 duration-500">
                                        {profile.avatar_url ? (
                                            <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            profile.username.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-background shadow-lg ${statusColors[profile.status || 'offline']}`} />
                                </div>
                            </div>

                            {/* Profile Info */}
                            <div className="p-6 pt-4 space-y-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h2 className="text-2xl font-black text-foreground" style={{ color: customRole?.color || 'inherit' }}>{profile.username}</h2>
                                        {customRole?.icon && AVAILABLE_ICONS[customRole.icon] ? (
                                            React.createElement(AVAILABLE_ICONS[customRole.icon], { className: "w-5 h-5", style: { color: customRole.color } })
                                        ) : (
                                            memberInfo && ROLE_ICONS[memberInfo.role]
                                        )}
                                    </div>
                                    {memberInfo?.nickname && (
                                        <p className="text-sm text-muted-foreground font-medium opacity-60 italic mb-2">aka {memberInfo.nickname}</p>
                                    )}
                                    {profile.bio ? (
                                        <p className="text-sm text-foreground/80 leading-relaxed mt-3 bg-white/5 p-4 rounded-2xl border border-white/5 inner-glow">
                                            {profile.bio}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground/40 italic mt-3">No bio yet...</p>
                                    )}
                                </div>

                                {/* Metadata */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                                            <Calendar className="w-4 h-4 text-primary opacity-50" />
                                            <div>
                                                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground opacity-50">Joined</p>
                                                <p className="text-xs font-bold">{new Date(profile.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        {memberInfo && (
                                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center gap-3">
                                                <Shield className="w-4 h-4 text-primary opacity-50" />
                                                <div>
                                                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground opacity-50">Server Rank</p>
                                                    <p className="text-xs font-bold capitalize">{memberInfo.role}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {customRole && (
                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
                                            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground opacity-50">Identity</p>
                                            <div className="flex items-center gap-2 px-3 py-2 bg-background/50 rounded-xl border border-white/5">
                                                <div className="w-6 h-6 rounded-lg flex items-center justify-center shadow-lg" style={{ backgroundColor: customRole.color }}>
                                                    {customRole.icon && AVAILABLE_ICONS[customRole.icon] ? (
                                                        React.createElement(AVAILABLE_ICONS[customRole.icon], { className: "w-3.5 h-3.5 text-white" })
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-white">{customRole.name.charAt(0).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                <span className="text-sm font-bold" style={{ color: customRole.color }}>{customRole.name}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="pt-2">
                                    <Button
                                        onClick={() => {
                                            if (profile.id) onStartDM(profile.id);
                                            onOpenChange(false);
                                        }}
                                        className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group transition-all active:scale-[0.98] inner-glow"
                                    >
                                        <MessageSquare className="w-5 h-5 transition-transform group-hover:scale-110" />
                                        Send Direct Message
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
};

export default UserProfileModal;
