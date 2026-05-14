import './_lib/env.js';
import { getSession } from './_lib/session.js';
import { getDeckWithCards } from './_lib/decks.js';
import { generateQuiz } from './_lib/llm.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const { deckId } = req.body || {};
  if (!deckId) return res.status(400).json({ error: 'Missing deckId' });

  const deck = await getDeckWithCards(deckId, session.uid);
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const cards = deck.cards || [];
  if (cards.length < 3) {
    return res.status(400).json({
      error: 'deck_too_small',
      message: 'Need at least 3 cards to generate a quiz.',
    });
  }

  try {
    const { questions } = await generateQuiz({
      deckTitle: deck.title,
      cards: cards.map((c) => ({
        question: c.question,
        answer: c.answer,
        hint: c.hint,
      })),
    });
    res.status(200).json({ questions });
  } catch (e) {
    console.error('Quiz error', e);
    res.status(502).json({ error: 'llm_error', message: e.message });
  }
}
