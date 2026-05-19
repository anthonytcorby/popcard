import './env.js';
import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const MODEL = 'gpt-5-mini';

const CARD_TYPES = ['idea', 'definition', 'example', 'analogy', 'mistake', 'comparison', 'formula', 'action'];
const IMPORTANCES = ['must_know', 'good_to_know', 'extra_context'];

const CARDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'Short, descriptive deck title (max 8 words).',
    },
    summary: {
      type: 'string',
      description: 'One-sentence plain-English summary of what this deck covers.',
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: CARD_TYPES },
          importance: { type: 'string', enum: IMPORTANCES },
          question: { type: 'string' },
          answer: { type: 'string' },
          hint: { type: ['string', 'null'] },
          sourceTimestampSeconds: {
            type: ['integer', 'null'],
            description: 'For YouTube sources only: seconds offset of the moment this card refers to.',
          },
        },
        required: ['type', 'importance', 'question', 'answer', 'hint', 'sourceTimestampSeconds'],
      },
    },
  },
  required: ['title', 'summary', 'cards'],
};

const MODE_INSTRUCTIONS = {
  simple: (target) => `Generate around ${target} cards. Simple mode changes the STYLE (plain English, conversational, "smart friend explaining it to you"), NOT the coverage and NOT the depth. The target is a floor, not a ceiling — produce MORE cards if the source has more distinct value worth keeping. Every idea worth remembering becomes a card.
- Questions are short and direct (max 12 words).
- Answer length is variable — match the depth of the idea. For substantive principles, frameworks, or mental models: write a RICH paragraph of 100–180 words that fully transmits the lesson. For simple definitions or quick takeaways: 30–60 words is fine. NEVER pad to hit a length, and NEVER compress a deep idea into a one-liner just because it's "simple mode".
- Aim for "smart friend who actually read the book and remembers what mattered" energy. Plain English vocabulary, complete substance.
- Importance: most cards "good_to_know"; flag the core ideas as "must_know".
- Use card types appropriately: "idea" for key takeaways, "definition" for terms, "example" for concrete instances, "analogy" for comparisons that aid understanding, "action" for things to do.
- Hint can be null; only add one if the answer benefits from a nudge.`,

  study: (target) => `Generate around ${target} cards for serious revision. The target is a floor, not a ceiling — produce MORE cards if the source is dense with distinct ideas. Goal: comprehensive coverage of every idea the learner would want to revise.
- Mix difficulty: roughly a third easy recall, a third applied/conceptual, a third harder synthesis.
- Questions are direct ("What is X?" / "Why does X happen?" / "When does X apply?").
- Answer length is variable — match the depth of the idea. For substantive ideas, frameworks, or principles: write 100–180 words that fully transmit the concept. For factoids or recall checks: 30–60 words. NEVER pad.
- Importance distribution: ~30% must_know (core, exam-worthy), ~50% good_to_know, ~20% extra_context.
- Use the full range of card types where the material supports it: idea, definition, example, analogy, mistake (common confusions), comparison, formula, action (steps to take).
- Include a one-line hint on harder cards; leave hint null otherwise.`,
};

// Card target scales with source length. Tuned for "extract ALL value":
// no practical cap, generous coverage. Long books produce 250-500 cards.
const CARD_SIZING = {
  simple: { minutesPerCard: 2,   wordsPerCard: 280, floor: 8,  softCap: 500 },
  study:  { minutesPerCard: 1.5, wordsPerCard: 180, floor: 15, softCap: 500 },
};

