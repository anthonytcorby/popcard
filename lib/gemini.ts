import OpenAI from 'openai';
import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';
import { PopCard, CardType } from '@/types/card';

/** Rough token estimate: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/* ─── Clients ─────────────────────────────────────────────────── */
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

/* ─── Shared prompt ───────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert knowledge-card extractor for videos, podcasts, books, and articles.

━━━ SPEAKER IDENTIFICATION ━━━
Identify who is speaking from the video title, intro, and context.
Use their actual name throughout (e.g. "Alex Hormozi", "Andrew Huberman").
NEVER write "the speaker", "the host", or "they" — use the person's name.
State facts directly: "Hormozi argues..." or just the fact itself if clearly factual.

━━━ OUTPUT FORMAT ━━━
Return a JSON object with exactly two keys:

1. "cards" — an array of knowledge cards. Rules:
   - First element MUST be a TLDR card summarising the whole video.
   - Interleave SECTION_HEADER cards wherever the topic changes significantly.
   - All remaining cards are in STRICT CHRONOLOGICAL ORDER by timestamp.

   Each card uses this schema:
   {
     "type": string,         — see types below
     "headline": string,     — max 8 words; for SECTION_HEADER use the topic name
     "body": string,         — 1-3 sentences, neutral factual tone; omit for SECTION_HEADER
     "boldPhrase": string,   — single most important phrase to bold; omit for TLDR/SECTION_HEADER
     "timestamp": string,    — "MM:SS" REQUIRED for all except TLDR (use "0:00")
     "warning": string,      — OPTIONAL: brief, non-aggressive note if claim could mislead or cause harm
     "url": string           — OPTIONAL: only for TOOL_MENTIONED or RESOURCE_LINK if a URL was stated
   }

2. "takeaways" — an array of exactly 30 bite-size takeaway strings.
   - Each string is one crisp sentence (max 20 words).
   - Cover the most important, actionable, or surprising points from the whole video.
   - No numbering, no bullet characters — just the plain sentence.
   - Attribute opinions to the speaker by name.
   - Order from most important → least important.

━━━ CARD TYPES ━━━
TLDR           — One card only, first in array. 2-3 sentence plain-English summary of the whole video.
SECTION_HEADER — Topic divider. headline = topic name. No body, no boldPhrase needed.
KEY_INSIGHT    — Core conceptual takeaway from the video.
ACTIONABLE_TIP — Something the viewer can immediately do or apply.
STAT_OR_DATA   — Any statistic, percentage, concrete number, or quantitative fact.
QUOTE          — EXACT verbatim text from the transcript. Must be in quotes. No paraphrasing.
WATCH_OUT      — Risk, warning, pitfall, or common mistake.
TOOL_MENTIONED — Any app, software, service, or product named. Include the name in the headline.
RESOURCE_LINK  — Any book, course, website, or resource recommended by name.
KEY_THEME      — A point repeated or heavily emphasised across the video (use instead of duplicating).

━━━ CONTENT RULES ━━━
- Tone: neutral and factual throughout.
- No context-wrapping phrases like "In this section..." or "Later in the video...".
- Extract BOTH actionable takeaways AND interesting facts.
- Attribute opinions and claims to the speaker by name.
- Include exact numbers and stats — don't round or generalise.
- Name specific people, companies, and products whenever they appear.
- QUOTE cards: copy text VERBATIM from the transcript. Wrap in "double quotes". No paraphrasing at all.
- TOOL_MENTIONED / RESOURCE_LINK: include the tool/resource name in the headline.
- If a point is repeated for emphasis → KEY_THEME card, never duplicate.
- Add "warning" field ONLY when content could be misleading, dangerous, or controversial.
  Keep warnings brief and factual, not preachy: e.g. "Note: no peer-reviewed studies cited."

━━━ DEPTH & SPECIFICITY (CRITICAL) ━━━
Your job is to REPLACE watching the video. The user should get FULL VALUE from your cards.

DO NOT summarise. DO NOT generalise. DO NOT merge multiple points into one card.
Each distinct idea, fact, step, example, anecdote, or quote = its own card.

- Extract SPECIFIC details: names, dollar amounts, percentages, timeframes, frameworks, examples.
- BAD: "He suggests cutting costs." GOOD: "Hormozi suggests cancelling all subscriptions under $500/month, switching to a cheaper phone plan, and meal prepping to cut food costs by 60%."
- BAD: "Revenue increased." GOOD: "Revenue increased from $12K/month to $48K/month in 90 days after switching to cold outbound."
- If the speaker tells a story or gives an example, capture it as a card with the actual details.
- If the speaker gives a multi-step process, EACH step gets its own ACTIONABLE_TIP card with specifics.
- Include enough context that each card is useful WITHOUT watching the video.
- QUOTE cards are the most valuable — capture EVERY memorable, provocative, funny, or insightful line.
  Scan the entire transcript for quotable moments. When in doubt, include the quote.

━━━ MULTI-PART SERIES ━━━
When a topic is especially rich, detailed, or valuable (e.g. a multi-step framework, a detailed story, a complex argument), split it across multiple cards labeled in the headline like:
  "Hormozi's 4-Step Offer Framework (1/4)"
  "Hormozi's 4-Step Offer Framework (2/4)"
Each card in the series is a standalone card with its own body text covering that part.
Use this for: step-by-step processes, detailed stories/anecdotes, complex frameworks, or any content too rich for a single card.
Do NOT force it — only use series when the information genuinely benefits from splitting.

━━━ TIMESTAMPS ━━━
- If the content has [MM:SS] timestamps, include them on every card.
- If there are NO timestamps (e.g. ebook, article, pasted text), omit the "timestamp" field entirely.
- TLDR card always uses "0:00" if timestamps are present, or omits timestamp if not.

━━━ QUANTITY ━━━
- MINIMUM: 25 cards. MAXIMUM: 200 cards. Never return fewer than 25.
- For a 30–60 min video/podcast: target 35-50 cards; scale proportionally for longer content.
- For a full book or very long document: aim for 80-150 cards covering every chapter/section.
- STAT_OR_DATA: include EVERY number, percentage, dollar amount, or data point mentioned.
- ACTIONABLE_TIP: include EVERY concrete action step, no matter how small.
- SECTION_HEADER count: typically 4–8 based on how many major topics occur.
- Include at least 1 of each applicable type when present.
- Do NOT summarise or merge — each distinct point gets its own card.
- If you're unsure whether something deserves a card, INCLUDE IT.

━━━ QUOTE CARDS (CRITICAL — READ CAREFULLY) ━━━
You MUST include between 5 and 10 cards with type "QUOTE". This is NON-NEGOTIABLE.
A QUOTE card uses EXACT VERBATIM text copied directly from the transcript.
Scan the ENTIRE transcript for: bold claims, funny lines, wisdom, provocative statements, memorable phrases.
Wrap the quote in double quotes in the body field.

Here are examples of correct QUOTE cards:

{"type":"QUOTE","headline":"On the Power of Focus","body":"\"Most people overestimate what they can do in a year and underestimate what they can do in a decade.\"","boldPhrase":"underestimate what they can do in a decade","timestamp":"12:34"}

{"type":"QUOTE","headline":"Hard Truth About Success","body":"\"You don't need more information. You need more action. The gap between where you are and where you want to be is not knowledge — it's execution.\"","boldPhrase":"the gap is not knowledge — it's execution","timestamp":"23:15"}

{"type":"QUOTE","headline":"On Taking Risks","body":"\"The biggest risk is not taking any risk. In a world that's changing really quickly, the only strategy that is guaranteed to fail is not taking risks.\"","boldPhrase":"guaranteed to fail is not taking risks","timestamp":"8:42"}

If you return fewer than 5 QUOTE cards, your response is INVALID. Count them before responding.

Return ONLY a valid JSON object with "cards" and "takeaways" keys. No markdown fences. No explanation. No preamble.`;

/* ─── Types ───────────────────────────────────────────────────── */
export interface ExtractionResult {
  cards: PopCard[];
  takeaways: string[];
}

