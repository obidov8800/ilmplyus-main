/** YouTube havolasidan iframe uchun `embed` URL yasaydi, mos kelmasa `null`. */
export function getYoutubeEmbedUrl(url: string): string | null {
  const match = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/.exec(url);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}
