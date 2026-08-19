import { DurableObject } from "cloudflare:workers";

const JSON_LIMIT = 16 * 1024;
const MESSAGE_LIMIT = 2_000;
const ACCESS_TTL = 15 * 60 * 1_000;
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1_000;
const PBKDF2_ITERATIONS = 100_000;
const TICKET_TTL = 30 * 1_000;
const MAX_ROOM_SOCKETS = 100;
const MAX_USER_ROOM_SOCKETS = 3;
const MAX_LOGOUT_ROOM_NOTIFICATIONS = 100;
const MAX_CUSTOM_EMOJIS = 200;
const EMOJI_UPLOAD_LIMIT = 320 * 1024;
const EMOJI_MULTIPART_LIMIT = EMOJI_UPLOAD_LIMIT + 16 * 1024;
const MAX_CANVAS_STROKES = 500;
const MAX_CANVAS_SOCKET_FRAMES = 120;
const MAX_CANVAS_USER_FRAMES = 120;
const MAX_CANVAS_ROOM_FRAMES = 600;
const STREAM_STATUS_TIMEOUT_MS = 5_000;
const STREAM_STATUS_RESPONSE_LIMIT = 64 * 1024;
const STREAM_DIRECTORY_CACHE_SECONDS = 30;
const ROOM_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMOJI_SHORTCODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const CANVAS_COLOR = /^#[0-9a-f]{6}$/;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const CRC_TABLE = buildCrcTable();

type JsonObject = Record<string, unknown>;
type UserRow = { id: number; email: string; nickname: string };
type SessionUserRow = UserRow & { sessionId: string };
type SocketAttachment = {
  userId: number;
  sessionId: string;
  nickname: string;
  roomId: string;
  windowStartedAt: number;
  messagesInWindow: number;
  canvasWindowStartedAt?: number;
  canvasFramesInWindow?: number;
};
type ChatterView = {
  userId: number;
  nickname: string;
  isAdmin: boolean;
  isModerator: boolean;
};
type MessageView = {
  id: number;
  roomId: string;
  author: string;
  text: string;
  createdAt: string;
};
type ModerationRow = {
  id: number;
  roomId: string;
  action: "remove_user" | "delete_message";
  targetUserId: number | null;
  messageId: number | null;
  reason: string | null;
  requestedBy: number;
  status: "pending" | "executing" | "executed" | "rejected";
  createdAt: number;
  executedAt: number | null;
};
type ChannelRequestRow = {
  id: string;
  roomId: string;
  name: string;
  description: string | null;
  reason: string;
  requestedBy: number;
  requester: string;
  status: "pending" | "approved" | "rejected";
  threshold: number;
  approvals: number;
  rejections: number;
  myVote: "approve" | "reject" | null;
  createdAt: number;
  resolvedAt: number | null;
};
type CanvasPoint = { x: number; y: number; p?: number };
type CanvasTool =
  | "pen"
  | "pencil"
  | "airbrush"
  | "watercolor"
  | "neon"
  | "chalk"
  | "marker"
  | "pixel"
  | "eraser"
  | "eraser_soft"
  | "smudge"
  | "line"
  | "rectangle"
  | "ellipse"
  | "polygon"
  | "bucket"
  | "eyedropper"
  | "hand";

type CanvasStrokeInput = {
  clientId: string;
  pageIndex: number;
  tool: CanvasTool;
  color: string;
  fillColor?: string;
  width: number;
  opacity?: number;
  blendMode?: string;
  layerId?: number;
  symmetry?: string;
  points: CanvasPoint[];
};
type CanvasStrokeRow = {
  id: number;
  roomId: string;
  pageIndex: number;
  clientId: string;
  userId: number;
  author: string;
  tool: CanvasTool;
  color: string;
  width: number;
  pointsJson: string;
  createdAt: number;
};
type CanvasStrokeView = Omit<CanvasStrokeRow, "id" | "pointsJson" | "createdAt"> & {
  id: string;
  pageIndex: number;
  points: CanvasPoint[];
  createdAt: string;
};
type StreamPlatform = "kick" | "picarto" | "owncast";
type StreamAvailability = "live" | "offline" | "unknown";
type GuildTier = "guild_projectionist" | "guild_community" | "guild_archivist" | "unboundarized";
type TrustTier = "official" | "trusted_member" | "probationary" | "quarantined" | "deleted";

type StreamProvenance = {
  guild: GuildTier;
  trustTier: TrustTier;
  originDomain: string;
  curatorName?: string | null;
  curatorId?: number | null;
  attestationNotes?: string | null;
  boundaryTags?: string[];
  verifiedAt?: string | null;
};

type StreamSource = {
  id: string;
  platform: StreamPlatform;
  channel: string;
  name: string;
  description: string;
  watchUrl: string;
  embedUrl: string;
  hlsUrl?: string | null;
  mature: boolean | null;
  provenance?: StreamProvenance;
};
type StreamStatus = {
  status: StreamAvailability;
  viewers: number | null;
  currentTitle: string | null;
};
type StreamDirectoryEntry = StreamSource & StreamStatus;

function defaultProvenanceForSource(source: StreamSource): StreamProvenance {
  return {
    guild: "guild_community",
    trustTier: "trusted_member",
    originDomain: source.platform === "kick" ? "kick.com" : source.platform === "picarto" ? "picarto.tv" : "community-origin",
    attestationNotes: "Community livestream source.",
    boundaryTags: ["community-verified"],
    verifiedAt: "2026-08-18T00:00:00.000Z",
  };
}

const STREAM_SOURCES: readonly StreamSource[] = [];

const UNKNOWN_STREAM_STATUS: StreamStatus = {
  status: "unknown",
  viewers: null,
  currentTitle: null,
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function headers(extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  if (!result.has("Cache-Control")) result.set("Cache-Control", "no-store");
  result.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  result.set("Referrer-Policy", "no-referrer");
  result.set("X-Content-Type-Options", "nosniff");
  result.set("X-Frame-Options", "DENY");
  return result;
}

function json(body: JsonObject, status = 200): Response {
  return Response.json(body, { status, headers: headers() });
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

async function readJson(request: Request, limit = JSON_LIMIT): Promise<JsonObject> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") fail(415, "Content-Type must be application/json.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) fail(413, "Request body is too large.");
  if (!request.body) fail(400, "A JSON body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("Request body is too large.");
        fail(413, "Request body is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(400, "Malformed JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "A JSON object is required.");
  return value as JsonObject;
}

async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) fail(413, "Request body is too large.");
  if (!request.body) fail(400, "A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("Request body is too large.");
        fail(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readBoundedJsonResponse(response: Response, limit: number): Promise<JsonObject | null> {
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("Upstream status response is too large.");
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : null;
  } catch {
    return null;
  }
}

async function fixedStreamStatus(
  endpoint: string,
): Promise<JsonObject | null> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Movie-Hell-Status/1.0 (+https://movie-hell.pages.dev/)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(STREAM_STATUS_TIMEOUT_MS),
    });
    return await readBoundedJsonResponse(response, STREAM_STATUS_RESPONSE_LIMIT);
  } catch {
    return null;
  }
}

function upstreamViewers(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function upstreamTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length >= 1 && title.length <= 200 ? title : null;
}

async function picartoStreamStatus(channel?: string): Promise<StreamStatus> {
  if (!channel) return { ...UNKNOWN_STREAM_STATUS };
  const payload = await fixedStreamStatus(`https://api.picarto.tv/api/v1/channel/name/${encodeURIComponent(channel)}`);
  if (!payload || typeof payload.online !== "boolean") return { ...UNKNOWN_STREAM_STATUS };
  return {
    status: payload.online ? "live" : "offline",
    viewers: upstreamViewers(payload.viewers),
    currentTitle: payload.online ? upstreamTitle(payload.title) : null,
  };
}

async function owncastStreamStatus(statusUrl?: string): Promise<StreamStatus> {
  if (!statusUrl) return { ...UNKNOWN_STREAM_STATUS };
  const payload = await fixedStreamStatus(statusUrl);
  if (!payload || typeof payload.online !== "boolean") return { ...UNKNOWN_STREAM_STATUS };
  return {
    status: payload.online ? "live" : "offline",
    viewers: upstreamViewers(payload.viewerCount),
    currentTitle: payload.online ? upstreamTitle(payload.streamTitle) : null,
  };
}

async function kickStreamStatus(channel?: string): Promise<StreamStatus> {
  if (!channel) return { status: "live", viewers: null, currentTitle: null };
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && data.livestream) {
        return {
          status: "live",
          viewers: typeof data.livestream.viewer_count === "number" ? data.livestream.viewer_count : null,
          currentTitle: typeof data.livestream.session_title === "string" ? data.livestream.session_title : null,
        };
      }
    }
  } catch {}
  return { status: "live", viewers: null, currentTitle: null };
}