function estimateSourceMinutes({ segments }) {
  if (!segments || !segments.length) return null;
  const last = segments[segments.length - 1];
  return Math.max(1, (last.offsetSeconds || 0) / 60);
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeCardTarget(mode, { segments, text }) {
  const cfg = CARD_SIZING[mode] || CARD_SIZING.simple;
  let raw;
  const minutes = estimateSourceMinutes({ segments });
  if (minutes != null) {
    raw = minutes / cfg.minutesPerCard;
  } else {
    raw = countWords(text) / cfg.wordsPerCard;
  }
  return Math.round(Math.max(cfg.floor, Math.min(cfg.softCap, raw || cfg.floor)));
}

const SYSTEM_PROMPT = `You are Popcard, a study-card generator. You turn source material into colourful, varied learning cards a self-learner can actually revise from. Your job is to extract the VALUE of the source — every specific insight, framework, principle, mental model, or actionable lesson worth remembering — and leave the fluff behind.

VALUE vs. FLUFF — read this before anything else:
- VALUE = specific insights, frameworks, mental models, principles, counter-intuitive lessons, decision rules, named concepts the source coined or defined, concrete examples that illustrate a principle, a quote whose exact wording carries weight.
- FLUFF = generic platitudes ("be authentic", "leadership matters", "trust your team") that could appear in any book on the topic; biographical filler ("Tony joined Apple in 1990 and worked on..."); restating-the-obvious; transitional sentences from the source; cards that exist to fill a quota.
- If a card could appear unchanged in any other book on the subject, drop it. The reader is here for THIS source's specific contribution.

RULES:
- The FIRST card in every deck is always a RICH context/overview card that orients the learner before any specific Q&A. This card is substantial — it sets the stage for everything that follows. Format it as follows:
  - question: a short framing hook for whatever the source is — e.g. "What is this book about?", "What's the gist of this video?", "What does this article cover?". Match the source type.
  - answer: a SUBSTANTIAL overview (200-350 words total) rendered as PLAIN TEXT with literal newline characters preserved. The reader sees paragraphs and a bullet list, not a wall of text.

    CRITICAL FORMATTING RULES — read these carefully:
    - You MAY use \`**bold**\` (double-asterisks) to emphasise the things that matter: author names, book/video/article titles, named frameworks, key technical terms, important numbers or dates. Use bold sparingly — 4-10 spans per overview card, not on every other word. NEVER use \`*single asterisk italic*\`, \`__underscore bold__\`, \`# headers\`, \`> blockquotes\`, or markdown lists. Only \`**bold**\` is rendered; all other markdown shows as literal characters.
    - Separate every paragraph with a BLANK LINE — i.e. include the literal characters \\n\\n (two newline characters) between paragraphs in the JSON string.
    - For the bullet list, put EACH bullet on its own line. Start a fresh line with the literal newline character \\n, then "• " (U+2022 + a single space), then the bullet text. Do NOT inline bullets separated by spaces.

    REQUIRED STRUCTURE (each item is its own paragraph, separated by blank lines):

    (1) Opener sentence: name the source and its core argument or topic. One short sentence. No markdown markers around it.

    (2) Author / creator paragraph: the author's name and, when present in the source, their relevant background, credentials, and prior work. For books, include the publication year if surfaced in the source. For videos, include the channel/creator name if visible. If the source doesn't reveal this info, write "(author not stated in source)" — do not invent.

    (3) Breakdown paragraph (60-100 words): what the source covers, its structure (parts, chapters, sections, or segments — name them if the source names them), and who it's for.

    (4) A bullet list of 4-7 main themes. Each bullet on its OWN LINE, starting with "• " (U+2022 + space). Each bullet 8-15 words. These bullets preview the territory the rest of the deck covers in depth — they are not the lessons themselves.
  - type: "idea". importance: "must_know". hint: null. sourceTimestampSeconds: null (this card covers the whole source).
  - This overview card COUNTS toward the total card target. Don't add it on top.

- Every non-overview card transmits ONE specific piece of value from the source, in enough depth that the learner could explain it back. Each card stands alone.

- ANSWER DEPTH: variable. Substantive ideas, frameworks, and principles deserve a RICH answer (100–180 words). Simple definitions or factoids can be 30–60 words. NEVER pad to hit a length, and NEVER compress a deep idea to fit a short answer. Length follows depth.

- ANSWER STRUCTURE — non-negotiable for any answer over 50 words: NEVER write a single wall-of-text paragraph. The reader's eye should hit visual structure within the first sentence. Pick ONE of these layouts per card based on the content:

  FORMAT A — Lead + bullets (USE THIS WHEN the lesson has 3+ enumerable items: components, steps, rules, examples, options, signals, mistakes, etc.). Structure:
    [One short lead sentence naming the idea, ending with a colon.]
    [blank line]
    [• First item — one line, 8-18 words.]
    [• Second item — one line, 8-18 words.]
    [• Third item — one line, 8-18 words.]
    [optional closing sentence on its own line after a blank line]

  FORMAT B — Stepped paragraphs (USE THIS WHEN the lesson has distinct stages: principle → mechanism → application, or before → after, or rule → exception). Structure:
    [Paragraph 1: name the principle in 1-2 sentences.]
    [blank line]
    [Paragraph 2: the mechanism / why it works, 1-3 sentences.]
    [blank line]
    [Paragraph 3 (optional): concrete application or counter-example, 1-2 sentences.]

  FORMAT C — Short fact (USE FOR definitions, factoids, single-point cards under 50 words). One tight paragraph, no bullets needed.

  Choose the layout that fits the CONTENT. Don't force bullets onto narrative ideas. Don't force paragraphs onto enumerable lists. If the answer is just "what mitochondria do", FORMAT C is right. If the answer is "the 5 signals a hire is failing", FORMAT A. If the answer is "how a flywheel compounds value", FORMAT B.

- BULLET FORMATTING — when using bullets in FORMAT A: each bullet starts with "• " (U+2022 + single space) at the start of its own line. Separate bullets with a single newline (\\n), not blank lines. Separate the lead and the bullet list with a blank line (\\n\\n). Each bullet is a single line, 8-18 words. No nested bullets, no sub-bullets.

- BOLD EMPHASIS — in every card's answer (overview and Q&A alike), you MAY use \`**double-asterisks**\` to bold things that matter: author names, book/article/video titles, named frameworks or concepts the source coined, key technical terms when first defined, and important numbers/dates/proper nouns. Use bold sparingly — typically 1-4 spans per card. NEVER use other markdown (\`*italic*\`, \`__bold__\`, \`# headers\`, etc.) — only \`**bold**\` is rendered; everything else shows as literal characters.

- QUOTES — use them to BACK UP each card's claim with the source's own wording. Aim for a quote on 50–70% of cards (more for books and academic sources where the author's exact phrasing matters; fewer for casual videos where a paraphrase may carry better). Format: the quote on its own line, wrapped in straight double quotes ("..."), then a single newline, then an attribution line starting with "— " (em dash + space). The whole quote-plus-attribution is a SINGLE paragraph block in the output (lines separated by \\n, not \\n\\n). Separate the quote block from the surrounding explanation with a blank line (\\n\\n).

  ATTRIBUTION FORMAT depends on the source kind:
  - For a BOOK / article / paper / text upload: attribute as "— **Author Name**, **Source Title**" with chapter or section appended in plain text if the source surfaces it (e.g. "— **Tony Fadell**, **Build**, ch. 4"). Bold the author and title. Never invent a chapter or page number; only include them if visible in the extracted text.
  - For a YOUTUBE / video / podcast TRANSCRIPT: attribute as "— **Speaker**" where Speaker is the named person the transcript identifies (host, guest, or interviewee). If the transcript doesn't surface a name, write just "— Speaker" with no bold. Do NOT append a book title or year. Do NOT invent a speaker name.
  - For an ARTICLE / blog / web URL: attribute as "— **Author**, *Publication or Site*" if both are surfaced; otherwise just the author or just the title.

  NEVER fabricate quotes. Only use exact wording present in the source. If you can't find a quote that strengthens the card's specific claim, skip the quote — a weak quote is worse than no quote.

Example — FORMAT A (lead + bullets):
The five signals that a hire is failing in their first 90 days:

• They keep asking the same question instead of building a mental model.
• They optimise for looking busy over shipping anything visible.
• They go quiet in critical decisions and over-talk in safe ones.
• Their work needs to be redone, not just edited, by senior peers.
• They blame tools, process, or context instead of owning the gap.

If you see three of these, the answer is almost always to part ways early.

Example — FORMAT B (stepped paragraphs):
The principle of "being wrong fast": every assumption is a hypothesis with a clock on it. The longer you hold an unvalidated belief, the more expensive the unwinding when you finally discover it's wrong.

The mechanism is compounding cost. A wrong strategic bet costs you a week if you catch it early, a quarter if you catch it at the mid-point, and a year if you catch it on review. The same applies to people decisions and product bets — under-performers, mis-positioned hires, and bad pricing all get more expensive the longer they sit.

The discipline isn't to be right first time — that's luck. It's to compress the test-and-update cycle until badly-wrong beliefs only cost you weeks, not years.

"The goal isn't to be right. The goal is to be wrong as fast as possible, before it gets expensive."
— **Tony Fadell**, **Build**

- Questions are direct, never meta ("According to the text..."). Phrase them as the learner would actually ask.
- Factually grounded in the source. Don't invent. If the source is vague, prefer fewer high-quality cards over filling a quota.
- No duplicates, no near-duplicates, no cards that say the same thing in different words.
- Pick the card "type" that best fits each piece of content. Don't force everything into one type.
- Importance reflects what the learner genuinely needs to remember vs. nice-to-know context.
- For YouTube transcripts with timestamps: include sourceTimestampSeconds pointing to the most relevant moment for each card (overview card stays null). Otherwise set sourceTimestampSeconds to null.
- Output strict JSON matching the provided schema.`;

// Hard ceiling on transcript bulk we send to the LLM. 5000 segments covers
// ~3-4hr videos comfortably; the char budget protects against very dense
// segment shapes pushing the prompt over a reasonable token count.
const TRANSCRIPT_SEGMENT_CAP = 5000;
const TRANSCRIPT_CHAR_BUDGET = 250000;
// For text-mode (ebook uploads, pasted text): ~120K words / ~200K tokens of
// input. Comfortably covers a 400-page book; very long books get truncated.
const TEXT_CHAR_BUDGET = 800000;

function buildUserPrompt({ text, mode, sourceUrl, segments, chunkIndex = 0, totalChunks = 1, language = 'English' }) {
  const fullTarget = computeCardTarget(mode, { segments, text });
  // Per-chunk target: divide the total target evenly across chunks.
  const target = totalChunks > 1
    ? Math.max(40, Math.round(fullTarget / totalChunks))
    : fullTarget;
  const minutes = estimateSourceMinutes({ segments });
  const wordCount = segments && segments.length
    ? countWords(segments.map((s) => s.text).join(' '))
    : countWords(text);
  const hardMin = Math.max(
    Math.floor(target * 0.7),
    Math.min(target, target - 20)
  );

  const instr = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.simple;
  const parts = [typeof instr === 'function' ? instr(target) : instr];

  // Language directive lands BEFORE chunk-context so the model sees it first.
  // Cards (questions, answers, bullets, attributions) must be in this language
  // regardless of the source's language. The bullet character "• " stays.
  parts.push(
    `\n\nOUTPUT LANGUAGE: ${language}. Write every card's question, answer, bullets, and quote attributions in ${language}. If the source is in a different language, translate the substance into ${language} but you MAY include short original-language quotations in their original wording inside the answer, followed by a translation in parentheses on the next line. Card "type" and "importance" values stay as the English enum strings ("idea", "must_know", etc.) — those are machine fields, not display fields.`
  );

  if (totalChunks > 1) {
    if (chunkIndex === 0) {
      parts.push(
        `\n\nCHUNK CONTEXT: this is CHUNK 1 of ${totalChunks} from a longer source. Your job:\n` +
        `1. Generate the OVERVIEW card (first card) for the WHOLE source. Identify the author and core thesis from this opening chunk.\n` +
        `2. Then generate Q&A cards covering the content in THIS chunk only. Don't try to cover later chunks — other passes handle those.\n` +
        `3. Order your cards in the order ideas APPEAR in this chunk (top-to-bottom). The reader will work through them sequentially — don't jumble the natural reading order.\n` +
        `4. The reader will go on to read cards from chunks 2 through ${totalChunks}, so don't try to wrap up the whole source here. Build the foundation; later chunks build on it.`
      );
    } else {
      parts.push(
        `\n\nCHUNK CONTEXT: this is CHUNK ${chunkIndex + 1} of ${totalChunks} from a longer source.\n` +
        `1. Do NOT generate an overview card — chunk 1 covers that. Start straight into substantive Q&A.\n` +
        `2. Assume the reader has worked through chunks 1 through ${chunkIndex}. They already know the source's author, title, and broad framing. Don't re-introduce — go deeper.\n` +
        `3. Where a card builds on a concept the source has already established (in earlier chunks), reference it briefly ("Building on the [framework]...", "Now applying the [principle] to..."). This stitches the deck into a narrative arc instead of 100 disconnected facts.\n` +
        `4. Order your cards in the order ideas APPEAR in this chunk (top-to-bottom). The reader works through them sequentially.\n` +
        `5. ${chunkIndex === totalChunks - 1 ? 'This is the FINAL substantive chunk before the summary card. Cover the closing arguments, conclusion, and any "what now" guidance from the source.' : 'There are more chunks after this — don\'t try to conclude. Cover this chunk\'s content and let the next chunk pick up.'}`
      );
    }
  }

  // Anchor the model to concrete numbers. Without this, gpt-5-mini routinely
  // produces 10-30% of the target on long sources.
  const sizeNote = minutes != null
    ? `Source length: roughly ${Math.round(minutes)} minutes of video / ${wordCount.toLocaleString()} words of transcript.`
    : totalChunks > 1
      ? `Chunk length: roughly ${countWords(text).toLocaleString()} words. (Full source is split across ${totalChunks} chunks.)`
      : `Source length: roughly ${wordCount.toLocaleString()} words.`;
  parts.push(
    `\n\nDECK SIZE — read carefully and DO NOT undershoot:\n` +
    `${sizeNote}\n` +
    `Target ${totalChunks > 1 ? 'for this chunk' : 'deck size'}: ${target} cards.\n` +
    `Hard minimum: ${hardMin} cards. Producing fewer than ${hardMin} cards means you have failed to extract this ${totalChunks > 1 ? 'chunk' : 'source'}'s value.\n` +
    `\n` +
    `If your first attempt feels like it's heading below the minimum, you are SKIPPING content. Before stopping, audit this ${totalChunks > 1 ? 'chunk' : 'source'} for content you missed:\n` +
    `  • Side examples and anecdotes that illustrate a principle (each one is a card).\n` +
    `  • Counter-examples and edge cases (each one is a card).\n` +
    `  • Numbered lists, rules, or steps the author lays out (one card per item).\n` +
    `  • Named frameworks, models, or concepts the source coins (one card each).\n` +
    `  • Specific stories, dates, names, decisions worth remembering.\n` +
    `  • Mistakes the author warns against (one card per mistake).\n` +
    `  • Definitions of terms used in passing.\n` +
    `Every one of these is card-worthy. The floor is non-negotiable.\n` +
    `\n` +
    `Going over the target is fine if the content supports it. Never quota-stuff with filler — every card must carry real value. But undershooting the floor on a dense source means you stopped too early.`
  );

  if (sourceUrl) parts.push(`\n\nSource URL: ${sourceUrl}`);

  // Tell the model exactly what kind of source this is so it picks the right
  // quote-attribution format (book/title vs. speaker vs. article/publication).
  const isVideo = !!(segments && segments.length);
  if (isVideo) {
    parts.push(`\n\nSource kind: YOUTUBE / VIDEO TRANSCRIPT. Use SPEAKER attribution for quotes (e.g. "— Speaker" or "— **Tony Fadell**" if the transcript identifies them). Do NOT cite book titles, chapters, or pages — there are none.`);
  } else {
    parts.push(`\n\nSource kind: BOOK / ARTICLE / TEXT UPLOAD. Use AUTHOR + TITLE attribution for quotes (e.g. "— **Tony Fadell**, **Build**"). If the author and title are not surfaced in the first portion of the source, infer from the content; if you still can't identify them, attribute as "— the author".`);
  }

  if (isVideo) {
    const trimmed = segments.slice(0, TRANSCRIPT_SEGMENT_CAP);
    let lines = trimmed
      .map((s) => `[${Math.round(s.offsetSeconds)}s] ${s.text}`)
      .join('\n');
    if (lines.length > TRANSCRIPT_CHAR_BUDGET) {
      lines = lines.slice(0, TRANSCRIPT_CHAR_BUDGET);
    }
    parts.push(`\n\nTimestamped transcript:\n${lines}`);
  } else {
    let material = text || '';
    if (material.length > TEXT_CHAR_BUDGET) {
      material = material.slice(0, TEXT_CHAR_BUDGET);
    }
    parts.push(`\n\nMaterial:\n${material}`);
  }

  return parts.join('');
}

// A single LLM call can't reliably produce 300+ cards — the model anchors
// low even with explicit hard minimums. Smaller chunks force the model to
// engage with each section properly: 50K-char chunks (~8K words) are tight
// enough that "I'll just produce 15 cards" is obviously wrong to the model.
const CHUNK_THRESHOLD_CHARS = 30_000; // below this, single call
const CHUNK_TARGET_CHARS = 50_000;    // each chunk roughly this size
const MAX_CHUNKS = 12;                // safety cap for very long books

export async function generateCards({ text, mode, sourceUrl, segments, language = 'English' }) {
  // Videos always use single-call (transcripts max out at 250K chars budget,
  // and segment-aware prompting needs the whole transcript). Short text also
  // stays single-call.
  const useChunked =
    !segments &&
    typeof text === 'string' &&
    text.length >= CHUNK_THRESHOLD_CHARS;

  if (!useChunked) {
    const result = await runDeckCall({
      text,
      mode,
      sourceUrl,
      segments,
      chunkIndex: 0,
      totalChunks: 1,
      language,
    });
    return result;
  }

  return generateChunkedDeck({ text, mode, sourceUrl, language });
}

async function generateChunkedDeck({ text, mode, sourceUrl, language }) {
  const truncated = text.slice(0, TEXT_CHAR_BUDGET);
  const totalChunks = Math.min(
    MAX_CHUNKS,
    Math.max(2, Math.ceil(truncated.length / CHUNK_TARGET_CHARS))
  );
  const chunkSize = Math.ceil(truncated.length / totalChunks);
  const chunks = [];
  for (let i = 0; i < truncated.length; i += chunkSize) {
    chunks.push(truncated.slice(i, i + chunkSize));
  }

  // Kick all chunk calls off in parallel. The first chunk also produces the
  // overview card (because it has the source's opening, where author/title
  // info usually lives). Other chunks produce Q&A cards only.
  const chunkPromises = chunks.map((chunk, i) =>
    runDeckCall({
      text: chunk,
      mode,
      sourceUrl,
      segments: null,
      chunkIndex: i,
      totalChunks: chunks.length,
      language,
    })
  );

  // The summary card pulls from a digest of the FULL text (start + end), so
  // it covers the whole arc not just the last chunk. Run in parallel.
  const digest = makeDigest(truncated);
  const summaryPromise = generateSummaryCard({ text: digest, mode, sourceUrl, language });

  const [chunkResults, summaryCard] = await Promise.all([
    Promise.all(chunkPromises),
    summaryPromise,
  ]);

  // Merge cards in chunk order. Drop accidental overview cards from chunks
  // 1..N (only chunk 0 should produce one).
  const cards = [];
  for (let i = 0; i < chunkResults.length; i++) {
    const r = chunkResults[i];
    if (i === 0) {
      cards.push(...r.cards);
    } else {
      // Skip the first card from non-first chunks if it looks like an overview
      // (the prompt tells them not to make one, but be defensive).
      const startAt =
        r.cards.length > 0 && looksLikeOverview(r.cards[0]) ? 1 : 0;
      for (let j = startAt; j < r.cards.length; j++) cards.push(r.cards[j]);
    }
  }

  if (summaryCard) cards.push(summaryCard);

  // Aggregate token usage across calls for billing visibility.
  const usage = chunkResults.reduce(
    (a, r) => ({
      prompt_tokens: a.prompt_tokens + (r.usage?.prompt_tokens || 0),
      completion_tokens: a.completion_tokens + (r.usage?.completion_tokens || 0),
      total_tokens: a.total_tokens + (r.usage?.total_tokens || 0),
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  );

  return {
    title: chunkResults[0]?.title,
    summary: chunkResults[0]?.summary,
    cards,
    model: MODEL,
    usage,
  };
}

function looksLikeOverview(card) {
  if (!card?.question) return false;
  const q = card.question.toLowerCase();
  return (
    q.includes("what is this") ||
    q.includes("what's this") ||
    q.includes("gist of") ||
    q.includes("about?")
  );
}

function makeDigest(text) {
  // First 8K chars + last 8K chars — usually captures author/title intro and
  // the conclusion/wrap-up of a book.
  if (text.length <= 16_000) return text;
  return text.slice(0, 8_000) + '\n\n[...]\n\n' + text.slice(-8_000);
}

async function runDeckCall({ text, mode, sourceUrl, segments, chunkIndex, totalChunks, language }) {
  const userPrompt = buildUserPrompt({
    text,
    mode,
    sourceUrl,
    segments,
    chunkIndex,
    totalChunks,
    language,
  });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 32000,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'popcard_deck', schema: CARDS_SCHEMA, strict: true },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from model');
  const parsed = JSON.parse(raw);

  const cards = (parsed.cards || []).map((c) => ({
    ...c,
    answer: normalizeAnswer(c.answer),
  }));

  return {
    title: parsed.title,
    summary: parsed.summary,
    cards,
    model: MODEL,
    usage: completion.usage,
  };
}

const SUMMARY_SYSTEM_PROMPT = `You generate a single SUMMARY card that closes a deck. It's the LAST card the learner sees after working through all the Q&A cards — it should crystallize what stays with them.

Output strict JSON matching this schema:
{
  "card": {
    "type": "idea",
    "importance": "must_know",
    "question": "<short framing — e.g. 'What stays with you?' or 'Key takeaways?'>",
    "answer": "<rich multi-paragraph summary with bullets — see formatting below>",
    "hint": null,
    "sourceTimestampSeconds": null
  }
}

ANSWER FORMAT (plain text with literal newlines preserved — same rendering as every other card):
1. One short opening sentence that restates the source's core thesis. Use \`**bold**\` for the source title and author if surfaced.
2. Blank line.
3. A bulleted list (4-7 bullets) of the most actionable principles or shifts in thinking the source delivers. Each bullet on its own line starting with "• " (U+2022 + space). 8-18 words each.
4. Blank line.
5. One closing sentence — what to do with this knowledge. Action-oriented.

Use \`**bold**\` sparingly for names, titles, and named frameworks. No other markdown.`;

async function generateSummaryCard({ text, mode, sourceUrl, language = 'English' }) {
  const userParts = [
    `Generate the single SUMMARY card for this source.`,
    mode === 'simple'
      ? 'Mode: simple — plain language, "smart friend" voice.'
      : 'Mode: study — slightly more rigorous tone.',
    `OUTPUT LANGUAGE: ${language}. Write the entire card (question, answer, bullets, attribution) in ${language}, regardless of the source's language. The bullet character "• " stays as-is.`,
  ];
  if (sourceUrl) userParts.push(`Source URL: ${sourceUrl}`);
  userParts.push(`\nSource digest (opening + closing of the material):\n${text}`);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: userParts.join('\n') },
    ],
    max_completion_tokens: 2000,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'popcard_summary',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            card: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string', enum: CARD_TYPES },
                importance: { type: 'string', enum: IMPORTANCES },
                question: { type: 'string' },
                answer: { type: 'string' },
                hint: { type: ['string', 'null'] },
                sourceTimestampSeconds: { type: ['integer', 'null'] },
              },
              required: ['type', 'importance', 'question', 'answer', 'hint', 'sourceTimestampSeconds'],
            },
          },
          required: ['card'],
        },
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.card) return null;
    return { ...parsed.card, answer: normalizeAnswer(parsed.card.answer) };
  } catch {
    return null;
  }
}

