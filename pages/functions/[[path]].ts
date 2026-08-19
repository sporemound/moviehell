interface Env {
  MOVIE_HELL_BACKEND: Fetcher;
}

const unavailableHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Content-Type": "text/plain; charset=utf-8",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    return await env.MOVIE_HELL_BACKEND.fetch(request);
  } catch {
    console.error(JSON.stringify({
      event: "pages_backend_unavailable",
      path: new URL(request.url).pathname,
    }));
    return new Response("Movie Hell is temporarily unavailable.", {
      status: 503,
      headers: unavailableHeaders,
    });
  }
};