async function collectBytes(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("PNG expands beyond its declared dimensions.");
        fail(400, "PNG expands beyond its declared dimensions.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

function pngCrc(type: Uint8Array, data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of type) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  for (const value of data) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  ) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function ascii(value: string): Uint8Array {
  return new Uint8Array(Array.from(value, (character) => character.charCodeAt(0)));
}

function pngChunk(typeName: "IHDR" | "IDAT" | "IEND", data: Uint8Array): Uint8Array {
  const type = ascii(typeName);
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(type, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.byteLength, pngCrc(type, data));
  return chunk;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

async function canonicalPng(input: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (input.byteLength < 45 || input.byteLength > EMOJI_UPLOAD_LIMIT) fail(400, "Invalid PNG size.");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (input[index] !== PNG_SIGNATURE[index]) fail(400, "The upload is not a PNG.");
  }
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  const imageData: Uint8Array[] = [];
  while (offset < input.byteLength) {
    if (input.byteLength - offset < 12) fail(400, "Truncated PNG chunk.");
    const length = readUint32(input, offset);
    const end = offset + 12 + length;
    if (end < offset || end > input.byteLength) fail(400, "Truncated PNG chunk.");
    const typeBytes = input.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()) fail(400, "Invalid PNG chunk type.");
    if (readUint32(input, offset + 8 + length) !== pngCrc(typeBytes, data)) fail(400, "Invalid PNG checksum.");
    if (type === "IHDR") {
      if (sawHeader || offset !== PNG_SIGNATURE.length || length !== 13) fail(400, "Invalid PNG header.");
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      if (width < 1 || width > 256 || height < 1 || height > 256) fail(400, "PNG dimensions must be 1 to 256 pixels.");
      if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        fail(400, "PNG must be noninterlaced 8-bit RGBA.");
      }
      sawHeader = true;
    } else if (type === "IDAT") {
      if (!sawHeader || imageDataEnded || sawEnd || length === 0) fail(400, "Invalid PNG image data.");
      sawImageData = true;
      imageData.push(data);
    } else if (type === "IEND") {
      if (!sawHeader || !sawImageData || sawEnd || length !== 0 || end !== input.byteLength) {
        fail(400, "Invalid PNG ending.");
      }
      sawEnd = true;
    } else {
      if (!sawHeader) fail(400, "Invalid PNG chunk order.");
      if (type === "acTL" || type === "fcTL" || type === "fdAT") fail(400, "Animated PNG is not accepted.");
      if (type[0] === type[0].toUpperCase()) fail(400, "Unsupported critical PNG chunk.");
      if (sawImageData) imageDataEnded = true;
    }
    offset = end;
  }
  if (!sawHeader || !sawImageData || !sawEnd || offset !== input.byteLength) fail(400, "Incomplete PNG.");
  const rowBytes = width * 4;
  const expectedInflated = (rowBytes + 1) * height;
  let inflated: Uint8Array;
  try {
    const source = new Blob([concatenate(imageData).slice().buffer]).stream();
    inflated = await collectBytes(source.pipeThrough(new DecompressionStream("deflate")), expectedInflated);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "Invalid compressed PNG data.");
  }
  if (inflated.byteLength !== expectedInflated) fail(400, "PNG raster length is invalid.");
  const pixels = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (rowBytes + 1);
    const filter = inflated[sourceOffset];
    if (filter > 4) fail(400, "PNG uses an invalid row filter.");
    const destinationOffset = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = inflated[sourceOffset + 1 + column];
      const left = column >= 4 ? pixels[destinationOffset + column - 4] : 0;
      const above = row > 0 ? pixels[destinationOffset - rowBytes + column] : 0;
      const upperLeft = row > 0 && column >= 4 ? pixels[destinationOffset - rowBytes + column - 4] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2)
        : filter === 4 ? paeth(left, above, upperLeft)
        : 0;
      pixels[destinationOffset + column] = (encoded + predictor) & 0xff;
    }
  }
  const filterZeroRaster = new Uint8Array(expectedInflated);
  for (let row = 0; row < height; row += 1) {
    filterZeroRaster[row * (rowBytes + 1)] = 0;
    filterZeroRaster.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
  }
  let compressed: Uint8Array;
  try {
    const source = new Blob([filterZeroRaster.slice().buffer]).stream();
    compressed = await collectBytes(source.pipeThrough(new CompressionStream("deflate")), EMOJI_UPLOAD_LIMIT);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "Could not canonicalize PNG data.");
  }
  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const bytes = concatenate([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
  if (bytes.byteLength > EMOJI_UPLOAD_LIMIT) fail(400, "Canonical PNG is too large.");
  return { bytes, width, height };
}

function stringField(body: JsonObject, key: string, min: number, max: number): string {
  const value = body[key];
  if (typeof value !== "string") fail(400, `${key} must be a string.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) fail(400, `${key} has an invalid length.`);
  return normalized;
}

function canonicalRoomId(value: unknown): string {
  if (typeof value !== "string" || !ROOM_ID.test(value)) fail(400, "Invalid roomId.");
  return value;
}

function canvasStrokeInput(body: JsonObject, roomId: string): CanvasStrokeInput {
  const envelopeKeys = new Set(["type", "roomId", "stroke"]);
  if (Object.keys(body).length !== envelopeKeys.size || Object.keys(body).some((key) => !envelopeKeys.has(key)) ||
    body.type !== "canvas_stroke" || body.roomId !== roomId || !body.stroke ||
    typeof body.stroke !== "object" || Array.isArray(body.stroke)) {
    fail(400, "Invalid canvas stroke envelope.");
  }
  const stroke = body.stroke as JsonObject;
  const strokeKeys = new Set(["clientId", "pageIndex", "tool", "color", "fillColor", "width", "opacity", "blendMode", "layerId", "symmetry", "points"]);
  if (Object.keys(stroke).some((key) => !strokeKeys.has(key))) {
    fail(400, "Invalid canvas stroke fields.");
  }
  const clientId = typeof stroke.clientId === "string" ? stroke.clientId : "";
  if (!SESSION_ID.test(clientId)) fail(400, "Invalid canvas clientId.");
  const pageIndexRaw = stroke.pageIndex !== undefined ? Number(stroke.pageIndex) : 1;
  const pageIndex = Number.isSafeInteger(pageIndexRaw) && pageIndexRaw >= 1 && pageIndexRaw <= 5 ? pageIndexRaw : 1;
  const validTools = new Set([
    "pen", "pencil", "airbrush", "watercolor", "neon", "chalk", "marker", "pixel",
    "eraser", "eraser_soft", "smudge", "line", "rectangle", "ellipse", "polygon", "bucket", "eyedropper", "hand"
  ]);
  const tool = typeof stroke.tool === "string" && validTools.has(stroke.tool) ? (stroke.tool as CanvasTool) : "pen";
  const color = typeof stroke.color === "string" && CANVAS_COLOR.test(stroke.color) ? stroke.color : "#f3d899";
  const fillColor = typeof stroke.fillColor === "string" && CANVAS_COLOR.test(stroke.fillColor) ? stroke.fillColor : undefined;
  const widthNum = Number(stroke.width);
  const width = Number.isSafeInteger(widthNum) && widthNum >= 1 && widthNum <= 120 ? widthNum : 3;
  const opacity = typeof stroke.opacity === "number" && stroke.opacity >= 0 && stroke.opacity <= 1 ? stroke.opacity : 1;
  const blendMode = typeof stroke.blendMode === "string" ? stroke.blendMode : undefined;
  const layerId = typeof stroke.layerId === "number" ? stroke.layerId : undefined;
  const symmetry = typeof stroke.symmetry === "string" ? stroke.symmetry : undefined;

  if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 256) {
    fail(400, "Canvas strokes require 2 to 256 points.");
  }
  const points = stroke.points.map((point): CanvasPoint => {
    if (!point || typeof point !== "object" || Array.isArray(point)) fail(400, "Invalid canvas point.");
    const record = point as JsonObject;
    if (!("x" in record) || !("y" in record)) fail(400, "Invalid canvas point.");
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      fail(400, "Canvas coordinates must be finite and normalized.");
    }
    const pt: CanvasPoint = { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
    if ("p" in record && typeof record.p === "number" && Number.isFinite(record.p)) {
      pt.p = Math.round(Math.max(0, Math.min(1, record.p)) * 1_000) / 1_000;
    }
    return pt;
  });
  if (encoder.encode(JSON.stringify(points)).byteLength > 16_384) fail(400, "Canvas stroke is too large.");
  return { clientId, pageIndex, tool, color, fillColor, width, opacity, blendMode, layerId, symmetry, points };
}

function canvasStrokeView(row: CanvasStrokeRow): CanvasStrokeView {
  const parsed: unknown = JSON.parse(row.pointsJson);
  if (!Array.isArray(parsed)) throw new Error("Stored canvas stroke is invalid");
  return {
    id: String(row.id),
    pageIndex: row.pageIndex || 1,
    roomId: row.roomId,
    clientId: row.clientId,
    userId: row.userId,
    author: row.author,
    tool: row.tool,
    color: row.color,
    width: row.width,
    points: parsed as CanvasPoint[],
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") fail(400, "email must be a string.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Invalid email address.");
  return email;
}

function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    fail(400, "Password must be 12 to 128 characters.");
  }
  return value;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return hex(value);
}

async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", value.slice().buffer)));
}

async function derivePassword(password: string, saltHex: string): Promise<Uint8Array> {
  const salt = new Uint8Array(saltHex.match(/../g)?.map((value) => Number.parseInt(value, 16)) ?? []);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  ));
}

async function passwordRecord(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomToken(16);
  return { salt, hash: hex(await derivePassword(password, salt)) };
}

async function passwordMatches(password: string, salt: string, expectedHex: string): Promise<boolean> {
  const actual = await derivePassword(password, salt);
  const expected = new Uint8Array(expectedHex.match(/../g)?.map((value) => Number.parseInt(value, 16)) ?? []);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ (expected[index] ?? 0);
  return difference === 0;
}

async function rateLimit(db: D1Database, key: string, maximum: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO rate_limits (rate_key, request_count, resets_at)
    VALUES (?, 1, ?)
    ON CONFLICT(rate_key) DO UPDATE SET
      request_count = CASE WHEN resets_at <= ? THEN 1 ELSE request_count + 1 END,
      resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
    RETURNING request_count
  `).bind(key, now + windowMs, now, now).first<{ request_count: number }>();
  if (!row || row.request_count > maximum) fail(429, "Too many requests. Try again later.");
}

function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

async function bearerUser(request: Request, env: Env): Promise<SessionUserRow> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) fail(401, "Authentication required.");
  const token = authorization.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token)) fail(401, "Invalid session.");
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.nickname, s.id AS sessionId
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.access_hash = ? AND s.revoked_at IS NULL AND s.access_expires_at > ?
  `).bind(await sha256(token), Date.now()).first<SessionUserRow>();
  if (!row) fail(401, "Invalid or expired session.");
  return row;
}

async function createSession(env: Env, user: UserRow): Promise<JsonObject> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO sessions
      (id, user_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), user.id, await sha256(accessToken), await sha256(refreshToken),
    now + ACCESS_TTL, now + REFRESH_TTL, now,
  ).run();
  return {
    ok: true,
    accessToken,
    refreshToken,
    user: { ...user, isAdmin: isAdmin(env, user.id), isModerator: isModerator(env, user.id) },
  };
}

async function signup(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") fail(415, "Content-Type must be application/json.");
  await rateLimit(env.DB, `signup:${requestIp(request)}`, 8, 60 * 60 * 1_000);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const nickname = stringField(body, "nickname", 1, 48);
  const password = validatePassword(body.password);
  const record = await passwordRecord(password);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO users (email, nickname, password_hash, password_salt, created_at)
      VALUES (?, ?, ?, ?, ?) RETURNING id, email, nickname
    `).bind(email, nickname, record.hash, record.salt, Date.now()).first<UserRow>();
    if (!result) fail(500, "Could not create account.");
    return json(await createSession(env, result), 201);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(409, "An account with that email already exists.");
  }
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  await rateLimit(env.DB, `login:${requestIp(request)}`, 10, 15 * 60 * 1_000);
  const row = await env.DB.prepare(`
    SELECT id, email, nickname, password_hash AS passwordHash, password_salt AS passwordSalt
    FROM users WHERE email = ?
  `).bind(email).first<UserRow & { passwordHash: string; passwordSalt: string }>();
  const validPassword = await passwordMatches(
    password,
    row?.passwordSalt ?? "00000000000000000000000000000000",
    row?.passwordHash ?? "0000000000000000000000000000000000000000000000000000000000000000",
  );
  if (!row || !validPassword) {
    fail(401, "Invalid email or password.");
  }
  return json(await createSession(env, { id: row.id, email: row.email, nickname: row.nickname }));
}

async function refresh(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const refreshToken = stringField(body, "refreshToken", 64, 64);
  if (!/^[a-f0-9]{64}$/.test(refreshToken)) fail(401, "Invalid refresh token.");
  const oldHash = await sha256(refreshToken);
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.nickname, s.id AS sessionId
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.refresh_hash = ? AND s.revoked_at IS NULL AND s.refresh_expires_at > ?
  `).bind(oldHash, Date.now()).first<SessionUserRow>();
  if (!row) fail(401, "Invalid or expired refresh token.");
  const accessToken = randomToken();
  const nextRefreshToken = randomToken();
  const now = Date.now();
  const update = await env.DB.prepare(`
    UPDATE sessions SET access_hash = ?, refresh_hash = ?, access_expires_at = ?, refresh_expires_at = ?
    WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL
  `).bind(
    await sha256(accessToken), await sha256(nextRefreshToken), now + ACCESS_TTL, now + REFRESH_TTL,
    row.sessionId, oldHash,
  ).run();
  if (update.meta.changes !== 1) fail(401, "Refresh token was already used.");
  return json({
    ok: true,
    accessToken,
    refreshToken: nextRefreshToken,
    user: {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      isAdmin: isAdmin(env, row.id),
      isModerator: isModerator(env, row.id),
    },
  });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  await readJson(request);
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(Date.now(), user.sessionId).run();
  const connectedRooms = await env.DB.prepare(`
    SELECT room_id AS roomId
    FROM websocket_tickets
    WHERE session_id = ? AND consumed_at IS NOT NULL
    GROUP BY room_id
    ORDER BY MAX(consumed_at) DESC
    LIMIT ?
  `).bind(user.sessionId, MAX_LOGOUT_ROOM_NOTIFICATIONS).all<{ roomId: string }>();
  await Promise.allSettled(connectedRooms.results.map(async ({ roomId }) => {
    const stub = await roomStub(env, roomId);
    const response = await stub.fetch("https://internal/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: user.sessionId }),
    });
    if (!response.ok) throw new Error("Socket revocation failed");
  }));
  return json({ ok: true });
}

function streamDirectoryCacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = "/__movie_hell_stream_directory_v1";
  url.search = "";
  url.hash = "";
  return new Request(url, { method: "GET" });
}

async function purgeStreamDirectoryCache(request: Request): Promise<void> {
  try {
    const cache = caches.default;
    const cacheKey = streamDirectoryCacheKey(request);
    await cache.delete(cacheKey);
  } catch {
    // Cache purge fallback
  }
}

function streamDirectoryResponse(streams: StreamDirectoryEntry[], isProvenanceCatalog: boolean = false): Response {
  return Response.json(
    { ok: true, checkedAt: new Date().toISOString(), streams },
    {
      headers: headers({
        "Cache-Control": isProvenanceCatalog
          ? "no-cache, no-store, must-revalidate"
          : `public, max-age=${STREAM_DIRECTORY_CACHE_SECONDS}, s-maxage=${STREAM_DIRECTORY_CACHE_SECONDS}`,
      }),
    },
  );
}

async function listStreams(request: Request, env: Env, isProvenanceCatalog: boolean = false): Promise<Response> {
  const cacheKey = streamDirectoryCacheKey(request);
  let cache: Cache | null = null;
  if (!isProvenanceCatalog) {
    try {
      cache = caches.default;
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {
      cache = null;
    }
  }

  let customProvenanceRows: Array<{
    id: string;
    platform: string;
    channel: string;
    name: string;
    description: string | null;
    watch_url: string;
    embed_url: string | null;
    hls_url: string | null;
    guild: GuildTier;
    trust_tier: TrustTier;
    origin_domain: string;
    curator_id: number | null;
    curator_name: string | null;
    attestation_notes: string | null;
    boundary_tags: string | null;
    verified_at: number | null;
  }> = [];

  try {
    const custom = await env.DB.prepare(`
      SELECT p.*, u.nickname AS curator_name
      FROM stream_provenance p
      LEFT JOIN users u ON u.id = p.curator_id
    `).all();
    if (custom.results) {
      customProvenanceRows = custom.results as any;
    }
  } catch {
    // Fallback if table query fails
  }

  const statuses = new Map<string, StreamStatus>();
  await Promise.allSettled(
    customProvenanceRows.map(async (row) => {
      if (row.trust_tier === "deleted") return;
      if (row.platform === "picarto" && row.channel) {
        const status = await picartoStreamStatus(row.channel);
        statuses.set(row.id, status);
        statuses.set(row.channel, status);
      } else if (row.platform === "kick" && row.channel) {
        const status = await kickStreamStatus(row.channel);
        statuses.set(row.id, status);
        statuses.set(row.channel, status);
      } else if (row.platform === "owncast") {
        const origin = row.origin_domain || (row.watch_url ? (() => { try { return new URL(row.watch_url).host; } catch { return ""; } })() : "");
        if (origin) {
          const status = await owncastStreamStatus(`https://${origin}/api/status`);
          statuses.set(row.id, status);
          statuses.set(row.channel, status);
        }
      }
    })
  );

  const dynamicProvenanceMap = new Map(customProvenanceRows.map((r) => [r.id, r]));

  const streams: StreamDirectoryEntry[] = STREAM_SOURCES
    .filter((source) => {
      const dynamic = dynamicProvenanceMap.get(source.id);
      if (dynamic) {
        if (dynamic.trust_tier === "deleted") return false;
        if (!isProvenanceCatalog && dynamic.trust_tier === "quarantined") return false;
      }
      return true;
    })
    .map((source): StreamDirectoryEntry => {
      const dynamic = dynamicProvenanceMap.get(source.id);
      const provenance: StreamProvenance = dynamic
        ? {
            guild: dynamic.guild,
            trustTier: dynamic.trust_tier,
            originDomain: dynamic.origin_domain || defaultProvenanceForSource(source).originDomain,
            curatorName: dynamic.curator_name,
            curatorId: dynamic.curator_id,
            attestationNotes: dynamic.attestation_notes,
            boundaryTags: (() => {
              try { return JSON.parse(dynamic.boundary_tags || '[]'); } catch { return []; }
            })(),
            verifiedAt: dynamic.verified_at ? new Date(dynamic.verified_at).toISOString() : null,
          }
        : defaultProvenanceForSource(source);

      const status = statuses.get(source.id) ?? statuses.get(source.channel) ?? UNKNOWN_STREAM_STATUS;

      return {
        ...source,
        name: (dynamic?.name && dynamic.name.trim()) || source.name,
        platform: (dynamic?.platform as StreamPlatform) || source.platform,
        channel: (dynamic?.channel && dynamic.channel.trim()) || source.channel,
        description: dynamic?.description !== undefined && dynamic.description !== null && dynamic.description !== '' ? dynamic.description : source.description,
        watchUrl: (dynamic?.watch_url && dynamic.watch_url.trim()) || source.watchUrl,
        embedUrl: (dynamic?.embed_url && dynamic.embed_url.trim()) || source.embedUrl,
        hlsUrl: dynamic?.hls_url !== undefined && dynamic.hls_url !== null && dynamic.hls_url !== '' ? dynamic.hls_url : source.hlsUrl,
        ...status,
        provenance,
      };
    });

  for (const [id, dynamic] of dynamicProvenanceMap.entries()) {
    if (dynamic.trust_tier === "deleted") continue;
    if (!isProvenanceCatalog && dynamic.trust_tier === "quarantined") continue;
    if (!STREAM_SOURCES.some((s) => s.id === id)) {
      const dynamicStatus = statuses.get(id) ?? statuses.get(dynamic.channel) ?? UNKNOWN_STREAM_STATUS;

      streams.push({
        id: dynamic.id,
        platform: (dynamic.platform as StreamPlatform) || "kick",
        channel: dynamic.channel,
        name: dynamic.name,
        description: dynamic.description || "",
        watchUrl: dynamic.watch_url,
        embedUrl: dynamic.embed_url || dynamic.watch_url,
        hlsUrl: dynamic.hls_url,
        mature: null,
        ...dynamicStatus,
        provenance: {
          guild: dynamic.guild,
          trustTier: dynamic.trust_tier,
          originDomain: dynamic.origin_domain,
          curatorName: dynamic.curator_name,
          curatorId: dynamic.curator_id,
          attestationNotes: dynamic.attestation_notes,
          boundaryTags: (() => {
            try { return JSON.parse(dynamic.boundary_tags || '[]'); } catch { return []; }
          })(),
          verifiedAt: dynamic.verified_at ? new Date(dynamic.verified_at).toISOString() : null,
        },
      });
    }
  }

  const response = streamDirectoryResponse(streams, isProvenanceCatalog);
  if (cache && !isProvenanceCatalog) {
    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      // Cache put failure fallback
    }
  }
  return response;
}

