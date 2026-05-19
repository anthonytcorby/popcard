import './_lib/env.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';

// Single collection operations
//   GET    /api/collection?id=X  → fetch collection + its cards
//   PATCH  /api/collection?id=X  → rename / pin
//   DELETE /api/collection?id=X  → delete (cascades to collection_cards)

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const id = req.query?.id || req.body?.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'GET') return handleGet(req, res, session, id);
  if (req.method === 'PATCH') return handlePatch(req, res, session, id);
  if (req.method === 'DELETE') return handleDelete(req, res, session, id);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res, session, id) {
  try {
    const collRows = await sql`
      SELECT id, name, description, pinned, created_at, updated_at
      FROM collections
      WHERE id = ${id} AND user_id = ${session.uid}
      LIMIT 1
    `;
    if (!collRows.length) return res.status(404).json({ error: 'Collection not found' });
    const c = collRows[0];

    const cardRows = await sql`
      SELECT id, source_card_id, source_deck_id, position, type, importance,
             question, answer, hint, source_timestamp_seconds, source_label, added_at
      FROM collection_cards
      WHERE collection_id = ${id}
      ORDER BY position, added_at
    `;

    res.status(200).json({
      collection: {
        id: c.id,
        name: c.name,
        description: c.description,
        pinned: c.pinned,
        cardCount: cardRows.length,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      },
      cards: cardRows.map((r) => ({
        id: r.id,
        sourceCardId: r.source_card_id,
        sourceDeckId: r.source_deck_id,
        position: r.position,
        type: r.type,
        importance: r.importance,
        question: r.question,
        answer: r.answer,
        hint: r.hint,
        sourceTimestampSeconds: r.source_timestamp_seconds,
        sourceLabel: r.source_label,
        addedAt: r.added_at,
      })),
    });
  } catch (e) {
    if (e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({ error: 'migration_required', message: 'Collections table is missing. Run `node tools/migrate-collections.mjs`.' });
    }
    console.error('collection get error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}

async function handlePatch(req, res, session, id) {
  const { name, pinned } = req.body || {};
  const updates = {};
  if (typeof name === 'string') {
    const t = name.trim().slice(0, 140);
    if (!t) return res.status(400).json({ error: 'Name cannot be empty' });
    updates.name = t;
  }
  if (typeof pinned === 'boolean') updates.pinned = pinned;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    let result;
    if (updates.name != null && updates.pinned != null) {
      result = await sql`
        UPDATE collections SET name = ${updates.name}, pinned = ${updates.pinned}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${session.uid}
        RETURNING id, name, pinned
      `;
    } else if (updates.name != null) {
      result = await sql`
        UPDATE collections SET name = ${updates.name}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${session.uid}
        RETURNING id, name, pinned
      `;
    } else {
      result = await sql`
        UPDATE collections SET pinned = ${updates.pinned}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${session.uid}
        RETURNING id, name, pinned
      `;
    }
    if (!result.length) return res.status(404).json({ error: 'Collection not found' });
    res.status(200).json({ collection: result[0] });
  } catch (e) {
    console.error('collection patch error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}

async function handleDelete(req, res, session, id) {
  try {
    const result = await sql`
      DELETE FROM collections WHERE id = ${id} AND user_id = ${session.uid} RETURNING id
    `;
    if (!result.length) return res.status(404).json({ error: 'Collection not found' });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('collection delete error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}
