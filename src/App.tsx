import { useEffect, useRef, useState } from 'react';
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';

import { AdminDashboard } from './AdminDashboard';
import {
  CANVAS_PRESET_COLORS,
  DEFAULT_CANVAS_LAYERS,
  formatRefillCountdown,
  paintStroke,
  type DrawableStroke,
} from './canvasUtils';
import Faq from './Faq';
import { KritaStudio } from './KritaStudio';
import { ModDashboard } from './ModDashboard';
import TheaterStage from './TheaterStage';

import type {
  ApiResult,
  AuthMode,
  AuthResponse,
  CanvasAspectRatio,
  CanvasLayer,
  CanvasPoint,
  CanvasStroke,
  CanvasStrokeDraft,
  CanvasTool,
  ChannelRequest,
  ChannelRequestsResponse,
  ChannelRequestVote,
  Chatter,
  CustomEmoji,
  EmojiResponse,
  EmojisResponse,
  Message,
  MessagesResponse,
  Room,
  RoomsResponse,
  SocketEnvelope,
  StreamListing,
  StreamsResponse,
  User,
  WsTicketResponse,
} from './types';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';
type RoomView = 'chat' | 'canvas' | 'chatters';
type SitePage = 'home' | 'faq' | 'popout-chat' | 'popout-stage' | 'popout-canvas' | 'admin' | 'mod';

const retryDelays = [1_000, 2_000, 4_000, 8_000, 10_000];
const appName = 'Movie Hell';
const githubUrl = import.meta.env.VITE_GITHUB_URL || '';
const homeDescription =
  'Movie Hell is a user-choice aggregation host for film channels, live chat, shared canvases, and cinema reactions.';
const faqDescription =
  'Answers about Movie Hell accounts, channel approval, moderator voting, chat, shared canvases, reactions, and privacy.';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emojiTokenPattern =
  /\[\[mh-emoji:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const maxCanvasStrokes = 500;
const cinemaReactions = [
  { emoji: '🎬', label: 'Action!' },
  { emoji: '🍿', label: 'Popcorn worthy' },
  { emoji: '🎞️', label: 'Film grain feels' },
  { emoji: '📽️', label: 'Projection perfect' },
  { emoji: '🎥', label: 'Great cinematography' },
  { emoji: '🎟️', label: 'Ticket punched' },
  { emoji: '👏', label: 'Standing ovation' },
  { emoji: '⭐', label: 'Five stars' },
  { emoji: '🏆', label: 'Award worthy' },
  { emoji: '🔥', label: 'Box-office fire' },
  { emoji: '🤌', label: 'Pure cinema' },
  { emoji: '🫡', label: 'Respect the auteur' },
  { emoji: '🧠', label: 'Art-house brain' },
  { emoji: '🤯', label: 'Plot twist' },
  { emoji: '🧐', label: 'Continuity police' },
  { emoji: '🤔', label: "Director's cut?" },
  { emoji: '😂', label: 'Comedy landed' },
  { emoji: '😭', label: 'Third-act tears' },
  { emoji: '😱', label: 'Horror gasp' },
  { emoji: '🫣', label: 'Through my fingers' },
  { emoji: '😬', label: 'Cringe close-up' },
  { emoji: '🙄', label: 'Sequel fatigue' },
  { emoji: '🥱', label: 'Slow-cinema snooze' },
  { emoji: '💀', label: 'That killed me' },
  { emoji: '🩸', label: 'Giallo red' },
  { emoji: '🧛', label: 'Midnight creature' },
  { emoji: '👽', label: 'Cult classic' },
  { emoji: '🤖', label: 'Practical effects?' },
  { emoji: '🦈', label: 'Jumped the shark' },
  { emoji: '🎭', label: 'Genre whiplash' },
  { emoji: '❤️‍🔥', label: 'Screen romance' },
  { emoji: '💔', label: 'Tragic ending' },
  { emoji: '👑', label: 'Camp royalty' },
  { emoji: '🧀', label: 'Glorious cheese' },
  { emoji: '🐐', label: 'All-time great' },
  { emoji: '🌃', label: 'Neo-noir mood' },
  { emoji: '☄️', label: 'Blockbuster' },
  { emoji: '⏪', label: 'Rewind that' },
  { emoji: '⏸️', label: 'Intermission' },
  { emoji: '🚪', label: 'Exit stage left' },
] as const;

function pageFromPath(pathname: string): SitePage {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const pageParam = params.get('page');
  if (pageParam === 'popout-canvas' || /^\/popout-canvas\/?$/i.test(pathname)) return 'popout-canvas';
  if (pageParam === 'popout-chat' || /^\/popout-chat\/?$/i.test(pathname)) return 'popout-chat';
  if (pageParam === 'popout-stage' || /^\/popout-stage\/?$/i.test(pathname)) return 'popout-stage';
  if (/^\/faq\/?$/i.test(pathname)) return 'faq';
  if (/^\/admin\/?$/i.test(pathname)) return 'admin';
  if (/^\/mod\/?$/i.test(pathname)) return 'mod';
  return 'home';
}

function errorText(value: unknown, fallback: string) {
  if (value && typeof value === 'object') {
    const result = value as ApiResult;
    if (typeof result.error === 'string' && result.error) return result.error;
    if (typeof result.message === 'string' && result.message) return result.message;
  }
  return fallback;
}

async function api<T extends ApiResult>(
  path: string,
  options: RequestInit = {},
  accessToken = '',
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);

  const response = await fetch(path, { ...options, headers });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(errorText(payload, 'Request failed (' + response.status + ')'));
  }
  return payload;
}

function roomId(room: Room) {
  return String(room.id);
}

function channelRequesterName(request: ChannelRequest) {
  return request.requester?.nickname || request.requesterName || 'A Movie Hell member';
}

function messageRoomId(message: Message, fallback: string) {
  return message.roomId == null ? fallback : String(message.roomId);
}