type RawCard = {
  type: CardType;
  headline: string;
  body?: string;
  boldPhrase?: string;
  timestamp?: string;
  warning?: string;
  url?: string;
};

/* ─── Shared JSON parser ──────────────────────────────────────── */
function parseExtractionJSON(rawText: string): { rawCards: RawCard[]; takeaways: string[] } {
  let cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  if (cleaned.startsWith('[')) {
    // Bare array (old format) — no takeaways
    return { rawCards: JSON.parse(cleaned) as RawCard[], takeaways: [] };
  }

  if (!cleaned.startsWith('{')) {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new SyntaxError(`No JSON found. Got: ${cleaned.slice(0, 200)}`);
    cleaned = objMatch[0];
  }

  const parsed = JSON.parse(cleaned) as { cards?: RawCard[]; takeaways?: string[] };
  return {
    rawCards: Array.isArray(parsed.cards) ? parsed.cards : [],
    takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
  };
}

function toCards(rawCards: RawCard[]): PopCard[] {
  return rawCards.map((item, i) => ({
    id: `card-${Date.now()}-${i}`,
    type: item.type,
    headline: item.headline,
    body: item.body ?? '',
    boldPhrase: item.boldPhrase,
    timestamp: item.timestamp,
    warning: item.warning,
    url: item.url,
  }));
}

