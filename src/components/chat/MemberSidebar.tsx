import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Crown, Shield, ShieldCheck, Star, Heart, Zap, Ghost, Skull, Octagon, Circle, Square, Flame, Rocket, Palette } from 'lucide-react';

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3 h-3 text-warning" />,
  admin: <ShieldCheck className="w-3 h-3 text-primary" />,
  moderator: <Shield className="w-3 h-3 text-success" />,
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

interface Member {
  id: string;
  user_id: string;
  role: string;
  custom_role_id: string | null;
  nickname: string | null;
  profile?: { username: string; avatar_url: string | null; status: string };
}

const statusColors: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  do_not_disturb: 'bg-destructive',
  invisible: 'bg-muted-foreground',
  offline: 'bg-muted-foreground',
};

const MemberSidebar: React.FC<{ serverId: string; onMemberClick?: (userId: string) => void }> = ({ serverId, onMemberClick }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [roleConfigs, setRoleConfigs] = useState<Record<string, string>>({});
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  useEffect(() => {
    const fetchMemberData = async () => {
      // Fetch custom roles first
      const { data: rolesData } = await supabase
        .from('server_roles' as any)
        .select('*')
        .eq('server_id', serverId);

      if (rolesData) setCustomRoles(rolesData as any);

      // Fetch members and profiles
      const { data: memberData } = await supabase
        .from('server_members')
        .select('*')
        .eq('server_id', serverId);

      if (memberData) {
        const userIds = memberData.map((m: any) => m.user_id);
        const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, status').in('id', userIds);
        const profileMap: Record<string, any> = {};
        profiles?.forEach((p: any) => { profileMap[p.id] = p; });
        setMembers(memberData.map((m: any) => ({ ...m, profile: profileMap[m.user_id] })));
      }

      // Fetch legacy role colors
      const { data: roleData } = await supabase
        .from('server_role_configs' as any)
        .select('role_name, color')
        .eq('server_id', serverId);

      if (roleData) {
        const configMap: Record<string, string> = {};
        roleData.forEach((r: any) => configMap[r.role_name] = r.color);
        setRoleConfigs(configMap);
      }
    };

    fetchMemberData();

    // Set up realtime listener
    const memberSub = supabase.channel(`members_${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${serverId}` }, () => fetchMemberData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_role_configs', filter: `server_id=eq.${serverId}` }, () => fetchMemberData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_roles', filter: `server_id=eq.${serverId}` }, () => fetchMemberData())
      .subscribe();

    return () => {
      supabase.removeChannel(memberSub);
    };
  }, [serverId]);

  const renderMember = (m: Member) => {
    const customRole = customRoles.find(r => r.id === m.custom_role_id);
    const displayName = m.nickname || m.profile?.username || 'Unknown';
    const displayColor = customRole?.color || roleConfigs[m.role] || 'inherit';

    return (
      <div
        key={m.id}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
        onClick={() => onMemberClick?.(m.user_id)}
      >
        <div className="relative">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-lg transition-transform group-hover:scale-105"
            style={{ backgroundColor: customRole?.color || roleConfigs[m.role] || '#94a3b8' }}
          >
            {m.profile?.avatar_url ? (
              <img src={m.profile.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${statusColors[m.profile?.status || 'offline']}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold truncate group-hover:text-primary transition-colors" style={{ color: displayColor }}>
              {displayName}
            </p>
            {customRole?.icon && AVAILABLE_ICONS[customRole.icon] ? (
              React.createElement(AVAILABLE_ICONS[customRole.icon], { className: "w-3 h-3", style: { color: customRole.color } })
            ) : (
              ROLE_ICONS[m.role]
            )}
          </div>
          <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest opacity-50">{customRole?.name || m.role}</p>
        </div>
      </div>
    );
  };

  const roles = ['owner', 'admin', 'moderator', 'member'];

  return (
    <div className="w-64 h-full bg-background/30 backdrop-blur-2xl border-l border-white/5 overflow-y-auto scrollbar-hide p-4 inner-glow shrink-0 min-h-0">
      {roles.map(role => {
        const roleMembers = members.filter(m => m.role === role);
        if (roleMembers.length === 0) return null;

        return (
          <div key={role} className="mb-6">
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-3 flex items-center gap-2 opacity-30">
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: roleConfigs[role] || '#94a3b8' }} />
              {role}s — {roleMembers.length}
            </h3>
            <div className="space-y-1">
              {roleMembers.map(renderMember)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MemberSidebar;