function authorName(author: Message['author']) {
  if (typeof author === 'string') return author;
  return author.nickname || 'Unknown';
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function safeWatchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function streamPlatformLabel(platform: StreamListing['platform']) {
  if (platform === 'owncast') return 'Owncast';
  if (platform === 'picarto') return 'Picarto';
  return 'Kick';
}

function streamStatusLabel(status: StreamListing['status']) {
  if (status === 'offline') return 'Offline';
  return 'Live now';
}

function orderedStreams(streams: StreamListing[]) {
  const statusOrder: Record<StreamListing['status'], number> = {
    live: 0,
    unknown: 1,
    offline: 2,
  };
  return [...streams].sort(
    (left, right) =>
      statusOrder[left.status] - statusOrder[right.status] ||
      (right.viewers ?? -1) - (left.viewers ?? -1) ||
      left.name.localeCompare(right.name),
  );
}

type StreamDirectoryProps = {
  streams: StreamListing[];
  checkedAt: string;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  activeStreamId?: string | null;
  onWatchStream?: (stream: StreamListing) => void;
};

function StreamDirectory({
  streams,
  checkedAt,
  loading,
  error,
  onRefresh,
  activeStreamId,
  onWatchStream,
}: StreamDirectoryProps) {
  const listings = orderedStreams(streams);
  const liveCount = listings.filter((stream) => stream.status !== 'offline').length;

  return (
    <section className="panel stream-directory" aria-labelledby="stream-directory-heading" aria-busy={loading}>
      <div className="stream-directory-heading">
        <div>
          <p className="panel-kicker">Across the marquee</p>
          <h2 id="stream-directory-heading">Live channel directory</h2>
          <p className="stream-directory-intro">
            Check the active lineup across independent hosts. Click <strong>Watch on Stage</strong> to raise the red velvet curtains on our cinema screen above, or open the host directly.
          </p>
        </div>
        <div className="stream-directory-controls">
          <span className="stream-live-count" aria-label={`${liveCount} channels live now`}>
            <strong>{liveCount}</strong> live now
          </span>
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Checking…' : 'Refresh lineup'}
          </button>
        </div>
      </div>

      {checkedAt && (
        <p className="stream-checked-at">
          Last checked <time dateTime={checkedAt}>{formatTime(checkedAt)}</time>
        </p>
      )}
      {error && (
        <p className="stream-directory-error" role="alert">
          {error} {listings.length > 0 && 'Showing the most recent lineup available in this tab.'}
        </p>
      )}
      {loading && listings.length === 0 ? (
        <p className="quiet-state" role="status">Checking every projection booth…</p>
      ) : listings.length === 0 ? (
        <p className="quiet-state">No stream listings are available right now. The Movie Hell rooms remain open below.</p>
      ) : (
        <ul className="stream-list" aria-label="Aggregated stream listings">
          {listings.map((stream) => {
            const watchUrl = safeWatchUrl(stream.watchUrl);
            const isCurrentlyWatching = activeStreamId === stream.id;
            return (
              <li
                key={stream.id}
                className={`stream-card ${isCurrentlyWatching ? 'stream-card-active' : ''}`}
                data-status={stream.status}
              >
                <div className="stream-card-badges">
                  <span className="stream-platform">{streamPlatformLabel(stream.platform)}</span>
                  <span className={`stream-status stream-status-${stream.status}`}>
                    <span aria-hidden="true" /> {streamStatusLabel(stream.status)}
                  </span>
                  {stream.provenance && (
                    <span
                      className={`stream-guild-crest ${stream.provenance.guild}`}
                      title={`Origin: ${stream.provenance.originDomain || stream.platform} • ${stream.provenance.attestationNotes || 'Verified'}`}
                    >
                      {stream.provenance.guild === 'guild_projectionist'
                        ? '🏛️ House'
                        : stream.provenance.guild === 'guild_community'
                          ? '🛡️ Community'
                          : stream.provenance.guild === 'guild_archivist'
                            ? '📼 Archive'
                            : '⚠️ Unboundarized'}
                    </span>
                  )}
                  {stream.mature === true && <span className="stream-mature">Mature</span>}
                  {isCurrentlyWatching && <span className="stream-badge-watching">On Stage</span>}
                </div>
                <h3>{stream.name}</h3>
                <p className="stream-channel">{stream.channel}</p>
                {stream.currentTitle && <p className="stream-current-title">{stream.currentTitle}</p>}
                {stream.description && <p className="stream-description">{stream.description}</p>}
                <p className="stream-viewers">
                  {stream.viewers == null
                    ? 'Viewer count unavailable'
                    : `${stream.viewers.toLocaleString()} ${stream.viewers === 1 ? 'viewer' : 'viewers'}`}
                </p>
                {stream.mature === true && (
                  <p className="stream-mature-notice">
                    The provider marks this channel as mature. Review its content notice before opening.
                  </p>
                )}
                <div className="stream-card-actions">
                  <button
                    type="button"
                    className={`stream-watch-stage-btn ${isCurrentlyWatching ? 'is-active' : ''}`}
                    onClick={() => onWatchStream?.(stream)}
                    title={`Watch ${stream.name} on the Movie Hell stage`}
                  >
                    {isCurrentlyWatching ? '🍿 Watching on Stage' : '🎬 Watch on Stage'}
                  </button>
                  {watchUrl ? (
                    <a
                      className="stream-watch-link"
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${stream.name} on ${streamPlatformLabel(stream.platform)} in a new tab`}
                    >
                      Provider <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <span className="stream-link-unavailable">Provider link unavailable</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsedAuthor(value: unknown): Message['author'] {
  if (typeof value === 'string') return value;
  const candidate = record(value);
  return candidate && typeof candidate.nickname === 'string'
    ? { nickname: candidate.nickname }
    : 'Unknown';
}

function parsedCanvasPoint(value: unknown): CanvasPoint | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.x !== 'number' || typeof candidate.y !== 'number') {
    return null;
  }
  if (
    !Number.isFinite(candidate.x) ||
    !Number.isFinite(candidate.y) ||
    candidate.x < 0 ||
    candidate.x > 1 ||
    candidate.y < 0 ||
    candidate.y > 1
  ) {
    return null;
  }
  return { x: candidate.x, y: candidate.y };
}

function parsedCanvasStroke(value: unknown): CanvasStroke | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== 'string' || candidate.id.length > 128) return null;
  const pageIndexRaw = typeof candidate.pageIndex === 'number' ? candidate.pageIndex : 1;
  const pageIndex = Number.isSafeInteger(pageIndexRaw) && pageIndexRaw >= 1 && pageIndexRaw <= 5 ? pageIndexRaw : 1;
  if (candidate.tool !== 'pen' && candidate.tool !== 'eraser') return null;
  if (typeof candidate.color !== 'string' || !hexColorPattern.test(candidate.color)) return null;
  if (
    typeof candidate.width !== 'number' ||
    !Number.isInteger(candidate.width) ||
    candidate.width < 1 ||
    candidate.width > 24
  ) {
    return null;
  }
  if (!Array.isArray(candidate.points) || candidate.points.length < 2 || candidate.points.length > 64) {
    return null;
  }
  const points = candidate.points.map(parsedCanvasPoint);
  if (points.some((point) => point === null)) return null;
  if (typeof candidate.createdAt !== 'string' || candidate.createdAt.length > 64) return null;
  return {
    id: candidate.id,
    pageIndex,
    author: parsedAuthor(candidate.author),
    tool: candidate.tool,
    color: candidate.color.toLowerCase(),
    width: candidate.width,
    points: points as CanvasPoint[],
    createdAt: candidate.createdAt,
  };
}

function parsedEpoch(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function orderedCanvasStrokes(...groups: CanvasStroke[][]): CanvasStroke[] {
  const byId = new Map<string, CanvasStroke>();
  for (const stroke of groups.flat()) byId.set(stroke.id, stroke);
  return [...byId.values()]
    .sort((left, right) => {
      const leftId = Number(left.id);
      const rightId = Number(right.id);
      if (Number.isSafeInteger(leftId) && Number.isSafeInteger(rightId)) return leftId - rightId;
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    })
    .slice(-(maxCanvasStrokes * 5));
}

function socketEnvelope(raw: string, fallbackRoomId: string): SocketEnvelope | null {
  try {
    const envelope = record(JSON.parse(raw));
    if (!envelope) return null;

    if (envelope.type === 'canvas_snapshot') {
      const roomId = typeof envelope.roomId === 'string' ? envelope.roomId : '';
      const epoch = parsedEpoch(envelope.epoch);
      if (
        !roomId ||
        epoch === null ||
        !Array.isArray(envelope.strokes) ||
        envelope.strokes.length > maxCanvasStrokes * 5
      ) {
        return null;
      }
      const strokes = envelope.strokes.map(parsedCanvasStroke);
      if (strokes.some((stroke) => stroke === null)) return null;
      return {
        type: 'canvas_snapshot',
        roomId,
        epoch,
        strokes: strokes as CanvasStroke[],
        refillTimestamp: typeof envelope.refillTimestamp === 'number' ? envelope.refillTimestamp : undefined,
        hoursRemaining: typeof envelope.hoursRemaining === 'number' ? envelope.hoursRemaining : undefined,
      };
    }

    if (envelope.type === 'canvas_stroke') {
      const roomId = typeof envelope.roomId === 'string' ? envelope.roomId : '';
      const epoch = parsedEpoch(envelope.epoch);
      const stroke = parsedCanvasStroke(envelope.stroke);
      if (!roomId || epoch === null || !stroke) return null;
      return { type: 'canvas_stroke', roomId, epoch, stroke };
    }

    if (envelope.type === 'canvas_error') {
      const roomId = typeof envelope.roomId === 'string' ? envelope.roomId : '';
      if (!roomId || typeof envelope.error !== 'string' || envelope.error.length > 300) return null;
      return { type: 'canvas_error', roomId, error: envelope.error };
    }

    if (envelope.type === 'presence') {
      const roomId = typeof envelope.roomId === 'string' ? envelope.roomId : fallbackRoomId;
      const rawChatters = Array.isArray(envelope.chatters) ? envelope.chatters : [];
      const chatters: Chatter[] = [];
      for (const item of rawChatters) {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const userId = Number(rec.userId);
          const nickname = typeof rec.nickname === 'string' ? rec.nickname : '';
          if (Number.isSafeInteger(userId) && nickname) {
            chatters.push({
              userId,
              nickname,
              isAdmin: Boolean(rec.isAdmin),
              isModerator: Boolean(rec.isModerator),
            });
          }
        }
      }
      return { type: 'presence', roomId, chatters };
    }

    if (envelope.type && envelope.type !== 'chat') return null;
    const candidate =
      envelope.message && typeof envelope.message === 'object'
        ? (envelope.message as Record<string, unknown>)
        : envelope;
    if (typeof candidate.text !== 'string') return null;

    const message: Message = {
      id:
        typeof candidate.id === 'string' || typeof candidate.id === 'number'
          ? candidate.id
          : 'socket-' + Date.now() + '-' + Math.random(),
      roomId:
        typeof candidate.roomId === 'string' || typeof candidate.roomId === 'number'
          ? candidate.roomId
          : fallbackRoomId,
      author: parsedAuthor(candidate.author),
      text: candidate.text,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    };
    return { type: 'chat', message };
  } catch {
    return null;
  }
}

function normalizedCustomEmoji(value: unknown): CustomEmoji | null {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !uuidPattern.test(candidate.id) ||
    typeof candidate.shortcode !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{1,31}$/.test(candidate.shortcode) ||
    typeof candidate.label !== 'string' ||
    candidate.label.length < 1 ||
    candidate.label.length > 64 ||
    typeof candidate.assetUrl !== 'string' ||
    typeof candidate.width !== 'number' ||
    !Number.isInteger(candidate.width) ||
    candidate.width < 1 ||
    candidate.width > 256 ||
    typeof candidate.height !== 'number' ||
    !Number.isInteger(candidate.height) ||
    candidate.height < 1 ||
    candidate.height > 256 ||
    typeof candidate.createdAt !== 'string'
  ) {
    return null;
  }

  try {
    const asset = new URL(candidate.assetUrl, window.location.origin);
    if (asset.origin !== window.location.origin || (asset.protocol !== 'http:' && asset.protocol !== 'https:')) {
      return null;
    }
    return {
      id: candidate.id.toLowerCase(),
      shortcode: candidate.shortcode,
      label: candidate.label,
      assetUrl: asset.pathname + asset.search,
      width: candidate.width,
      height: candidate.height,
      disabled: candidate.disabled === true,
      createdAt: candidate.createdAt,
    };
  } catch {
    return null;
  }
}

function MessageText({
  text,
  emojisById,
  emojisByShortcode,
}: {
  text: string;
  emojisById?: Map<string, CustomEmoji>;
  emojisByShortcode?: Map<string, CustomEmoji>;
}) {
  const parts: ReactNode[] = [];
  const tokenMatcher =
    /\[\[mh-emoji:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]|:([a-z0-9][a-z0-9_-]{1,31}):/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenMatcher.exec(text))) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    const emojiId = match[1]?.toLowerCase();
    const shortcode = match[2]?.toLowerCase();

    if (emojiId) {
      const emoji = emojisById?.get(emojiId);
      parts.push(
        <img
          key={`emoji-id-${match.index}-${emojiId}`}
          className="message-emoji"
          src={emoji?.assetUrl || `/api/emojis/${emojiId}/image`}
          width={emoji?.width || 28}
          height={emoji?.height || 28}
          alt={emoji ? `:${emoji.shortcode}:` : ':reaction:'}
          loading="lazy"
          decoding="async"
        />,
      );
    } else if (shortcode) {
      const emoji = emojisByShortcode?.get(shortcode);
      if (emoji) {
        parts.push(
          <img
            key={`emoji-sc-${match.index}-${emoji.id}`}
            className="message-emoji"
            src={emoji.assetUrl}
            width={emoji.width || 28}
            height={emoji.height || 28}
            alt={`:${emoji.shortcode}:`}
            loading="lazy"
            decoding="async"
          />,
        );
      } else {
        parts.push(match[0]);
      }
    } else {
      parts.push(match[0]);
    }

    cursor = tokenMatcher.lastIndex;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

type SharedCanvasProps = {
  roomName: string;
  connection: ConnectionState;
  epoch: number;
  strokes: CanvasStroke[];
  notice: string;
  onStroke: (stroke: CanvasStrokeDraft) => void;
  activePage: number;
  onChangePage: (page: number) => void;
  refillAt?: number;
  onPopOut?: () => void;
  layers?: CanvasLayer[];
  onChangeLayers?: (layers: CanvasLayer[]) => void;
  onDeleteLayerStrokes?: (layerId: number) => void;
};

function SharedCanvas({
  roomName,
  connection,
  epoch,
  strokes,
  notice,
  onStroke,
  activePage,
  onChangePage,
  refillAt,
  onPopOut,
  layers,
  onChangeLayers,
  onDeleteLayerStrokes,
}: SharedCanvasProps) {
  const [aspectRatio, setAspectRatio] = useState<CanvasAspectRatio>('16:9');

  return (
    <div id="room-canvas-panel" className="canvas-panel" role="tabpanel" aria-labelledby="room-canvas-tab">
      <KritaStudio
        roomName={roomName}
        strokes={strokes}
        epoch={epoch}
        connected={connection === 'connected'}
        activePage={activePage}
        refillAt={refillAt}
        onChangePage={onChangePage}
        onStroke={onStroke}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        notice={notice}
        onPopOut={onPopOut}
        layers={layers}
        onChangeLayers={onChangeLayers}
        onDeleteLayerStrokes={onDeleteLayerStrokes}
      />
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<SitePage>(() => pageFromPath(typeof window !== 'undefined' ? window.location.pathname : '/'));
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string>(() => {
    try {
      return localStorage.getItem('mh_access_token') || '';
    } catch {
      return '';
    }
  });
  const [refreshToken, setRefreshToken] = useState<string>(() => {
    try {
      return localStorage.getItem('mh_refresh_token') || '';
    } catch {
      return '';
    }
  });
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('mh_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('roomId') || '';
    }
    return '';
  });
  const [streams, setStreams] = useState<StreamListing[]>([]);
  const [streamsCheckedAt, setStreamsCheckedAt] = useState('');
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState('');
  const [streamsRefreshKey, setStreamsRefreshKey] = useState(0);
  const [activeStream, setActiveStream] = useState<StreamListing | null>(null);
  const [isChatDocked, setIsChatDocked] = useState(true);

  // Sync session tokens with localStorage
  useEffect(() => {
    try {
      if (accessToken) localStorage.setItem('mh_access_token', accessToken);
      else localStorage.removeItem('mh_access_token');
    } catch {}
  }, [accessToken]);

  useEffect(() => {
    try {
      if (refreshToken) localStorage.setItem('mh_refresh_token', refreshToken);
      else localStorage.removeItem('mh_refresh_token');
    } catch {}
  }, [refreshToken]);

  useEffect(() => {
    try {
      if (user) localStorage.setItem('mh_user', JSON.stringify(user));
      else localStorage.removeItem('mh_user');
    } catch {}
  }, [user]);

  // Validate or refresh session on mount
  useEffect(() => {
    if (!accessToken) return;
    api<{ ok: boolean; user: User }>('/api/auth/me', {}, accessToken)
      .then((res) => {
        if (res.user) setUser(res.user);
      })
      .catch(() => {
        if (refreshToken) {
          api<AuthResponse>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          })
            .then((ref) => {
              if (ref.accessToken && ref.user) {
                setAccessToken(ref.accessToken);
                setUser(ref.user);
              }
            })
            .catch(() => {
              setAccessToken('');
              setUser(null);
            });
        }
      });
  }, []);

  // Initialize selectedRoomId or activeStream from query params if opening in popout mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('roomId');
    if (roomParam) {
      setSelectedRoomId(roomParam);
    }
    const streamParam = params.get('streamId');
    if (streamParam && streams.length > 0) {
      const match = streams.find((s) => s.id === streamParam);
      if (match) setActiveStream(match);
    }
  }, [streams]);

  const openPopOutChat = (targetRoomId?: string) => {
    const rid = targetRoomId || selectedRoomId;
    const width = 450;
    const height = 720;
    const left = Math.max(0, window.screen.width - width - 40);
    const top = 60;
    const url = `/?page=popout-chat${rid ? `&roomId=${encodeURIComponent(rid)}` : ''}`;
    window.open(
      url,
      `MovieHellChat_${rid || 'default'}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
  };

  const openPopOutStage = (targetStream?: StreamListing) => {
    const stream = targetStream || activeStream;
    if (!stream) return;
    const width = 960;
    const height = 540;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const url = `/?page=popout-stage&streamId=${encodeURIComponent(stream.id)}`;
    window.open(
      url,
      `MovieHellStage_${stream.id}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
  };

  const openPopOutCanvas = (targetRoomId?: string) => {
    const rid = targetRoomId || selectedRoomId;
    const width = 1180;
    const height = 820;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const url = `/?page=popout-canvas${rid ? `&roomId=${encodeURIComponent(rid)}` : ''}`;
    window.open(
      url,
      `MovieHellCanvas_${rid || 'default'}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
  };

  const handleWatchStream = (stream: StreamListing) => {
    setActiveStream(stream);
    const stageElement = document.getElementById('theater-stage');
    if (stageElement) {
      stageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCloseTheater = () => {
    setActiveStream(null);
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [channelRequests, setChannelRequests] = useState<ChannelRequest[]>([]);
  const [channelRequestsLoading, setChannelRequestsLoading] = useState(false);
  const [canVoteChannelRequests, setCanVoteChannelRequests] = useState(false);
  const [channelRequestName, setChannelRequestName] = useState('');
  const [channelRequestDescription, setChannelRequestDescription] = useState('');
  const [channelRequestReason, setChannelRequestReason] = useState('');
  const [channelRequestSubmitting, setChannelRequestSubmitting] = useState(false);
  const [channelRequestVoteBusyId, setChannelRequestVoteBusyId] = useState('');
  const [channelRequestError, setChannelRequestError] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [roomView, setRoomView] = useState<RoomView>('chat');
  const [roomChatters, setRoomChatters] = useState<Chatter[]>([]);
  const [chatterQuery, setChatterQuery] = useState('');
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [emojisLoading, setEmojisLoading] = useState(false);
  const [emojiCatalogRefreshKey, setEmojiCatalogRefreshKey] = useState(0);
  const [emojiCatalogError, setEmojiCatalogError] = useState('');
  const [canUploadEmoji, setCanUploadEmoji] = useState(false);
  const [emojiUploading, setEmojiUploading] = useState(false);
  const [emojiShortcode, setEmojiShortcode] = useState('');
  const [emojiLabel, setEmojiLabel] = useState('');
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [canvasStrokes, setCanvasStrokes] = useState<CanvasStroke[]>([]);
  const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>(DEFAULT_CANVAS_LAYERS);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [canvasNotice, setCanvasNotice] = useState('');
  const [canvasActivePage, setCanvasActivePage] = useState(1);
  const [canvasRefillAt, setCanvasRefillAt] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const reactionToggleRef = useRef<HTMLButtonElement | null>(null);
  const emojiFileRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLOListElement | null>(null);
  const canvasEpochRef = useRef(0);

  useEffect(() => {
    if (roomView === 'chat' && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, roomView]);

  const handleUpdateCanvasLayers = (newLayers: CanvasLayer[]) => {
    setCanvasLayers(newLayers);
    if (typeof BroadcastChannel !== 'undefined' && selectedRoomId) {
      try {
        const bc = new BroadcastChannel('movie_hell_canvas_sync');
        bc.postMessage({ type: 'update_layers', layers: newLayers, roomId: selectedRoomId });
        bc.close();
      } catch {}
    }
  };

  const handleDeleteCanvasLayer = (layerId: number) => {
    setCanvasLayers((prev) => {
      const next = prev.filter((l) => l.id !== layerId);
      const finalLayers = next.length > 0 ? next : DEFAULT_CANVAS_LAYERS;
      if (typeof BroadcastChannel !== 'undefined' && selectedRoomId) {
        try {
          const bc = new BroadcastChannel('movie_hell_canvas_sync');
          bc.postMessage({ type: 'update_layers', layers: finalLayers, roomId: selectedRoomId });
          bc.close();
        } catch {}
      }
      return finalLayers;
    });
    setCanvasStrokes((prev) => {
      const remaining = prev.filter((s) => (s.layerId || 2) !== layerId);
      if (typeof BroadcastChannel !== 'undefined' && selectedRoomId) {
        try {
          const bc = new BroadcastChannel('movie_hell_canvas_sync');
          bc.postMessage({ type: 'delete_layer_strokes', layerId, roomId: selectedRoomId });
          bc.close();
        } catch {}
      }
      return remaining;
    });
  };

  // Inter-window canvas stroke & layer synchronization across popouts & main tabs
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined' || !selectedRoomId) return;
    const bc = new BroadcastChannel('movie_hell_canvas_sync');
    bc.onmessage = (event) => {
      const data = event.data;
      if (!data || data.roomId !== selectedRoomId) return;
      if (data.type === 'local_stroke' && data.stroke) {
        setCanvasStrokes((current) => orderedCanvasStrokes(current, [data.stroke]));
      } else if (data.type === 'delete_layer_strokes' && typeof data.layerId === 'number') {
        setCanvasStrokes((prev) => prev.filter((s) => (s.layerId || 2) !== data.layerId));
      } else if (data.type === 'update_layers' && Array.isArray(data.layers)) {
        setCanvasLayers(data.layers);
      }
    };
    return () => bc.close();
  }, [selectedRoomId]);

  const authenticated = Boolean(accessToken && user);
  const selectedRoom = rooms.find((room) => roomId(room) === selectedRoomId);
  const activeCustomEmojis = customEmojis.filter((emoji) => !emoji.disabled);
  const emojisById = new Map(customEmojis.map((emoji) => [emoji.id.toLowerCase(), emoji]));
  const emojisByShortcode = new Map(customEmojis.map((emoji) => [emoji.shortcode.toLowerCase(), emoji]));
  const mayUploadEmoji = canUploadEmoji;

  useEffect(() => {
    const syncPage = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', syncPage);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);

  useEffect(() => {
    document.title =
      page === 'faq'
        ? 'FAQ · Movie Hell'
        : page === 'admin'
        ? 'Admin Control Room · Movie Hell'
        : page === 'mod'
        ? 'Moderator Desk · Movie Hell'
        : appName;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', page === 'faq' ? faqDescription : homeDescription);
  }, [page]);

  useEffect(() => {
    if (page !== 'home' && page !== 'popout-stage') return;
    const controller = new AbortController();
    setStreamsLoading(true);
    setStreamsError('');
    api<StreamsResponse>('/api/streams', { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const streamList = Array.isArray(result.streams) ? result.streams : [];
        setStreams(streamList);
        setStreamsCheckedAt(typeof result.checkedAt === 'string' ? result.checkedAt : '');
        setActiveStream((current) => {
          if (current && streamList.some((s) => s.id === current.id)) {
            return streamList.find((s) => s.id === current.id) || current;
          }
          const official = streamList.find((s) => s.provenance?.trustTier === 'official');
          return official || streamList[0] || null;
        });
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setStreamsError(errorText(requestError, 'The live directory could not be refreshed.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStreamsLoading(false);
      });
    return () => controller.abort();
  }, [page, streamsRefreshKey]);

  useEffect(() => {
    setRoomView('chat');
    setRoomChatters([]);
    setChatterQuery('');
    setCanvasStrokes([]);
    canvasEpochRef.current = 0;
    setCanvasEpoch(0);
    setCanvasNotice(selectedRoomId ? 'Waiting for the authoritative canvas snapshot.' : '');
    setReactionsOpen(false);
  }, [selectedRoomId]);

  useEffect(() => {
    if (!authenticated || (page !== 'home' && page !== 'popout-chat' && page !== 'popout-stage')) {
      if (!authenticated) {
        setCustomEmojis([]);
        setCanUploadEmoji(false);
        setEmojiCatalogError('');
      }
      return;
    }

    const controller = new AbortController();
    setEmojisLoading(true);
    setEmojiCatalogError('');
    api<EmojisResponse>('/api/emojis', { signal: controller.signal }, accessToken)
      .then((result) => {
        const received = Array.isArray(result.emojis)
          ? result.emojis.map(normalizedCustomEmoji).filter((emoji): emoji is CustomEmoji => Boolean(emoji))
          : [];
        setCustomEmojis(received);
        setCanUploadEmoji(result.canUpload === true);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setEmojiCatalogError(errorText(requestError, 'Could not load custom reactions.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEmojisLoading(false);
      });

    return () => controller.abort();
  }, [authenticated, accessToken, emojiCatalogRefreshKey, page]);

  const addMessage = (incoming: Message) => {
    setMessages((current) => {
      const incomingId = String(incoming.id);
      if (current.some((message) => String(message.id) === incomingId)) return current;

      const pendingIndex = current.findIndex(
        (message) =>
          String(message.id).startsWith('pending-') &&
          message.text === incoming.text &&
          authorName(message.author) === authorName(incoming.author),
      );
      if (pendingIndex < 0) return [...current, incoming];
      const next = [...current];
      next[pendingIndex] = incoming;
      return next;
    });
  };

  const loadRooms = async (token = accessToken) => {
    setRoomsLoading(true);
    try {
      const result = await api<RoomsResponse>('/api/rooms', {}, token);
      const nextRooms = Array.isArray(result.rooms) ? result.rooms : [];
      setRooms(nextRooms);
      setSelectedRoomId((current) =>
        nextRooms.some((room) => roomId(room) === current)
          ? current
          : nextRooms[0]
            ? roomId(nextRooms[0])
            : '',
      );
    } catch (requestError) {
      setError(errorText(requestError, 'Could not load rooms.'));
    } finally {
      setRoomsLoading(false);
    }
  };

  const loadChannelRequests = async (token = accessToken, signal?: AbortSignal) => {
    setChannelRequestsLoading(true);
    try {
      const result = await api<ChannelRequestsResponse>(
        '/api/channel-requests',
        signal ? { signal } : {},
        token,
      );
      if (signal?.aborted) return;
      setChannelRequests(Array.isArray(result.requests) ? result.requests : []);
      setCanVoteChannelRequests(result.canVote === true);
      setChannelRequestError('');
    } catch (requestError) {
      if (!signal?.aborted) {
        setChannelRequestError(errorText(requestError, 'Could not load channel requests.'));
      }
    } finally {
      if (!signal?.aborted) setChannelRequestsLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated || page === 'faq' || page === 'admin' || page === 'mod') return;
    void loadRooms();
  }, [authenticated, accessToken, page]);

  useEffect(() => {
    if (!authenticated) {
      setChannelRequests([]);
      setCanVoteChannelRequests(false);
      setChannelRequestError('');
      return;
    }
    if (page !== 'home') return;
    const controller = new AbortController();
    void loadChannelRequests(accessToken, controller.signal);
    return () => controller.abort();
  }, [authenticated, accessToken, page]);

  useEffect(() => {
    if (page !== 'home' && page !== 'popout-chat') return;
    setMessages([]);
    if (!accessToken || !selectedRoomId) return;

    const controller = new AbortController();
    setMessagesLoading(true);
    api<MessagesResponse>(
      '/api/messages?roomId=' + encodeURIComponent(selectedRoomId),
      { signal: controller.signal },
      accessToken,
    )
      .then((result) => {
        const received = Array.isArray(result.messages) ? result.messages : [];
        setMessages((current) => {
          const byId = new Map(received.map((message) => [String(message.id), message]));
          for (const message of current) {
            if (messageRoomId(message, selectedRoomId) === selectedRoomId) {
              byId.set(String(message.id), message);
            }
          }
          return [...byId.values()];
        });
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(errorText(requestError, 'Could not load messages.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMessagesLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, selectedRoomId, page]);

  useEffect(() => {
    if ((page !== 'home' && page !== 'popout-chat' && page !== 'popout-canvas' && page !== 'popout-stage') || !accessToken || !selectedRoomId) {
      setConnection('idle');
      return;
    }

    let stopped = false;
    let retryIndex = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const scheduleReconnect = () => {
      if (stopped || retryIndex >= retryDelays.length) {
        if (!stopped) setConnection('disconnected');
        return;
      }
      const delay = retryDelays[retryIndex];
      retryIndex += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (stopped) return;
      setConnection('connecting');
      try {
        const result = await api<WsTicketResponse>(
          '/api/ws-ticket',
          {
            method: 'POST',
            body: JSON.stringify({ roomId: selectedRoomId }),
            signal: controller.signal,
          },
          accessToken,
        );
        if (!result.ticket) throw new Error('WebSocket ticket was not returned.');

        const url = new URL('/ws', window.location.href);
        url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('roomId', selectedRoomId);
        url.searchParams.set('ticket', result.ticket);

        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.addEventListener('open', () => {
          if (stopped || socketRef.current !== socket) {
            socket.close();
            return;
          }
          setConnection('connected');
          setCanvasNotice('Connected. Waiting for the authoritative canvas snapshot.');
        });
        socket.addEventListener('message', (event) => {
          if (stopped || socketRef.current !== socket) return;
          const incoming = socketEnvelope(String(event.data), selectedRoomId);
          if (!incoming) return;
          if (incoming.type === 'chat') {
            if (messageRoomId(incoming.message, selectedRoomId) === selectedRoomId) {
              addMessage(incoming.message);
            }
            return;
          }
          if (incoming.type === 'presence') {
            if (incoming.roomId === selectedRoomId) {
              setRoomChatters(incoming.chatters);
            }
            return;
          }
          if (incoming.roomId !== selectedRoomId) return;
          if (incoming.type === 'canvas_snapshot') {
            const sameEpoch = incoming.epoch === canvasEpochRef.current;
            canvasEpochRef.current = incoming.epoch;
            setCanvasEpoch(incoming.epoch);
            if (incoming.refillTimestamp) {
              setCanvasRefillAt(incoming.refillTimestamp);
            }
            setCanvasStrokes((current) =>
              sameEpoch
                ? orderedCanvasStrokes(incoming.strokes, current)
                : orderedCanvasStrokes(incoming.strokes),
            );
            setCanvasNotice(
              incoming.strokes.length === 0
                ? 'The shared screen is ready for its first sketch.'
                : 'Canvas synchronized: ' + incoming.strokes.length + ' strokes on screen.',
            );
            return;
          }
          if (incoming.type === 'canvas_stroke') {
            if (incoming.epoch < canvasEpochRef.current) return;
            if (incoming.epoch > canvasEpochRef.current) {
              canvasEpochRef.current = incoming.epoch;
              setCanvasEpoch(incoming.epoch);
              setCanvasStrokes([incoming.stroke]);
            } else {
              setCanvasStrokes((current) => orderedCanvasStrokes(current, [incoming.stroke]));
            }
            setCanvasNotice(authorName(incoming.stroke.author) + ' added a stroke.');
            return;
          }
          setCanvasNotice(incoming.error);
        });
        socket.addEventListener('close', () => {
          if (stopped || socketRef.current !== socket) return;
          socketRef.current = null;
          setConnection('disconnected');
          setCanvasNotice('Live connection lost. Drawing is paused while Movie Hell reconnects.');
          scheduleReconnect();
        });
        socket.addEventListener('error', () => {
          if (!stopped && socketRef.current === socket) socket.close();
        });
      } catch {
        if (!stopped && !controller.signal.aborted) {
          setConnection('disconnected');
          scheduleReconnect();
        }
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [accessToken, selectedRoomId, page]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body =
        mode === 'signup'
          ? { email: email.trim(), nickname: nickname.trim(), password }
          : { email: email.trim(), password };
      const result = await api<AuthResponse>('/api/auth/' + mode, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!result.accessToken || !result.user) {
        throw new Error('The server did not return a session.');
      }
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken || '');
      setUser(result.user);
      setNotice(mode === 'signup' ? 'Account created and signed in.' : 'Signed in.');
    } catch (requestError) {
      setError(errorText(requestError, (mode === 'signup' ? 'Sign up' : 'Login') + ' failed.'));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const logout = async () => {
    const token = accessToken;
    const revokeToken = refreshToken;
    setBusy(true);
    setError('');
    let revokeFailed = false;
    try {
      await api<ApiResult>(
        '/api/auth/logout',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken: revokeToken }),
        },
        token,
      );
    } catch {
      revokeFailed = true;
    } finally {
      setAccessToken('');
      setRefreshToken('');
      setUser(null);
      setRooms([]);
      setSelectedRoomId('');
      setMessages([]);
      setChannelRequests([]);
      setCanVoteChannelRequests(false);
      setChannelRequestName('');
      setChannelRequestDescription('');
      setChannelRequestReason('');
      setChannelRequestError('');
      setCustomEmojis([]);
      setCanUploadEmoji(false);
      setCanvasStrokes([]);
      canvasEpochRef.current = 0;
      setCanvasEpoch(0);
      setBusy(false);
      setNotice(
        revokeFailed
          ? 'Local session cleared; server revocation could not be confirmed.'
          : 'Signed out.',
      );
    }
  };

  const submitChannelRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = channelRequestName.trim();
    const description = channelRequestDescription.trim();
    const reason = channelRequestReason.trim();
    if (!name || !reason) {
      setChannelRequestError('A channel name and programming reason are required.');
      return;
    }
    setChannelRequestSubmitting(true);
    setChannelRequestError('');
    try {
      await api<ChannelRequestsResponse>(
        '/api/channel-requests',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: description || undefined,
            reason,
          }),
        },
        accessToken,
      );
      setChannelRequestName('');
      setChannelRequestDescription('');
      setChannelRequestReason('');
      setNotice('Your channel request is queued for moderator approval.');
      await loadChannelRequests();
    } catch (requestError) {
      setChannelRequestError(errorText(requestError, 'Could not submit the channel request.'));
    } finally {
      setChannelRequestSubmitting(false);
    }
  };

  const voteOnChannelRequest = async (request: ChannelRequest, decision: ChannelRequestVote) => {
    if (!canVoteChannelRequests || request.status !== 'pending' || request.myVote) return;
    setChannelRequestVoteBusyId(request.id);
    setChannelRequestError('');
    try {
      const result = await api<ChannelRequestsResponse>(
        '/api/channel-requests/' + encodeURIComponent(request.id) + '/votes',
        { method: 'POST', body: JSON.stringify({ decision }) },
        accessToken,
      );
      setNotice(
        result.request?.status === 'approved' || result.room
          ? 'Moderator quorum reached. ' + request.name + ' is now open.'
          : 'Your moderator vote is recorded.',
      );
      await Promise.all([loadChannelRequests(), loadRooms()]);
    } catch (requestError) {
      const message = errorText(requestError, 'Could not record the moderator vote.');
      await loadChannelRequests();
      setChannelRequestError(message);
    } finally {
      setChannelRequestVoteBusyId('');
    }
  };

  const forceRemoveChannelRequest = async (request: ChannelRequest) => {
    if (!window.confirm(`Permanently force remove proposal for "${request.name}"?`)) return;
    setChannelRequestVoteBusyId(request.id);
    setChannelRequestError('');
    try {
      await api(
        '/api/channel-requests/' + encodeURIComponent(request.id),
        { method: 'DELETE' },
        accessToken,
      );
      setNotice('Proposal for "' + request.name + '" permanently removed.');
      await loadChannelRequests();
    } catch (requestError) {
      const message = errorText(requestError, 'Could not remove the proposal.');
      setChannelRequestError(message);
    } finally {
      setChannelRequestVoteBusyId('');
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedRoomId || !user) return;

    setError('');
    setDraft('');
    const pending: Message = {
      id: 'pending-' + Date.now(),
      roomId: selectedRoomId,
      author: user.nickname,
      text,
      createdAt: new Date().toISOString(),
    };
    addMessage(pending);

    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'chat', roomId: selectedRoomId, text }));
        return;
      } catch {
        // Fall through to HTTP.
      }
    }

    try {
      const result = await api<MessagesResponse>(
        '/api/messages',
        {
          method: 'POST',
          body: JSON.stringify({ roomId: selectedRoomId, text }),
        },
        accessToken,
      );
      if (result.message) addMessage(result.message);
      if (Array.isArray(result.messages)) setMessages(result.messages);
    } catch (requestError) {
      setMessages((current) =>
        current.filter((message) => String(message.id) !== String(pending.id)),
      );
      setError(errorText(requestError, 'Could not send the message.'));
      setDraft(text);
    }
  };

  const uploadEmoji = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mayUploadEmoji) return;
    const shortcode = emojiShortcode.trim().toLowerCase();
    const label = emojiLabel.trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(shortcode)) {
      setEmojiCatalogError('Shortcodes must be 2–32 lowercase letters, numbers, underscores, or dashes.');
      return;
    }
    if (!label || label.length > 64) {
      setEmojiCatalogError('Reaction labels must be 1–64 characters.');
      return;
    }
    if (!emojiFile) {
      setEmojiCatalogError('Choose a GIF, PNG, WebP, or JPEG image to upload.');
      return;
    }
    if (emojiFile.size > 320 * 1024) {
      setEmojiCatalogError('Custom reaction images must be 320 KiB or smaller.');
      return;
    }

    setEmojiUploading(true);
    setEmojiCatalogError('');
    try {
      const body = new FormData();
      body.append('file', emojiFile);
      body.append('shortcode', shortcode);
      body.append('label', label);
      const result = await api<EmojiResponse>(
        '/api/admin/emojis',
        { method: 'POST', body },
        accessToken,
      );
      const emoji = normalizedCustomEmoji(result.emoji);
      if (!emoji) throw new Error('The server returned an invalid custom reaction.');
      setCustomEmojis((current) => [emoji, ...current.filter((item) => item.id !== emoji.id)]);
      setEmojiShortcode('');
      setEmojiLabel('');
      setEmojiFile(null);
      if (emojiFileRef.current) emojiFileRef.current.value = '';
      setNotice('Custom reaction :' + emoji.shortcode + ': joined the concession stand.');
    } catch (requestError) {
      setEmojiCatalogError(errorText(requestError, 'Could not upload the custom reaction.'));
    } finally {
      setEmojiUploading(false);
    }
  };

  const insertAtCaret = (value: string) => {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const spacerBefore = start > 0 && !/\s/u.test(draft[start - 1] ?? '') ? ' ' : '';
    const spacerAfter = end < draft.length && !/\s/u.test(draft[end] ?? '') ? ' ' : '';
    const insertion = spacerBefore + value + spacerAfter;
    const nextDraft = draft.slice(0, start) + insertion + draft.slice(end);
    const nextCaret = start + insertion.length;
    setDraft(nextDraft);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertReaction = (emoji: string) => insertAtCaret(emoji);

  const insertCustomEmoji = (emoji: CustomEmoji) => {
    insertAtCaret(':' + emoji.shortcode + ':');
  };

  const sendCanvasStroke = (stroke: CanvasStrokeDraft) => {
    // Instant local mirroring to movie screen overlay and companion tabs
    if (typeof BroadcastChannel !== 'undefined' && selectedRoomId) {
      try {
        const bc = new BroadcastChannel('movie_hell_canvas_sync');
        const localStroke: CanvasStroke = {
          id: String(Date.now()),
          pageIndex: stroke.pageIndex || 1,
          layerId: stroke.layerId || 2,
          tool: stroke.tool,
          color: stroke.color,
          fillColor: stroke.fillColor,
          width: stroke.width,
          opacity: stroke.opacity,
          blendMode: stroke.blendMode,
          symmetry: stroke.symmetry,
          points: stroke.points,
          createdAt: new Date().toISOString(),
          author: user ? { nickname: user.nickname } : 'You',
        };
        bc.postMessage({ type: 'local_stroke', stroke: localStroke, roomId: selectedRoomId });
        bc.close();
      } catch {}
    }

    const socket = socketRef.current;
    if (!selectedRoomId || !socket || socket.readyState !== WebSocket.OPEN) {
      setCanvasNotice('Drawing is paused until live chat reconnects.');
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: 'canvas_stroke',
          roomId: selectedRoomId,
          stroke,
        }),
      );
      setCanvasNotice('Stroke sent to the projection booth.');
    } catch {
      setCanvasNotice('The stroke could not be sent. Try again after reconnecting.');
    }
  };

  const roomTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const tabs: RoomView[] = ['chat', 'canvas', 'chatters'];
    const currentIndex = tabs.indexOf(roomView);
    let next: RoomView | null = null;
    if (event.key === 'ArrowLeft') {
      next = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === 'ArrowRight') {
      next = tabs[(currentIndex + 1) % tabs.length];
    } else if (event.key === 'Home') {
      next = tabs[0];
    } else if (event.key === 'End') {
      next = tabs[tabs.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    setRoomView(next);
    requestAnimationFrame(() => document.getElementById('room-' + next + '-tab')?.focus());
  };

  const navigate = (event: ReactMouseEvent<HTMLAnchorElement>, nextPage: SitePage) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const target = nextPage === 'faq' ? '/faq' : nextPage === 'admin' ? '/admin' : nextPage === 'mod' ? '/mod' : '/';
    if (window.location.pathname + window.location.search + window.location.hash !== target) {
      window.history.pushState({}, '', target);
    }
    setPage(nextPage);
    setReactionsOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(() => {
      document.getElementById(nextPage === 'faq' ? 'faq-heading' : 'site-heading')?.focus();
    });
  };

  const renderChatSection = (isDocked = false) => (
    <section className={`panel messages ${isDocked ? 'theater-docked-chat' : ''}`} aria-labelledby="messages-heading">
      {selectedRoom ? (
        <>
          <div className="message-heading">
            {isDocked ? (
              <div className="room-quick-picker">
                <p className="panel-kicker" style={{ margin: 0 }}>Room</p>
                <select
                  id="docked-room-select"
                  className="room-quick-dropdown"
                  value={selectedRoomId ?? ''}
                  aria-label="Select active screening room chat"
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                >
                  {rooms.map((r) => (
                    <option key={roomId(r)} value={roomId(r)}>
                      🍿 {r.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <p className="panel-kicker">Now discussing</p>
                <h2 id="messages-heading">{selectedRoom.name}</h2>
                {selectedRoom.description && <p>{selectedRoom.description}</p>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span className={'connection connection-' + connection} role="status">
                <span aria-hidden="true" /> Live: {connection}
              </span>
              <button
                type="button"
                className={`theater-chatters-pill ${roomView === 'chatters' ? 'active' : ''}`}
                onClick={() => setRoomView(roomView === 'chatters' ? 'chat' : 'chatters')}
                title="View active audience chatters in this screening room"
                aria-label={`View active chatters (${roomChatters.length} online)`}
              >
                <span className="live-dot" aria-hidden="true" />
                <span>👥 {roomChatters.length}</span>
              </button>
              {(user?.isModerator || user?.isAdmin) && (
                <button
                  type="button"
                  className="theater-mod-btn"
                  onClick={() => setPage('mod')}
                  title="Open Community Moderator Desk"
                  aria-label="Open Community Moderator Desk"
                >
                  🛡️ Mod
                </button>
              )}
              <button
                type="button"
                className="theater-popout-btn"
                onClick={() => openPopOutChat()}
                title="Open this chat in a standalone window"
                aria-label="Open this chat in a standalone window"
              >
                🗗 Pop-out
              </button>
            </div>
          </div>
          <div className="room-view-tabs" role="tablist" aria-label="Room feature">
            <button
              id="room-chat-tab"
              type="button"
              role="tab"
              aria-selected={roomView === 'chat'}
              aria-controls="room-chat-panel"
              tabIndex={roomView === 'chat' ? 0 : -1}
              onClick={() => setRoomView('chat')}
              onKeyDown={roomTabKeyDown}
            >
              💬 Chat
            </button>
            <button
              id="room-chatters-tab"
              type="button"
              role="tab"
              aria-selected={roomView === 'chatters'}
              aria-controls="room-chatters-panel"
              tabIndex={roomView === 'chatters' ? 0 : -1}
              onClick={() => setRoomView('chatters')}
              onKeyDown={roomTabKeyDown}
            >
              👥 Audience ({roomChatters.length})
            </button>
            <button
              id="room-canvas-tab"
              type="button"
              role="tab"
              aria-selected={roomView === 'canvas'}
              aria-controls="room-canvas-panel"
              tabIndex={roomView === 'canvas' ? 0 : -1}
              onClick={() => setRoomView('canvas')}
              onKeyDown={roomTabKeyDown}
            >
              🎨 Shared canvas
            </button>
          </div>

          {roomView === 'chat' ? (
            <div
              id="room-chat-panel"
              className="room-view-panel"
              role="tabpanel"
              aria-labelledby="room-chat-tab"
            >
              {messagesLoading ? (
                <p className="quiet-state" role="status">Rolling the reel…</p>
              ) : messages.length === 0 ? (
                <p className="quiet-state">The house is quiet. Deliver the opening line.</p>
              ) : (
                <ol ref={messageListRef} className="message-list">
                  {messages.map((message) => (
                    <li key={String(message.id)}>
                      <div>
                        <strong>{authorName(message.author)}</strong>
                        {message.createdAt && (
                          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        )}
                      </div>
                      <p><MessageText text={message.text} emojisById={emojisById} emojisByShortcode={emojisByShortcode} /></p>
                    </li>
                  ))}
                </ol>
              )}
              <div className="composer">
                {reactionsOpen && (
                  <div
                    id="cinema-reactions"
                    className="reaction-picker"
                    role="dialog"
                    aria-label="Cinema reactions"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setReactionsOpen(false);
                        reactionToggleRef.current?.focus();
                      }
                    }}
                  >
                    <div className="reaction-picker-heading">
                      <div>
                        <strong>Audience reactions</strong>
                        <span>Pick your perfect cut</span>
                      </div>
                      <button
                        className="reaction-close"
                        type="button"
                        aria-label="Close cinema reactions"
                        onClick={() => {
                          setReactionsOpen(false);
                          reactionToggleRef.current?.focus();
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <p className="reaction-section-title">House favorites</p>
                    <div className="reaction-grid" role="group" aria-label="Built-in cinema reactions">
                      {cinemaReactions.map((reaction) => (
                        <button
                          key={reaction.label}
                          type="button"
                          aria-label={'Insert ' + reaction.label + ' ' + reaction.emoji}
                          title={reaction.label}
                          onClick={() => insertReaction(reaction.emoji)}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                          <small>{reaction.label}</small>
                        </button>
                      ))}
                    </div>

                    <div className="custom-reactions" aria-labelledby="custom-reactions-title">
                      <p id="custom-reactions-title" className="reaction-section-title">
                        Moderator premieres
                      </p>
                      {emojisLoading ? (
                        <p className="reaction-note" role="status">Loading the custom reel…</p>
                      ) : activeCustomEmojis.length === 0 ? (
                        <p className="reaction-note">No custom reactions are screening yet.</p>
                      ) : (
                        <div className="reaction-grid custom-reaction-grid" role="group" aria-label="Custom reactions">
                          {activeCustomEmojis.map((emoji) => (
                            <button
                              key={emoji.id}
                              type="button"
                              aria-label={'Insert ' + emoji.label + ' :' + emoji.shortcode + ':'}
                              title={emoji.label}
                              onClick={() => insertCustomEmoji(emoji)}
                            >
                              <img
                                src={emoji.assetUrl}
                                width={emoji.width}
                                height={emoji.height}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                decoding="async"
                              />
                              <small>{emoji.label}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {mayUploadEmoji && (
                      <form className="emoji-upload" onSubmit={uploadEmoji}>
                        <p className="reaction-section-title">Add a custom reaction</p>
                        <div className="emoji-upload-fields">
                          <label htmlFor="emoji-shortcode">
                            Shortcode
                            <input
                              id="emoji-shortcode"
                              value={emojiShortcode}
                              pattern="[a-z0-9][a-z0-9_-]{1,31}"
                              minLength={2}
                              maxLength={32}
                              placeholder="final_cut"
                              autoComplete="off"
                              onChange={(event) => setEmojiShortcode(event.target.value.toLowerCase())}
                              required
                            />
                          </label>
                          <label htmlFor="emoji-label">
                            Reaction label
                            <input
                              id="emoji-label"
                              value={emojiLabel}
                              maxLength={64}
                              placeholder="Final cut approved"
                              autoComplete="off"
                              onChange={(event) => setEmojiLabel(event.target.value)}
                              required
                            />
                          </label>
                        </div>
                        <label htmlFor="emoji-file">
                          Image (GIF, PNG, or WebP)
                          <input
                            ref={emojiFileRef}
                            id="emoji-file"
                            type="file"
                            accept="image/png,image/gif,image/webp,image/jpeg"
                            onChange={(event) => {
                              const files = event.target.files;
                              setEmojiFile(files && files.length > 0 ? files[0] : null);
                            }}
                            required
                          />
                        </label>
                        <button type="submit" disabled={emojiUploading}>
                          {emojiUploading ? 'Preparing the premiere…' : 'Upload reaction'}
                        </button>
                      </form>
                    )}

                    {emojiCatalogError && (
                      <p className="reaction-error" role="alert">{emojiCatalogError}</p>
                    )}
                  </div>
                )}
                <div className="composer-label">
                  <label htmlFor="message">Your take</label>
                  <span>Keep the aisle clear for good banter.</span>
                </div>
                <div className="composer-row">
                  <div className="reaction-control">
                    <button
                      ref={reactionToggleRef}
                      className="reaction-toggle"
                      type="button"
                      aria-label="Choose a cinema reaction"
                      aria-expanded={reactionsOpen}
                      aria-controls="cinema-reactions"
                      onClick={() => {
                        const opening = !reactionsOpen;
                        setReactionsOpen(opening);
                        if (opening) setEmojiCatalogRefreshKey((current) => current + 1);
                      }}
                    >
                      <span aria-hidden="true">🎬</span>
                      <span className="reaction-toggle-text">Reactions</span>
                    </button>
                  </div>
                  <form className="message-form" onSubmit={sendMessage}>
                    <input
                      ref={messageInputRef}
                      id="message"
                      aria-label="Message for the current screening room"
                      placeholder="Drop a line, a theory, or a perfectly timed gasp…"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      required
                    />
                    <button className="send-button" type="submit">Send</button>
                  </form>
                </div>
              </div>
            </div>
          ) : roomView === 'chatters' ? (
            <div
              id="room-chatters-panel"
              className="room-view-panel room-chatters-panel"
              role="tabpanel"
              aria-labelledby="room-chatters-tab"
            >
              <div className="chatters-header">
                <div className="chatters-title-group">
                  <span className="chatters-live-indicator" aria-hidden="true" />
                  <strong>Active in this room ({roomChatters.length})</strong>
                </div>
                {roomChatters.length > 4 && (
                  <input
                    type="search"
                    className="chatters-search-input"
                    placeholder="Search chatters…"
                    value={chatterQuery}
                    onChange={(e) => setChatterQuery(e.target.value)}
                    aria-label="Filter active chatters"
                  />
                )}
              </div>

              {roomChatters.length === 0 ? (
                <p className="quiet-state">Connecting to room audience…</p>
              ) : (
                <ul className="chatters-list" aria-label="Active chatters list">
                  {roomChatters
                    .filter((c) => !chatterQuery || c.nickname.toLowerCase().includes(chatterQuery.toLowerCase()))
                    .map((chatter) => {
                      const isSelf = user?.id === chatter.userId;
                      return (
                        <li key={chatter.userId} className="chatter-item">
                          <div className="chatter-info">
                            <span className="chatter-status-dot" title="Online now" aria-hidden="true" />
                            <span className="chatter-nickname">
                              {chatter.nickname}
                              {isSelf && <span className="chatter-self-badge"> (You)</span>}
                            </span>
                            {chatter.isAdmin ? (
                              <span className="chatter-badge admin-badge">👑 Admin</span>
                            ) : chatter.isModerator ? (
                              <span className="chatter-badge mod-badge">🛡️ Mod</span>
                            ) : (
                              <span className="chatter-badge member-badge">🎟️ Viewer</span>
                            )}
                          </div>
                          {!isSelf && (
                            <button
                              type="button"
                              className="chatter-mention-btn"
                              title={`Mention @${chatter.nickname} in chat`}
                              onClick={() => {
                                setRoomView('chat');
                                setDraft((prev) => (prev ? `${prev} @${chatter.nickname} ` : `@${chatter.nickname} `));
                                requestAnimationFrame(() => messageInputRef.current?.focus());
                              }}
                            >
                              @
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          ) : (
            <SharedCanvas
              key={selectedRoomId}
              roomName={selectedRoom.name}
              connection={connection}
              epoch={canvasEpoch}
              strokes={canvasStrokes}
              notice={canvasNotice}
              onStroke={sendCanvasStroke}
              activePage={canvasActivePage}
              onChangePage={setCanvasActivePage}
              refillAt={canvasRefillAt}
              onPopOut={() => openPopOutCanvas()}
              layers={canvasLayers}
              onChangeLayers={handleUpdateCanvasLayers}
              onDeleteLayerStrokes={handleDeleteCanvasLayer}
            />
          )}
        </>
      ) : !authenticated ? (
        <div className="empty-screen auth-popout-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: '2.5rem' }}>🍿</span>
          <h2 id="messages-heading" style={{ marginTop: '0.5rem' }}>Sign In to Movie Hell</h2>
          <p style={{ fontSize: '0.85rem', color: '#9f9887' }}>Sign in to participate in live screening chat and collaborative art.</p>
          <form onSubmit={submitAuth} className="form-grid" style={{ width: '100%', maxWidth: '320px', margin: '1.25rem auto 0 auto', textAlign: 'left' }}>
            <label htmlFor="popout-email">Email</label>
            <input
              id="popout-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="popout-pwd">Password (min 12 characters)</label>
            <input
              id="popout-pwd"
              type="password"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="button-primary" style={{ marginTop: '0.5rem' }} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            {error && <p className="form-error" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
          </form>
        </div>
      ) : (
        <div className="empty-screen">
          <span aria-hidden="true">🎞️</span>
          <h2 id="messages-heading">Messages</h2>
          <p>{roomsLoading ? 'Connecting to screening room…' : 'Select an approved channel, or request a new option for the catalog.'}</p>
        </div>
      )}
    </section>
  );

  return (
    <main className={`app-shell ${page === 'popout-chat' || page === 'popout-stage' || page === 'popout-canvas' ? 'popout-mode' : ''}`}>
      {page === 'popout-chat' ? (
        <div className="theater-popout-window">
          {renderChatSection(true)}
        </div>
      ) : page === 'popout-stage' ? (
        <div className="theater-popout-window">
          <TheaterStage
            activeStream={activeStream}
            allStreams={streams}
            onSelectStream={handleWatchStream}
            onCloseTheater={handleCloseTheater}
            onPopOutChat={() => openPopOutChat()}
            onPopOutCanvas={() => openPopOutCanvas()}
            canvasStrokes={canvasStrokes}
            canvasEpoch={canvasEpoch}
            onCanvasStroke={sendCanvasStroke}
            canvasActivePage={canvasActivePage}
            onChangeCanvasPage={setCanvasActivePage}
            canvasRefillAt={canvasRefillAt}
            roomName={selectedRoom?.name || 'Auditorium'}
            isRoomConnected={connection === 'connected'}
            canvasLayers={canvasLayers}
            onChangeCanvasLayers={handleUpdateCanvasLayers}
            onDeleteCanvasLayerStrokes={handleDeleteCanvasLayer}
          />
        </div>
      ) : page === 'popout-canvas' ? (
        <div className="theater-popout-window canvas-popout-window">
          <KritaStudio
            roomName={selectedRoom?.name || 'Auditorium'}
            strokes={canvasStrokes}
            epoch={canvasEpoch}
            connected={connection === 'connected'}
            activePage={canvasActivePage}
            refillAt={canvasRefillAt}
            onChangePage={setCanvasActivePage}
            onStroke={sendCanvasStroke}
            aspectRatio="16:9"
            setAspectRatio={() => {}}
            notice={canvasNotice}
            isPopout={true}
            layers={canvasLayers}
            onChangeLayers={handleUpdateCanvasLayers}
            onDeleteLayerStrokes={handleDeleteCanvasLayer}
          />
        </div>
      ) : (
        <>
          <header className="cinema-topbar">
            <div className="topbar-left">
              <a
                className="topbar-brand"
                href="/"
                onClick={(event) => navigate(event, 'home')}
              >
                <span className="brand-crest" aria-hidden="true">🎬</span>
                <span className="brand-title">{appName}</span>
              </a>
              <span className="topbar-tagline">User-choice film catalog & live screenings</span>
            </div>

            <nav className="topbar-nav" aria-label="Site pages">
              <a
                className={`topbar-nav-link ${page === 'home' ? 'active' : ''}`}
                href="/"
                aria-current={page === 'home' ? 'page' : undefined}
                onClick={(event) => navigate(event, 'home')}
              >
                Screenings
              </a>
              <a
                className={`topbar-nav-link ${page === 'faq' ? 'active' : ''}`}
                href="/faq"
                aria-current={page === 'faq' ? 'page' : undefined}
                onClick={(event) => navigate(event, 'faq')}
              >
                FAQ & Policies
              </a>
              {user?.isAdmin && (
                <a
                  className={`topbar-nav-link topbar-nav-admin ${page === 'admin' ? 'active' : ''}`}
                  href="/admin"
                  aria-current={page === 'admin' ? 'page' : undefined}
                  onClick={(event) => navigate(event, 'admin')}
                >
                  👑 Admin Desk
                </a>
              )}
              {(user?.isModerator || user?.isAdmin) && (
                <a
                  className={`topbar-nav-link topbar-nav-mod ${page === 'mod' ? 'active' : ''}`}
                  href="/mod"
                  aria-current={page === 'mod' ? 'page' : undefined}
                  onClick={(event) => navigate(event, 'mod')}
                >
                  🛡️ Mod Desk
                </a>
              )}
              {githubUrl && (
                <a
                  className="topbar-nav-link topbar-nav-external"
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Source code on GitHub"
                >
                  GitHub ↗
                </a>
              )}
            </nav>

            <div className="topbar-right">
              {authenticated ? (
                <div className="user-badge-compact" aria-label="Signed-in account">
                  <button
                    type="button"
                    className="user-role-badge clickable"
                    onClick={() => setPage(user?.isAdmin ? 'admin' : user?.isModerator ? 'mod' : 'home')}
                    title={user?.isAdmin ? 'Open Admin Control Room' : user?.isModerator ? 'Open Moderator Desk' : 'Signed in as Member'}
                  >
                    {user?.isAdmin ? '👑 Admin' : user?.isModerator ? '🛡️ Mod' : '🎟️ Member'}
                  </button>
                  <strong className="user-nickname">{user?.nickname}</strong>
                  <button type="button" className="topbar-logout-btn" onClick={logout} disabled={busy} title="Leave the theater">
                    Leave
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="topbar-login-btn"
                  onClick={() => {
                    const authStage = document.querySelector('.auth-stage');
                    if (authStage) {
                      authStage.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                >
                  🎟️ Sign in
                </button>
              )}
            </div>
          </header>

          {page === 'faq' ? (
            <Faq />
          ) : page === 'admin' && user?.isAdmin ? (
            <AdminDashboard
              user={user}
              token={accessToken}
              onNavigateHome={() => setPage('home')}
              onNavigateMod={() => setPage('mod')}
            />
          ) : page === 'mod' && (user?.isModerator || user?.isAdmin) ? (
            <ModDashboard
              user={user}
              token={accessToken}
              onNavigateHome={() => setPage('home')}
              onNavigateAdmin={() => setPage('admin')}
            />
          ) : (
            <>
              {authenticated && isChatDocked ? (
                <div className="cinema-lounge-grid">
                  <TheaterStage
                    activeStream={activeStream}
                    allStreams={streams}
                    onSelectStream={handleWatchStream}
                    onCloseTheater={handleCloseTheater}
                    isChatDocked={isChatDocked}
                    onToggleChatDock={() => setIsChatDocked((prev) => !prev)}
                    onPopOutChat={() => openPopOutChat()}
                    canvasStrokes={canvasStrokes}
                    canvasEpoch={canvasEpoch}
                    onCanvasStroke={sendCanvasStroke}
                    canvasActivePage={canvasActivePage}
                    onChangeCanvasPage={setCanvasActivePage}
                    canvasRefillAt={canvasRefillAt}
                    roomName={selectedRoom?.name || 'Auditorium'}
                    isRoomConnected={connection === 'connected'}
                    canvasLayers={canvasLayers}
                    onChangeCanvasLayers={handleUpdateCanvasLayers}
                    onDeleteCanvasLayerStrokes={handleDeleteCanvasLayer}
                  />
                  {renderChatSection(true)}
                </div>
              ) : (
                <TheaterStage
                  activeStream={activeStream}
                  allStreams={streams}
                  onSelectStream={handleWatchStream}
                  onCloseTheater={handleCloseTheater}
                  isChatDocked={isChatDocked}
                  onToggleChatDock={() => setIsChatDocked((prev) => !prev)}
                  onPopOutChat={() => openPopOutChat()}
                  canvasStrokes={canvasStrokes}
                  canvasEpoch={canvasEpoch}
                  onCanvasStroke={sendCanvasStroke}
                  canvasActivePage={canvasActivePage}
                  onChangeCanvasPage={setCanvasActivePage}
                  canvasRefillAt={canvasRefillAt}
                  roomName={selectedRoom?.name || 'Auditorium'}
                  isRoomConnected={connection === 'connected'}
                  canvasLayers={canvasLayers}
                  onChangeCanvasLayers={handleUpdateCanvasLayers}
                  onDeleteCanvasLayerStrokes={handleDeleteCanvasLayer}
                />
              )}

              <StreamDirectory
                streams={streams}
                checkedAt={streamsCheckedAt}
                loading={streamsLoading}
                error={streamsError}
                onRefresh={() => setStreamsRefreshKey((current) => current + 1)}
                activeStreamId={activeStream?.id}
                onWatchStream={handleWatchStream}
              />
              {error && (
                <p className="alert error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="alert" role="status">
                  {notice}
                </p>
              )}

              {!authenticated ? (
                <section aria-labelledby="auth-heading" className="panel narrow auth-stage">
                  <p className="panel-kicker">The lobby is open</p>
                  <h2 id="auth-heading">{mode === 'signup' ? 'Create account' : 'Log in'}</h2>
                  <p className="auth-intro">
                    Take your seat among fellow night owls, genre obsessives, and unapologetic
                    rewatchers.
                  </p>
                  <div className="mode-switch" aria-label="Authentication mode">
                    <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
                      Log in
                    </button>
                    <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
                      Sign up
                    </button>
                  </div>
                  <form onSubmit={submitAuth}>
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                    {mode === 'signup' && (
                      <>
                        <label htmlFor="nickname">Nickname</label>
                        <input
                          id="nickname"
                          autoComplete="nickname"
                          spellCheck={false}
                          maxLength={48}
                          value={nickname}
                          onChange={(event) => setNickname(event.target.value)}
                          required
                        />
                      </>
                    )}
                    <label htmlFor="password">Password (min 12 characters)</label>
                    <input
                      id="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      minLength={12}
                      maxLength={128}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <button type="submit" disabled={busy}>
                      {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}
                    </button>
                  </form>
                </section>
              ) : (
                <div className={`workspace ${isChatDocked ? 'workspace-solo-rooms' : ''}`}>
                  <aside className="panel rooms" aria-labelledby="rooms-heading">
                    <p className="panel-kicker">Choose a screen</p>
                    <h2 id="rooms-heading">Screening rooms</h2>
                    <section className="channel-request-box" aria-labelledby="channel-request-heading">
                      <p className="panel-kicker">The catalog desk</p>
                      <h3 id="channel-request-heading">Channel request box</h3>
                      <p id="channel-request-help" className="channel-request-intro">
                        Browse approved channels and choose freely. Need another option? Anyone signed in
                        may pitch one; only configured moderator votes decide whether it joins the catalog.
                      </p>
                      <form onSubmit={submitChannelRequest} aria-describedby="channel-request-help">
                        <label htmlFor="channel-request-name">Channel name</label>
                        <input
                          id="channel-request-name"
                          value={channelRequestName}
                          onChange={(event) => setChannelRequestName(event.target.value)}
                          maxLength={80}
                          required
                        />
                        <label htmlFor="channel-request-description">Description (optional)</label>
                        <textarea
                          id="channel-request-description"
                          value={channelRequestDescription}
                          onChange={(event) => setChannelRequestDescription(event.target.value)}
                          maxLength={500}
                        />
                        <label htmlFor="channel-request-reason">Why add it to the catalog?</label>
                        <textarea
                          id="channel-request-reason"
                          value={channelRequestReason}
                          onChange={(event) => setChannelRequestReason(event.target.value)}
                          maxLength={500}
                          required
                        />
                        <button type="submit" disabled={channelRequestSubmitting}>
                          {channelRequestSubmitting ? 'Dropping it in the box…' : 'Request this channel'}
                        </button>
                      </form>
                      {channelRequestError && (
                        <p className="channel-request-error" role="alert">{channelRequestError}</p>
                      )}
                    </section>
                    {roomsLoading ? (
                      <p className="quiet-state" role="status">Lighting the screens…</p>
                    ) : rooms.length === 0 ? (
                      <p className="quiet-state">No channels have cleared moderator approval yet.</p>
                    ) : (
                      <ul className="room-list">
                        {rooms.map((room) => {
                          const id = roomId(room);
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                className="room-button"
                                aria-current={selectedRoomId === id ? 'true' : undefined}
                                onClick={() => setSelectedRoomId(id)}
                              >
                                <strong>{room.name}</strong>
                                {room.description && <span>{room.description}</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <section className="channel-request-queue" aria-labelledby="channel-request-queue-heading">
                      <div className="channel-request-queue-heading">
                        <h3 id="channel-request-queue-heading">Requests on the marquee</h3>
                        <span>{channelRequests.length}</span>
                      </div>
                      {channelRequestsLoading ? (
                        <p className="quiet-state" role="status">Checking the request box…</p>
                      ) : channelRequests.length === 0 ? (
                        <p className="quiet-state">The request box is empty.</p>
                      ) : (
                        <ul className="channel-request-list" aria-busy={channelRequestsLoading}>
                          {channelRequests.map((request) => {
                            const threshold = Math.max(1, request.threshold);
                            const approvals = Math.max(0, request.approvals);
                            const voteBusy = channelRequestVoteBusyId === request.id;
                            return (
                              <li key={request.id} className="channel-request-card">
                                <div className="channel-request-card-heading">
                                  <strong>{request.name}</strong>
                                  <span className={'request-status request-status-' + request.status}>
                                    {request.status}
                                  </span>
                                </div>
                                {request.description && <p>{request.description}</p>}
                                <p className="channel-request-reason"><strong>The pitch:</strong> {request.reason}</p>
                                <p className="channel-request-meta">
                                  Requested by {channelRequesterName(request)} · {formatTime(request.createdAt)}
                                </p>
                                <label className="channel-request-progress-label" htmlFor={'request-progress-' + request.id}>
                                  {approvals} of {threshold} moderator approvals
                                </label>
                                <progress
                                  id={'request-progress-' + request.id}
                                  value={Math.min(approvals, threshold)}
                                  max={threshold}
                                />
                                {canVoteChannelRequests && (
                                  <div
                                    className="channel-request-actions"
                                    aria-busy={voteBusy}
                                    aria-label={'Moderator actions for ' + request.name}
                                  >
                                    {request.status === 'pending' && !request.myVote && (
                                      <>
                                        <button type="button" disabled={voteBusy} onClick={() => void voteOnChannelRequest(request, 'approve')}>
                                          Approve
                                        </button>
                                        <button type="button" className="decline-button" disabled={voteBusy} onClick={() => void voteOnChannelRequest(request, 'reject')}>
                                          Decline
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      className="decline-button"
                                      style={{ borderColor: 'var(--color-danger, #f43f5e)', color: 'var(--color-danger, #f43f5e)' }}
                                      disabled={voteBusy}
                                      onClick={() => void forceRemoveChannelRequest(request)}
                                      title="Permanently remove proposal"
                                    >
                                      🗑️ Force Remove
                                    </button>
                                  </div>
                                )}
                                {request.myVote && (
                                  <p className="channel-request-voted" role="status">
                                    Your moderator vote: {request.myVote === 'approve' ? 'approve' : 'decline'}.
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </aside>

                  {!isChatDocked && renderChatSection(false)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
