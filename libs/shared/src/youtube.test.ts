import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from './youtube';

describe('parseYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?t=10`,
    `https://www.youtube.com/embed/${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}&list=abc`,
  ])('accepts %s', (u) => expect(parseYouTubeId(u)).toBe(id));

  it.each(['', 'not a url', 'https://vimeo.com/123', 'https://youtube.com/watch?v=short', 'javascript:alert(1)'])(
    'rejects %s',
    (u) => expect(parseYouTubeId(u)).toBeNull(),
  );
});