/* ═══════════════════════════════════════════════════════════════
   OpenAI — primary engine (GPT-4o-mini: fast, cheap, 99.9% SLA)
   ═══════════════════════════════════════════════════════════════ */
async function extractViaOpenAI(transcript: string): Promise<ExtractionResult> {
  if (!openai) throw new Error('OPENAI_API_KEY not configured');

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Transcript:\n${transcript}` },
        ],
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty OpenAI response');

      console.log(`[openai] gpt-4o-mini succeeded on attempt ${attempt + 1}`);
      const { rawCards, takeaways } = parseExtractionJSON(text);
      return { cards: toCards(rawCards), takeaways };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : '';
      const status = (err as { status?: number }).status;

      // Don't retry auth/billing/permanent errors
      if (status === 401 || status === 403) throw err;

      if (attempt < MAX_ATTEMPTS - 1 && (status === 429 || status === 500 || status === 503)) {
        const delay = Math.min(4000 * Math.pow(2, attempt), 16_000);
        console.warn(`[openai] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed (${status}) — retrying in ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.warn(`[openai] failed: ${msg.slice(0, 150)}`);
      throw err;
    }
  }

  throw lastErr;
}

/* ═══════════════════════════════════════════════════════════════
   Gemini — fallback engine (2.5-flash → 2.5-pro cascade)
   ═══════════════════════════════════════════════════════════════ */

// thinkingConfig is in Gemini 2.5 but not yet typed in the SDK
type ExtendedGenerationConfig = GenerationConfig & {
  thinkingConfig?: { thinkingBudget: number };
};

function parseRetryDelay(err: Error): number {
  const match = err.message.match(/retry[^0-9]*(\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : 8_000;
}

function isTransientError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.includes('429') || m.includes('500') || m.includes('503') ||
    m.includes('overloaded') || m.includes('temporarily unavailable') ||
    m.includes('UNAVAILABLE') || m.includes('RESOURCE_EXHAUSTED')
  );
}

