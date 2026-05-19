import './_lib/env.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';

// Add or remove a card from a collection.
//   POST   /api/collection-card  → body { collectionId, sourceCardId }
//          Snapshots the source card's content into the collection.
//   DELETE /api/collection-card?id=X → removes a collection_card row.

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  if (req.method === 'POST') return handleAdd(req, res, session);
  if (req.method === 'DELETE') return handleRemove(req, res, session);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAdd(req, res, session) {
  const { collectionId, sourceCardId } = req.body || {};
  if (!collectionId || !sourceCardId) {
    return res.status(400).json({ error: 'Missing collectionId or sourceCardId' });
  }

  try {
    // Verify collection ownership
    const cRows = await sql`
      SELECT id FROM collections WHERE id = ${collectionId} AND user_id = ${session.uid} LIMIT 1
    `;
    if (!cRows.length) return res.status(404).json({ error: 'Collection not found' });

    // Fetch source card + its deck (must belong to user) for snapshot + label
    const srcRows = await sql`
      SELECT c.id, c.type, c.importance, c.question, c.answer, c.hint,
             c.source_timestamp_seconds, c.deck_id,
             d.title AS deck_title, d.source_type AS deck_source_type
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE c.id = ${sourceCardId} AND d.user_id = ${session.uid}
      LIMIT 1
    `;
    if (!srcRows.length) return res.status(404).json({ error: 'Source card not found' });
    const src = srcRows[0];

    // Build a provenance label like "From 'Build' (text)" or "From '...' (youtube)"
    const sourceLabel = `From "${src.deck_title || 'Untitled'}"`;

    // Determine next position
    const posRows = await sql`
      SELECT COALESCE(MAX(position) + 1, 0)::int AS next_pos
      FROM collection_cards WHERE collection_id = ${collectionId}
    `;
    const nextPos = posRows[0]?.next_pos ?? 0;

    try {
      const inserted = await sql`
        INSERT INTO collection_cards
          (collection_id, source_card_id, source_deck_id, position, type, importance,
           question, answer, hint, source_timestamp_seconds, source_label)
        VALUES (${collectionId}, ${src.id}, ${src.deck_id}, ${nextPos},
                ${src.type || 'idea'}, ${src.importance || 'good_to_know'},
                ${src.question}, ${src.answer}, ${src.hint || null},
                ${src.source_timestamp_seconds}, ${sourceLabel})
        RETURNING id, position
      `;
      // Bump collection updated_at
      await sql`UPDATE collections SET updated_at = NOW() WHERE id = ${collectionId}`;
      return res.status(201).json({
        collectionCard: { id: inserted[0].id, position: inserted[0].position },
      });
    } catch (insertErr) {
      // Unique violation (already saved this card to this collection) → idempotent OK
      if (insertErr?.code === '23505') {
        return res.status(200).json({ alreadySaved: true });
      }
      throw insertErr;
    }
  } catch (e) {
    if (e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({ error: 'migration_required', message: 'Collections table is missing. Run `node tools/migrate-collections.mjs`.' });
    }
    console.error('collection-card add error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}

async function handleRemove(req, res, session) {
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const result = await sql`
      DELETE FROM collection_cards
      WHERE id = ${id}
        AND collection_id IN (SELECT id FROM collections WHERE user_id = ${session.uid})
      RETURNING id, collection_id
    `;
    if (!result.length) return res.status(404).json({ error: 'Card not found' });
    await sql`UPDATE collections SET updated_at = NOW() WHERE id = ${result[0].collection_id}`;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('collection-card remove error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}
