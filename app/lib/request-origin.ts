// Behind a tunnel, Next's request URL can use the loopback address.
// Use the operator-configured origin without allowing arbitrary forwarded hosts.
export function isAllowedRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  return origin === new URL(request.url).origin || origin === process.env.APP_PUBLIC_ORIGIN;
}
