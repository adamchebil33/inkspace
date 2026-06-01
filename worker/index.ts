// Worker entry point. Static files are served by the assets layer; only
// /api/* requests reach this handler (see wrangler.jsonc).
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/api/health') {
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}

export default {
  fetch: (request) => handleRequest(request),
} satisfies ExportedHandler<Env>