async function proxyPicartoEmbed(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!channel) fail(400, "Channel parameter is required.");
  const targetUrl = `https://picarto.tv/streampopout/${encodeURIComponent(channel)}/public`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://picarto.tv/",
      },
    });

    let html = await upstream.text();

    const injection = `
<base href="https://picarto.tv/">
<style>
  /* Suppress cookie consent modals, overlays, and banners */
  [class*="cookie" i], [class*="consent" i], [id*="cookie" i], [id*="consent" i],
  [data-testid*="cookie" i], [data-testid*="consent" i],
  .cookie-banner, .consent-banner, .cookie-modal, .consent-modal {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }
  /* Fill 100% of the cinema screen */
  html, body, #root, #root > div {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }
</style>
<script>
  (function() {
    // 1. Rewrite script and link creations so webpack loads chunks from picarto.tv
    var origCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      var el = origCreateElement.call(document, tagName, options);
      if (tagName && typeof tagName === 'string') {
        var lower = tagName.toLowerCase();
        if (lower === 'script' || lower === 'link') {
          var origSetAttribute = el.setAttribute;
          el.setAttribute = function(name, value) {
            if ((name === 'src' || name === 'href') && typeof value === 'string' && value.startsWith('/static/')) {
              value = 'https://picarto.tv' + value;
            }
            return origSetAttribute.call(el, name, value);
          };
          var prop = lower === 'script' ? 'src' : 'href';
          var proto = lower === 'script' ? HTMLScriptElement.prototype : HTMLLinkElement.prototype;
          var descriptor = Object.getOwnPropertyDescriptor(proto, prop);
          if (descriptor && descriptor.set) {
            var origSetter = descriptor.set;
            Object.defineProperty(el, prop, {
              set: function(val) {
                if (typeof val === 'string' && val.startsWith('/static/')) {
                  val = 'https://picarto.tv' + val;
                } else if (typeof val === 'string' && val.startsWith(window.location.origin + '/static/')) {
                  val = val.replace(window.location.origin, 'https://picarto.tv');
                }
                return origSetter.call(this, val);
              },
              get: descriptor.get,
              configurable: true
            });
          }
        }
      }
      return el;
    };

    // 2. Intercept fetch & XHR for API / stream calls
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/') || input.startsWith('/static/') || input.startsWith('/stream/')) {
          input = 'https://picarto.tv' + input;
        } else if (input.startsWith(window.location.origin + '/api/') || input.startsWith(window.location.origin + '/static/')) {
          input = input.replace(window.location.origin, 'https://picarto.tv');
        }
      }
      return origFetch.call(this, input, init);
    };

    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string') {
        if (url.startsWith('/api/') || url.startsWith('/static/') || url.startsWith('/stream/')) {
          url = 'https://picarto.tv' + url;
        } else if (url.startsWith(window.location.origin + '/api/') || url.startsWith(window.location.origin + '/static/')) {
          url = url.replace(window.location.origin, 'https://picarto.tv');
        }
      }
      return origOpen.apply(this, arguments);
    };

    // 3. Immediately rewrite URL to the popout route so Picarto React Router does not 404
    try {
      var targetPath = '/streampopout/' + ${JSON.stringify(channel)} + '/public';
      window.history.replaceState({ path: targetPath }, '', targetPath);
    } catch(e) {}

    // 4. Pre-seed cookie consent so Picarto's modal does not render
    try {
      localStorage.setItem('cookie_consent', 'true');
      localStorage.setItem('cookies_accepted', 'true');
      localStorage.setItem('cookieConsent', 'true');
      localStorage.setItem('cookie_policy_accepted', 'true');
      localStorage.setItem('picarto_cookies', 'true');
      localStorage.setItem('picarto_cookies_accepted', 'true');
      document.cookie = "cookie_consent=true; path=/; max-age=31536000; SameSite=Lax";
      document.cookie = "cookies_accepted=true; path=/; max-age=31536000; SameSite=Lax";
    } catch(e) {}

    // 5. Spoof popout window properties and suppress frame busting
    try {
      window.name = "picarto_popout";
      if (!window.opener) {
        Object.defineProperty(window, 'opener', { value: window, writable: true, configurable: true });
      }
      window.top = window.self;
      window.parent = window.self;
    } catch(e) {}
  })();
</script>
`;

    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${injection}`);
    } else if (html.includes("<head ")) {
      html = html.replace(/<head[^>]*>/, `$&${injection}`);
    } else {
      html = injection + html;
    }

    return new Response(html, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy":
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
          "connect-src * wss: https:; " +
          "media-src * blob: data: https:; " +
          "script-src * 'unsafe-inline' 'unsafe-eval' https:; " +
          "style-src * 'unsafe-inline' https:; " +
          "font-src * data: https:; " +
          "img-src * data: blob: https:;",
        "Permissions-Policy": "autoplay=*, fullscreen=*, encrypted-media=*, picture-in-picture=*",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;"><h3>Unable to load Picarto stream</h3><p><a href="https://picarto.tv/${encodeURIComponent(channel)}" target="_blank" style="color:#d8b66b;">Open directly on Picarto</a></p></body></html>`,
      {
        status: 502,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
}

async function proxyPicartoAsset(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `https://picarto.tv${url.pathname}${url.search}`;
  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/128.0.0.0",
        "Referer": "https://picarto.tv/",
      },
    });
    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.delete("X-Frame-Options");
    headers.delete("Content-Security-Policy");
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function proxyKickEmbed(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channel = (url.searchParams.get("channel") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!channel) fail(400, "Channel parameter is required.");
  const targetUrl = `https://player.kick.com/${encodeURIComponent(channel)}`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://kick.com/",
      },
    });

    let html = await upstream.text();

    // Strip any existing <base href="/" /> from Kick
    html = html.replace(/<base[^>]*>/gi, "");

    // Rewrite all relative URLs to absolute Kick URLs
    html = html.replaceAll('href="/', 'href="https://player.kick.com/');
    html = html.replaceAll('src="/', 'src="https://player.kick.com/');

    const injection = `
<base href="https://player.kick.com/">
<style>
  html, body, #root, #root > div, iframe {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }
</style>
<script>
  (function() {
    try {
      localStorage.setItem('cookie_consent', 'true');
      localStorage.setItem('cookies_accepted', 'true');
      document.cookie = "cookie_consent=true; path=/; max-age=31536000; SameSite=None; Secure";
    } catch(e) {}
    var origCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      var el = origCreateElement.call(document, tagName, options);
      if (tagName && typeof tagName === 'string') {
        var lower = tagName.toLowerCase();
        if (lower === 'script' || lower === 'link') {
          var origSetAttribute = el.setAttribute;
          el.setAttribute = function(name, value) {
            if ((name === 'src' || name === 'href') && typeof value === 'string' && value.startsWith('/')) {
              value = 'https://player.kick.com' + value;
            }
            return origSetAttribute.call(el, name, value);
          };
        }
      }
      return el;
    };
  })();
</script>
`;

    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${injection}`);
    } else if (html.includes("<head ")) {
      html = html.replace(/<head[^>]*>/, `$&${injection}`);
    } else {
      html = injection + html;
    }

    return new Response(html, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy":
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
          "connect-src * wss: https:; " +
          "media-src * blob: data: https:; " +
          "script-src * 'unsafe-inline' 'unsafe-eval' https:; " +
          "style-src * 'unsafe-inline' https:; " +
          "font-src * data: https:; " +
          "img-src * data: blob: https:;",
        "Permissions-Policy": "autoplay=*, fullscreen=*, encrypted-media=*, picture-in-picture=*",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#000;color:#fff;margin:0;padding:0;overflow:hidden;width:100vw;height:100vh;"><iframe src="https://player.kick.com/${encodeURIComponent(channel)}" style="width:100%;height:100%;border:none;" allow="autoplay; fullscreen; encrypted-media"></iframe></body></html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
}

async function listRooms(request: Request, env: Env): Promise<Response> {
  await bearerUser(request, env);
  const result = await env.DB.prepare(`
    SELECT id, name, description, created_at AS createdAt FROM rooms ORDER BY created_at DESC LIMIT 200
  `).all<{ id: string; name: string; description: string | null; createdAt: number }>();
  return json({
    ok: true,
    rooms: result.results.map((room) => ({ ...room, createdAt: new Date(room.createdAt).toISOString() })),
  });
}

function slug(value: string): string {
  const base = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
  return base || "room";
}

function channelRequestView(row: ChannelRequestRow, canVote: boolean): JsonObject {
  return {
    ...row,
    requester: { id: row.requestedBy, nickname: row.requester },
    requesterId: row.requestedBy,
    requesterName: row.requester,
    canVote,
    createdAt: new Date(row.createdAt).toISOString(),
    resolvedAt: row.resolvedAt == null ? null : new Date(row.resolvedAt).toISOString(),
  };
}

async function channelRequestById(env: Env, id: string, viewerId: number): Promise<ChannelRequestRow | null> {
  return env.DB.prepare(`
    SELECT r.id, r.room_id AS roomId, r.name, r.description, r.reason,
      r.requested_by AS requestedBy, u.nickname AS requester, r.status, r.threshold,
      (SELECT COUNT(*) FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.decision = 'approve') AS approvals,
      (SELECT COUNT(*) FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.decision = 'reject') AS rejections,
      (SELECT decision FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.voter_id = ?) AS myVote,
      r.created_at AS createdAt, r.resolved_at AS resolvedAt
    FROM channel_requests r JOIN users u ON u.id = r.requested_by
    WHERE r.id = ?
  `).bind(viewerId, id).first<ChannelRequestRow>();
}

async function listChannelRequests(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  const canVote = isModerator(env, user.id);
  const result = await env.DB.prepare(`
    SELECT r.id, r.room_id AS roomId, r.name, r.description, r.reason,
      r.requested_by AS requestedBy, u.nickname AS requester, r.status, r.threshold,
      (SELECT COUNT(*) FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.decision = 'approve') AS approvals,
      (SELECT COUNT(*) FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.decision = 'reject') AS rejections,
      (SELECT decision FROM channel_request_votes v
        WHERE v.request_id = r.id AND v.voter_id = ?) AS myVote,
      r.created_at AS createdAt, r.resolved_at AS resolvedAt
    FROM channel_requests r JOIN users u ON u.id = r.requested_by
    ORDER BY r.created_at DESC LIMIT 100
  `).bind(user.id).all<ChannelRequestRow>();
  return json({ ok: true, canVote, requests: result.results.map((row) => channelRequestView(row, canVote)) });
}

async function createChannelRequest(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  await rateLimit(env.DB, `channel-request:create:${user.id}`, 3, 60 * 60 * 1_000);
  const body = await readJson(request);
  const name = stringField(body, "name", 1, 80);
  const descriptionValue = body.description;
  const description = descriptionValue == null || descriptionValue === ""
    ? null
    : stringField(body, "description", 1, 500);
  const reason = stringField(body, "reason", 1, 500);
  const id = crypto.randomUUID();
  const roomId = canonicalRoomId(slug(name));
  const threshold = approvalThreshold(env);
  const createdAt = Date.now();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO channel_requests
          (id, room_id, name, description, reason, requested_by, status, threshold, created_at)
        SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE id = ?)
        RETURNING id
      `).bind(id, roomId, name, description, reason, user.id, threshold, createdAt, roomId),
      env.DB.prepare(`
        INSERT INTO audit_log (actor_id, event, subject, details, created_at)
        SELECT ?, 'channel_request.created', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM channel_requests WHERE id = ?)
      `).bind(user.id, id, JSON.stringify({ roomId }), createdAt, id),
    ]);
    if (results[0].results.length !== 1) fail(409, "A channel with that address already exists.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (String(error).toLowerCase().includes("unique")) {
      fail(409, "A request for that channel is already pending.");
    }
    throw error;
  }
  const row = await channelRequestById(env, id, user.id);
  if (!row) fail(500, "Could not create channel request.");
  const canVote = isModerator(env, user.id);
  return json({ ok: true, canVote, request: channelRequestView(row, canVote) }, 201);
}

async function voteChannelRequest(request: Request, env: Env, id: string): Promise<Response> {
  const voter = await moderatorUser(request, env);
  await rateLimit(env.DB, `channel-request:vote:${voter.id}`, 60, 60 * 60 * 1_000);
  const existing = await env.DB.prepare("SELECT id FROM channel_requests WHERE id = ?")
    .bind(id).first<{ id: string }>();
  if (!existing) fail(404, "Channel request not found.");
  const body = await readJson(request);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") fail(400, "decision must be approve or reject.");
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO channel_request_votes (request_id, voter_id, decision, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(id, voter.id, decision, now),
      env.DB.prepare(`
        UPDATE channel_requests SET status = 'rejected', resolved_at = ?
        WHERE id = ? AND status = 'pending' AND
          (SELECT COUNT(*) FROM channel_request_votes
            WHERE request_id = ? AND decision = 'reject') >= threshold
      `).bind(now, id, id),
      env.DB.prepare(`
        UPDATE channel_requests SET status = 'approved', resolved_at = ?
        WHERE id = ? AND status = 'pending' AND
          (SELECT COUNT(*) FROM channel_request_votes
            WHERE request_id = ? AND decision = 'approve') >= threshold
      `).bind(now, id, id),
      env.DB.prepare(`
        INSERT INTO rooms (id, name, description, created_by, created_at)
        SELECT room_id, name, description, requested_by, ?
        FROM channel_requests WHERE id = ? AND status = 'approved' AND resolved_at = ?
      `).bind(now, id, now),
      env.DB.prepare(`
        INSERT INTO canvas_state (room_id, updated_at)
        SELECT room_id, ? FROM channel_requests
        WHERE id = ? AND status = 'approved' AND resolved_at = ?
      `).bind(now, id, now),
      env.DB.prepare(`
        INSERT INTO audit_log (actor_id, event, subject, details, created_at)
        VALUES (?, 'channel_request.voted', ?, ?, ?)
      `).bind(voter.id, id, JSON.stringify({ decision }), now),
      env.DB.prepare(`
        INSERT INTO audit_log (actor_id, event, subject, details, created_at)
        SELECT ?, 'channel_request.approved', ?, '{}', ?
        WHERE EXISTS (
          SELECT 1 FROM channel_requests WHERE id = ? AND status = 'approved' AND resolved_at = ?
        )
      `).bind(voter.id, id, now, id, now),
      env.DB.prepare(`
        INSERT INTO audit_log (actor_id, event, subject, details, created_at)
        SELECT ?, 'channel_request.rejected', ?, '{}', ?
        WHERE EXISTS (
          SELECT 1 FROM channel_requests WHERE id = ? AND status = 'rejected' AND resolved_at = ?
        )
      `).bind(voter.id, id, now, id, now),
    ]);
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("not pending")) fail(409, "Channel request is not pending.");
    if (message.includes("channel_request_votes") && message.includes("unique")) {
      fail(409, "You already voted on this request.");
    }
    if (message.includes("rooms.id") && message.includes("unique")) {
      fail(409, "The requested channel address is no longer available.");
    }
    throw error;
  }
  const row = await channelRequestById(env, id, voter.id);
  if (!row) fail(404, "Channel request not found.");
  return json({ ok: true, canVote: true, request: channelRequestView(row, true) });
}

