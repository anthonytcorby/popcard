import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const CAPTION_PROMPT = `You are an elite TikTok copywriter. You write carousel slides for podcast/YouTube clips that get millions of views.

Given the video title, channel name, and card data, produce:

1. "hookLine" — Max 12 words, scroll-stopping. Use *asterisks* around 1-2 KEY WORDS for emphasis.
   - MUST include the episode/video title (or a recognisable abbreviated form of it). The viewer must know WHICH episode this is about.
   - You may paraphrase or add a hook around the title, but the title itself (or its key phrase) must be clearly present.
   - Provoke curiosity, urgency, or shock. NEVER start with "On..."
   - Examples: "What *Matt Damon* REVEALED in 'Good Will Hunting' Interview", "The *REAL* takeaways from 'How I Built This'"
   - The asterisk words get rendered as bold uppercase in the design

2. "slideOrder" — Array of card indices (0-based) that re-orders the cards to tell a STORY.
   Rules for ordering:
   - Open with the most shocking/attention-grabbing insight
   - Build a narrative arc: setup → escalation → climax → resolution
   - Group related points together so each slide flows into the next
   - End with a forward-looking or actionable takeaway before the CTA
   - The viewer should feel like they went on a journey, not read a random list
   - Return ALL card indices, just re-ordered

3. "rewrittenHeadlines" — Array of rewritten headlines, one per card in the ORIGINAL order (before slideOrder reordering).
   Rules:
   - NEVER "On [topic]". That's lazy filler.
   - Use *asterisks* on 1-2 words per headline for emphasis
   - Each headline must be a SPECIFIC statement from the card's actual content
   - Include numbers/stats when available
   - Make the viewer NEED to read the body
   - Max 8 words
   - BAD: "On RV Parks", "On The Trade-Offs", "On Bitcoin"
   - GOOD: "RV Parks Are a *$35B* Goldmine", "The *Hidden* Cost Nobody Mentions", "He Said Bitcoin Goes to *ZERO*"
   - Think: would someone screenshot just this slide? If not, rewrite it.

4. "caption" — TikTok caption (under 250 chars excluding hashtags):
   - Hook question or bold claim
   - 1-2 sentences of value
   - CTA: "Save this" or "Follow for more"
   - 10-12 hashtags

Return ONLY JSON: { "hookLine": "...", "slideOrder": [0,3,1,...], "rewrittenHeadlines": [...], "caption": "..." }`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { ok } = rateLimit(ip, 60_000, 10);
  if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { title, cards, channelName } = await req.json();

  // cards is an array of { headline, body, type }
  const cardList = (cards as Array<{ headline: string; body: string; type: string }>)
    .map((c, i) => `${i + 1}. [${c.type}] "${c.headline}" — ${c.body?.slice(0, 150) || ''}`)
    .join('\n');

  if (!openai) {
    const fallbackHeadlines = (cards as Array<{ headline: string }>).map((c) => c.headline);
    return NextResponse.json({
      caption: `${title}\n\nKey takeaways you need to know. Save this for later!\n\n#knowledge #learning #education #productivity #selfimprovement #motivation #tips #fyp`,
      hookLine: title?.split(':')[0] || title,
      rewrittenHeadlines: fallbackHeadlines,
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: CAPTION_PROMPT },
        {
          role: 'user',
          content: `Channel: ${channelName || 'Unknown'}\nVideo title: ${title}\n\nCards:\n${cardList}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response');
    const parsed = JSON.parse(text) as {
      caption: string;
      hookLine: string;
      slideOrder?: number[];
      rewrittenHeadlines: string[];
    };
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[tiktok/caption]', err);
    const fallbackHeadlines = (cards as Array<{ headline: string }>).map((c) => c.headline);
    return NextResponse.json({
      caption: `${title}\n\nKey takeaways you need to know. Save this!\n\n#knowledge #learning #education #fyp #tips`,
      hookLine: title,
      rewrittenHeadlines: fallbackHeadlines,
    });
  }
}
