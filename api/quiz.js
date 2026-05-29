import './_lib/env.js';
import { getSession } from './_lib/session.js';
import { getDeckWithCards, saveDeckQuiz } from './_lib/decks.js';
import { generateQuiz } from './_lib/llm.js';

// GET /api/quiz?id=<deckId>
// Returns a deck's multiple-choice quiz, generating + caching it on first play.
// The quiz uses purpose-built, same-concept distractors (see generateQuiz),
// not recycled card answers — so the wrong options are genuinely plausible.
const MIN_CARDS = 4;

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  // GET ?id= (quizzes page) and POST {deckId} (deck-view page) both supported.
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query?.id || req.query?.deckId || req.body?.deckId || req.body?.id;
  if (!id) return res.status(400).json({ error: 'Missing deck id' });

  const deck = await getDeckWithCards(id, session.uid);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  // Reuse the cached quiz if we already generated one for this deck.
  const cached = deck.quiz;
  if (cached && Array.isArray(cached.questions) && cached.questions.length) {
    return res.status(200).json({ questions: cached.questions, cached: true });
  }

  // Quiz-worthy cards: skip the overview card (position 0).
  const cards = (deck.cards || []).filter((c) => c.position !== 0 && c.answer);
  if (cards.length < MIN_CARDS) {
    return res.status(400).json({ error: 'deck_too_small', message: 'Need at least 4 cards to build a quiz.' });
  }

  try {
    const { questions, model } = await generateQuiz({
      deckTitle: deck.title,
      cards: cards.map((c) => ({ question: c.question, answer: c.answer, hint: c.hint })),
    });
    if (!questions.length) {
      return res.status(502).json({ error: 'llm_error', message: 'Could not build a quiz from this deck. Try again.' });
    }
    const quiz = { questions, model, generatedAt: new Date().toISOString() };
    await saveDeckQuiz(id, session.uid, quiz);   // cache for next time
    return res.status(200).json({ questions, cached: false });
  } catch (e) {
    console.error('Quiz generation error', e);
    return res.status(502).json({ error: 'llm_error', message: 'Could not build a quiz right now. Try again.' });
  }
}
