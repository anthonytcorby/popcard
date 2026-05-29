// Seed Popcard's first two stock-knowledge modules: A-Level Maths
// (Differentiation) and A-Level English Literature (techniques & analysis).
//
// Run with: node tools/seed-stock-modules.mjs   (idempotent — re-running
// refreshes each module's cards/quizzes by slug).
//
// EVERYTHING here is inserted with review_status = 'unverified'. It is NOT
// shown on the site (see api/_lib/stock.js, which only ever serves 'verified'
// content). A future human/AI reviewer promotes items via stock_review_log.
//
// Reads POSTGRES_URL from .env.local
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^POSTGRES_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '');
if (!url) throw new Error('POSTGRES_URL not found in .env.local');
const sql = neon(url);

// ---------------------------------------------------------------------------
// MODULE 1 — A-Level Mathematics: Differentiation
// ---------------------------------------------------------------------------
const maths = {
  slug: 'maths-alevel-edexcel-pure-differentiation',
  subject: 'Mathematics',
  level: 'A Level',
  qualification: 'Edexcel A Level Mathematics (9MA0)',
  exam_board: 'Edexcel',
  module: 'Pure Mathematics',
  topic: 'Differentiation',
  subtopic: 'Differentiation (Years 1 & 2)',
  title: 'A-Level Maths — Differentiation',
  description: 'Core differentiation for A-Level Pure Maths: rules, tangents and normals, stationary points, optimisation, and standard derivatives.',
  source_note: 'AI-generated and mapped to Edexcel 9MA0 Pure Mathematics (Differentiation). Pending source verification — not yet reviewed.',
  cards: [
    { type: 'definition', diff: 'introductory', q: 'What does differentiation find?', a: 'The rate of change of one quantity with respect to another — geometrically, the gradient of a curve at a point.', hint: 'Think "gradient" / "rate of change".', tags: ['concept'] },
    { type: 'definition', diff: 'introductory', q: 'What do the notations dy/dx and f′(x) mean?', a: 'Both mean the derivative of the function. dy/dx is Leibniz notation; f′(x) is function notation.', hint: null, tags: ['notation'] },
    { type: 'explanation', diff: 'introductory', q: 'How is the gradient of a curve at a point defined?', a: 'It equals the gradient of the tangent to the curve at that point, found by evaluating the derivative there.', hint: null, tags: ['gradient','tangent'] },
    { type: 'formula', diff: 'advanced', q: 'State differentiation from first principles.', a: 'f′(x) = lim(h→0) [ f(x+h) − f(x) ] / h.', hint: 'A limit of the gradient of a chord as h → 0.', tags: ['first-principles','limit'] },
    { type: 'formula', diff: 'core', q: 'State the power rule for differentiation.', a: 'If y = xⁿ then dy/dx = n·xⁿ⁻¹.', hint: 'Bring the power down, subtract one.', tags: ['power-rule'] },
    { type: 'formula', diff: 'introductory', q: 'What is the derivative of a constant, c?', a: 'd/dx (c) = 0 — a constant has zero rate of change.', hint: null, tags: ['rules'] },
    { type: 'formula', diff: 'core', q: 'State the constant-multiple rule.', a: 'd/dx [a·f(x)] = a·f′(x): a constant factor passes through differentiation.', hint: null, tags: ['rules'] },
    { type: 'formula', diff: 'core', q: 'State the sum/difference rule.', a: 'd/dx [f(x) ± g(x)] = f′(x) ± g′(x): differentiate term by term.', hint: null, tags: ['rules'] },
    { type: 'worked_example', diff: 'core', q: 'Differentiate y = 3x⁴ − 2x² + 5.', a: 'dy/dx = 12x³ − 4x. (The constant 5 differentiates to 0.)', hint: 'Apply the power rule to each term.', tags: ['polynomial'] },
    { type: 'worked_example', diff: 'core', q: 'Differentiate y = 1/x.', a: 'Write as x⁻¹, so dy/dx = −x⁻² = −1/x².', hint: 'Rewrite using a negative power first.', tags: ['negative-powers'] },
    { type: 'worked_example', diff: 'core', q: 'Differentiate y = √x.', a: 'Write as x^(1/2), so dy/dx = ½·x^(−1/2) = 1/(2√x).', hint: 'Use a fractional power.', tags: ['fractional-powers'] },
    { type: 'definition', diff: 'core', q: 'What is the second derivative (d²y/dx² or f″(x))?', a: 'The derivative of the first derivative. It measures how the gradient is changing (concavity).', hint: null, tags: ['second-derivative'] },
    { type: 'formula', diff: 'core', q: 'Give the equation of the tangent to y = f(x) at x = a.', a: 'y − f(a) = f′(a)(x − a), where f′(a) is the gradient at that point.', hint: null, tags: ['tangent'] },
    { type: 'formula', diff: 'core', q: 'Give the equation of the normal to y = f(x) at x = a.', a: 'The normal is perpendicular to the tangent: gradient = −1/f′(a), so y − f(a) = −1/f′(a) · (x − a).', hint: 'Perpendicular gradients multiply to −1.', tags: ['normal'] },
    { type: 'definition', diff: 'core', q: 'When is a function increasing on an interval?', a: 'When f′(x) > 0 throughout that interval (positive gradient).', hint: null, tags: ['increasing'] },
    { type: 'definition', diff: 'core', q: 'When is a function decreasing on an interval?', a: 'When f′(x) < 0 throughout that interval (negative gradient).', hint: null, tags: ['decreasing'] },
    { type: 'definition', diff: 'core', q: 'What is a stationary point?', a: 'A point where f′(x) = 0 (zero gradient) — it may be a maximum, minimum, or point of inflection.', hint: null, tags: ['stationary'] },
    { type: 'process', diff: 'core', q: 'How do you use the second derivative to classify a stationary point?', a: 'At a point where f′(x)=0: if f″(x) < 0 it is a maximum; if f″(x) > 0 it is a minimum; if f″(x) = 0 the test is inconclusive — investigate further.', hint: null, tags: ['stationary','second-derivative'] },
    { type: 'definition', diff: 'advanced', q: 'What is a point of inflection?', a: 'A point where the concavity changes (f″ changes sign). f″ = 0 is necessary but not sufficient — the sign must actually change.', hint: null, tags: ['inflection'] },
    { type: 'process', diff: 'core', q: 'What are the steps of an optimisation problem?', a: 'Form an expression for the quantity, differentiate it, set the derivative to 0, solve, verify the nature (max/min), then interpret the answer in context.', hint: null, tags: ['optimisation','modelling'] },
    { type: 'formula', diff: 'core', q: 'State the chain rule.', a: 'dy/dx = dy/du · du/dx. For y = [f(x)]ⁿ, dy/dx = n[f(x)]ⁿ⁻¹·f′(x).', hint: 'Differentiate the outside, then multiply by the derivative of the inside.', tags: ['chain-rule'] },
    { type: 'formula', diff: 'advanced', q: 'State the product rule.', a: 'd/dx [u·v] = u′v + uv′.', hint: null, tags: ['product-rule'] },
    { type: 'formula', diff: 'advanced', q: 'State the quotient rule.', a: 'd/dx [u/v] = (u′v − uv′) / v².', hint: 'Low-d-high minus high-d-low, over low squared.', tags: ['quotient-rule'] },
    { type: 'formula', diff: 'core', q: 'What is the derivative of eˣ (and e^{kx})?', a: 'd/dx (eˣ) = eˣ; and d/dx (e^{kx}) = k·e^{kx}.', hint: null, tags: ['exponential'] },
    { type: 'formula', diff: 'core', q: 'What is the derivative of ln x?', a: 'd/dx (ln x) = 1/x  (for x > 0).', hint: null, tags: ['logarithm'] },
    { type: 'formula', diff: 'core', q: 'What are the derivatives of sin x and cos x?', a: 'd/dx (sin x) = cos x; d/dx (cos x) = −sin x  (x in radians).', hint: null, tags: ['trigonometry'] },
    { type: 'formula', diff: 'advanced', q: 'What is the derivative of tan x?', a: 'd/dx (tan x) = sec²x  (x in radians).', hint: null, tags: ['trigonometry'] },
    { type: 'application', diff: 'advanced', q: 'How do connected rates of change work?', a: 'Link related derivatives with the chain rule, e.g. dV/dt = dV/dr · dr/dt — useful when several quantities change with time.', hint: null, tags: ['rates-of-change'] },
    { type: 'process', diff: 'extension', q: 'How do you differentiate implicitly?', a: 'Differentiate both sides with respect to x, applying the chain rule to y-terms: d/dx(yⁿ) = n·yⁿ⁻¹·(dy/dx). Then rearrange for dy/dx.', hint: null, tags: ['implicit'] },
    { type: 'misconception', diff: 'core', q: 'Common error: differentiating trig functions in degrees.', a: 'The standard derivatives (sin x → cos x, etc.) only hold when x is measured in radians, not degrees. Always work in radians.', hint: null, tags: ['misconception','trigonometry'] },
  ],
  quizzes: [
    { q: 'What is d/dx of x⁵?', options: ['5x⁴', 'x⁴', '5x⁵', '4x⁵'], correct: 0, explanation: 'Power rule: bring the 5 down, reduce the power by one → 5x⁴.' },
    { q: 'What is the derivative of the constant 7?', options: ['7', '1', '0', '7x'], correct: 2, explanation: 'A constant has zero rate of change, so its derivative is 0.' },
    { q: 'Differentiate y = 3x².', options: ['3x', '6x', '6x²', '3'], correct: 1, explanation: '3·2·x¹ = 6x.' },
    { q: 'At a maximum stationary point, the second derivative f″(x) is…', options: ['positive', 'zero', 'negative', 'undefined'], correct: 2, explanation: 'f″(x) < 0 indicates a maximum (curve is concave down).' },
    { q: 'The gradient of the tangent at a point equals…', options: ['f(x) at that point', 'f′(x) at that point', 'the y-value', 'zero always'], correct: 1, explanation: 'The derivative evaluated at the point gives the tangent gradient.' },
    { q: 'If a tangent has gradient 2, the normal there has gradient…', options: ['2', '−2', '½', '−½'], correct: 3, explanation: 'Perpendicular gradients multiply to −1, so normal gradient = −1/2.' },
    { q: 'What is d/dx of e^{2x}?', options: ['e^{2x}', '2e^{2x}', '2x·e^{2x}', 'e^{x}'], correct: 1, explanation: 'd/dx(e^{kx}) = k·e^{kx}, so 2e^{2x}.' },
    { q: 'What is d/dx of ln x?', options: ['x', '1/x', 'ln x', 'e^x'], correct: 1, explanation: 'The derivative of ln x is 1/x.' },
    { q: 'Using the chain rule, d/dx of (3x + 1)⁴ is…', options: ['4(3x+1)³', '12(3x+1)³', '(3x+1)³', '12(3x+1)⁴'], correct: 1, explanation: '4(3x+1)³ × 3 (derivative of the inside) = 12(3x+1)³.' },
    { q: 'A function is increasing on an interval when…', options: ['f′(x) > 0', 'f′(x) < 0', 'f′(x) = 0', 'f″(x) = 0'], correct: 0, explanation: 'Positive gradient throughout means the function is increasing.' },
  ],
};