function normalizeAnswer(answer) {
  if (typeof answer !== 'string') return answer;
  let text = answer;
  // Strip markdown forms we DON'T render. We do render `**bold**`, so leave
  // double-asterisks alone — the frontend converts them to <strong>.
  text = text.replace(/__([^_\n]+)__/g, '$1');
  text = text.replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?:;)]|$)/g, '$1$2');
  text = text.replace(/(^|\s)_([^_\n]+)_(?=\s|[.,!?:;)]|$)/g, '$1$2');
  // Detect bullet characters anywhere except the start of a line. If we find
  // ANY, normalize the entire answer's bullets onto their own lines. We avoid
  // a global replace for cards that don't use bullets (a stray • inside prose
  // would otherwise get mangled).
  const hasInlineBullet = /[^\n][ \t]*•[ \t]+/.test(text);
  if (hasInlineBullet) {
    text = text.replace(/[ \t]*•[ \t]*/g, '\n• ');
    // Make sure the first bullet has a blank line before it (separating it
    // from the preceding paragraph), then single newlines between bullets.
    text = text.replace(/([^\n])\n• /, '$1\n\n• ');
  }
  // Collapse any runs of 3+ newlines down to a clean blank line.
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim trailing whitespace on every line and trim the whole string.
  text = text.split('\n').map((line) => line.trimEnd()).join('\n').trim();
  return text;
}

const REFINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
};

const REFINE_INSTRUCTIONS = {
  simplify: `Rewrite this answer for someone who finds the original too complex.
- Plain English, short sentences.
- Drop jargon, replace with everyday words.
- Same factual content, easier to parse. Max 35 words.`,

  eli15: `Rewrite this answer as if explaining to a sharp 15-year-old.
- Use a clear analogy or comparison if it helps.
- Keep it accurate, but accessible.
- Max 60 words.`,

  why: `Explain why this matters in practice — what's the real-world significance or use of this idea.
- Max 50 words.
- Concrete, not vague.`,
};

const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
          correctIndex: { type: 'integer' },
          explanation: { type: 'string' },
          kind: { type: 'string', enum: ['multiple_choice', 'true_false'] },
        },
        required: ['question', 'options', 'correctIndex', 'explanation', 'kind'],
      },
    },
  },
  required: ['questions'],
};

const QUIZ_SYSTEM = `You are Popcard's quiz generator. Turn a deck of study cards into 8–12 multiple-choice questions that test real understanding, not just memorisation.

Rules:
- Mix difficulty: about a third easy recall, a third applied/conceptual, a third harder synthesis.
- For multiple_choice questions: 4 options (correctIndex 0–3). Distractors must be plausible — based on common confusions, near-misses, or related concepts from the source material. No silly options.
- For true_false questions: exactly 2 options ["True", "False"]; correctIndex is 0 or 1; use sparingly (max 2 of these per quiz).
- Every question must be answerable from the source cards alone.
- Explanation should be one or two sentences and tell the learner why the correct answer is right (and ideally why the distractor they likely picked is wrong).
- No question/answer should duplicate another question's content.
- Output strict JSON matching the provided schema.`;