async function assertRoomAccess(env: Env, userId: number, roomId: string): Promise<void> {
  const room = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(roomId).first<{ id: string }>();
  if (!room) fail(404, "Room not found.");
  const ban = await env.DB.prepare("SELECT 1 AS banned FROM room_bans WHERE room_id = ? AND user_id = ?")
    .bind(roomId, userId).first<{ banned: number }>();
  if (ban) fail(403, "You have been removed from this room.");
}

async function listMessages(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await bearerUser(request, env);
  const roomId = canonicalRoomId(url.searchParams.get("roomId"));
  await assertRoomAccess(env, user.id, roomId);
  const result = await env.DB.prepare(`
    SELECT m.id, m.room_id AS roomId, u.nickname AS author, m.text, m.created_at AS createdAt
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ? AND m.deleted_at IS NULL
    ORDER BY m.id DESC LIMIT 100
  `).bind(roomId).all<Omit<MessageView, "createdAt"> & { createdAt: number }>();
  return json({
    ok: true,
    messages: result.results.reverse().map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt).toISOString(),
    })),
  });
}

async function roomStub(env: Env, roomId: string): Promise<DurableObjectStub> {
  return env.CHAT_ROOMS.getByName(roomId);
}

async function createMessage(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  const body = await readJson(request);
  const roomId = canonicalRoomId(body.roomId);
  const text = stringField(body, "text", 1, MESSAGE_LIMIT);
  await assertRoomAccess(env, user.id, roomId);
  await rateLimit(env.DB, `message:${roomId}:${user.id}`, 30, 10 * 1_000);
  const createdAt = Date.now();
  const row = await env.DB.prepare(`
    INSERT INTO messages (room_id, user_id, text, created_at)
    SELECT ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM sessions
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
    ) AND NOT EXISTS (
      SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
    )
    RETURNING id
  `).bind(
    roomId, user.id, text, createdAt,
    user.sessionId, user.id, createdAt,
    roomId, user.id,
  ).first<{ id: number }>();
  if (!row) fail(403, "Session expired or room access revoked.");
  const message: MessageView = { id: row.id, roomId, author: user.nickname, text, createdAt: new Date(createdAt).toISOString() };
  const stub = await roomStub(env, roomId);
  await stub.fetch("https://internal/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return json({ ok: true, message }, 201);
}

async function issueTicket(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  const body = await readJson(request);
  const roomId = canonicalRoomId(body.roomId);
  await assertRoomAccess(env, user.id, roomId);
  await rateLimit(env.DB, `ticket:${user.id}`, 30, 60 * 1_000);
  const ticket = randomToken();
  const expiresAt = Date.now() + TICKET_TTL;
  await env.DB.prepare(`
    INSERT INTO websocket_tickets (ticket_hash, user_id, session_id, room_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(await sha256(ticket), user.id, user.sessionId, roomId, expiresAt, Date.now()).run();
  return json({ ok: true, ticket, expiresAt: new Date(expiresAt).toISOString() }, 201);
}

function configuredAdmins(env: Env): Set<number> {
  return new Set(
    String(env.ADMIN_USER_IDS)
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
  );
}

function configuredModerators(env: Env): Set<number> {
  const moderators = configuredAdmins(env);
  const configured = String(Reflect.get(env, "MODERATOR_USER_IDS") ?? "");
  for (const value of configured.split(",")) {
    const userId = Number(value.trim());
    if (Number.isSafeInteger(userId) && userId > 0) moderators.add(userId);
  }
  return moderators;
}

function isModerator(env: Env, userId: number): boolean {
  return configuredModerators(env).has(userId);
}

function isAdmin(env: Env, userId: number): boolean {
  return configuredAdmins(env).has(userId);
}

async function adminUser(request: Request, env: Env): Promise<SessionUserRow> {
  const user = await bearerUser(request, env);
  if (!isAdmin(env, user.id)) fail(403, "Administrator access required.");
  return user;
}

async function moderatorUser(request: Request, env: Env): Promise<SessionUserRow> {
  const user = await bearerUser(request, env);
  if (!isModerator(env, user.id)) fail(403, "Moderator access required.");
  return user;
}

async function emojiCatalog(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  const result = await env.DB.prepare(`
    SELECT id, shortcode, label, byte_size AS byteSize, width, height, status,
      created_at AS createdAt, disabled_at AS disabledAt
    FROM custom_emojis
    WHERE status IN ('published', 'disabled')
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(MAX_CUSTOM_EMOJIS).all<{
    id: string;
    shortcode: string;
    label: string;
    byteSize: number;
    width: number;
    height: number;
    status: "published" | "disabled";
    createdAt: number;
    disabledAt: number | null;
  }>();
  return json({
    ok: true,
    canUpload: isModerator(env, user.id) && result.results.length < MAX_CUSTOM_EMOJIS,
    isModerator: isModerator(env, user.id),
    emojis: result.results.map((emoji) => ({
      ...emoji,
      disabled: emoji.status === "disabled",
      assetUrl: `/api/emojis/${emoji.id}/image`,
      createdAt: new Date(emoji.createdAt).toISOString(),
      disabledAt: emoji.disabledAt == null ? null : new Date(emoji.disabledAt).toISOString(),
    })),
  });
}

function detectMimeType(bytes: Uint8Array): string {
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return "image/png";
}

function parseImageMeta(input: Uint8Array): { bytes: Uint8Array; width: number; height: number; mimeType: string } {
  if (input.byteLength < 14 || input.byteLength > EMOJI_UPLOAD_LIMIT) {
    fail(400, "Image size must be between 14 bytes and 320 KiB.");
  }

  let rawWidth = 0;
  let rawHeight = 0;
  let mimeType = "image/png";

  // 1. Check PNG Signature (89 50 4E 47 0D 0A 1A 0A)
  if (
    input.length >= 24 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47 &&
    input[4] === 0x0d &&
    input[5] === 0x0a &&
    input[6] === 0x1a &&
    input[7] === 0x0a
  ) {
    mimeType = "image/png";
    rawWidth = (input[16] << 24) | (input[17] << 16) | (input[18] << 8) | input[19];
    rawHeight = (input[20] << 24) | (input[21] << 16) | (input[22] << 8) | input[23];
  }
  // 2. Check GIF Signature (GIF87a or GIF89a)
  else if (
    input.length >= 10 &&
    input[0] === 0x47 &&
    input[1] === 0x49 &&
    input[2] === 0x46 &&
    input[3] === 0x38 &&
    (input[4] === 0x37 || input[4] === 0x39) &&
    input[5] === 0x61
  ) {
    mimeType = "image/gif";
    rawWidth = input[6] | (input[7] << 8);
    rawHeight = input[8] | (input[9] << 8);
  }
  // 3. Check WebP Signature (RIFF....WEBP)
  else if (
    input.length >= 30 &&
    input[0] === 0x52 &&
    input[1] === 0x49 &&
    input[2] === 0x46 &&
    input[3] === 0x46 &&
    input[8] === 0x57 &&
    input[9] === 0x45 &&
    input[10] === 0x42 &&
    input[11] === 0x50
  ) {
    mimeType = "image/webp";
    const chunkType = String.fromCharCode(input[12], input[13], input[14], input[15]);
    if (chunkType === "VP8 " && input.length >= 30) {
      rawWidth = (input[26] | (input[27] << 8)) & 0x3fff;
      rawHeight = (input[28] | (input[29] << 8)) & 0x3fff;
    } else if (chunkType === "VP8L" && input.length >= 25) {
      rawWidth = 1 + (((input[21] | (input[22] << 8)) & 0x3fff));
      rawHeight = 1 + ((((input[22] >> 6) | (input[23] << 2) | (input[24] << 10)) & 0x3fff));
    } else if (chunkType === "VP8X" && input.length >= 30) {
      rawWidth = 1 + (input[24] | (input[25] << 8) | (input[26] << 16));
      rawHeight = 1 + (input[27] | (input[28] << 8) | (input[29] << 16));
    } else {
      rawWidth = 128;
      rawHeight = 128;
    }
  }
  // 4. Check JPEG Signature (FF D8 FF)
  else if (input.length >= 4 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
    mimeType = "image/jpeg";
    let offset = 2;
    while (offset < input.length - 8) {
      if (input[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = input[offset + 1];
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        rawHeight = (input[offset + 5] << 8) | input[offset + 6];
        rawWidth = (input[offset + 7] << 8) | input[offset + 8];
        break;
      }
      const len = (input[offset + 2] << 8) | input[offset + 3];
      offset += 2 + len;
    }
  } else {
    fail(400, "Image must be a valid GIF, PNG, WebP, or JPEG.");
  }

  if (rawWidth < 1 || rawHeight < 1) {
    rawWidth = 128;
    rawHeight = 128;
  }

  const maxDim = Math.max(rawWidth, rawHeight);
  const scale = maxDim > 256 ? 256 / maxDim : 1;
  const width = Math.max(1, Math.min(256, Math.round(rawWidth * scale)));
  const height = Math.max(1, Math.min(256, Math.round(rawHeight * scale)));

  return { bytes: input, width, height, mimeType };
}

async function uploadEmoji(request: Request, env: Env): Promise<Response> {
  const moderator = await moderatorUser(request, env);
  await rateLimit(env.DB, `emoji:upload:${moderator.id}`, 10, 60 * 60 * 1_000);
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) fail(415, "Content-Type must be multipart/form-data.");
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") fail(415, "Encoded upload bodies are not accepted.");
  const requestBytes = await readBytes(request, EMOJI_MULTIPART_LIMIT);
  let form: FormData;
  try {
    const boundedRequest = new Request(request.url, { method: "POST", headers: request.headers, body: requestBytes });
    form = await boundedRequest.formData();
  } catch {
    fail(400, "Malformed multipart upload.");
  }
  const allowedFields = new Set(["file", "shortcode", "label"]);
  let invalidField = false;
  form.forEach((_value, key) => {
    if (!allowedFields.has(key)) invalidField = true;
  });
  if (invalidField || form.getAll("file").length !== 1 || form.getAll("shortcode").length !== 1 || form.getAll("label").length !== 1) {
    fail(400, "Upload must contain exactly file, shortcode, and label.");
  }
  const file = form.get("file");
  const shortcodeValue = form.get("shortcode");
  const labelValue = form.get("label");
  if (!(file instanceof File) || typeof shortcodeValue !== "string" || typeof labelValue !== "string") {
    fail(400, "Invalid emoji upload fields.");
  }
  if (file.size < 1 || file.size > EMOJI_UPLOAD_LIMIT) {
    fail(400, "Emoji and reaction images must be 320 KiB or smaller.");
  }
  const shortcode = shortcodeValue.trim().toLowerCase();
  const label = labelValue.trim();
  if (!EMOJI_SHORTCODE.test(shortcode)) fail(400, "Invalid emoji shortcode.");
  if (label.length < 1 || label.length > 64) fail(400, "label has an invalid length.");
  
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const imageMeta = parseImageMeta(rawBytes);
  const digest = await sha256Bytes(imageMeta.bytes);
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  let inserted: { id: string } | null;
  try {
    inserted = await env.DB.prepare(`
      INSERT INTO custom_emojis
        (id, shortcode, label, image_bytes, byte_size, width, height, sha256, status, uploaded_by, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?
      WHERE (SELECT COUNT(*) FROM custom_emojis) < ?
      RETURNING id
    `).bind(
      id, shortcode, label, imageMeta.bytes.slice().buffer, imageMeta.bytes.byteLength,
      imageMeta.width, imageMeta.height, digest, moderator.id, createdAt, MAX_CUSTOM_EMOJIS,
    ).first<{ id: string }>();
  } catch (error) {
    if (String(error).includes("UNIQUE")) fail(409, "That emoji shortcode is already in use.");
    throw error;
  }
  if (!inserted) fail(409, "The custom emoji catalog is full.");
  await audit(env, moderator.id, "emoji.published", id, { shortcode, width: imageMeta.width, height: imageMeta.height });
  return json({
    ok: true,
    emoji: {
      id,
      shortcode,
      label,
      width: imageMeta.width,
      height: imageMeta.height,
      byteSize: imageMeta.bytes.byteLength,
      status: "published",
      disabled: false,
      assetUrl: `/api/emojis/${id}/image`,
      createdAt: new Date(createdAt).toISOString(),
    },
  }, 201);
}

async function disableEmoji(request: Request, env: Env, id: string): Promise<Response> {
  const moderator = await moderatorUser(request, env);
  const disabledAt = Date.now();
  const row = await env.DB.prepare(`
    UPDATE custom_emojis
    SET status = 'disabled', disabled_at = COALESCE(disabled_at, ?), disabled_by = COALESCE(disabled_by, ?)
    WHERE id = ? AND status IN ('published', 'disabled')
    RETURNING id, shortcode
  `).bind(disabledAt, moderator.id, id).first<{ id: string; shortcode: string }>();
  if (!row) fail(404, "Emoji not found.");
  await audit(env, moderator.id, "emoji.disabled", id, { shortcode: row.shortcode });
  return json({ ok: true, id, status: "disabled" });
}

async function serveEmoji(request: Request, env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(`
    SELECT image_bytes AS imageBytes, byte_size AS byteSize, sha256
    FROM custom_emojis
    WHERE id = ? AND status IN ('published', 'disabled')
  `).bind(id).first<{ imageBytes: unknown; byteSize: number; sha256: string }>();
  if (!row) return json({ ok: false, error: "Not found." }, 404);
  const imageBytes = row.imageBytes instanceof ArrayBuffer
    ? new Uint8Array(row.imageBytes)
    : ArrayBuffer.isView(row.imageBytes)
      ? new Uint8Array(row.imageBytes.buffer, row.imageBytes.byteOffset, row.imageBytes.byteLength)
      : Array.isArray(row.imageBytes)
        ? Uint8Array.from(row.imageBytes)
        : null;
  if (!imageBytes || imageBytes.byteLength !== row.byteSize) throw new Error("Stored emoji image is invalid");
  const mimeType = detectMimeType(imageBytes);
  const responseHeaders = headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": "inline",
    "Content-Length": String(row.byteSize),
    "Content-Type": mimeType,
    "Cross-Origin-Resource-Policy": "same-origin",
    ETag: `"${row.sha256}"`,
  });
  const candidates = (request.headers.get("if-none-match") ?? "").split(",").map((value) => value.trim());
  if (candidates.includes("*") || candidates.includes(`"${row.sha256}"`)) {
    responseHeaders.delete("Content-Length");
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return new Response(imageBytes, { status: 200, headers: responseHeaders });
}

function positiveInteger(value: unknown, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) fail(400, `${name} must be a positive integer.`);
  return number;
}

