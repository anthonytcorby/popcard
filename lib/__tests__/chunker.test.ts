import { describe, it, expect } from 'vitest';
import { chunkTranscript } from '../chunker';

describe('chunkTranscript', () => {
  it('returns a single chunk for short input', () => {
    const text = 'Hello world. This is a short transcript.';
    const chunks = chunkTranscript(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('Hello world');
  });

  it('splits long text into multiple chunks', () => {
    // ~6000 words — exceeds WORDS_PER_CHUNK (1100) so must produce multiple chunks
    const sentence = 'This is a test sentence with six words. ';
    const text = sentence.repeat(800);
    const chunks = chunkTranscript(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('does not produce empty chunks', () => {
    const text = 'Word '.repeat(2000);
    const chunks = chunkTranscript(text);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it('handles empty string', () => {
    const chunks = chunkTranscript('');
    // Either returns empty array or single empty-ish chunk — should not throw
    expect(Array.isArray(chunks)).toBe(true);
  });
});