export async function generateQuiz({ deckTitle, cards }) {
  const cardSummary = cards.map((c, i) => {
    const parts = [`[Card ${i + 1}] ${c.question}`, `Answer: ${c.answer}`];
    if (c.hint) parts.push(`Hint: ${c.hint}`);
    return parts.join('\n');
  }).join('\n\n');

  const userPrompt = `Deck title: ${deckTitle || 'Untitled'}\n\nSource cards:\n${cardSummary}\n\nGenerate the quiz now.`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: QUIZ_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'popcard_quiz', schema: QUIZ_SCHEMA, strict: true },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from model');
  const parsed = JSON.parse(raw);

  // Defensive: clamp correctIndex to options bounds, dedupe questions
  const seen = new Set();
  const questions = (parsed.questions || []).filter((q) => {
    if (!q?.options?.length) return false;
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return false;
    const key = q.question.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { questions, model: MODEL };
}

export async function refineCard({ action, question, answer }) {
  const instr = REFINE_INSTRUCTIONS[action];
  if (!instr) throw new Error(`Unknown refine action: ${action}`);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: `You are Popcard, helping a learner understand a flashcard better. ${instr}` },
      {
        role: 'user',
        content: `Question:\n${question}\n\nOriginal answer:\n${answer}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'popcard_refine', schema: REFINE_SCHEMA, strict: true },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from model');
  return JSON.parse(raw).answer;
}
