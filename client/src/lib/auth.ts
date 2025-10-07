export function handleUnauthorized(status: number) {
  if (status === 401 || status === 403) {
    const loginUrl = "/login";
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `${loginUrl}?next=${next}`;
  }
}
