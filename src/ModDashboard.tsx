import { FormEvent, useEffect, useState } from 'react';
import {
  ChannelRequest,
  ChannelRequestsResponse,
  Chatter,
  GuildTier,
  ModerationActionItem,
  ModerationListResponse,
  Room,
  RoomsResponse,
  StreamListing,
  StreamPlatform,
  StreamsResponse,
  TrustTier,
  User,
} from './types';

type ModTab = 'pitches' | 'live_rooms' | 'proposals' | 'provenance';

type ModDashboardProps = {
  user: User;
  token: string | null;
  onNavigateHome: () => void;
  onNavigateAdmin: () => void;
};

export function ModDashboard({ user, token, onNavigateHome, onNavigateAdmin }: ModDashboardProps) {
  const [activeTab, setActiveTab] = useState<ModTab>('pitches');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Pitches State
  const [pitches, setPitches] = useState<ChannelRequest[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(false);
  const [pitchVoteBusyId, setPitchVoteBusyId] = useState('');
  const [pitchVoteNote, setPitchVoteNote] = useState('');

  // Live Rooms State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('lobby');
  const [roomChatters, setRoomChatters] = useState<Chatter[]>([]);
  const [chattersLoading, setChattersLoading] = useState(false);
  const [targetUserId, setTargetUserId] = useState<number | ''>('');
  const [banReason, setBanReason] = useState('');
  const [banBusy, setBanBusy] = useState(false);

  // Moderation Proposals State
  const [proposals, setProposals] = useState<ModerationActionItem[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalVoteBusyId, setProposalVoteBusyId] = useState<number | null>(null);

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

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
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
      setError('Could not load channel request queue.');
    } finally {
      setPitchesLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = (await res.json()) as RoomsResponse;
      if (data.ok && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      }
    } catch {
      setError('Could not load rooms.');
    }
  };

  const fetchRoomChatters = async (roomId: string) => {
    setChattersLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/chatters`);
      const data = (await res.json()) as { ok: boolean; chatters: Chatter[] };
      if (data.ok && Array.isArray(data.chatters)) {
        setRoomChatters(data.chatters);
      }
    } catch {
      setError('Could not inspect room audience.');
    } finally {
      setChattersLoading(false);
    }
  };

  const fetchProposals = async () => {
    setProposalsLoading(true);
    try {
      const res = await fetch('/api/admin/moderation', { headers: authHeaders });
      const data = (await res.json()) as ModerationListResponse;
      if (data.ok && Array.isArray(data.moderation)) {
        setProposals(data.moderation);
      }
    } catch {
      setError('Could not load moderation proposals.');
    } finally {
      setProposalsLoading(false);
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
    fetchRooms();
  }, []);

  useEffect(() => {
    if (activeTab === 'pitches') fetchPitches();
    if (activeTab === 'live_rooms') fetchRoomChatters(selectedRoomId);
    if (activeTab === 'proposals') fetchProposals();
    if (activeTab === 'provenance') fetchProvenanceSources();
  }, [activeTab, selectedRoomId]);

  const handleCastPitchVote = async (requestId: string, decision: 'approve' | 'decline') => {
    setPitchVoteBusyId(requestId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/channel-requests/${requestId}/votes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ decision, note: pitchVoteNote.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to submit vote.');
      setNotice(`Vote ${decision} recorded for pitch.`);
      setPitchVoteNote('');
      fetchPitches();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not cast vote.');
    } finally {
      setPitchVoteBusyId('');
    }
  };

  const handleProposeBan = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetUserId || !banReason.trim()) return;
    setBanBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/rooms/${selectedRoomId}/moderation`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'remove_user',
          targetUserId: Number(targetUserId),
          reason: banReason.trim(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Action failed.');
      setNotice(`Moderation proposal created against User #${targetUserId}.`);
      setTargetUserId('');
      setBanReason('');
      fetchRoomChatters(selectedRoomId);
      if (activeTab === 'proposals') fetchProposals();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Moderation action failed.');
    } finally {
      setBanBusy(false);
    }
  };

  const handleCastProposalVote = async (proposalId: number, decision: 'approve' | 'reject') => {
    setProposalVoteBusyId(proposalId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/moderation/${proposalId}/votes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ decision }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Vote failed.');
      setNotice(`Vote cast on proposal #${proposalId}.`);
      fetchProposals();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cast vote.');
    } finally {
      setProposalVoteBusyId(null);
    }
  };

  const handlePitchDelete = async (requestId: string, pitchName: string) => {
    if (!window.confirm(`Permanently force remove proposal for "${pitchName}"?`)) return;
    setPitchVoteBusyId(requestId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/channel-requests/${requestId}`, {
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
      setPitchVoteBusyId('');
    }
  };

  const handleProposalDelete = async (proposalId: number) => {
    if (!window.confirm(`Permanently force remove moderation proposal #${proposalId}?`)) return;
    setProposalVoteBusyId(proposalId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/moderation/${proposalId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed.');
      setNotice(`Moderation proposal #${proposalId} permanently removed.`);
      fetchProposals();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Proposal deletion failed.');
    } finally {
      setProposalVoteBusyId(null);
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
    <div className="dashboard-container mod-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-area">
          <button type="button" className="dashboard-back-btn" onClick={onNavigateHome}>
            ← Back to Cinema Lounge
          </button>
          <div className="dashboard-heading">
            <span className="dashboard-badge-mod">🛡️ Moderator Desk</span>
            <h1>Community Watch & Curation Desk</h1>
            <p>Vote on audience channel pitches, watch screening rooms, and maintain movie house etiquette.</p>
          </div>
        </div>
        <div className="dashboard-actions">
          {user.isAdmin && (
            <button type="button" className="theater-popout-btn" onClick={onNavigateAdmin}>
              👑 Admin Control Room
            </button>
          )}
          <div className="admin-status-pill mod">
            <span>Moderator:</span>
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
          aria-selected={activeTab === 'pitches'}
          className={`dash-tab ${activeTab === 'pitches' ? 'active' : ''}`}
          onClick={() => setActiveTab('pitches')}
        >
          📥 Pitch Box Queue ({pitches.filter((p) => p.status === 'pending').length} Pending)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'live_rooms'}
          className={`dash-tab ${activeTab === 'live_rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('live_rooms')}
        >
          👁️ Live Room Watcher
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'proposals'}
          className={`dash-tab ${activeTab === 'proposals' ? 'active' : ''}`}
          onClick={() => setActiveTab('proposals')}
        >
          ⚖️ Multi-Sig Moderation ({proposals.filter((p) => p.status === 'pending').length} Active)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'provenance'}
          className={`dash-tab ${activeTab === 'provenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('provenance')}
        >
          🏛️ Provenance & Guilds ({sources.length})
        </button>
      </nav>

      <main className="dashboard-content">
        {/* PITCHES TAB */}
        {activeTab === 'pitches' && (
          <section className="dash-section">
            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>📥 Channel Pitches Submitted by Viewers</h3>
                  <p className="card-desc">Review movie channels requested by the community and cast approval votes toward the consensus threshold.</p>
                </div>
                <button type="button" className="dash-secondary-btn" onClick={fetchPitches}>
                  ↻ Refresh Queue
                </button>
              </div>

              {pitchesLoading ? (
                <p className="quiet-state">Loading pitch box submissions…</p>
              ) : pitches.length === 0 ? (
                <p className="quiet-state">No submissions currently in the pitch box.</p>
              ) : (
                <div className="mod-pitch-grid">
                  {pitches.map((pitch) => {
                    const approvals = pitch.approvals ?? 0;
                    const threshold = pitch.threshold ?? 2;
                    const progressPercent = Math.min(100, Math.round((approvals / threshold) * 100));
                    return (
                      <div key={pitch.id} className="mod-pitch-card">
                        <div className="pitch-card-head">
                          <div>
                            <h4>{pitch.name}</h4>
                            <span className="table-subtext">Proposed by {pitch.requester?.nickname || (pitch.requesterId ? `User #${pitch.requesterId}` : 'Community')}</span>
                          </div>
                          <span className={`status-pill ${pitch.status}`}>{pitch.status}</span>
                        </div>

                        {pitch.description && <p className="pitch-desc">{pitch.description}</p>}

                        <div className="pitch-reason-box">
                          <strong>Pitch Argument:</strong>
                          <p>"{pitch.reason}"</p>
                        </div>

                        <div className="pitch-threshold-bar">
                          <div className="progress-labels">
                            <span>Consensus Progress:</span>
                            <strong>{approvals} / {threshold} votes</strong>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>

                        <div className="pitch-card-footer">
                          {pitch.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="dash-success-btn"
                                disabled={pitchVoteBusyId === pitch.id}
                                onClick={() => handleCastPitchVote(pitch.id, 'approve')}
                              >
                                👍 Approve Pitch
                              </button>
                              <button
                                type="button"
                                className="dash-secondary-btn"
                                disabled={pitchVoteBusyId === pitch.id}
                                onClick={() => handleCastPitchVote(pitch.id, 'decline')}
                              >
                                👎 Decline
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="dash-danger-btn"
                            disabled={pitchVoteBusyId === pitch.id}
                            onClick={() => handlePitchDelete(pitch.id, pitch.name)}
                            title="Permanently remove proposal"
                          >
                            🗑️ Force Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* LIVE ROOMS TAB */}
        {activeTab === 'live_rooms' && (
          <section className="dash-section">
            <div className="dash-two-col">
              <div className="dash-card">
                <h3>👁️ Live Screening Room Audience</h3>
                <p className="card-desc">Inspect active connections and chatters in real time.</p>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="room-select">Select Screening Room:</label>
                  <select
                    id="room-select"
                    className="dash-select"
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                  >
                    {rooms.map((r) => {
                      const id = typeof r === 'string' ? r : r.id;
                      const name = typeof r === 'string' ? r : r.name;
                      return (
                        <option key={id} value={id}>
                          {name} ({id})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {chattersLoading ? (
                  <p className="quiet-state">Contacting room Durable Object…</p>
                ) : roomChatters.length === 0 ? (
                  <p className="quiet-state">No viewers connected to this screening room.</p>
                ) : (
                  <ul className="chatters-list">
                    {roomChatters.map((chatter) => (
                      <li key={chatter.userId} className="chatter-item">
                        <div className="chatter-info">
                          <span className="chatter-status-dot" aria-hidden="true" />
                          <span className="chatter-nickname">{chatter.nickname}</span>
                          <span className="table-subtext">ID #{chatter.userId}</span>
                          {chatter.isAdmin ? (
                            <span className="chatter-badge admin-badge">👑 Admin</span>
                          ) : chatter.isModerator ? (
                            <span className="chatter-badge mod-badge">🛡️ Mod</span>
                          ) : (
                            <span className="chatter-badge member-badge">Viewer</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="dash-danger-btn small"
                          onClick={() => {
                            setTargetUserId(chatter.userId);
                            setBanReason(`Disruptive behavior in screening room [${selectedRoomId}]`);
                          }}
                        >
                          Target
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="dash-card">
                <h3>🛡️ Issue Room Moderation Action</h3>
                <p className="card-desc">File a moderation removal for disruptive viewers. In multi-sig setups, peer moderators confirm the action.</p>
                <form onSubmit={handleProposeBan} className="dash-form">
                  <div className="form-group">
                    <label htmlFor="target-user-id">Target User ID *</label>
                    <input
                      id="target-user-id"
                      type="number"
                      placeholder="e.g. 4"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value ? Number(e.target.value) : '')}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="target-room">Target Room</label>
                    <input id="target-room" type="text" value={selectedRoomId} disabled />
                  </div>
                  <div className="form-group">
                    <label htmlFor="ban-reason">Violation / Reason *</label>
                    <textarea
                      id="ban-reason"
                      rows={3}
                      placeholder="Explain the disruption or code-of-conduct violation…"
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="dash-danger-btn" disabled={banBusy || !targetUserId || !banReason.trim()}>
                    {banBusy ? 'Issuing…' : '🚨 Propose Room Ban'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* PROPOSALS TAB */}
        {activeTab === 'proposals' && (
          <section className="dash-section">
            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>⚖️ Multi-Sign-off Moderation Actions</h3>
                  <p className="card-desc">Actions requiring multi-moderator consensus before execution.</p>
                </div>
                <button type="button" className="dash-secondary-btn small" onClick={fetchProposals} disabled={proposalsLoading}>
                  {proposalsLoading ? 'Refreshing...' : '🔄 Refresh Proposals'}
                </button>
              </div>

              {proposalsLoading ? (
                <div className="dash-loading">Loading pending actions…</div>
              ) : proposals.length === 0 ? (
                <div className="dash-empty">No open moderation proposals.</div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Action ID</th>
                        <th>Type</th>
                        <th>Target</th>
                        <th>Room</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposals.map((prop) => (
                        <tr key={prop.id}>
                          <td><code>#{prop.id}</code></td>
                          <td>
                            <strong>{prop.action === 'remove_user' ? '🚫 Remove User' : '🗑️ Delete Message'}</strong>
                          </td>
                          <td>
                            {prop.targetUserId ? `User #${prop.targetUserId}` : `Msg #${prop.messageId}`}
                          </td>
                          <td><code>{prop.roomId}</code></td>
                          <td style={{ maxWidth: '280px' }}>
                            <p className="table-reason-text">{prop.reason || '—'}</p>
                          </td>
                          <td>
                            <span className={`status-pill ${prop.status}`}>{prop.status}</span>
                          </td>
                          <td>
                            <div className="table-actions">
                              {prop.status === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="dash-success-btn small"
                                    disabled={proposalVoteBusyId === prop.id}
                                    onClick={() => handleCastProposalVote(prop.id, 'approve')}
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="dash-secondary-btn small"
                                    disabled={proposalVoteBusyId === prop.id}
                                    onClick={() => handleCastProposalVote(prop.id, 'reject')}
                                  >
                                    ✗ Reject
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="dash-danger-btn small"
                                disabled={proposalVoteBusyId === prop.id}
                                onClick={() => handleProposalDelete(prop.id)}
                                title="Permanently remove moderation proposal"
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

        {/* PROVENANCE & GUILDS TAB */}
        {activeTab === 'provenance' && (
          <section className="dash-section">
            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>📺 Channel & Stream Catalog Manager</h3>
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
                    className="dash-secondary-btn small"
                    onClick={handleClearSourceForm}
                    title="Clear form and register a new stream"
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
                  ✨ <strong>Mode: Add New Stream</strong> — Select an active stream below to edit/rename, or enter custom details to register.
                </div>
              )}

              <form className="dash-form" onSubmit={handleBoundarize}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="mod-quick-source-select">⚡ Quick-Select Active Stream to Edit / Rename</label>
                  <select
                    id="mod-quick-source-select"
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

                <div className="dash-form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-source-id">Stream Handle / Source ID *</label>
                    <input
                      id="mod-boundarize-source-id"
                      type="text"
                      placeholder="e.g. kick:channel_name or picarto:stream_handle"
                      value={boundarizeSourceId}
                      onChange={(e) => setBoundarizeSourceId(e.target.value)}
                      required
                    />
                    <small>Primary source ID (e.g. <code>kick:channel_name</code> or <code>picarto:stream_handle</code>).</small>
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-name">Display Name (Channel Title) *</label>
                    <input
                      id="mod-boundarize-name"
                      type="text"
                      placeholder="e.g. Community Stream"
                      value={boundarizeName}
                      onChange={(e) => setBoundarizeName(e.target.value)}
                      required
                    />
                    <small>Renaming here preserves the upstream API and HLS connection.</small>
                  </div>
                </div>

                <div className="dash-form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-platform">Platform Binding</label>
                    <select
                      id="mod-boundarize-platform"
                      value={boundarizePlatform}
                      onChange={(e) => setBoundarizePlatform(e.target.value as StreamPlatform)}
                    >
                      <option value="picarto">Picarto (Active API Polling & HLS Edge)</option>
                      <option value="owncast">Owncast (Active API & Direct HLS)</option>
                      <option value="kick">Kick (Embed Player)</option>
                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-channel">Channel Identifier / Slug</label>
                    <input
                      id="mod-boundarize-channel"
                      type="text"
                      placeholder="e.g. stream.custom.org, channel_name, or live_slug"
                      value={boundarizeChannel}
                      onChange={(e) => setBoundarizeChannel(e.target.value)}
                    />
                  </div>
                </div>

                <div className="dash-form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-guild">Guild Membership Tier *</label>
                    <select
                      id="mod-boundarize-guild"
                      value={boundarizeGuild}
                      onChange={(e) => setBoundarizeGuild(e.target.value as GuildTier)}
                    >
                      <option value="guild_projectionist">🏛️ Projectionist Guild (Canonical House Channel)</option>
                      <option value="guild_community">🛡️ Trusted Community Guild (Boundarized Member)</option>
                      <option value="guild_archivist">📼 Archivist Guild (Vintage Vault & Film Club)</option>
                      <option value="unboundarized">⚠️ Unboundarized (Restricted Sandbox)</option>
                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-trust">Trust Tier *</label>
                    <select
                      id="mod-boundarize-trust"
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

                <div className="dash-form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-domain">Origin Domain</label>
                    <input
                      id="mod-boundarize-domain"
                      type="text"
                      placeholder="e.g. picarto.tv, kick.com, stream.custom.org"
                      value={boundarizeDomain}
                      onChange={(e) => setBoundarizeDomain(e.target.value)}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-tags">Boundary Tags</label>
                    <input
                      id="mod-boundarize-tags"
                      type="text"
                      placeholder="official, cinema-lounge, film-club, low-latency"
                      value={boundarizeTags}
                      onChange={(e) => setBoundarizeTags(e.target.value)}
                    />
                  </div>
                </div>

                <div className="dash-form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-watch-url">Watch Webpage URL</label>
                    <input
                      id="mod-boundarize-watch-url"
                      type="url"
                      placeholder="https://picarto.tv/..."
                      value={boundarizeWatchUrl}
                      onChange={(e) => setBoundarizeWatchUrl(e.target.value)}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="mod-boundarize-embed-url">Direct Embed / Player Proxy URL</label>
                    <input
                      id="mod-boundarize-embed-url"
                      type="text"
                      placeholder="/api/proxy/picarto?channel=... or https://player..."
                      value={boundarizeEmbedUrl}
                      onChange={(e) => setBoundarizeEmbedUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="mod-boundarize-hls-url">Direct HLS / M3U8 Stream URL (Optional for Direct Native Player)</label>
                  <input
                    id="mod-boundarize-hls-url"
                    type="url"
                    placeholder="https://edge1-us-losangeles.picarto.tv/stream/hls/..."
                    value={boundarizeHlsUrl}
                    onChange={(e) => setBoundarizeHlsUrl(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mod-boundarize-attestation">Moderator Attestation & Provenance Notes</label>
                  <textarea
                    id="mod-boundarize-attestation"
                    rows={2}
                    placeholder="e.g. Verified by moderator: community creator with verified RTMP feed."
                    value={boundarizeAttestation}
                    onChange={(e) => setBoundarizeAttestation(e.target.value)}
                  />
                </div>

                <div className="form-actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button type="submit" className="dash-primary-btn" disabled={boundarizeBusy}>
                    {boundarizeBusy ? 'Saving...' : '💾 Save Channel Changes'}
                  </button>
                  <button type="button" className="dash-secondary-btn" onClick={handleClearSourceForm}>
                    ➕ Clear / New Stream
                  </button>
                  {boundarizeSourceId && (
                    <button
                      type="button"
                      className="dash-danger-btn"
                      onClick={() => handleDeleteSource(boundarizeSourceId, boundarizeName)}
                    >
                      🗑️ Delete / Reset Stream
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="dash-card full-width">
              <div className="card-header-flex">
                <div>
                  <h3>Active Stream Provenance & Guild Roster</h3>
                  <p>Certified stream sources and their current trust boundaries across all screening rooms.</p>
                </div>
                <button
                  type="button"
                  className="dash-secondary-btn small"
                  onClick={fetchProvenanceSources}
                  disabled={sourcesLoading}
                >
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
                            ? 'status-pill approved'
                            : prov?.trustTier === 'trusted_member'
                              ? 'status-pill approved'
                              : prov?.trustTier === 'quarantined'
                                ? 'status-pill rejected'
                                : 'status-pill pending';

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
                                  className="dash-secondary-btn small"
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
                                    className="dash-danger-btn small"
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
                                  className="dash-danger-btn small"
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