function approvalThreshold(env: Env): number {
  const value = Number(env.APPROVAL_THRESHOLD);
  return Number.isSafeInteger(value) ? Math.min(10, Math.max(2, value)) : 2;
}

async function audit(env: Env, actorId: number, event: string, subject: string, details: JsonObject): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_log (actor_id, event, subject, details, created_at) VALUES (?, ?, ?, ?, ?)
    `).bind(actorId, event, subject, JSON.stringify(details), Date.now()).run();
  } catch {
    // Suppress audit logging failures so they never block critical flows
  }
}

async function moderationById(env: Env, id: number): Promise<ModerationRow | null> {
  return env.DB.prepare(`
    SELECT id, room_id AS roomId, action, target_user_id AS targetUserId,
      message_id AS messageId, reason, requested_by AS requestedBy, status,
      created_at AS createdAt, executed_at AS executedAt
    FROM moderation_actions WHERE id = ?
  `).bind(id).first<ModerationRow>();
}

async function createModeration(request: Request, env: Env, roomId: string): Promise<Response> {
  const requester = await adminUser(request, env);
  canonicalRoomId(roomId);
  const room = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(roomId).first<{ id: string }>();
  if (!room) fail(404, "Room not found.");
  const body = await readJson(request);
  const action = body.action;
  if (action !== "remove_user" && action !== "delete_message") fail(400, "Invalid moderation action.");
  const reason = body.reason == null || body.reason === "" ? null : stringField(body, "reason", 1, 500);
  let targetUserId: number | null = null;
  let messageId: number | null = null;
  if (action === "remove_user") {
    targetUserId = positiveInteger(body.targetUserId, "targetUserId");
    const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(targetUserId).first<{ id: number }>();
    if (!target) fail(404, "Target user not found.");
  } else {
    messageId = positiveInteger(body.messageId, "messageId");
    const target = await env.DB.prepare("SELECT id FROM messages WHERE id = ? AND room_id = ? AND deleted_at IS NULL")
      .bind(messageId, roomId).first<{ id: number }>();
    if (!target) fail(404, "Target message not found.");
  }
  const createdAt = Date.now();
  const row = await env.DB.prepare(`
    INSERT INTO moderation_actions
      (room_id, action, target_user_id, message_id, reason, requested_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id
  `).bind(roomId, action, targetUserId, messageId, reason, requester.id, createdAt).first<{ id: number }>();
  if (!row) fail(500, "Could not create moderation action.");
  await audit(env, requester.id, "moderation.created", String(row.id), { roomId, action });
  return json({ ok: true, moderation: await moderationById(env, row.id) }, 201);
}

async function allocateQuota(request: Request, env: Env): Promise<Response> {
  const operator = await adminUser(request, env);
  const body = await readJson(request);
  const userId = positiveInteger(body.userId, "userId");
  const votes = positiveInteger(body.votes ?? body.totalVotes, "votes", 10_000);
  if (!configuredAdmins(env).has(userId)) fail(400, "Quota recipient must be a configured administrator.");
  const quota = await env.DB.prepare(`
    INSERT INTO approval_quotas (user_id, total_votes, used_votes)
    VALUES (?, ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET total_votes = total_votes + excluded.total_votes
    RETURNING user_id AS userId, total_votes AS totalVotes, used_votes AS usedVotes
  `).bind(userId, votes).first<{ userId: number; totalVotes: number; usedVotes: number }>();
  if (!quota) fail(500, "Could not allocate quota.");
  await audit(env, operator.id, "quota.allocated", String(userId), { votes });
  return json({ ok: true, quota });
}

async function listModeration(request: Request, env: Env, url: URL): Promise<Response> {
  await adminUser(request, env);
  const requestedStatus = url.searchParams.get("status");
  const validStatus = requestedStatus === "pending" || requestedStatus === "executing" ||
    requestedStatus === "executed" || requestedStatus === "rejected" ? requestedStatus : null;
  if (requestedStatus && !validStatus) fail(400, "Invalid moderation status.");
  const result = validStatus
    ? await env.DB.prepare(`
        SELECT id, room_id AS roomId, action, target_user_id AS targetUserId,
          message_id AS messageId, reason, requested_by AS requestedBy, status,
          created_at AS createdAt, executed_at AS executedAt
        FROM moderation_actions WHERE status = ? ORDER BY id DESC LIMIT 100
      `).bind(validStatus).all<ModerationRow>()
    : await env.DB.prepare(`
        SELECT id, room_id AS roomId, action, target_user_id AS targetUserId,
          message_id AS messageId, reason, requested_by AS requestedBy, status,
          created_at AS createdAt, executed_at AS executedAt
        FROM moderation_actions ORDER BY id DESC LIMIT 100
      `).all<ModerationRow>();
  return json({ ok: true, moderation: result.results });
}

async function moderationDetail(request: Request, env: Env, id: number): Promise<Response> {
  await adminUser(request, env);
  const moderation = await moderationById(env, id);
  if (!moderation) fail(404, "Moderation action not found.");
  const votes = await env.DB.prepare(`
    SELECT voter_id AS voterId, decision, reason, created_at AS createdAt
    FROM moderation_votes WHERE moderation_id = ? ORDER BY id
  `).bind(id).all<{ voterId: number; decision: string; reason: string | null; createdAt: number }>();
  return json({ ok: true, moderation, votes: votes.results, threshold: approvalThreshold(env) });
}

async function executeModeration(env: Env, id: number): Promise<ModerationRow | null> {
  const threshold = approvalThreshold(env);
  let action = await moderationById(env, id);
  if (!action) return null;
  if (action.status === "pending") {
    const claimed = await env.DB.prepare(`
      UPDATE moderation_actions SET status = 'executing'
      WHERE id = ? AND status = 'pending' AND
        (SELECT COUNT(*) FROM moderation_votes WHERE moderation_id = ? AND decision = 'approve') >= ? AND
        (SELECT COUNT(*) FROM moderation_votes WHERE moderation_id = ? AND decision = 'reject') < ?
      RETURNING id
    `).bind(id, id, threshold, id, threshold).first<{ id: number }>();
    if (!claimed) return action;
    action = await moderationById(env, id);
    if (!action) return null;
  }
  if (action.status === "rejected") return action;
  const finishedAt = action.executedAt ?? Date.now();
  if (action.status === "executing") {
    if (action.action === "remove_user" && action.targetUserId) {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO room_bans (room_id, user_id, moderation_id, created_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET moderation_id = excluded.moderation_id
        `).bind(action.roomId, action.targetUserId, action.id, finishedAt),
        env.DB.prepare("UPDATE moderation_actions SET status = 'executed', executed_at = ? WHERE id = ? AND status = 'executing'")
          .bind(finishedAt, action.id),
        env.DB.prepare("INSERT INTO audit_log (actor_id, event, subject, details, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(action.requestedBy, "moderation.executed", String(action.id), JSON.stringify({ action: action.action }), finishedAt),
      ]);
    } else if (action.action === "delete_message" && action.messageId) {
      await env.DB.batch([
        env.DB.prepare("UPDATE messages SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ? AND room_id = ?")
          .bind(finishedAt, action.messageId, action.roomId),
        env.DB.prepare("UPDATE moderation_actions SET status = 'executed', executed_at = ? WHERE id = ? AND status = 'executing'")
          .bind(finishedAt, action.id),
        env.DB.prepare("INSERT INTO audit_log (actor_id, event, subject, details, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(action.requestedBy, "moderation.executed", String(action.id), JSON.stringify({ action: action.action }), finishedAt),
      ]);
    }
    action = await moderationById(env, id);
    if (!action) return null;
  }
  const stub = await roomStub(env, action.roomId);
  if (action.action === "remove_user" && action.targetUserId) {
    await stub.fetch("https://internal/ban", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: action.targetUserId }),
    });
  } else if (action.action === "delete_message" && action.messageId) {
    await stub.fetch("https://internal/notify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message_deleted", messageId: action.messageId }),
    });
  }
  return action;
}

async function castVote(request: Request, env: Env, id: number): Promise<Response> {
  const voter = await adminUser(request, env);
  const body = await readJson(request);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") fail(400, "decision must be approve or reject.");
  const reason = body.reason == null || body.reason === "" ? null : stringField(body, "reason", 1, 500);
  try {
    await env.DB.prepare(`
      INSERT INTO moderation_votes (moderation_id, voter_id, decision, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, voter.id, decision, reason, Date.now()).run();
  } catch (error) {
    const message = String(error);
    if (message.includes("own moderation")) fail(403, "You cannot vote on your own moderation action.");
    if (message.includes("quota exhausted")) fail(403, "Approval quota exhausted.");
    if (message.includes("not pending")) fail(409, "Moderation action is not pending.");
    if (message.includes("UNIQUE")) fail(409, "You already voted on this action.");
    throw error;
  }
  await audit(env, voter.id, "moderation.voted", String(id), { decision });
  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN decision = 'approve' THEN 1 ELSE 0 END) AS approvals,
      SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) AS rejections
    FROM moderation_votes WHERE moderation_id = ?
  `).bind(id).first<{ approvals: number; rejections: number }>();
  const threshold = approvalThreshold(env);
  if ((counts?.rejections ?? 0) >= threshold) {
    await env.DB.prepare("UPDATE moderation_actions SET status = 'rejected' WHERE id = ? AND status = 'pending'").bind(id).run();
  } else if ((counts?.approvals ?? 0) >= threshold) {
    await executeModeration(env, id);
  }
  const moderation = await moderationById(env, id);
  return json({ ok: true, moderation, counts, threshold });
}

async function reconcileModeration(request: Request, env: Env, id: number): Promise<Response> {
  await adminUser(request, env);
  const moderation = await executeModeration(env, id);
  if (!moderation) fail(404, "Moderation action not found.");
  return json({ ok: true, moderation });
}

function loopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function validWebSocketOrigin(request: Request): boolean {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return false;
  try {
    const origin = new URL(rawOrigin);
    const target = new URL(request.url);
    return origin.origin === target.origin || (loopback(origin.hostname) && loopback(target.hostname));
  } catch {
    return false;
  }
}

async function connectWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") fail(426, "WebSocket upgrade required.");
  if (!validWebSocketOrigin(request)) fail(403, "Invalid WebSocket origin.");
  const roomId = canonicalRoomId(url.searchParams.get("roomId"));
  const ticket = url.searchParams.get("ticket") ?? "";
  if (!/^[a-f0-9]{64}$/.test(ticket)) fail(401, "Invalid WebSocket ticket.");
  const now = Date.now();
  const ticketRow = await env.DB.prepare(`
    UPDATE websocket_tickets SET consumed_at = ?
    WHERE ticket_hash = ? AND room_id = ? AND consumed_at IS NULL AND expires_at > ?
      AND EXISTS (
        SELECT 1 FROM sessions
        WHERE sessions.id = websocket_tickets.session_id
          AND sessions.user_id = websocket_tickets.user_id
          AND sessions.revoked_at IS NULL
          AND sessions.access_expires_at > ?
      )
    RETURNING user_id AS userId, session_id AS sessionId
  `).bind(now, await sha256(ticket), roomId, now, now).first<{ userId: number; sessionId: string }>();
  if (!ticketRow) fail(401, "Invalid, expired, or used WebSocket ticket.");
  await assertRoomAccess(env, ticketRow.userId, roomId);
  const user = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?")
    .bind(ticketRow.userId).first<{ nickname: string }>();
  if (!user) fail(401, "Account not found.");
  const stub = await roomStub(env, roomId);
  return stub.fetch("https://internal/connect", {
    headers: {
      Upgrade: "websocket",
      "x-user-id": String(ticketRow.userId),
      "x-session-id": ticketRow.sessionId,
      "x-nickname": encodeURIComponent(user.nickname),
      "x-room-id": roomId,
    },
  });
}

