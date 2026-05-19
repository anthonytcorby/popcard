import './_lib/env.js';
import { sql } from './_lib/db.js';
import { getSession } from './_lib/session.js';

// Collections — user's curated "knowledge decks" built from cards saved from
// any source deck.
//   GET  /api/collections        → list user's collections + card counts
//   POST /api/collections        → create a new collection (body: {name, description?})

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  if (req.method === 'GET') return handleList(req, res, session);
  if (req.method === 'POST') return handleCreate(req, res, session);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req, res, session) {
  try {
    const rows = await sql`
      SELECT
        c.id, c.name, c.description, c.pinned, c.created_at, c.updated_at,
        (SELECT count(*)::int FROM collection_cards cc WHERE cc.collection_id = c.id) AS card_count
      FROM collections c
      WHERE c.user_id = ${session.uid}
      ORDER BY c.pinned DESC, c.updated_at DESC
    `;
    res.status(200).json({
      collections: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        pinned: r.pinned,
        cardCount: r.card_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    if (e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({
        error: 'migration_required',
        message: 'Collections table is missing. Run `node tools/migrate-collections.mjs` to enable knowledge decks.',
      });
    }
    console.error('collections list error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}

async function handleCreate(req, res, session) {
  const { name, description } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Missing name' });
  }
  const trimmedName = name.trim().slice(0, 140);
  const trimmedDesc = typeof description === 'string' ? description.trim().slice(0, 500) : null;

  try {
    const rows = await sql`
      INSERT INTO collections (user_id, name, description)
      VALUES (${session.uid}, ${trimmedName}, ${trimmedDesc})
      RETURNING id, name, description, pinned, created_at, updated_at
    `;
    const c = rows[0];
    res.status(201).json({
      collection: {
        id: c.id,
        name: c.name,
        description: c.description,
        pinned: c.pinned,
        cardCount: 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      },
    });
  } catch (e) {
    if (e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '')) {
      return res.status(503).json({
        error: 'migration_required',
        message: 'Collections table is missing. Run `node tools/migrate-collections.mjs` to enable knowledge decks.',
      });
    }
    console.error('collection create error', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
}
