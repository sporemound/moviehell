export type AuthMode = 'signup' | 'login';

export type User = {
  id: string | number;
  email: string;
  nickname: string;
  isAdmin?: boolean;
  isModerator?: boolean;
  createdAt?: string;
  created_at?: string;
};

export type SessionPayload = {
  userId: string | number;
  email: string;
  nickname: string;
  issuedAt: number;
  expiresAt: number;
};

export type Room = {
  id: string | number;
  name: string;
  description?: string | null;
  initialChannel?: string | null;
  createdAt?: string;
};

export type StreamPlatform = 'kick' | 'owncast' | 'picarto';
export type StreamStatus = 'live' | 'offline' | 'unknown';

export type GuildTier =
  | 'guild_projectionist'
  | 'guild_community'
  | 'guild_archivist'
  | 'unboundarized';

export type TrustTier = 'official' | 'trusted_member' | 'probationary' | 'quarantined' | 'deleted';

export type StreamProvenance = {
  guild: GuildTier;
  trustTier: TrustTier;
  originDomain: string;
  curatorName?: string | null;
  curatorId?: number | null;
  attestationNotes?: string | null;
  boundaryTags?: string[];
  verifiedAt?: string | null;
};

export type StreamListing = {
  id: string;
  platform: StreamPlatform;
  channel: string;
  name: string;
  description: string;
  watchUrl: string;
  embedUrl?: string | null;
  hlsUrl?: string | null;
  status: StreamStatus;
  viewers: number | null;
  currentTitle: string | null;
  mature: boolean | null;
  provenance?: StreamProvenance;
};

export type CurtainState = 'closed' | 'opening' | 'open' | 'closing';

export type ChannelRequestStatus = 'pending' | 'approved' | 'rejected';
export type ChannelRequestVote = 'approve' | 'reject';

export type ChannelRequest = {
  id: string;
  roomId?: string | null;
  name: string;
  description?: string | null;
  reason: string;
  requester?: {
    id: string | number;
    nickname: string;
  };
  requesterId?: string | number;
  requesterName?: string;
  status: ChannelRequestStatus;
  approvals: number;
  rejections: number;
  threshold: number;
  myVote: ChannelRequestVote | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export type MessageAuthor =
  | string
  | {
      nickname?: string;
    };

export type Message = {
  id: string | number;
  roomId: string | number;
  author: MessageAuthor;
  text: string;
  createdAt?: string;
};

export type CustomEmoji = {
  id: string;
  shortcode: string;
  label: string;
  assetUrl: string;
  width: number;
  height: number;
  disabled: boolean;
  createdAt: string;
};

export type CanvasBrushEngine =
  | 'ink'
  | 'pencil'
  | 'airbrush'
  | 'watercolor'
  | 'neon'
  | 'chalk'
  | 'marker'
  | 'pixel'
  | 'eraser_soft'
  | 'eraser_hard'
  | 'smudge';

export type CanvasShapeTool =
  | 'freehand'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'bucket'
  | 'eyedropper'
  | 'hand';

export type CanvasTool =
  | 'pen'
  | 'pencil'
  | 'airbrush'
  | 'watercolor'
  | 'neon'
  | 'chalk'
  | 'marker'
  | 'pixel'
  | 'eraser'
  | 'eraser_soft'
  | 'smudge'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'bucket'
  | 'eyedropper'
  | 'hand';

export type CanvasBlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'color-dodge'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'destination-out';

export type CanvasSymmetryMode = 'none' | 'mirror-h' | 'mirror-v' | 'radial-4' | 'radial-8';

export type CanvasStabilizerMode = 'off' | 'basic' | 'weighted' | 'krita';

export type CanvasAspectRatio = '16:9' | '4:3' | '2.39:1' | '1:1' | 'stage';

export type CanvasPoint = {
  x: number;
  y: number;
  p?: number;
};

export type CanvasLayer = {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: CanvasBlendMode;
};

export type CanvasStroke = {
  id: string;
  pageIndex: number;
  layerId?: number;
  author: MessageAuthor;
  tool: CanvasTool;
  color: string;
  fillColor?: string;
  width: number;
  opacity?: number;
  blendMode?: CanvasBlendMode;
  symmetry?: CanvasSymmetryMode;
  points: CanvasPoint[];
  createdAt: string;
};

export type CanvasStrokeDraft = Omit<CanvasStroke, 'id' | 'author' | 'createdAt'> & {
  clientId: string;
  pageIndex?: number;
};

export type Chatter = {
  userId: number;
  nickname: string;
  isAdmin?: boolean;
  isModerator?: boolean;
};

export type SocketEnvelope =
  | {
      type: 'chat';
      message: Message;
    }
  | {
      type: 'presence';
      roomId: string;
      chatters: Chatter[];
    }
  | {
      type: 'canvas_snapshot';
      roomId: string;
      epoch: number;
      strokes: CanvasStroke[];
      refillTimestamp?: number;
      hoursRemaining?: number;
    }
  | {
      type: 'canvas_stroke';
      roomId: string;
      epoch: number;
      stroke: CanvasStroke;
    }
  | {
      type: 'canvas_error';
      roomId: string;
      error: string;
    };

export type ApiResult = {
  ok: boolean;
  message?: string;
  error?: string;
};

export type AuthResponse = ApiResult & {
  accessToken?: string;
  refreshToken?: string;
  user?: User;
};

export type RoomsResponse = ApiResult & {
  rooms?: Room[];
  room?: Room;
};

export type StreamsResponse = ApiResult & {
  checkedAt?: string;
  streams?: StreamListing[];
};

export type ChannelRequestsResponse = ApiResult & {
  requests?: ChannelRequest[];
  request?: ChannelRequest;
  room?: Room;
  canVote?: boolean;
};

export type MessagesResponse = ApiResult & {
  messages?: Message[];
  message?: Message;
};

export type EmojisResponse = ApiResult & {
  emojis?: CustomEmoji[];
  canUpload?: boolean;
};

export type EmojiResponse = ApiResult & {
  emoji?: CustomEmoji;
};

export type WsTicketResponse = ApiResult & {
  ticket?: string;
  expiresIn?: number;
};

export type AdminUser = {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
  isAdmin: boolean;
  isModerator: boolean;
  bansCount: number;
  activeSessions: number;
};

export type AdminUsersResponse = ApiResult & {
  users?: AdminUser[];
};

export type AuditLogEntry = {
  id: number;
  actorId: number;
  actorNickname: string;
  event: string;
  subject: string;
  details: Record<string, unknown> | string;
  createdAt: string;
};

export type AuditLogResponse = ApiResult & {
  logs?: AuditLogEntry[];
};

export type ModerationActionItem = {
  id: number;
  roomId: string;
  action: 'remove_user' | 'delete_message';
  targetUserId: number | null;
  messageId: number | null;
  reason: string | null;
  requestedBy: number;
  status: 'pending' | 'executing' | 'executed' | 'rejected';
  createdAt: number;
  executedAt: number | null;
};

export type ModerationListResponse = ApiResult & {
  moderation?: ModerationActionItem[];
};

export type BoundarizePayload = {
  sourceId: string;
  guild: GuildTier;
  trustTier: TrustTier;
  originDomain?: string;
  attestationNotes?: string;
  boundaryTags?: string[];
};

export type ProvenanceSourcesResponse = ApiResult & {
  sources?: StreamListing[];
};