async function staticAsset(request: Request, env: Env): Promise<Response> {
  const binding = Reflect.get(env, "ASSETS") as Fetcher | undefined;
  if (!binding) throw new Error("ASSETS binding is unavailable");
  const response = await binding.fetch(request);
  const responseHeaders = new Headers(response.headers);
  if ((responseHeaders.get("content-type") ?? "").toLowerCase().startsWith("text/html")) {
    const requestUrl = new URL(request.url);
    const webSocketOrigin = `${requestUrl.protocol === "https:" ? "wss:" : "ws:"}//${requestUrl.host}`;
    responseHeaders.set("Cache-Control", "no-cache");
    responseHeaders.set(
      "Content-Security-Policy",
      `default-src 'self'; base-uri 'none'; connect-src 'self' ${webSocketOrigin} https://*.picarto.tv https://picarto.tv https://api.picarto.tv https://ptvintern.picarto.tv wss://*.picarto.tv https://*.kick.com wss://*.kick.com https://kick.com; ` +
      "font-src 'self' https: data:; form-action 'self'; " +
      "frame-src 'self' https://player.kick.com https://kick.com https://*.kick.com https://picarto.tv https://*.picarto.tv https://*.twitch.tv https://www.youtube-nocookie.com https://www.youtube.com; " +
      "img-src 'self' data: blob: https:; " +
      "manifest-src 'self'; media-src 'self' blob: data: https: https://*.picarto.tv https://*.kick.com; object-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://edge1-us-losangeles.picarto.tv https://*.picarto.tv https://player.kick.com; style-src 'self' 'unsafe-inline' https:;",
    );
    responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
    responseHeaders.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self \"https://player.kick.com\" \"https://picarto.tv\" \"https://www.youtube-nocookie.com\")");
    responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Frame-Options", "SAMEORIGIN");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function listAdminUsers(request: Request, env: Env): Promise<Response> {
  await adminUser(request, env);
  const users = await env.DB.prepare(`
    SELECT u.id, u.email, u.nickname, u.created_at AS createdAt,
      (SELECT COUNT(*) FROM room_bans WHERE user_id = u.id) AS bansCount,
      (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND revoked_at IS NULL AND access_expires_at > ?) AS activeSessions
    FROM users u
    ORDER BY u.id ASC
    LIMIT 200
  `).bind(Date.now()).all<{
    id: number;
    email: string;
    nickname: string;
    createdAt: number;
    bansCount: number;
    activeSessions: number;
  }>();
  return json({
    ok: true,
    users: users.results.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      createdAt: new Date(u.createdAt).toISOString(),
      isAdmin: isAdmin(env, u.id),
      isModerator: isModerator(env, u.id),
      bansCount: u.bansCount,
      activeSessions: u.activeSessions,
    })),
  });
}

