const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the 11-character video ID from watch?v=, youtu.be/, embed/ and shorts/ URLs.
 * Returns null for anything else (other hosts, playlists without a video, malformed input).
 */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, value] = url.pathname.split('/');
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (kind === 'embed' || kind === 'shorts') id = value ?? null;
  }
  return id && ID_RE.test(id) ? id : null;
}