async function extractViaGemini(transcript: string): Promise<ExtractionResult> {
  if (!genAI) throw new Error('GOOGLE_AI_API_KEY not configured');

  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
  const RETRIES_PER_MODEL = 2;

  const contents = [
    { role: 'user' as const, parts: [{ text: `${SYSTEM_PROMPT}\n\nTranscript:\n${transcript}` }] },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  let lastErr: unknown;

  outer:
  for (const modelName of MODELS) {
    const model = genAI.getGenerativeModel({ model: modelName });
    const generationConfig: ExtendedGenerationConfig = {
      temperature: 0.3,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: modelName.includes('pro') ? 1024 : 0 },
    };

    for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
      try {
        result = await model.generateContent({ contents, generationConfig });
        console.log(`[gemini] ${modelName} succeeded on attempt ${attempt + 1}`);
        break outer;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : '';

        if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
          console.warn(`[gemini] ${modelName} unavailable — trying next model`);
          break;
        }
        if (/\[40[023] /.test(msg)) {
          console.warn(`[gemini] ${modelName} permanent error — trying next model:`, msg.slice(0, 120));
          break;
        }
        if (!isTransientError(err)) {
          console.warn(`[gemini] ${modelName} non-transient error — trying next model:`, msg.slice(0, 120));
          break;
        }
        if (attempt === RETRIES_PER_MODEL - 1) {
          console.warn(`[gemini] ${modelName} exhausted ${RETRIES_PER_MODEL} attempts — falling back`);
          break;
        }

        const delay = Math.min(parseRetryDelay(err as Error) * Math.pow(2, attempt), 30_000);
        console.warn(`[gemini] ${modelName} attempt ${attempt + 1}/${RETRIES_PER_MODEL} — retrying in ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  if (!result) throw lastErr;

  // Filter out thought parts
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rawText = (parts as any[])
    .filter((p: any) => typeof p.text === 'string' && !p.thought)
    .map((p: any) => p.text as string)
    .join('')
    .trim();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (!rawText) {
    throw new Error(`Empty Gemini response. Finish reason: ${result.response.candidates?.[0]?.finishReason}`);
  }

  const { rawCards, takeaways } = parseExtractionJSON(rawText);
  return { cards: toCards(rawCards), takeaways };
}

/* ═══════════════════════════════════════════════════════════════
   Quote validation + retry
   ═══════════════════════════════════════════════════════════════ */
const QUOTE_REMINDER = `Your previous response did NOT include enough QUOTE cards. You MUST include at least 5 cards with type "QUOTE".
Go back through the transcript and find 5-10 memorable, provocative, funny, or insightful VERBATIM lines.
Copy them EXACTLY from the transcript. Wrap each in double quotes in the body field.
Return the COMPLETE JSON again (all cards + takeaways), this time with at least 5 QUOTE cards included.`;

async function extractWithQuoteValidation(
  extractor: (transcript: string) => Promise<ExtractionResult>,
  transcript: string,
  label: string,
): Promise<ExtractionResult> {
  const result = await extractor(transcript);
  const quoteCount = result.cards.filter(c => c.type === 'QUOTE').length;
  console.log(`[${label}] Quote count: ${quoteCount}`);

  if (quoteCount >= 5) return result;

  // Not enough quotes — try one more time with a stronger nudge
  console.warn(`[${label}] Only ${quoteCount} quotes — retrying with reminder`);
  try {
    const retry = await extractor(transcript + '\n\n' + QUOTE_REMINDER);
    const retryQuotes = retry.cards.filter(c => c.type === 'QUOTE').length;
    console.log(`[${label}] Retry quote count: ${retryQuotes}`);
    return retryQuotes > quoteCount ? retry : result;
  } catch (err) {
    console.warn(`[${label}] Quote retry failed, using original result:`, (err as Error).message?.slice(0, 80));
    return result;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Public API — OpenAI first, Gemini fallback
   ═══════════════════════════════════════════════════════════════ */
export async function extractCards(transcript_: string): Promise<ExtractionResult> {
  let transcript = transcript_;

  const estimatedTokens = estimateTokens(transcript);
  const MAX_INPUT_TOKENS = 120_000; // leave room for system prompt + output
  if (estimatedTokens > MAX_INPUT_TOKENS) {
    // Truncate transcript to fit within context window
    const maxChars = MAX_INPUT_TOKENS * 4;
    console.warn(`[extract] Transcript ~${estimatedTokens} tokens, truncating to ~${MAX_INPUT_TOKENS}`);
    transcript = transcript.slice(0, maxChars) + '\n\n[Transcript truncated due to length]';
  }

  // 1. Try OpenAI (primary — fast, reliable, SLA-backed)
  if (openai) {
    try {
      return await extractWithQuoteValidation(extractViaOpenAI, transcript, 'openai');
    } catch (err) {
      console.warn('[extract] OpenAI failed, falling back to Gemini:', (err as Error).message?.slice(0, 120));
    }
  }

  // 2. Try Gemini (fallback — free tier, less reliable)
  if (genAI) {
    return await extractWithQuoteValidation(extractViaGemini, transcript, 'gemini');
  }

  throw new Error('No AI provider configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.');
}