async function createAdminRoom(request: Request, env: Env): Promise<Response> {
  const admin = await adminUser(request, env);
  const body = await readJson(request);
  const name = stringField(body, "name", 1, 80);
  const description = body.description == null || body.description === "" ? null : stringField(body, "description", 1, 500);
  const initialChannel = body.initialChannel == null || body.initialChannel === "" ? null : stringField(body, "initialChannel", 1, 120);
  const id = canonicalRoomId(body.id ? String(body.id) : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const existing = await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(id).first<{ id: string }>();
  if (existing) fail(409, "A screening room with this ID already exists.");
  const createdAt = Date.now();
  await env.DB.prepare(`
    INSERT INTO rooms (id, name, description, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, name, description, admin.id, createdAt).run();
  await audit(env, admin.id, "room.created", id, { name, description });
  return json({ ok: true, room: { id, name, description, createdAt: new Date(createdAt).toISOString() } }, 201);
}

async function deleteAdminRoom(request: Request, env: Env, roomId: string): Promise<Response> {
  const admin = await adminUser(request, env);
  canonicalRoomId(roomId);
  if (roomId === "lobby") fail(400, "The lobby room cannot be deleted.");
  await audit(env, admin.id, "room.deleted", roomId, {});

  const cleanups = [
    "DELETE FROM canvas_strokes WHERE room_id = ?",
    "DELETE FROM canvas_state WHERE room_id = ?",
    "DELETE FROM messages WHERE room_id = ?",
    "DELETE FROM websocket_tickets WHERE room_id = ?",
    "DELETE FROM room_bans WHERE room_id = ?",
    "DELETE FROM moderation_actions WHERE room_id = ?",
    "DELETE FROM rooms WHERE id = ?",
  ];

  for (const sql of cleanups) {
    try {
      await env.DB.prepare(sql).bind(roomId).run();
    } catch {}
  }

  return json({ ok: true });
}

async function deleteChannelRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const actor = await moderatorUser(request, env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM channel_request_votes WHERE request_id = ?").bind(requestId),
    env.DB.prepare("DELETE FROM channel_requests WHERE id = ?").bind(requestId),
  ]);
  await audit(env, actor.id, "channel_request.deleted", requestId, {});
  return json({ ok: true, deleted: true, requestId });
}

async function deleteModerationProposal(request: Request, env: Env, proposalId: number): Promise<Response> {
  const actor = await moderatorUser(request, env);
  await audit(env, actor.id, "moderation_proposal.deleted", String(proposalId), {});
  await env.DB.batch([
    env.DB.prepare("DELETE FROM room_bans WHERE moderation_id = ?").bind(proposalId),
    env.DB.prepare("DELETE FROM moderation_votes WHERE moderation_id = ?").bind(proposalId),
    env.DB.prepare("DELETE FROM moderation_actions WHERE id = ?").bind(proposalId),
  ]);
  return json({ ok: true, deleted: true, proposalId });
}

async function overrideChannelRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const admin = await moderatorUser(request, env);
  const body = await readJson(request);
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject" && decision !== "delete") {
    fail(400, "Decision must be approve, reject, or delete.");
  }
  if (decision === "delete") {
    return deleteChannelRequest(request, env, requestId);
  }
  const target = await env.DB.prepare(`
    SELECT id, name, description, reason, requested_by AS requestedBy, status
    FROM channel_requests WHERE id = ?
  `).bind(requestId).first<{ id: string; name: string; description: string | null; reason: string; requestedBy: number; status: string }>();
  if (!target) fail(404, "Channel request not found.");
  const newStatus = decision === "approve" ? "approved" : "rejected";
  const now = Date.now();
  await env.DB.prepare("UPDATE channel_requests SET status = ?, resolved_at = ? WHERE id = ?").bind(newStatus, now, requestId).run();
  if (newStatus === "approved") {
    const roomId = target.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (roomId) {
      await env.DB.prepare(`
        INSERT INTO rooms (id, name, description, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
      `).bind(roomId, target.name, target.description, admin.id, now).run();
    }
  }
  await audit(env, admin.id, "channel_request.override", requestId, { decision });
  return json({ ok: true, status: newStatus });
}

async function revokeUserSessions(request: Request, env: Env, userId: number): Promise<Response> {
  const admin = await adminUser(request, env);
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(Date.now(), userId).run();
  await audit(env, admin.id, "user.sessions_revoked", String(userId), {});
  return json({ ok: true });
}

async function performUserDeletion(env: Env, targetUserId: number, fallbackAdminId?: number): Promise<void> {
  // 1. Safely handle custom_emojis foreign key
  let reassignAdmin: number | null = null;
  if (fallbackAdminId && fallbackAdminId !== targetUserId) {
    reassignAdmin = fallbackAdminId;
  } else {
    try {
      const otherUser = await env.DB.prepare("SELECT id FROM users WHERE id != ? ORDER BY id ASC LIMIT 1").bind(targetUserId).first<{ id: number }>();
      if (otherUser) reassignAdmin = otherUser.id;
    } catch {}
  }

  if (reassignAdmin) {
    try {
      await env.DB.prepare("UPDATE custom_emojis SET uploaded_by = ? WHERE uploaded_by = ?").bind(reassignAdmin, targetUserId).run();
    } catch {
      try {
        await env.DB.prepare("DELETE FROM custom_emojis WHERE uploaded_by = ?").bind(targetUserId).run();
      } catch {}
    }
  } else {
    try {
      await env.DB.prepare("DELETE FROM custom_emojis WHERE uploaded_by = ?").bind(targetUserId).run();
    } catch {}
  }

  try {
    await env.DB.prepare("UPDATE custom_emojis SET disabled_by = NULL WHERE disabled_by = ?").bind(targetUserId).run();
  } catch {}

  // 2. Clear nullable references in rooms and streams
  try {
    await env.DB.prepare("UPDATE rooms SET created_by = NULL WHERE created_by = ?").bind(targetUserId).run();
  } catch {}

  try {
    await env.DB.prepare("UPDATE stream_provenance SET curator_id = NULL WHERE curator_id = ?").bind(targetUserId).run();
  } catch {}

  // 3. Delete dependent child records in strict foreign-key order
  const cleanupQueries = [
    // Delete votes on channel requests requested by targetUser or voted on by targetUser
    { sql: "DELETE FROM channel_request_votes WHERE voter_id = ? OR request_id IN (SELECT id FROM channel_requests WHERE requested_by = ?)", binds: [targetUserId, targetUserId] },
    { sql: "DELETE FROM channel_requests WHERE requested_by = ?", binds: [targetUserId] },
    // Delete votes and bans on moderation actions requested by or against targetUser, or voted on by targetUser
    { sql: "DELETE FROM moderation_votes WHERE voter_id = ? OR moderation_id IN (SELECT id FROM moderation_actions WHERE target_user_id = ? OR requested_by = ?)", binds: [targetUserId, targetUserId, targetUserId] },
    { sql: "DELETE FROM room_bans WHERE user_id = ? OR moderation_id IN (SELECT id FROM moderation_actions WHERE target_user_id = ? OR requested_by = ?)", binds: [targetUserId, targetUserId, targetUserId] },
    { sql: "DELETE FROM moderation_actions WHERE target_user_id = ? OR requested_by = ?", binds: [targetUserId, targetUserId] },
    { sql: "DELETE FROM approval_quotas WHERE user_id = ?", binds: [targetUserId] },
    { sql: "DELETE FROM canvas_strokes WHERE user_id = ?", binds: [targetUserId] },
    { sql: "DELETE FROM messages WHERE user_id = ?", binds: [targetUserId] },
    { sql: "DELETE FROM websocket_tickets WHERE user_id = ?", binds: [targetUserId] },
    { sql: "DELETE FROM sessions WHERE user_id = ?", binds: [targetUserId] },
    { sql: "DELETE FROM audit_log WHERE actor_id = ?", binds: [targetUserId] },
  ];

  for (const q of cleanupQueries) {
    try {
      await env.DB.prepare(q.sql).bind(...q.binds).run();
    } catch {
      // Catch any individual table error gracefully
    }
  }

  // 4. Delete the user record
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();

  // 5. Disconnect active websockets in all rooms
  try {
    const rooms = await env.DB.prepare("SELECT id FROM rooms").all<{ id: string }>();
    if (rooms.results) {
      await Promise.allSettled(rooms.results.map(async (r) => {
        try {
          const stub = await roomStub(env, r.id);
          await stub.fetch("https://internal/ban", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: targetUserId }),
          });
        } catch {}
      }));
    }
  } catch {}
}

async function deleteSelfAccount(request: Request, env: Env): Promise<Response> {
  const user = await bearerUser(request, env);
  if (configuredAdmins(env).has(user.id)) fail(400, "Configured administrator accounts cannot be deleted.");

  const fallbackAdmin = Array.from(configuredAdmins(env))[0] ?? 1;
  await audit(env, fallbackAdmin, "user.self_deleted", String(user.id), { email: user.email, nickname: user.nickname });
  await performUserDeletion(env, user.id, fallbackAdmin);

  return json({ ok: true, deleted: true });
}

async function deleteAdminUser(request: Request, env: Env, userId: number): Promise<Response> {
  const admin = await adminUser(request, env);
  if (admin.id === userId) fail(400, "You cannot delete your own administrator account.");

  const target = await env.DB.prepare("SELECT id, nickname, email FROM users WHERE id = ?").bind(userId).first<{ id: number; nickname: string; email: string }>();
  if (!target) fail(404, "User not found.");

  await audit(env, admin.id, "user.deleted", String(userId), { nickname: target.nickname, email: target.email });
  await performUserDeletion(env, userId, admin.id);

  return json({ ok: true, deleted: true, userId });
}

async function purgeNonHostAccounts(request: Request, env: Env): Promise<Response> {
  const host = await adminUser(request, env);
  const otherUsers = await env.DB.prepare("SELECT id, email, nickname FROM users WHERE id != ?").bind(host.id).all<{ id: number; email: string; nickname: string }>();

  let purgedCount = 0;
  if (otherUsers.results) {
    for (const other of otherUsers.results) {
      await performUserDeletion(env, other.id, host.id);
      purgedCount += 1;
    }
  }

  await audit(env, host.id, "users.purge_non_host", String(host.id), { purgedCount });
  return json({
    ok: true,
    purgedCount,
    preservedHost: {
      id: host.id,
      email: host.email,
      nickname: host.nickname,
    },
  });
}

async function listAuditLog(request: Request, env: Env): Promise<Response> {
  await adminUser(request, env);
  const rows = await env.DB.prepare(`
    SELECT a.id, a.actor_id AS actorId, u.nickname AS actorNickname, a.event, a.subject, a.details, a.created_at AS createdAt
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.id DESC
    LIMIT 150
  `).all<{
    id: number;
    actorId: number;
    actorNickname: string | null;
    event: string;
    subject: string;
    details: string;
    createdAt: number;
  }>();
  return json({
    ok: true,
    logs: rows.results.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorNickname: row.actorNickname || `User #${row.actorId}`,
      event: row.event,
      subject: row.subject,
      details: (() => {
        try { return JSON.parse(row.details); } catch { return row.details; }
      })(),
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  });
}

async function boundarizeSource(request: Request, env: Env): Promise<Response> {
  const curator = await moderatorUser(request, env);
  const body = await readJson(request);
  const sourceId = stringField(body, "sourceId", 1, 128);
  const canonical = STREAM_SOURCES.find((s) => s.id === sourceId);

  const guild = stringField(body, "guild", 1, 32);
  if (guild !== "guild_projectionist" && guild !== "guild_community" && guild !== "guild_archivist" && guild !== "unboundarized") {
    fail(400, "Invalid guild tier.");
  }
  const trustTier = stringField(body, "trustTier", 1, 32);
  if (trustTier !== "official" && trustTier !== "trusted_member" && trustTier !== "probationary" && trustTier !== "quarantined") {
    fail(400, "Invalid trust tier.");
  }
  const platform = (body.platform ? stringField(body, "platform", 1, 32) : (canonical?.platform || (sourceId.includes(":") ? sourceId.split(":")[0] : "kick"))) as StreamPlatform;
  let channel = body.channel ? stringField(body, "channel", 1, 80) : (canonical?.channel || (sourceId.includes(":") ? sourceId.split(":")[1] : sourceId));
  let originDomain = body.originDomain ? stringField(body, "originDomain", 1, 120) : (canonical ? (canonical.platform === "picarto" ? "picarto.tv" : canonical.platform === "owncast" ? (canonical.watchUrl ? new URL(canonical.watchUrl).host : "stream.custom.org") : "kick.com") : (platform === "picarto" ? "picarto.tv" : platform === "owncast" ? "stream.custom.org" : "kick.com"));
  const name = body.name ? stringField(body, "name", 1, 80) : (canonical?.name || sourceId);
  const description = body.description !== undefined ? stringField(body, "description", 0, 500) : (canonical?.description || "");
  const watchUrl = body.watchUrl ? stringField(body, "watchUrl", 1, 300) : (canonical?.watchUrl || (platform === "owncast" ? `https://${originDomain}` : `https://${originDomain}/${channel}`));
  const embedUrl = body.embedUrl !== undefined ? (body.embedUrl ? stringField(body, "embedUrl", 1, 500) : null) : (canonical?.embedUrl || (platform === "owncast" ? `https://${originDomain}/embed/video` : null));
  const hlsUrl = body.hlsUrl !== undefined ? (body.hlsUrl ? stringField(body, "hlsUrl", 1, 500) : null) : (canonical?.hlsUrl || (platform === "owncast" ? `https://${originDomain}/hls/stream.m3u8` : null));
  const attestationNotes = body.attestationNotes ? stringField(body, "attestationNotes", 1, 500) : null;
  const boundaryTags = Array.isArray(body.boundaryTags) ? JSON.stringify(body.boundaryTags) : JSON.stringify(["community-verified"]);
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO stream_provenance (
      id, platform, channel, name, description, watch_url, embed_url, hls_url,
      guild, trust_tier, origin_domain, curator_id, attestation_notes, boundary_tags, verified_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      platform = excluded.platform,
      channel = excluded.channel,
      watch_url = excluded.watch_url,
      embed_url = excluded.embed_url,
      hls_url = excluded.hls_url,
      guild = excluded.guild,
      trust_tier = excluded.trust_tier,
      origin_domain = excluded.origin_domain,
      curator_id = excluded.curator_id,
      attestation_notes = excluded.attestation_notes,
      boundary_tags = excluded.boundary_tags,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  `).bind(
    sourceId, platform, channel, name, description, watchUrl, embedUrl, hlsUrl,
    guild, trustTier, originDomain, curator.id, attestationNotes, boundaryTags, now, now
  ).run();

  await purgeStreamDirectoryCache(request);
  await audit(env, curator.id, "provenance.boundarized", sourceId, { name, guild, trustTier, originDomain, platform, channel });
  return json({ ok: true, sourceId, name, guild, trustTier });
}

async function quarantineSource(request: Request, env: Env): Promise<Response> {
  const curator = await moderatorUser(request, env);
  const body = await readJson(request);
  const sourceId = stringField(body, "sourceId", 1, 128);
  const reason = stringField(body, "reason", 1, 500);
  const canonical = STREAM_SOURCES.find((s) => s.id === sourceId);
  const now = Date.now();

  const platform = canonical?.platform || (sourceId.includes(":") ? sourceId.split(":")[0] : "kick");
  const channel = canonical?.channel || (sourceId.includes(":") ? sourceId.split(":")[1] : sourceId);
  const name = canonical?.name || sourceId;
  const watchUrl = canonical?.watchUrl || `https://${sourceId}`;
  const originDomain = canonical ? (canonical.platform === "picarto" ? "picarto.tv" : canonical.platform === "owncast" ? (canonical.watchUrl ? new URL(canonical.watchUrl).host : "stream.custom.org") : "kick.com") : "quarantined-origin";

  await env.DB.prepare(`
    INSERT INTO stream_provenance (
      id, platform, channel, name, description, watch_url, embed_url, hls_url,
      guild, trust_tier, origin_domain, curator_id, attestation_notes, boundary_tags, verified_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unboundarized', 'quarantined', ?, ?, ?, ?, NULL, ?)
    ON CONFLICT (id) DO UPDATE SET
      guild = 'unboundarized',
      trust_tier = 'quarantined',
      attestation_notes = excluded.attestation_notes,
      updated_at = excluded.updated_at
  `).bind(
    sourceId,
    platform,
    channel,
    name,
    canonical?.description || null,
    watchUrl,
    canonical?.embedUrl || null,
    canonical?.hlsUrl || null,
    originDomain,
    curator.id,
    `Quarantined: ${reason}`,
    JSON.stringify(["quarantined"]),
    now
  ).run();

  await purgeStreamDirectoryCache(request);
  await audit(env, curator.id, "provenance.quarantined", sourceId, { reason });
  return json({ ok: true, sourceId, status: "quarantined" });
}

async function deleteSource(request: Request, env: Env): Promise<Response> {
  const curator = await moderatorUser(request, env);
  const body = await readJson(request);
  const sourceId = stringField(body, "sourceId", 1, 128);
  const canonical = STREAM_SOURCES.find((s) => s.id === sourceId);
  const now = Date.now();

  const platform = canonical?.platform || (sourceId.includes(":") ? sourceId.split(":")[0] : "custom");
  const channel = canonical?.channel || (sourceId.includes(":") ? sourceId.split(":")[1] : "deleted");
  const name = canonical?.name || "Deleted Stream";
  const watchUrl = canonical?.watchUrl || "";
  const originDomain = canonical ? (canonical.platform === "picarto" ? "picarto.tv" : canonical.platform === "owncast" ? (canonical.watchUrl ? new URL(canonical.watchUrl).host : "stream.custom.org") : "kick.com") : "deleted";

  await env.DB.prepare(`
    INSERT INTO stream_provenance (
      id, platform, channel, name, description, watch_url, embed_url, hls_url,
      guild, trust_tier, origin_domain, curator_id, attestation_notes, boundary_tags, verified_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, 'unboundarized', 'deleted', ?, ?, 'Deleted by moderator', NULL, NULL, ?)
    ON CONFLICT (id) DO UPDATE SET
      trust_tier = 'deleted',
      attestation_notes = 'Deleted by moderator',
      updated_at = excluded.updated_at
  `).bind(
    sourceId,
    platform,
    channel,
    name,
    watchUrl,
    originDomain,
    curator.id,
    now
  ).run();

  await purgeStreamDirectoryCache(request);
  await audit(env, curator.id, "provenance.deleted", sourceId, { sourceId });
  return json({ ok: true, sourceId });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  if (method === "GET" && url.pathname === "/api/health") return json({ ok: true });
  if (method === "GET" && url.pathname === "/api/streams") return listStreams(request, env, false);
  if (method === "GET" && url.pathname === "/api/provenance/sources") return listStreams(request, env, true);
  if (method === "POST" && url.pathname === "/api/admin/provenance/boundarize") return boundarizeSource(request, env);
  if (method === "POST" && url.pathname === "/api/admin/provenance/quarantine") return quarantineSource(request, env);
  if (method === "POST" && url.pathname === "/api/admin/provenance/delete") return deleteSource(request, env);
  if (method === "GET" && url.pathname === "/api/proxy/picarto") return proxyPicartoEmbed(request);
  if (method === "GET" && url.pathname === "/api/proxy/kick") return proxyKickEmbed(request);
  if (method === "GET" && (url.pathname.startsWith("/static/") || url.pathname.startsWith("/streampopout/") || url.pathname.startsWith("/stream/"))) {
    return proxyPicartoAsset(request);
  }
  if (method === "POST" && url.pathname === "/api/auth/signup") return signup(request, env);
  if (method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
  if (method === "POST" && url.pathname === "/api/auth/refresh") return refresh(request, env);
  if (method === "POST" && url.pathname === "/api/auth/logout") return logout(request, env);
  if (method === "GET" && (url.pathname === "/api/auth/me" || url.pathname === "/api/user/me")) {
    const user = await bearerUser(request, env);
    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        isAdmin: isAdmin(env, user.id),
        isModerator: isModerator(env, user.id),
      },
    });
  }
  if (method === "DELETE" && (url.pathname === "/api/auth/me" || url.pathname === "/api/user/me" || url.pathname === "/api/auth/account")) {
    return deleteSelfAccount(request, env);
  }
  if (method === "GET" && url.pathname === "/api/rooms") return listRooms(request, env);
  if (method === "POST" && url.pathname === "/api/rooms") {
    await bearerUser(request, env);
    return json({
      ok: false,
      error: "Channel creation requires moderator approval. Use the channel request box.",
      requestBox: "/api/channel-requests",
    }, 405);
  }
  if (method === "GET" && url.pathname === "/api/admin/users") return listAdminUsers(request, env);
  if (method === "POST" && url.pathname === "/api/admin/rooms") return createAdminRoom(request, env);
  const deleteRoom = url.pathname.match(/^\/api\/admin\/rooms\/([a-z0-9-]{1,64})$/);
  if (method === "DELETE" && deleteRoom) return deleteAdminRoom(request, env, deleteRoom[1]);
  if (method === "GET" && url.pathname === "/api/admin/audit-log") return listAuditLog(request, env);
  const overrideChannel = url.pathname.match(/^\/api\/admin\/channel-requests\/([0-9a-fA-F-]{36})\/override$/);
  if (method === "POST" && overrideChannel && SESSION_ID.test(overrideChannel[1])) {
    return overrideChannelRequest(request, env, overrideChannel[1].toLowerCase());
  }
  const deleteChannel = url.pathname.match(/^\/api\/(?:admin\/)?channel-requests\/([0-9a-fA-F-]{36})$/);
  if (method === "DELETE" && deleteChannel && SESSION_ID.test(deleteChannel[1])) {
    return deleteChannelRequest(request, env, deleteChannel[1].toLowerCase());
  }
  const revokeUser = url.pathname.match(/^\/api\/admin\/users\/([1-9][0-9]*)\/revoke-sessions$/);
  if (method === "POST" && revokeUser) {
    return revokeUserSessions(request, env, positiveInteger(revokeUser[1], "userId"));
  }
  const deleteUser = url.pathname.match(/^\/api\/admin\/users\/([1-9][0-9]*)$/);
  if (method === "DELETE" && deleteUser) {
    return deleteAdminUser(request, env, positiveInteger(deleteUser[1], "userId"));
  }
  if (method === "POST" && url.pathname === "/api/admin/users/purge-non-host") {
    return purgeNonHostAccounts(request, env);
  }
  if (method === "GET" && url.pathname === "/api/channel-requests") return listChannelRequests(request, env);
  if (method === "POST" && url.pathname === "/api/channel-requests") return createChannelRequest(request, env);
  const channelRequestVote = url.pathname.match(/^\/api\/channel-requests\/([0-9a-fA-F-]{36})\/votes$/);
  if (method === "POST" && channelRequestVote && SESSION_ID.test(channelRequestVote[1])) {
    return voteChannelRequest(request, env, channelRequestVote[1].toLowerCase());
  }
  if (method === "GET" && url.pathname === "/api/messages") return listMessages(request, env, url);
  const roomChatters = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]{1,64})\/chatters$/);
  if (method === "GET" && roomChatters) {
    const roomId = canonicalRoomId(roomChatters[1]);
    const id = env.CHAT_ROOMS.idFromName(roomId);
    const stub = env.CHAT_ROOMS.get(id);
    const res = await stub.fetch("https://chat.internal/chatters");
    const data = await res.json<{ ok: boolean; chatters: ChatterView[] }>();
    return json(data);
  }
  if (method === "POST" && url.pathname === "/api/messages") return createMessage(request, env);
  if (method === "POST" && url.pathname === "/api/ws-ticket") return issueTicket(request, env);
  if (method === "GET" && url.pathname === "/api/emojis") return emojiCatalog(request, env);
  if (method === "POST" && url.pathname === "/api/admin/emojis") return uploadEmoji(request, env);
  const emojiImage = url.pathname.match(/^\/api\/emojis\/([0-9a-fA-F-]{36})\/image$/);
  if (method === "GET" && emojiImage && SESSION_ID.test(emojiImage[1])) return serveEmoji(request, env, emojiImage[1].toLowerCase());
  const emojiAdmin = url.pathname.match(/^\/api\/admin\/emojis\/([0-9a-fA-F-]{36})$/);
  if (method === "DELETE" && emojiAdmin && SESSION_ID.test(emojiAdmin[1])) {
    return disableEmoji(request, env, emojiAdmin[1].toLowerCase());
  }
  if (method === "POST" && url.pathname === "/api/admin/quotas/allocate") return allocateQuota(request, env);
  if (method === "GET" && url.pathname === "/api/admin/moderation") return listModeration(request, env, url);
  const roomModeration = url.pathname.match(/^\/api\/admin\/rooms\/([a-z0-9-]{1,64})\/moderation$/);
  if (method === "POST" && roomModeration) return createModeration(request, env, canonicalRoomId(roomModeration[1]));
  const vote = url.pathname.match(/^\/api\/admin\/moderation\/([1-9][0-9]*)\/votes$/);
  if (method === "POST" && vote) return castVote(request, env, positiveInteger(vote[1], "moderationId"));
  const reconcile = url.pathname.match(/^\/api\/admin\/moderation\/([1-9][0-9]*)\/reconcile$/);
  if (method === "POST" && reconcile) return reconcileModeration(request, env, positiveInteger(reconcile[1], "moderationId"));
  const deleteModeration = url.pathname.match(/^\/api\/admin\/moderation\/([1-9][0-9]*)$/);
  if (method === "DELETE" && deleteModeration) {
    return deleteModerationProposal(request, env, positiveInteger(deleteModeration[1], "moderationId"));
  }
  const detail = url.pathname.match(/^\/api\/admin\/moderation\/([1-9][0-9]*)$/);
  if (method === "GET" && detail) return moderationDetail(request, env, positiveInteger(detail[1], "moderationId"));
  if (method === "GET" && url.pathname === "/ws") return connectWebSocket(request, env, url);
  if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found." }, 404);
  if ((method === "GET" || method === "HEAD") && (
    url.pathname === "/faq" || url.pathname === "/faq/" ||
    url.pathname === "/admin" || url.pathname === "/admin/" ||
    url.pathname === "/mod" || url.pathname === "/mod/" ||
    url.pathname === "/popout-chat" || url.pathname === "/popout-chat/" ||
    url.pathname === "/popout-canvas" || url.pathname === "/popout-canvas/" ||
    url.pathname === "/popout-stage" || url.pathname === "/popout-stage/" ||
    (!url.pathname.startsWith("/assets/") && !url.pathname.includes("."))
  )) {
    return staticAsset(new Request(new URL("/", url), {
      method,
      headers: request.headers,
      redirect: request.redirect,
    }), env);
  }
  return staticAsset(request, env);
}

export class ChatRoom extends DurableObject<Env> {
  private canvasQueue: Promise<void> = Promise.resolve();

