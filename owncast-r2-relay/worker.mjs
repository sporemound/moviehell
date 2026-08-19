const DEFAULT_ORIGIN = "https://stream.example.org";
const HLS_ROOT = "/hls/";

function baseHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
}

function safeOriginUrl(requestUrl, origin = DEFAULT_ORIGIN) {
  if (!requestUrl.pathname.startsWith(HLS_ROOT)) return null;
  if (requestUrl.pathname.includes("..")) return null;

  const target = new URL(
    requestUrl.pathname + requestUrl.search,
    origin
  );

  if (target.origin !== origin) return null;
  if (!target.pathname.startsWith(HLS_ROOT)) return null;

  return target;
}

function relayUri(value, publicRequestUrl, upstreamPlaylistUrl, origin = DEFAULT_ORIGIN) {
  try {
    const upstream = new URL(value, upstreamPlaylistUrl);

    if (upstream.origin !== origin) {
      return value;
    }

    if (!upstream.pathname.startsWith(HLS_ROOT)) {
      return value;
    }

    const outward = new URL(publicRequestUrl.origin);
    outward.pathname = upstream.pathname;
    outward.search = upstream.search;

    return outward.toString();
  } catch {
    return value;
  }
}

function rewritePlaylist(text, publicRequestUrl, upstreamPlaylistUrl) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;

      if (line.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_match, uri) =>
            `URI="${relayUri(uri, publicRequestUrl, upstreamPlaylistUrl)}"`
        );
      }

      return relayUri(
        line.trim(),
        publicRequestUrl,
        upstreamPlaylistUrl
      );
    })
    .join("\n");
}

function objectKey(url) {
  const query = url.search
    ? "__query__" + encodeURIComponent(url.search)
    : "";

  return `couch${url.pathname}${query}`;
}

async function serveStored(object, request) {
  const headers = baseHeaders();

  object.writeHttpMetadata(headers);

  headers.set("ETag", object.httpEtag);
  headers.set(
    "Cache-Control",
    "public, max-age=300, stale-while-revalidate=3600"
  );

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers
    });
  }

  return new Response(object.body, {
    status: 200,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const origin = env?.ORIGIN || DEFAULT_ORIGIN;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: baseHeaders()
      });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        origin,
        storage: "Cloudflare R2",
        mode: "pull-through"
      }, {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: baseHeaders()
      });
    }

    const upstreamUrl = safeOriginUrl(url, origin);

    if (!upstreamUrl) {
      return new Response("Not found", {
        status: 404,
        headers: baseHeaders()
      });
    }

    // --------------------------------------------------------
    // PLAYLISTS: always keep fresh and rewrite every HLS URL
    // back through this Worker.
    // --------------------------------------------------------

    if (upstreamUrl.pathname.endsWith(".m3u8")) {
      let upstream;

      try {
        upstream = await fetch(upstreamUrl.toString(), {
          headers: {
            "Accept":
              "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
          }
        });
      } catch {
        return new Response("Owncast origin unavailable", {
          status: 502,
          headers: baseHeaders()
        });
      }

      if (!upstream.ok) {
        const headers = baseHeaders();
        headers.set("Cache-Control", "no-store");

        return new Response(upstream.body, {
          status: upstream.status,
          headers
        });
      }

      const original = await upstream.text();

      const rewritten = rewritePlaylist(
        original,
        url,
        upstreamUrl,
        origin
      );

      const headers = baseHeaders();

      headers.set(
        "Content-Type",
        "application/vnd.apple.mpegurl"
      );

      headers.set(
        "Cache-Control",
        "no-store, max-age=0"
      );

      return new Response(rewritten, {
        status: 200,
        headers
      });
    }


    // --------------------------------------------------------
    // SEGMENTS: R2 FIRST.
    // Origin is contacted only on an R2 miss.
    // --------------------------------------------------------

    const key = objectKey(upstreamUrl);

    const existing = await env.LIVE_HLS.get(key);

    if (existing) {
      return serveStored(existing, request);
    }


    let upstream;

    try {
      upstream = await fetch(upstreamUrl.toString(), {
        headers: {
          "Accept": "*/*"
        }
      });
    } catch {
      return new Response("Owncast origin unavailable", {
        status: 502,
        headers: baseHeaders()
      });
    }


    if (!upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: baseHeaders()
      });
    }


    const bytes = await upstream.arrayBuffer();

    const contentType =
      upstream.headers.get("Content-Type") ||
      "application/octet-stream";


    ctx.waitUntil(
      env.LIVE_HLS.put(key, bytes, {
        httpMetadata: {
          contentType,
          cacheControl:
            "public, max-age=300, stale-while-revalidate=3600"
        },
        customMetadata: {
          source: origin,
          cachedAt: new Date().toISOString()
        }
      })
    );


    const headers = baseHeaders();

    headers.set("Content-Type", contentType);

    headers.set(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=3600"
    );

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers
      });
    }

    return new Response(bytes, {
      status: 200,
      headers
    });
  }
};
