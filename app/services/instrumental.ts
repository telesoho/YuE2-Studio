/** The lyrics' section tags without their words: the structure of the song, nothing to sing. */
export function sectionTagsOnly(lyrics: string): string {
  return lyrics.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(line => /^\[[^\]]+\]$/.test(line)).join('\n\n');
}