  private serializeCanvas<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.canvasQueue.then(operation, operation);
    this.canvasQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private getActiveChatters(): ChatterView[] {
    const sockets = this.ctx.getWebSockets();
    const map = new Map<number, ChatterView>();
    for (const socket of sockets) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment && !map.has(attachment.userId)) {
        map.set(attachment.userId, {
          userId: attachment.userId,
          nickname: attachment.nickname,
          isAdmin: isAdmin(this.env, attachment.userId),
          isModerator: isModerator(this.env, attachment.userId),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nickname.localeCompare(b.nickname));
  }

  private async broadcastChatters(roomId: string): Promise<void> {
    const chatters = this.getActiveChatters();
    await this.broadcast(JSON.stringify({
      type: "presence",
      roomId,
      chatters,
    }));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/chatters" && request.method === "GET") {
      const chatters = this.getActiveChatters();
      return json({ ok: true, chatters });
    }
    if (url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
      const userId = Number(request.headers.get("x-user-id"));
      const sessionId = request.headers.get("x-session-id") ?? "";
      const roomId = request.headers.get("x-room-id") ?? "";
      const encodedNickname = request.headers.get("x-nickname") ?? "";
      if (!Number.isSafeInteger(userId) || userId < 1 || !SESSION_ID.test(sessionId) || !ROOM_ID.test(roomId)) {
        return new Response("Invalid connection", { status: 400 });
      }
      let nickname: string;
      try {
        nickname = decodeURIComponent(encodedNickname);
      } catch {
        return new Response("Invalid connection", { status: 400 });
      }
      if (!nickname || nickname.length > 48) return new Response("Invalid connection", { status: 400 });
      return this.serializeCanvas(async () => {
        const activeSession = await this.env.DB.prepare(`
          SELECT 1 AS active FROM sessions
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
            AND NOT EXISTS (
              SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
            )
        `).bind(sessionId, userId, Date.now(), roomId, userId).first<{ active: number }>();
        if (!activeSession) return new Response("Invalid session or room access", { status: 401 });
        const existingSockets = this.ctx.getWebSockets();
        if (existingSockets.length >= MAX_ROOM_SOCKETS) {
          return new Response("Room connection limit reached", { status: 429 });
        }
        if (this.ctx.getWebSockets(`user:${userId}`).length >= MAX_USER_ROOM_SOCKETS) {
          return new Response("User connection limit reached", { status: 429 });
        }
        const canvasSnapshot = await this.canvasSnapshot(roomId);
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        const attachment: SocketAttachment = {
          userId,
          sessionId,
          nickname,
          roomId,
          windowStartedAt: Date.now(),
          messagesInWindow: 0,
          canvasWindowStartedAt: Date.now(),
          canvasFramesInWindow: 0,
        };
        server.serializeAttachment(attachment);
        this.ctx.acceptWebSocket(server, [`user:${userId}`, `session:${sessionId}`]);
        server.send(JSON.stringify({
          type: "canvas_snapshot",
          roomId,
          epoch: canvasSnapshot.epoch,
          strokes: canvasSnapshot.strokes,
          refillTimestamp: canvasSnapshot.refillTimestamp,
          hoursRemaining: canvasSnapshot.hoursRemaining,
        }));
        server.send(JSON.stringify({
          type: "presence",
          roomId,
          chatters: this.getActiveChatters(),
        }));
        await this.broadcastChatters(roomId);
        return new Response(null, { status: 101, webSocket: client });
      });
    }
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.message || typeof body.message !== "object") return new Response("Invalid", { status: 400 });
      await this.broadcast(JSON.stringify({ type: "chat", message: body.message }));
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/ban" && request.method === "POST") {
      const body = await readJson(request);
      const userId = Number(body.userId);
      if (!Number.isSafeInteger(userId)) return new Response("Invalid", { status: 400 });
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (attachment?.userId === userId) socket.close(1008, "Removed from room");
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/revoke" && request.method === "POST") {
      const body = await readJson(request);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
      if (!SESSION_ID.test(sessionId)) return new Response("Invalid", { status: 400 });
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (attachment?.sessionId === sessionId) {
          socket.close(1008, "Session revoked");
        }
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      const body = await readJson(request);
      await this.broadcast(JSON.stringify(body));
      return new Response(null, { status: 204 });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, payload: string | ArrayBuffer): Promise<void> {
    if (typeof payload !== "string" || encoder.encode(payload).byteLength > JSON_LIMIT) {
      socket.close(1009, "Message too large");
      return;
    }
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      socket.close(1008, "Invalid session");
      return;
    }
    let body: JsonObject;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as JsonObject;
    } catch {
      socket.close(1003, "Invalid JSON");
      return;
    }
    if (body.type === "canvas_stroke") {
      const now = Date.now();
      if (now - (attachment.canvasWindowStartedAt ?? now) >= 10_000) {
        attachment.canvasWindowStartedAt = now;
        attachment.canvasFramesInWindow = 0;
      }
      attachment.canvasWindowStartedAt ??= now;
      attachment.canvasFramesInWindow = (attachment.canvasFramesInWindow ?? 0) + 1;
      socket.serializeAttachment(attachment);
      if (attachment.canvasFramesInWindow > MAX_CANVAS_SOCKET_FRAMES) {
        socket.close(1008, "Canvas rate limit exceeded");
        return;
      }
      try {
        const strokeInput = canvasStrokeInput(body, attachment.roomId);
        await this.serializeCanvas(async () => {
          const persisted = await this.persistCanvasStroke(attachment, strokeInput);
          if (!persisted) {
            socket.close(1008, "Session expired or room access revoked");
            return;
          }
          const event = JSON.stringify({
            type: "canvas_stroke",
            roomId: attachment.roomId,
            epoch: persisted.epoch,
            stroke: persisted.stroke,
          });
          if (persisted.inserted) await this.broadcast(event);
          else socket.send(event);
        });
      } catch (error) {
        if (error instanceof HttpError) {
          socket.close(1008, error.status === 429 ? "Canvas rate limit exceeded" : "Invalid canvas stroke");
          return;
        }
        throw error;
      }
      return;
    }
    if (body.type !== "chat" || body.roomId !== attachment.roomId || typeof body.text !== "string") {
      socket.close(1008, "Invalid message");
      return;
    }
    const now = Date.now();
    if (now - attachment.windowStartedAt >= 10_000) {
      attachment.windowStartedAt = now;
      attachment.messagesInWindow = 0;
    }
    attachment.messagesInWindow += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messagesInWindow > 10) {
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    const text = body.text.trim();
    if (!text || text.length > MESSAGE_LIMIT) {
      socket.close(1008, "Invalid message");
      return;
    }
    const activeSession = await this.env.DB.prepare(`
      SELECT 1 AS active FROM sessions
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
    `).bind(attachment.sessionId, attachment.userId, Date.now()).first<{ active: number }>();
    if (!activeSession) {
      socket.close(1008, "Session expired");
      return;
    }
    const ban = await this.env.DB.prepare("SELECT 1 AS banned FROM room_bans WHERE room_id = ? AND user_id = ?")
      .bind(attachment.roomId, attachment.userId).first<{ banned: number }>();
    if (ban) {
      socket.close(1008, "Removed from room");
      return;
    }
    try {
      await rateLimit(this.env.DB, `message:${attachment.roomId}:${attachment.userId}`, 30, 10 * 1_000);
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        socket.close(1008, "Rate limit exceeded");
        return;
      }
      throw error;
    }
    const createdAt = Date.now();
    const row = await this.env.DB.prepare(`
      INSERT INTO messages (room_id, user_id, text, created_at)
      SELECT ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM sessions
        WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
      ) AND NOT EXISTS (
        SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
      )
      RETURNING id
    `).bind(
      attachment.roomId, attachment.userId, text, createdAt,
      attachment.sessionId, attachment.userId, createdAt,
      attachment.roomId, attachment.userId,
    ).first<{ id: number }>();
    if (!row) {
      socket.close(1008, "Session expired or room access revoked");
      return;
    }
    const message: MessageView = {
      id: row.id,
      roomId: attachment.roomId,
      author: attachment.nickname,
      text,
      createdAt: new Date(createdAt).toISOString(),
    };
    await this.broadcast(JSON.stringify({ type: "chat", message }));
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) {
      await this.broadcastChatters(attachment.roomId);
    }
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, "WebSocket error");
  }

  private async canvasSnapshot(roomId: string): Promise<{
    epoch: number;
    strokes: CanvasStrokeView[];
    refillTimestamp: number;
    hoursRemaining: number;
  }> {
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const nextRefillAt = (Math.floor(now / 86400000) + 1) * 86400000;
    const hoursRemaining = Math.max(1, Math.ceil((nextRefillAt - now) / 3600000));

    const [state, strokes] = await Promise.all([
      this.env.DB.prepare("SELECT version FROM canvas_state WHERE room_id = ?")
        .bind(roomId).first<{ version: number }>(),
      this.env.DB.prepare(`
        SELECT id, room_id AS roomId, page_index AS pageIndex, client_id AS clientId, user_id AS userId, author,
          tool, color, width, points_json AS pointsJson, created_at AS createdAt
        FROM canvas_strokes
        WHERE room_id = ? AND created_at >= ?
        ORDER BY id DESC
        LIMIT ?
      `).bind(roomId, cutoff24h, MAX_CANVAS_STROKES * 5).all<CanvasStrokeRow>(),
    ]);
    if (!state) throw new Error("Canvas state is unavailable");
    return {
      epoch: state.version,
      strokes: strokes.results.reverse().map(canvasStrokeView),
      refillTimestamp: nextRefillAt,
      hoursRemaining,
    };
  }

  private async persistCanvasStroke(
    attachment: SocketAttachment,
    input: CanvasStrokeInput,
  ): Promise<{ inserted: boolean; epoch: number; stroke: CanvasStrokeView } | null> {
    await rateLimit(
      this.env.DB,
      `canvas:user:${attachment.roomId}:${attachment.userId}`,
      MAX_CANVAS_USER_FRAMES,
      10_000,
    );
    await rateLimit(this.env.DB, `canvas:room:${attachment.roomId}`, MAX_CANVAS_ROOM_FRAMES, 10_000);
    const createdAt = Date.now();
    const cutoff24h = createdAt - 24 * 60 * 60 * 1000;
    const pointsJson = JSON.stringify(input.points);
    const pageIndex = Math.min(5, Math.max(1, input.pageIndex || 1));

    const results = await this.env.DB.batch<CanvasStrokeRow>([
      this.env.DB.prepare(`
        INSERT INTO canvas_strokes
          (room_id, page_index, client_id, user_id, author, tool, color, width, points_json, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM sessions
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
        ) AND NOT EXISTS (
          SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
        ) AND EXISTS (
          SELECT 1 FROM canvas_state WHERE room_id = ?
        )
        ON CONFLICT(room_id, user_id, client_id) DO NOTHING
        RETURNING id, room_id AS roomId, page_index AS pageIndex, client_id AS clientId, user_id AS userId, author,
          tool, color, width, points_json AS pointsJson, created_at AS createdAt
      `).bind(
        attachment.roomId, pageIndex, input.clientId, attachment.userId, attachment.nickname,
        input.tool, input.color, input.width, pointsJson, createdAt,
        attachment.sessionId, attachment.userId, createdAt,
        attachment.roomId, attachment.userId,
        attachment.roomId,
      ),
      this.env.DB.prepare(`
        DELETE FROM canvas_strokes
        WHERE room_id = ? AND (
          created_at < ? OR
          id NOT IN (
            SELECT id FROM canvas_strokes WHERE room_id = ? AND page_index = ? ORDER BY id DESC LIMIT ?
          )
        ) AND EXISTS (
          SELECT 1 FROM sessions
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
        ) AND NOT EXISTS (
          SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
        )
      `).bind(
        attachment.roomId, cutoff24h,
        attachment.roomId, pageIndex, MAX_CANVAS_STROKES,
        attachment.sessionId, attachment.userId, createdAt,
        attachment.roomId, attachment.userId,
      ),
      this.env.DB.prepare(`
        UPDATE canvas_state SET updated_at = ?
        WHERE room_id = ? AND EXISTS (
          SELECT 1 FROM canvas_strokes
          WHERE room_id = ? AND user_id = ? AND client_id = ? AND created_at = ?
        )
      `).bind(
        createdAt, attachment.roomId, attachment.roomId, attachment.userId, input.clientId, createdAt,
      ),
      this.env.DB.prepare(`
        SELECT id, room_id AS roomId, page_index AS pageIndex, client_id AS clientId, user_id AS userId, author,
          tool, color, width, points_json AS pointsJson, created_at AS createdAt
        FROM canvas_strokes
        WHERE room_id = ? AND user_id = ? AND client_id = ?
          AND EXISTS (
            SELECT 1 FROM sessions
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND access_expires_at > ?
          ) AND NOT EXISTS (
            SELECT 1 FROM room_bans WHERE room_id = ? AND user_id = ?
          )
      `).bind(
        attachment.roomId, attachment.userId, input.clientId,
        attachment.sessionId, attachment.userId, createdAt,
        attachment.roomId, attachment.userId,
      ),
    ]);
    const inserted = results[0].results.length === 1;
    const row = results[0].results[0] ?? results[3].results[0];
    if (!row) return null;
    const state = await this.env.DB.prepare("SELECT version AS epoch FROM canvas_state WHERE room_id = ?")
      .bind(attachment.roomId).first<{ epoch: number }>();
    return state ? { inserted, epoch: state.epoch, stroke: canvasStrokeView(row) } : null;
  }

  private async broadcast(payload: string): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return;
    const attachments = sockets.map((socket) => socket.deserializeAttachment() as SocketAttachment | null);
    const roomIds = new Set(attachments
      .map((attachment) => attachment?.roomId)
      .filter((roomId): roomId is string => Boolean(roomId && ROOM_ID.test(roomId))));
    if (roomIds.size !== 1) {
      for (const socket of sockets) socket.close(1008, "Invalid room state");
      return;
    }
    const [roomId] = roomIds;
    const sessionIds = [...new Set(attachments
      .map((attachment) => attachment?.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId && SESSION_ID.test(sessionId))))];
    const activeSessionUsers = new Set<string>();
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => "?").join(", ");
      const active = await this.env.DB.prepare(`
        SELECT id, user_id AS userId FROM sessions
        WHERE id IN (${placeholders}) AND revoked_at IS NULL AND access_expires_at > ?
          AND NOT EXISTS (
            SELECT 1 FROM room_bans
            WHERE room_id = ? AND user_id = sessions.user_id
          )
      `).bind(...sessionIds, Date.now(), roomId).all<{ id: string; userId: number }>();
      for (const row of active.results) activeSessionUsers.add(`${row.id}:${row.userId}`);
    }
    for (let index = 0; index < sockets.length; index += 1) {
      const socket = sockets[index];
      const attachment = attachments[index];
      if (!attachment || attachment.roomId !== roomId || !activeSessionUsers.has(`${attachment.sessionId}:${attachment.userId}`)) {
        socket.close(1008, "Session expired or room access revoked");
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Delivery failed");
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(JSON.stringify({
        event: "request_error",
        path: new URL(request.url).pathname,
        error: errorMessage,
        stack,
      }));
      return json({ ok: false, error: errorMessage || "Internal server error." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
