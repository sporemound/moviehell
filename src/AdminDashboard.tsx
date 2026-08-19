import { FormEvent, useEffect, useState } from 'react';
import {
  AdminUser,
  AdminUsersResponse,
  AuditLogEntry,
  AuditLogResponse,
  ChannelRequest,
  ChannelRequestsResponse,
  CustomEmoji,
  EmojisResponse,
  GuildTier,
  Room,
  RoomsResponse,
  StreamListing,
  StreamPlatform,
  StreamsResponse,
  TrustTier,
  User,
} from './types';

type AdminTab = 'rooms' | 'pitches' | 'users' | 'emotes' | 'audit' | 'provenance';

type AdminDashboardProps = {
  user: User;
  token: string | null;
  onNavigateHome: () => void;
  onNavigateMod: () => void;
};

export function AdminDashboard({ user, token, onNavigateHome, onNavigateMod }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('rooms');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Rooms State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomChannel, setNewRoomChannel] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Pitches State
  const [pitches, setPitches] = useState<ChannelRequest[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [quotaUserId, setQuotaUserId] = useState<number | ''>('');
  const [quotaVotes, setQuotaVotes] = useState(10);
  const [quotaBusy, setQuotaBusy] = useState(false);

  // Emotes State
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(false);
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiShortcode, setEmojiShortcode] = useState('');
  const [emojiLabel, setEmojiLabel] = useState('');
  const [emojiPreviewUrl, setEmojiPreviewUrl] = useState('');
  const [uploadingEmoji, setUploadingEmoji] = useState(false);

  // Provenance & Guild State
  const [sources, setSources] = useState<StreamListing[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [boundarizeSourceId, setBoundarizeSourceId] = useState('');
  const [boundarizeName, setBoundarizeName] = useState('');
  const [boundarizePlatform, setBoundarizePlatform] = useState<StreamPlatform>('kick');
  const [boundarizeChannel, setBoundarizeChannel] = useState('');
  const [boundarizeGuild, setBoundarizeGuild] = useState<GuildTier>('guild_community');
  const [boundarizeTrustTier, setBoundarizeTrustTier] = useState<TrustTier>('trusted_member');
  const [boundarizeDomain, setBoundarizeDomain] = useState('');
  const [boundarizeWatchUrl, setBoundarizeWatchUrl] = useState('');
  const [boundarizeEmbedUrl, setBoundarizeEmbedUrl] = useState('');
  const [boundarizeHlsUrl, setBoundarizeHlsUrl] = useState('');
  const [boundarizeAttestation, setBoundarizeAttestation] = useState('');
  const [boundarizeTags, setBoundarizeTags] = useState('community-verified, indie-screenings');
  const [boundarizeBusy, setBoundarizeBusy] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };

  const fetchRooms = async () => {
    setRoomsLoading(true);
    try {
      const res = await fetch('/api/rooms');
      const data = (await res.json()) as RoomsResponse;
      if (data.ok && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      }
    } catch {
      setError('Could not load screening rooms.');
    } finally {
      setRoomsLoading(false);
    }
  };

  const fetchPitches = async () => {
    setPitchesLoading(true);
    try {
      const res = await fetch('/api/channel-requests', { headers: authHeaders });
      const data = (await res.json()) as ChannelRequestsResponse;
      if (data.ok && Array.isArray(data.requests)) {
        setPitches(data.requests);
      }
    } catch {
      setError('Could not load channel pitches.');
    } finally {
      setPitchesLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders });
      const data = (await res.json()) as AdminUsersResponse;
      if (data.ok && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch {
      setError('Could not load user roster.');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchEmojis = async () => {
    setEmojisLoading(true);
    try {
      const res = await fetch('/api/emojis', { headers: authHeaders });
      const data = (await res.json()) as EmojisResponse;
      if (data.ok && Array.isArray(data.emojis)) {
        setEmojis(data.emojis);
      }
    } catch {
      setError('Could not load custom emotes.');
    } finally {
      setEmojisLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/admin/audit-log', { headers: authHeaders });
      const data = (await res.json()) as AuditLogResponse;
      if (data.ok && Array.isArray(data.logs)) {
        setAuditLogs(data.logs);
      }
    } catch {
      setError('Could not load audit trail.');
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchProvenanceSources = async () => {
    setSourcesLoading(true);
    try {
      const res = await fetch('/api/provenance/sources');
      const data = (await res.json()) as StreamsResponse;
      if (data.ok && Array.isArray(data.streams)) {
        setSources(data.streams);
      }
    } catch {
      setError('Could not load stream sources.');
    } finally {
      setSourcesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'rooms') {
      fetchRooms();
      fetchProvenanceSources();
    }
    if (activeTab === 'pitches') fetchPitches();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'emotes') fetchEmojis();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'provenance') fetchProvenanceSources();
  }, [activeTab]);

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreatingRoom(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: newRoomName.trim(),
          id: newRoomId.trim() || undefined,
          description: newRoomDesc.trim() || undefined,
          initialChannel: newRoomChannel.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; room?: Room; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create room.');
      }
      setNotice(`Official screening room "${newRoomName}" opened successfully!`);
      setNewRoomName('');
      setNewRoomId('');
      setNewRoomDesc('');
      setNewRoomChannel('');
      fetchRooms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Room creation failed.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!window.confirm(`Are you sure you want to delete screening room "${roomName}" (${roomId})?`)) return;
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete room.');
      setNotice(`Screening room "${roomName}" removed.`);
      fetchRooms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete room.');
    }
  };

  const handlePitchOverride = async (requestId: string, decision: 'approve' | 'reject') => {
    setActionBusyId(requestId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/channel-requests/${requestId}/override`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Override failed.');
      setNotice(`Pitch ${decision === 'approve' ? 'force-approved and room created' : 'rejected'}.`);
      fetchPitches();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pitch override failed.');
    } finally {
      setActionBusyId('');
    }
  };

  const handlePitchDelete = async (requestId: string, pitchName: string) => {
    if (!window.confirm(`Permanently force remove proposal for "${pitchName}"?`)) return;
    setActionBusyId(requestId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/channel-requests/${requestId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed.');
      setNotice(`Proposal for "${pitchName}" permanently removed.`);
      fetchPitches();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Proposal deletion failed.');
    } finally {
      setActionBusyId('');
    }
  };

  const handleRevokeSessions = async (targetUser: AdminUser) => {
    if (!window.confirm(`Revoke all active logins and sessions for ${targetUser.nickname} (#${targetUser.id})?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/revoke-sessions`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to revoke sessions.');
      setNotice(`All active sessions revoked for ${targetUser.nickname}.`);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions.');
    }
  };

  const handleDeleteUser = async (targetUser: AdminUser) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${targetUser.nickname}" (#${targetUser.id}) and all their data?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete user.');
      setNotice(`User "${targetUser.nickname}" (#${targetUser.id}) permanently deleted.`);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
    }
  };

  const handlePurgeNonHostAccounts = async () => {
    if (!window.confirm(`DANGER: Are you sure you want to permanently delete ALL accounts except your own (Host #${user.id})? All other users, sessions, and data will be wiped immediately.`)) return;
    try {
      const res = await fetch('/api/admin/users/purge-non-host', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; purgedCount?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to purge non-host accounts.');
      setNotice(`Successfully purged ${data.purgedCount ?? 0} non-host account(s). Only your account (#${user.id}) remains.`);
      fetchUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to purge non-host accounts.');
    }
  };

  const handleAllocateQuota = async (e: FormEvent) => {
    e.preventDefault();
    if (!quotaUserId || quotaVotes < 1) return;
    setQuotaBusy(true);
    try {
      const res = await fetch('/api/admin/quotas/allocate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ userId: Number(quotaUserId), votes: Number(quotaVotes) }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Quota allocation failed.');
      setNotice(`Successfully allocated ${quotaVotes} approval votes to Admin #${quotaUserId}.`);
      setQuotaUserId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quota allocation failed.');
    } finally {
      setQuotaBusy(false);
    }
  };

  const handleUploadEmoji = async (e: FormEvent) => {
    e.preventDefault();
    if (!emojiFile || !emojiShortcode.trim() || !emojiLabel.trim()) return;
    setUploadingEmoji(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      formData.set('file', emojiFile);
      formData.set('shortcode', emojiShortcode.trim().replace(/^:+|:+$/g, ''));
      formData.set('label', emojiLabel.trim());

      const res = await fetch('/api/admin/emojis', {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed.');
      setNotice(`Custom emote :${emojiShortcode.trim()}: uploaded successfully!`);
      setEmojiFile(null);
      setEmojiShortcode('');
      setEmojiLabel('');
      setEmojiPreviewUrl('');
      fetchEmojis();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Emote upload failed.');
    } finally {
      setUploadingEmoji(false);
    }
  };

  const handleDisableEmoji = async (emoji: CustomEmoji) => {
    if (!window.confirm(`Disable custom emote :${emoji.shortcode}:?`)) return;
    try {
      const res = await fetch(`/api/admin/emojis/${emoji.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to disable emote.');
      setNotice(`Emote :${emoji.shortcode}: disabled.`);
      fetchEmojis();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not disable emote.');
    }
  };

  const handleSelectSourceToEdit = (s: StreamListing) => {
    setBoundarizeSourceId(s.id);
    setBoundarizeName(s.name);
    setBoundarizePlatform(s.platform);
    setBoundarizeChannel(s.channel);
    setBoundarizeGuild(s.provenance?.guild || 'guild_community');
    setBoundarizeTrustTier(s.provenance?.trustTier || 'trusted_member');
    setBoundarizeDomain(
      s.provenance?.originDomain ||
        (s.platform === 'picarto' ? 'picarto.tv' : s.platform === 'owncast' ? (s.watchUrl ? new URL(s.watchUrl).host : 'stream.custom.org') : 'kick.com'),
    );
    setBoundarizeWatchUrl(s.watchUrl || '');
    setBoundarizeEmbedUrl(s.embedUrl || '');
    setBoundarizeHlsUrl(s.hlsUrl || '');
    setBoundarizeAttestation(s.provenance?.attestationNotes || '');
    setBoundarizeTags(s.provenance?.boundaryTags?.join(', ') || 'community-verified');
  };

  const handleBoundarize = async (e: FormEvent) => {
    e.preventDefault();
    if (!boundarizeSourceId.trim()) return;
    setBoundarizeBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/provenance/boundarize', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sourceId: boundarizeSourceId.trim(),
          name: boundarizeName.trim() || undefined,
          platform: boundarizePlatform,
          channel: boundarizeChannel.trim() || undefined,
          guild: boundarizeGuild,
          trustTier: boundarizeTrustTier,
          originDomain: boundarizeDomain.trim() || undefined,
          watchUrl: boundarizeWatchUrl.trim() || undefined,
          embedUrl: boundarizeEmbedUrl.trim() || undefined,
          hlsUrl: boundarizeHlsUrl.trim() || undefined,
          attestationNotes: boundarizeAttestation.trim() || undefined,
          boundaryTags: boundarizeTags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to boundarize source.');
      setNotice(`Source "${boundarizeName || boundarizeSourceId}" successfully updated in Guild Roster!`);
      setBoundarizeSourceId('');
      setBoundarizeName('');
      setBoundarizeChannel('');
      setBoundarizeDomain('');
      setBoundarizeWatchUrl('');
      setBoundarizeEmbedUrl('');
      setBoundarizeHlsUrl('');
      setBoundarizeAttestation('');
      fetchProvenanceSources();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Boundarization failed.');
    } finally {
      setBoundarizeBusy(false);
    }
  };

  const handleClearSourceForm = () => {
    setBoundarizeSourceId('');
    setBoundarizeName('');
    setBoundarizePlatform('kick');
    setBoundarizeChannel('');
    setBoundarizeGuild('guild_community');
    setBoundarizeTrustTier('trusted_member');
    setBoundarizeDomain('kick.com');
    setBoundarizeWatchUrl('');
    setBoundarizeEmbedUrl('');
    setBoundarizeHlsUrl('');
    setBoundarizeAttestation('');
    setBoundarizeTags('community-verified');
  };

  const handleDeleteSource = async (sourceId: string, name?: string) => {
    if (!window.confirm(`Are you sure you want to delete / reset stream "${name || sourceId}"?`)) return;
    try {
      const res = await fetch('/api/admin/provenance/delete', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ sourceId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete source.');
      setNotice(`Stream source "${name || sourceId}" deleted / reset to default.`);
      if (boundarizeSourceId === sourceId) handleClearSourceForm();
      fetchProvenanceSources();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleQuarantine = async (sourceId: string) => {
    const reason = window.prompt(`Enter reason for quarantining stream source "${sourceId}":`, 'Unvetted / violation of provenance boundaries');
    if (!reason) return;
    try {
      const res = await fetch('/api/admin/provenance/quarantine', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ sourceId, reason }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to quarantine source.');
      setNotice(`Stream source "${sourceId}" quarantined.`);
      fetchProvenanceSources();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quarantine failed.');
    }
  };

  return (
    <div className="dashboard-container admin-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-area">
          <button type="button" className="dashboard-back-btn" onClick={onNavigateHome}>
            ← Back to Cinema Lounge
          </button>
          <div className="dashboard-heading">
            <span className="dashboard-badge-admin">👑 Admin Control Room</span>
            <h1>Administration & System Operations</h1>
            <p>Full control over screening rooms, community submissions, accounts, and server logs.</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="theater-popout-btn" onClick={onNavigateMod}>
            🛡️ Open Mod Desk
          </button>
          <div className="admin-status-pill">
            <span>Operator:</span>
            <strong>{user.nickname}</strong>
          </div>
        </div>
      </header>

      {notice && (
        <div className="dashboard-notice success" role="status">
          <span>✓</span> {notice}
        </div>
      )}
      {error && (
        <div className="dashboard-notice error" role="alert">
          <span>⚠️</span> {error}
        </div>
      )}

      <nav className="dashboard-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'rooms'}
          className={`dash-tab ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          🎬 Screening Rooms ({rooms.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pitches'}
          className={`dash-tab ${activeTab === 'pitches' ? 'active' : ''}`}
          onClick={() => setActiveTab('pitches')}
        >
          📥 Channel Pitches ({pitches.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`dash-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users & Access ({users.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'emotes'}
          className={`dash-tab ${activeTab === 'emotes' ? 'active' : ''}`}
          onClick={() => setActiveTab('emotes')}
        >
          🎨 Emote Studio ({emojis.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'provenance'}
          className={`dash-tab ${activeTab === 'provenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('provenance')}
        >
          📺 Channels & Streams ({sources.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          className={`dash-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📜 Audit Trail ({auditLogs.length})
        </button>
      </nav>

      <main className="dashboard-content">
        {/* ROOMS TAB */}
        {activeTab === 'rooms' && (
          <section className="dash-section">
            <div className="dash-two-col">
              <div className="dash-card">
                <h3>🎬 Create Official Screening Room</h3>
                <p className="card-desc">Instantly provision a room without going through the pitch voting threshold.</p>
                <form onSubmit={handleCreateRoom} className="dash-form">
                  <div className="form-group">
                    <label htmlFor="room-name">Room Title *</label>
                    <input
                      id="room-name"
                      type="text"
                      placeholder="e.g. Midnight B-Movies"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="room-id">Slug / ID (optional)</label>
                    <input
                      id="room-id"
                      type="text"
                      placeholder="Auto-generated from title if blank"
                      value={newRoomId}
                      onChange={(e) => setNewRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="room-desc">Description</label>
                    <textarea
                      id="room-desc"
                      rows={2}
                      placeholder="Describe the mood, lineup, or theme…"
                      value={newRoomDesc}
                      onChange={(e) => setNewRoomDesc(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="room-channel">Initial Stream Source</label>
                    <input
                      id="room-channel"
                      type="text"
                      list="admin-room-stream-sources"
                      placeholder="e.g. kick:channel_name, owncast:stream_handle, or stream ID"
                      value={newRoomChannel}
                      onChange={(e) => setNewRoomChannel(e.target.value)}
                    />
                    <datalist id="admin-room-stream-sources">
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.platform})
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <button type="submit" className="dash-primary-btn" disabled={creatingRoom || !newRoomName.trim()}>
                    {creatingRoom ? 'Provisioning…' : '✨ Open Screening Room'}
                  </button>
                </form>
              </div>

              <div className="dash-card">
                <h3>🏛️ Active Official Rooms</h3>
                <p className="card-desc">Active screening halls registered in the live directory.</p>
                {roomsLoading ? (
                  <p className="quiet-state">Scanning projection booths…</p>
                ) : rooms.length === 0 ? (
                  <p className="quiet-state">No screening rooms open.</p>
                ) : (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Room</th>
                          <th>Slug ID</th>
                          <th>Stream</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.map((r) => {
                          const id = typeof r === 'string' ? r : r.id;
                          const name = typeof r === 'string' ? r : r.name;
                          const stream = typeof r === 'string' ? '' : r.initialChannel || '—';
                          const isLobby = id === 'lobby';
                          return (
                            <tr key={id}>
                              <td>
                                <strong>{name}</strong>
                                {typeof r === 'object' && r.description && (
                                  <span className="table-subtext">{r.description}</span>
                                )}
                              </td>
                              <td><code>{id}</code></td>
                              <td><span className="table-badge">{stream}</span></td>
                              <td>
                                {!isLobby ? (
                                  <button
                                    type="button"
                                    className="dash-danger-btn small"
                                    onClick={() => handleDeleteRoom(String(id), String(name))}
                                  >
                                    Delete
                                  </button>
                                ) : (
                                  <span className="table-subtext">Protected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* PITCHES TAB */}
        {activeTab === 'pitches' && (
          <section className="dash-section">
            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>📥 Channel Pitches & Administrative Overrides</h3>
                  <p className="card-desc">Review audience proposals. Administrators can force-approve or reject any pitch.</p>
                </div>
                <button type="button" className="dash-secondary-btn" onClick={fetchPitches}>
                  ↻ Refresh
                </button>
              </div>

              {pitchesLoading ? (
                <p className="quiet-state">Loading pitch box submissions…</p>
              ) : pitches.length === 0 ? (
                <p className="quiet-state">No channel requests submitted yet.</p>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Channel Title</th>
                        <th>Pitch Reason</th>
                        <th>Requester</th>
                        <th>Status</th>
                        <th>Direct Overrides</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pitches.map((pitch) => (
                        <tr key={pitch.id}>
                          <td>
                            <strong>{pitch.name}</strong>
                            {pitch.description && <span className="table-subtext">{pitch.description}</span>}
                          </td>
                          <td style={{ maxWidth: '300px' }}>
                            <p className="table-reason-text">{pitch.reason}</p>
                          </td>
                          <td>{pitch.requester?.nickname || (pitch.requesterId ? `User #${pitch.requesterId}` : 'Community')}</td>
                          <td>
                            <span className={`status-pill ${pitch.status}`}>{pitch.status}</span>
                          </td>
                          <td>
                            <div className="table-actions">
                              {pitch.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="dash-success-btn small"
                                    disabled={actionBusyId === pitch.id}
                                    onClick={() => handlePitchOverride(pitch.id, 'approve')}
                                    title="Force Approve and Create Room"
                                  >
                                    ⚡ Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="dash-secondary-btn small"
                                    disabled={actionBusyId === pitch.id}
                                    onClick={() => handlePitchOverride(pitch.id, 'reject')}
                                    title="Reject Proposal"
                                  >
                                    ❌ Reject
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="dash-danger-btn small"
                                disabled={actionBusyId === pitch.id}
                                onClick={() => handlePitchDelete(pitch.id, pitch.name)}
                                title="Permanently Force Remove Proposal"
                              >
                                🗑️ Force Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <section className="dash-section">
            <div className="dash-two-col">
              <div className="dash-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0 }}>👥 Registered Users ({users.length})</h3>
                  {users.length > 1 && (
                    <button
                      type="button"
                      className="dash-danger-btn small"
                      title="Permanently remove all accounts except your own host account"
                      onClick={handlePurgeNonHostAccounts}
                    >
                      🧹 Purge All Non-Host Accounts
                    </button>
                  )}
                </div>
                <input
                  type="search"
                  placeholder="Filter users by nickname or email…"
                  className="dash-search-box"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                {usersLoading ? (
                  <p className="quiet-state">Loading user roster…</p>
                ) : (
                  <div className="dash-table-wrap" style={{ maxHeight: '480px' }}>
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Nickname</th>
                          <th>Role</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users
                          .filter(
                            (u) =>
                              !userSearch ||
                              u.nickname.toLowerCase().includes(userSearch.toLowerCase()) ||
                              u.email.toLowerCase().includes(userSearch.toLowerCase()),
                          )
                          .map((u) => (
                            <tr key={u.id}>
                              <td><code>#{u.id}</code></td>
                              <td>
                                <strong>{u.nickname}</strong>
                                <span className="table-subtext">{u.email}</span>
                              </td>
                              <td>
                                {u.isAdmin ? (
                                  <span className="chatter-badge admin-badge">👑 Admin</span>
                                ) : u.isModerator ? (
                                  <span className="chatter-badge mod-badge">🛡️ Mod</span>
                                ) : (
                                  <span className="chatter-badge member-badge">Member</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="dash-danger-btn small"
                                    title="Revoke active sessions"
                                    onClick={() => handleRevokeSessions(u)}
                                  >
                                    Revoke Sessions
                                  </button>
                                  {u.id !== user.id && (
                                    <button
                                      type="button"
                                      className="dash-danger-btn small"
                                      title="Permanently delete user account"
                                      onClick={() => handleDeleteUser(u)}
                                    >
                                      Delete User
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="dash-card">
                <h3>⚖️ Approval Quota Allocation</h3>
                <p className="card-desc">Allocate multi-sig approval vote quotas to configured administrators.</p>
                <form onSubmit={handleAllocateQuota} className="dash-form">
                  <div className="form-group">
                    <label htmlFor="quota-user">Admin User ID *</label>
                    <input
                      id="quota-user"
                      type="number"
                      placeholder="e.g. 2"
                      value={quotaUserId}
                      onChange={(e) => setQuotaUserId(e.target.value ? Number(e.target.value) : '')}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="quota-votes">Approval Votes to Grant *</label>
                    <input
                      id="quota-votes"
                      type="number"
                      min={1}
                      max={500}
                      value={quotaVotes}
                      onChange={(e) => setQuotaVotes(Number(e.target.value))}
                      required
                    />
                  </div>
                  <button type="submit" className="dash-primary-btn" disabled={quotaBusy || !quotaUserId}>
                    {quotaBusy ? 'Allocating…' : '🎟️ Allocate Quota'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* EMOTES TAB */}
        {activeTab === 'emotes' && (
          <section className="dash-section">
            <div className="dash-two-col">
              <div className="dash-card">
                <h3>🎨 Custom Emote Studio</h3>
                <p className="card-desc">Upload custom cinema emotes (PNG, WEBP, GIF, SVG). Max 128KB, 128x128px.</p>
                <form onSubmit={handleUploadEmoji} className="dash-form">
                  <div className="form-group">
                    <label htmlFor="emote-shortcode">Shortcode * (without colons)</label>
                    <input
                      id="emote-shortcode"
                      type="text"
                      placeholder="e.g. cinema_fire"
                      value={emojiShortcode}
                      onChange={(e) => setEmojiShortcode(e.target.value.replace(/[^a-z0-9_]/gi, ''))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="emote-label">Display Label *</label>
                    <input
                      id="emote-label"
                      type="text"
                      placeholder="e.g. Cinema On Fire"
                      value={emojiLabel}
                      onChange={(e) => setEmojiLabel(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="emote-file">Emote Image File *</label>
                    <input
                      id="emote-file"
                      type="file"
                      accept="image/png,image/webp,image/gif,image/jpeg,image/avif,image/svg+xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setEmojiFile(file);
                        if (file) {
                          setEmojiPreviewUrl(URL.createObjectURL(file));
                        } else {
                          setEmojiPreviewUrl('');
                        }
                      }}
                      required
                    />
                  </div>
                  {emojiPreviewUrl && (
                    <div className="emote-upload-preview">
                      <span>Preview:</span>
                      <img src={emojiPreviewUrl} alt="Preview" width={48} height={48} />
                      <code>:{emojiShortcode || 'shortcode'}:</code>
                    </div>
                  )}
                  <button type="submit" className="dash-primary-btn" disabled={uploadingEmoji || !emojiFile}>
                    {uploadingEmoji ? 'Uploading…' : '🚀 Publish Emote'}
                  </button>
                </form>
              </div>

              <div className="dash-card">
                <h3>🖼️ Server Emote Catalog ({emojis.length})</h3>
                {emojisLoading ? (
                  <p className="quiet-state">Loading custom emotes…</p>
                ) : emojis.length === 0 ? (
                  <p className="quiet-state">No custom emotes uploaded yet.</p>
                ) : (
                  <div className="dash-emote-grid">
                    {emojis.map((emoji) => (
                      <div key={emoji.id} className={`dash-emote-card ${emoji.disabled ? 'disabled' : ''}`}>
                        <img src={`/api/emojis/${emoji.id}/image`} alt={emoji.label} width={36} height={36} />
                        <div className="emote-card-meta">
                          <strong>:{emoji.shortcode}:</strong>
                          <span>{emoji.label}</span>
                        </div>
                        {!emoji.disabled && (
                          <button
                            type="button"
                            className="dash-danger-btn small"
                            onClick={() => handleDisableEmoji(emoji)}
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* AUDIT TAB */}
        {activeTab === 'audit' && (
          <section className="dash-section">
            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>📜 System Audit Log & Moderation History</h3>
                  <p className="card-desc">Immutable chronological record of administrative actions, bans, and overrides.</p>
                </div>
                <input
                  type="search"
                  placeholder="Search logs by event, actor, or subject…"
                  className="dash-search-box"
                  style={{ width: '280px' }}
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                />
              </div>

              {auditLoading ? (
                <p className="quiet-state">Reading projection logs…</p>
              ) : auditLogs.length === 0 ? (
                <p className="quiet-state">No audit logs recorded yet.</p>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Actor</th>
                        <th>Event</th>
                        <th>Subject</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs
                        .filter(
                          (log) =>
                            !auditSearch ||
                            log.event.toLowerCase().includes(auditSearch.toLowerCase()) ||
                            log.actorNickname.toLowerCase().includes(auditSearch.toLowerCase()) ||
                            log.subject.toLowerCase().includes(auditSearch.toLowerCase()),
                        )
                        .map((log) => (
                          <tr key={log.id}>
                            <td>
                              <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString()}</time>
                            </td>
                            <td>
                              <strong>{log.actorNickname}</strong>
                              <span className="table-subtext">ID #{log.actorId}</span>
                            </td>
                            <td>
                              <code className="event-tag">{log.event}</code>
                            </td>
                            <td><code>{log.subject}</code></td>
                            <td>
                              <pre className="table-json">{JSON.stringify(log.details)}</pre>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
        {activeTab === 'provenance' && (
          <section className="dash-panel" aria-label="Channels & Stream Catalog Management">
            <div className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h2>📺 Channel & Stream Catalog Manager</h2>
                  <p>Add, edit, rename, and boundarize stream sources across all screening rooms and player dropdowns.</p>
                </div>
              </div>

              {boundarizeSourceId ? (
                <div style={{
                  padding: '0.65rem 1rem',
                  marginBottom: '1rem',
                  borderRadius: '0.25rem',
                  background: 'rgba(243, 216, 153, 0.12)',
                  border: '1px solid var(--gold-bright)',
                  color: 'var(--gold-bright)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}>
                  <div>
                    ✏️ <strong>Currently Editing:</strong> {boundarizeName || boundarizeSourceId} (<code>{boundarizeSourceId}</code>)
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={handleClearSourceForm}
                    title="Clear form and create a new stream"
                  >
                    ➕ New Stream Mode
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '0.5rem 0.85rem',
                  marginBottom: '1rem',
                  borderRadius: '0.25rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px dashed rgba(216, 182, 107, 0.3)',
                  color: 'var(--ivory-muted)',
                  fontSize: '0.84rem',
                }}>
                  ✨ <strong>Mode: Add New Stream</strong> — Choose a stream from the quick-select below to edit it, or fill in the fields to register a new stream.
                </div>
              )}

              <form className="dash-form" onSubmit={handleBoundarize}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="quick-source-select">⚡ Quick-Select Active Stream to Edit / Rename</label>
                  <select
                    id="quick-source-select"
                    value={boundarizeSourceId}
                    onChange={(e) => {
                      const found = sources.find((s) => s.id === e.target.value);
                      if (found) handleSelectSourceToEdit(found);
                      else if (!e.target.value) handleClearSourceForm();
                      else setBoundarizeSourceId(e.target.value);
                    }}
                  >
                    <option value="">— Select an existing stream to populate fields, or create new below —</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.platform.toUpperCase()}: {s.channel}) {s.provenance ? `[${s.provenance.guild}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="boundarize-source-id">Stream Handle / Source ID *</label>
                    <input
                      id="boundarize-source-id"
                      type="text"
                      placeholder="e.g. kick:channel_name, picarto:stream_handle, owncast:instance"
                      value={boundarizeSourceId}
                      onChange={(e) => setBoundarizeSourceId(e.target.value)}
                      required
                    />
                    <small>Unique source key (e.g. <code>kick:channel_name</code> or <code>picarto:stream_handle</code>).</small>
                  </div>
                  <div className="form-group">
                    <label htmlFor="boundarize-name">Display Name (Channel Title) *</label>
                    <input
                      id="boundarize-name"
                      type="text"
                      placeholder="e.g. Official Cinema Lounge"
                      value={boundarizeName}
                      onChange={(e) => setBoundarizeName(e.target.value)}
                      required
                    />
                    <small>Updating this changes the channel name without losing upstream API polling.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="boundarize-platform">Platform Binding</label>
                    <select
                      id="boundarize-platform"
                      value={boundarizePlatform}
                      onChange={(e) => setBoundarizePlatform(e.target.value as StreamPlatform)}
                    >
                      <option value="picarto">Picarto (Active API Polling & HLS Edge)</option>
                      <option value="owncast">Owncast (Active API & Direct HLS)</option>
                      <option value="kick">Kick (Embed Player)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="boundarize-channel">Channel Identifier / Slug</label>
                    <input
                      id="boundarize-channel"
                      type="text"
                      placeholder="e.g. stream.custom.org, channel_name, or live_slug"
                      value={boundarizeChannel}
                      onChange={(e) => setBoundarizeChannel(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="boundarize-guild">Guild Membership Tier *</label>
                    <select
                      id="boundarize-guild"
                      value={boundarizeGuild}
                      onChange={(e) => setBoundarizeGuild(e.target.value as GuildTier)}
                    >
                      <option value="guild_projectionist">🏛️ Projectionist Guild (Canonical House Channel)</option>
                      <option value="guild_community">🛡️ Trusted Community Guild (Boundarized Member)</option>
                      <option value="guild_archivist">📼 Archivist Guild (Vintage Vault & Film Club)</option>
                      <option value="unboundarized">⚠️ Unboundarized (Restricted Sandbox)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="boundarize-trust">Trust Tier *</label>
                    <select
                      id="boundarize-trust"
                      value={boundarizeTrustTier}
                      onChange={(e) => setBoundarizeTrustTier(e.target.value as TrustTier)}
                    >
                      <option value="official">Official House Stream</option>
                      <option value="trusted_member">Verified Community Member</option>
                      <option value="probationary">Probationary / Observation</option>
                      <option value="quarantined">Quarantined / Restrict Embeds</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="boundarize-domain">Origin Domain</label>
                    <input
                      id="boundarize-domain"
                      type="text"
                      placeholder="e.g. picarto.tv, kick.com, stream.custom.org"
                      value={boundarizeDomain}
                      onChange={(e) => setBoundarizeDomain(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="boundarize-tags">Boundary Tags</label>
                    <input
                      id="boundarize-tags"
                      type="text"
                      placeholder="official, cinema-lounge, film-club, low-latency"
                      value={boundarizeTags}
                      onChange={(e) => setBoundarizeTags(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="boundarize-watch-url">Watch Webpage URL</label>
                    <input
                      id="boundarize-watch-url"
                      type="url"
                      placeholder="https://picarto.tv/..."
                      value={boundarizeWatchUrl}
                      onChange={(e) => setBoundarizeWatchUrl(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="boundarize-embed-url">Direct Embed / Player Proxy URL</label>
                    <input
                      id="boundarize-embed-url"
                      type="text"
                      placeholder="/api/proxy/picarto?channel=... or https://player..."
                      value={boundarizeEmbedUrl}
                      onChange={(e) => setBoundarizeEmbedUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="boundarize-hls-url">Direct HLS / M3U8 Stream URL (Optional for Direct Native Player)</label>
                  <input
                    id="boundarize-hls-url"
                    type="url"
                    placeholder="https://edge1-us-losangeles.picarto.tv/stream/hls/..."
                    value={boundarizeHlsUrl}
                    onChange={(e) => setBoundarizeHlsUrl(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="boundarize-attestation">Curator Attestation & Provenance Notes</label>
                  <textarea
                    id="boundarize-attestation"
                    rows={2}
                    placeholder="e.g. Verified by house projectionist: authorized community livestreamer with verified RTMP key."
                    value={boundarizeAttestation}
                    onChange={(e) => setBoundarizeAttestation(e.target.value)}
                  />
                </div>

                <div className="form-actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button type="submit" className="btn-primary" disabled={boundarizeBusy}>
                    {boundarizeBusy ? 'Saving...' : '💾 Save Channel Changes'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleClearSourceForm}>
                    ➕ Clear / New Stream
                  </button>
                  {boundarizeSourceId && (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDeleteSource(boundarizeSourceId, boundarizeName)}
                    >
                      🗑️ Delete / Reset Stream
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <div>
                  <h2>Active Stream Provenance & Guild Roster</h2>
                  <p>Certified stream sources and their current trust boundaries across all screening rooms.</p>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={fetchProvenanceSources} disabled={sourcesLoading}>
                  {sourcesLoading ? 'Refreshing...' : '🔄 Refresh Roster'}
                </button>
              </div>

              {sourcesLoading ? (
                <div className="dash-loading">Scanning stream provenance records...</div>
              ) : sources.length === 0 ? (
                <div className="dash-empty">No stream sources registered.</div>
              ) : (
                <div className="table-responsive">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Stream / Source</th>
                        <th>Guild Crest</th>
                        <th>Trust Boundary</th>
                        <th>Origin Domain</th>
                        <th>Attestation & Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((s) => {
                        const prov = s.provenance;
                        const guildLabel =
                          prov?.guild === 'guild_projectionist'
                            ? '🏛️ Projectionist Guild'
                            : prov?.guild === 'guild_community'
                              ? '🛡️ Community Guild'
                              : prov?.guild === 'guild_archivist'
                                ? '📼 Archivist Guild'
                                : '⚠️ Unboundarized';

                        const trustBadgeClass =
                          prov?.trustTier === 'official'
                            ? 'status-badge status-approved'
                            : prov?.trustTier === 'trusted_member'
                              ? 'status-badge status-approved'
                              : prov?.trustTier === 'quarantined'
                                ? 'status-badge status-rejected'
                                : 'status-badge status-pending';

                        return (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.name}</strong>
                              <span className="table-subtext"><code>{s.id}</code> ({s.platform})</span>
                            </td>
                            <td>
                              <span className={`guild-crest-badge ${prov?.guild || 'unboundarized'}`}>
                                {guildLabel}
                              </span>
                            </td>
                            <td>
                              <span className={trustBadgeClass}>
                                {prov?.trustTier || 'unverified'}
                              </span>
                            </td>
                            <td>
                              <code>{prov?.originDomain || s.platform}</code>
                            </td>
                            <td>
                              <p style={{ margin: 0, fontSize: '0.84rem' }}>
                                {prov?.attestationNotes || 'Standard directory source.'}
                              </p>
                              {prov?.curatorName && (
                                <span className="table-subtext">Attested by @{prov.curatorName}</span>
                              )}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="btn-sm btn-secondary"
                                  onClick={() => {
                                    handleSelectSourceToEdit(s);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  title="Edit stream and boundarization parameters"
                                >
                                  ✏️ Edit
                                </button>
                                {prov?.trustTier !== 'quarantined' ? (
                                  <button
                                    type="button"
                                    className="btn-sm btn-danger"
                                    onClick={() => handleQuarantine(s.id)}
                                    title="Quarantine this stream origin"
                                  >
                                    ⛔ Quarantine
                                  </button>
                                ) : (
                                  <span className="table-subtext">Quarantined</span>
                                )}
                                <button
                                  type="button"
                                  className="btn-sm btn-danger"
                                  onClick={() => handleDeleteSource(s.id, s.name)}
                                  title="Delete stream or reset to defaults"
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