// ---------------------------------------------------------------------------
// MODULE 2 — A-Level English Literature: techniques, terminology & analysis
// ---------------------------------------------------------------------------
const literature = {
  slug: 'english-lit-alevel-aqa-techniques-analysis',
  subject: 'English Literature',
  level: 'A Level',
  qualification: 'AQA A Level English Literature',
  exam_board: 'AQA',
  module: 'Literary Methods & Analysis',
  topic: 'Techniques, Terminology & Analysis',
  subtopic: 'Devices, form/structure, prose & drama terms, exam skills',
  title: 'A-Level English Lit — Techniques & Analysis',
  description: 'Core literary terminology and analytical skills for A-Level English Literature: devices, poetic form and structure, prose and drama terms, and how to write about them.',
  source_note: 'AI-generated and mapped to AQA A Level English Literature assessment objectives (AO1–AO5). Original explanatory content; no copyrighted set-text material reproduced. Pending source verification — not yet reviewed.',
  cards: [
    { type: 'definition', diff: 'introductory', q: 'What is a metaphor?', a: 'A direct comparison stating one thing IS another (without "like" or "as") to suggest shared qualities.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'introductory', q: 'What is a simile?', a: 'A comparison of two things using "like" or "as".', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'introductory', q: 'What is personification?', a: 'Giving human qualities, feelings, or actions to non-human things or abstract ideas.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'introductory', q: 'What is imagery?', a: 'Descriptive language that appeals to the senses to create vivid mental pictures.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'core', q: 'What is symbolism?', a: 'When an object, colour, or image stands for a larger idea beyond its literal meaning.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'core', q: 'What is a motif?', a: 'A recurring image, idea, or symbol that develops a theme across a text.', hint: 'Repetition is key — it recurs.', tags: ['structure'] },
    { type: 'definition', diff: 'core', q: 'What is juxtaposition?', a: 'Placing two contrasting ideas or images close together to highlight their differences.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'core', q: 'What is an oxymoron?', a: 'Two contradictory terms placed together, e.g. "deafening silence".', hint: null, tags: ['device'] },
    { type: 'comparison', diff: 'core', q: 'What is the difference between verbal, dramatic, and situational irony?', a: 'Verbal: saying the opposite of what is meant. Dramatic: the audience knows something a character does not. Situational: an outcome opposite to what was expected.', hint: null, tags: ['irony'] },
    { type: 'definition', diff: 'core', q: 'What is pathetic fallacy?', a: 'Attributing human emotions to nature or weather to reflect a character’s mood or the atmosphere.', hint: 'Stormy weather mirroring inner turmoil.', tags: ['device'] },
    { type: 'definition', diff: 'core', q: 'What is foreshadowing?', a: 'Hints or clues early in a text that suggest events to come later.', hint: null, tags: ['structure'] },
    { type: 'definition', diff: 'core', q: 'What is enjambment?', a: 'When a sentence or phrase runs over the end of a line into the next without a pause.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'core', q: 'What is a caesura?', a: 'A deliberate pause within a line of poetry, often created by punctuation.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'core', q: 'What is an end-stopped line?', a: 'A line that ends with a pause or punctuation, completing its sense.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'advanced', q: 'What is a volta?', a: 'The "turn" — a shift in argument, tone, or mood in a poem, classically at line 9 or before the final couplet of a sonnet.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'advanced', q: 'What is iambic pentameter?', a: 'A line of five iambs (an iamb = an unstressed syllable followed by a stressed one), giving ten syllables with a de-DUM rhythm.', hint: null, tags: ['metre'] },
    { type: 'definition', diff: 'advanced', q: 'What is blank verse?', a: 'Unrhymed iambic pentameter — common in Shakespeare’s plays.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'core', q: 'What is free verse?', a: 'Poetry without a regular metre or rhyme scheme.', hint: null, tags: ['form'] },
    { type: 'definition', diff: 'core', q: 'What defines a sonnet?', a: 'A 14-line poem with a set rhyme scheme — e.g. the Shakespearean form: three quatrains and a final rhyming couplet.', hint: null, tags: ['form'] },
    { type: 'comparison', diff: 'core', q: 'What is the difference between alliteration, assonance, and sibilance?', a: 'Alliteration: repeated initial consonant sounds. Assonance: repeated vowel sounds within nearby words. Sibilance: repeated "s"/"sh" sounds.', hint: null, tags: ['sound'] },
    { type: 'definition', diff: 'advanced', q: 'What is anaphora?', a: 'The repetition of the same word or phrase at the start of successive lines or clauses, often for emphasis.', hint: null, tags: ['device'] },
    { type: 'definition', diff: 'core', q: 'What is a soliloquy?', a: 'A speech in a play where a character, alone on stage, voices their inner thoughts to the audience.', hint: null, tags: ['drama'] },
    { type: 'definition', diff: 'core', q: 'What is an aside?', a: 'A short remark made to the audience (or one character) that other characters on stage are not meant to hear.', hint: null, tags: ['drama'] },
    { type: 'definition', diff: 'advanced', q: 'What is an unreliable narrator?', a: 'A narrator whose account the reader cannot fully trust, due to bias, limited knowledge, or deception.', hint: null, tags: ['prose'] },
    { type: 'definition', diff: 'core', q: 'What is a semantic field?', a: 'A group of words linked by a shared area of meaning, e.g. words of disease and decay.', hint: null, tags: ['language'] },
    { type: 'definition', diff: 'advanced', q: 'What are a tragic hero and hamartia?', a: 'A tragic hero is a noble protagonist whose downfall is driven by a fatal flaw or error known as their hamartia.', hint: null, tags: ['tragedy'] },
    { type: 'definition', diff: 'core', q: 'What do "tone" and "register" mean?', a: 'Tone is the writer’s attitude/mood conveyed by their words; register is the level of formality of the language.', hint: null, tags: ['language'] },
    { type: 'exam_technique', diff: 'core', q: 'What do AQA assessment objectives AO1–AO5 reward?', a: 'AO1: informed argument + accurate terminology. AO2: analysis of language, form and structure. AO3: context. AO4: connections between texts. AO5: different interpretations.', hint: null, tags: ['exam','AO'] },
    { type: 'exam_technique', diff: 'core', q: 'How should you embed a quotation?', a: 'Weave a short quotation into the grammar of your own sentence rather than dropping it in separately — it reads fluently and lets you analyse specific words.', hint: null, tags: ['exam','skills'] },
    { type: 'exam_technique', diff: 'core', q: 'What makes a strong thesis in a literature essay?', a: 'A clear, arguable line of argument that directly answers the question and is sustained and developed across the whole essay.', hint: null, tags: ['exam','skills'] },
    { type: 'exam_technique', diff: 'core', q: 'What is the "what / how / why" of analysis?', a: 'Name the technique (what), explain the effect it creates (how), then link that to meaning, theme, or context (why) — the "why" earns the most marks.', hint: null, tags: ['exam','skills'] },
  ],
  quizzes: [
    { q: 'A comparison using "like" or "as" is a…', options: ['Metaphor', 'Simile', 'Symbol', 'Motif'], correct: 1, explanation: 'A simile compares using "like" or "as"; a metaphor states one thing IS another.' },
    { q: 'When the audience knows something a character does not, this is…', options: ['Verbal irony', 'Situational irony', 'Dramatic irony', 'Sarcasm'], correct: 2, explanation: 'Dramatic irony depends on the audience’s superior knowledge.' },
    { q: 'A line of poetry running on without pause into the next is…', options: ['Caesura', 'Enjambment', 'End-stopped', 'Volta'], correct: 1, explanation: 'Enjambment carries sense over the line break; a caesura is a pause within a line.' },
    { q: 'Unrhymed iambic pentameter is called…', options: ['Free verse', 'Blank verse', 'Sonnet', 'Prose'], correct: 1, explanation: 'Blank verse is unrhymed iambic pentameter; free verse has no regular metre at all.' },
    { q: 'Giving nature human emotions to reflect mood is…', options: ['Personification', 'Pathetic fallacy', 'Symbolism', 'Imagery'], correct: 1, explanation: 'Pathetic fallacy specifically uses nature/weather to mirror mood.' },
    { q: 'A recurring image or idea that develops a theme is a…', options: ['Motif', 'Metaphor', 'Caesura', 'Stanza'], correct: 0, explanation: 'A motif recurs across the text to build a theme.' },
    { q: 'The "turn" or shift of argument in a sonnet is the…', options: ['Volta', 'Quatrain', 'Couplet', 'Meter'], correct: 0, explanation: 'The volta marks a change in direction, tone, or argument.' },
    { q: 'A speech revealing a lone character’s private thoughts is a…', options: ['Aside', 'Soliloquy', 'Monologue to others', 'Dialogue'], correct: 1, explanation: 'A soliloquy is delivered alone on stage; an aside is a brief unheard remark.' },
    { q: 'Repetition of initial consonant sounds is…', options: ['Assonance', 'Sibilance', 'Alliteration', 'Anaphora'], correct: 2, explanation: 'Alliteration repeats initial consonant sounds in nearby words.' },
    { q: 'Which AQA assessment objective covers context?', options: ['AO1', 'AO2', 'AO3', 'AO5'], correct: 2, explanation: 'AO3 rewards understanding of the contexts in which texts are written and received.' },
  ],
};

// ---------------------------------------------------------------------------
// Insert routine
// ---------------------------------------------------------------------------
async function seedModule(m) {
  const rows = await sql`
    INSERT INTO stock_modules (slug, subject, level, qualification, exam_board, module, topic, subtopic, title, description)
    VALUES (${m.slug}, ${m.subject}, ${m.level}, ${m.qualification}, ${m.exam_board}, ${m.module}, ${m.topic}, ${m.subtopic}, ${m.title}, ${m.description})
    ON CONFLICT (slug) DO UPDATE SET
      subject = EXCLUDED.subject, level = EXCLUDED.level, qualification = EXCLUDED.qualification,
      exam_board = EXCLUDED.exam_board, module = EXCLUDED.module, topic = EXCLUDED.topic,
      subtopic = EXCLUDED.subtopic, title = EXCLUDED.title, description = EXCLUDED.description,
      updated_at = now()
    RETURNING id
  `;
  const moduleId = rows[0].id;

  // Refresh content for this module (idempotent re-seed).
  await sql`DELETE FROM stock_cards WHERE module_id = ${moduleId}`;
  await sql`DELETE FROM stock_quiz_questions WHERE module_id = ${moduleId}`;

  let pos = 0;
  for (const c of m.cards) {
    await sql`
      INSERT INTO stock_cards (module_id, position, card_type, question, answer, hint, difficulty, tags, source_note, review_status)
      VALUES (${moduleId}, ${pos}, ${c.type}, ${c.q}, ${c.a}, ${c.hint || null}, ${c.diff || 'core'}, ${c.tags || []}, ${m.source_note}, 'unverified')
    `;
    pos += 1;
  }

  let qpos = 0;
  for (const q of m.quizzes) {
    await sql`
      INSERT INTO stock_quiz_questions (module_id, position, question, options, correct_index, explanation, review_status)
      VALUES (${moduleId}, ${qpos}, ${q.q}, ${JSON.stringify(q.options)}::jsonb, ${q.correct}, ${q.explanation || null}, 'unverified')
    `;
    qpos += 1;
  }

  console.log(`[seed] ${m.title}: ${m.cards.length} cards, ${m.quizzes.length} quiz questions (all unverified)`);
  return moduleId;
}

await seedModule(maths);
await seedModule(literature);

const summary = await sql`
  SELECT m.title,
         (SELECT count(*) FROM stock_cards c WHERE c.module_id = m.id)::int AS cards,
         (SELECT count(*) FROM stock_quiz_questions q WHERE q.module_id = m.id)::int AS quizzes
  FROM stock_modules m ORDER BY m.title
`;
console.log('[seed] modules in DB:', summary);

const verifiedCount = await sql`SELECT count(*)::int AS n FROM stock_cards WHERE review_status = 'verified'`;
console.log(`[seed] verified cards (what the site would show): ${verifiedCount[0].n}  ← expected 0`);
console.log('[seed] done');
