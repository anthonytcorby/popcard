export function chunkTranscript(transcript: string): string[] {
  const words = transcript.split(/\s+/);
  const chunks: string[] = [];

  // Rough word-based chunking at ~1500 token target (≈6000 chars, ~1100 words)
  const WORDS_PER_CHUNK = 1100;
  const OVERLAP_WORDS = 75;

  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + WORDS_PER_CHUNK).join(' ');
    chunks.push(chunk);
    i += WORDS_PER_CHUNK - OVERLAP_WORDS;
  }

  return chunks;
}
