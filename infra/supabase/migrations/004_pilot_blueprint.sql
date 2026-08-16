-- The pilot Blueprint (BHCS-28)
--
-- Replaces the placeholder taxonomy seeded inline at the bottom of 001. That
-- seed was shaped like a Blueprint but could not be planned against: 19 of its
-- 30 rows had no incoming edge at all, every row carried identical BKT priors,
-- and nothing was tied to a published standard, so there was no way to argue
-- that any given KC was the right grain. It got the tables non-empty. It could
-- not survive a student.
--
-- What replaces it is 30 assessable leaf KCs — 10 math, 10 English, 10 Chinese
-- — each anchored to Common Core, PEP or HSK, plus the 16 structural nodes the
-- three subject hierarchies need. The grain is deliberately coarse. Squirrel
-- AI's tens of thousands of nano-KCs is the wrong target for one school's
-- authoring bandwidth; the eventual right size for K-5 across three subjects
-- is probably 200-500, and getting there is iteration. A KC that turns out to
-- hide two distinct skills will announce itself as a student who plateaus.
--
-- Sources, borrowed rather than invented, per
-- docs/research/open-source-stack/curriculum-content.md:
--   math       — Common Core math domains by grade band (CCSS refs in comments)
--   lang/en    — Common Core ELA strands
--   lang/zh    — PEP (人教版) grade character lists, HSK reading levels
--
-- ── Two decisions worth reading before editing this file ──
--
-- 1. STRUCTURAL EDGES ARE 'contains', NOT 'prerequisite'.
--
--    BHCS-28 asks for "at least one prerequisite edge, unless it is a root".
--    Taken literally that would mean an edge `math` -> `math/fractions`, typed
--    prerequisite. That deadlocks the frontier. The traversal in
--    impl/skill-graph.md unlocks a KC's outgoing edges once the source reaches
--    mastery >= 0.8, and `math` can never reach 0.8 because no Card will ever
--    target "Mathematics" — it is a heading, not a skill. Every leaf under it
--    would stay locked forever.
--
--    So the hierarchy is typed 'contains' and carries no learning semantics,
--    and 'prerequisite' is used only between assessable leaves, where it means
--    what it says. Every leaf has an incoming edge of some type; every leaf
--    except the four chain entry points has an incoming prerequisite.
--
--    ⚠️ BHCS-30 must filter `edge_type = 'prerequisite'` when traversing, and
--    'crossover' when co-tagging. A traversal that treats all edges alike will
--    walk the hierarchy and produce nonsense.
--
-- 2. BKT PRIORS VARY, BUT NOT ENOUGH TO FIX THE FRONTIER BAND.
--
--    p_L0 is set from difficulty (an easier KC is likelier already known) and
--    p_G from answer format (a four-way tone choice is guessable at 0.25; a
--    written character is not). p_S sits at 0.15 rather than the 0.1 default
--    because children slip more than the literature's adult-calibrated figure.
--
--    None of that rescues the ZPD window. Measured against the current
--    defaults, from a 0.3 prior: one correct answer lands at 0.693, two at
--    0.919. impl/skill-graph.md gates mastery at 0.8 and defines the frontier
--    as 0.3 <= p <= 0.7, so a KC occupies the frontier band after exactly one
--    correct answer and is "mastered" after two. Widening the band or raising
--    the gate to the literature-standard 0.95 is BHCS-30's call, but it is a
--    call, not an oversight — leaving it produces a radar that is all green by
--    the second session.

begin;

-- ────────────────────────────────────────────────────────────
-- Schema: difficulty
-- ────────────────────────────────────────────────────────────
--
-- BHCS-28 requires a difficulty level per KC and 001 gave the table nowhere to
-- put one. Same 1-5 scale as `tasks.difficulty` and `CardRequest.difficulty`
-- in worksheet-print, so the Card generator can pass a KC's difficulty through
-- without a mapping table. Roughly: 1 = Grade 1, 5 = Grade 5.

alter table kcs
  add column if not exists difficulty int not null default 3
    check (difficulty between 1 and 5);

comment on column kcs.difficulty is
  'Target grade band as a 1-5 scale, matching tasks.difficulty. Structural nodes carry the median of their leaves and are never assigned directly.';

-- ────────────────────────────────────────────────────────────
-- Blueprint: nodes
-- ────────────────────────────────────────────────────────────
--
-- Upserted rather than inserted so re-running is safe and so any student state
-- already attached to a surviving KC id survives with it. depth 0 = subject
-- root, 1 = strand, 2 = assessable leaf. The bootstrap eval in
-- impl/skill-graph.md reads depth = 2 as its candidate set, so leaves must sit
-- at exactly 2 and structural nodes must not.

insert into kcs (id, label_en, label_zh, subject, depth, difficulty, bkt_p_l0, bkt_p_t, bkt_p_s, bkt_p_g) values

  -- ── Math ───────────────────────────────────────────────────
  ('math',                                'Mathematics',                        '数学',                   'math', 0, 3, 0.30, 0.10, 0.15, 0.20),
  ('math/base-ten',                       'Base Ten',                           '十进制与数位',           'math', 1, 2, 0.30, 0.10, 0.15, 0.20),
  ('math/ops',                            'Operations',                         '四则运算',               'math', 1, 3, 0.30, 0.10, 0.15, 0.20),
  ('math/fractions',                      'Fractions',                          '分数',                   'math', 1, 4, 0.30, 0.10, 0.15, 0.20),
  ('math/measurement',                    'Measurement',                        '测量',                   'math', 1, 4, 0.30, 0.10, 0.15, 0.20),

  -- Leaves. Free-response numerals: guess is low, a child does not stumble
  -- onto "347" by accident.
  ('math/base-ten/place-value-hundreds',  'Place value: hundreds, tens, ones',  '数位：百位、十位、个位', 'math', 2, 2, 0.35, 0.10, 0.15, 0.10),  -- 2.NBT.A.1
  ('math/base-ten/add-3-digit',           'Add 3-digit numbers with regrouping','三位数进位加法',         'math', 2, 2, 0.35, 0.10, 0.15, 0.10),  -- 2.NBT.B.7
  ('math/base-ten/subtract-3-digit',      'Subtract with borrowing',            '三位数退位减法',         'math', 2, 3, 0.30, 0.10, 0.15, 0.10),  -- 2.NBT.B.7
  ('math/ops/multiplication-facts',       'Multiplication facts 0-10',          '乘法口诀 0-10',          'math', 2, 3, 0.30, 0.10, 0.15, 0.10),  -- 3.OA.C.7
  ('math/ops/division-as-inverse',        'Division as inverse of multiplication','除法：乘法的逆运算',    'math', 2, 3, 0.30, 0.10, 0.15, 0.10),  -- 3.OA.B.6
  -- Multi-step reasoning: slip is higher because there are more places to drop
  -- a step, and a wrong answer is likelier to be a lapse than a missing skill.
  ('math/ops/word-problems-1-step',       'One-step word problems',             '一步应用题',             'math', 2, 3, 0.25, 0.10, 0.20, 0.10),  -- 3.OA.D.8
  ('math/fractions/unit-fraction',        'Unit fractions: 1/2, 1/3, 1/4',      '单位分数',               'math', 2, 3, 0.30, 0.10, 0.15, 0.15),  -- 3.NF.A.1
  ('math/fractions/equivalent',           'Equivalent fractions',               '等值分数',               'math', 2, 4, 0.25, 0.10, 0.15, 0.15),  -- 3.NF.A.3
  -- Comparison answers are one of {<, >, =}: a third of wrong answers look right.
  ('math/fractions/compare',              'Comparing fractions',                '比较分数',               'math', 2, 4, 0.25, 0.10, 0.15, 0.33),  -- 3.NF.A.3d
  ('math/measurement/area-perimeter',     'Area and perimeter of rectangles',   '长方形的面积与周长',     'math', 2, 4, 0.25, 0.10, 0.20, 0.10),  -- 3.MD.C.7

  -- ── English ────────────────────────────────────────────────
  ('lang/en',                             'English Language',                   '英语',                   'language', 0, 3, 0.30, 0.10, 0.15, 0.20),
  ('lang/en/phonics',                     'Phonics',                            '自然拼读',               'language', 1, 1, 0.30, 0.10, 0.15, 0.20),
  ('lang/en/reading',                     'Reading',                            '阅读',                   'language', 1, 3, 0.30, 0.10, 0.15, 0.20),
  ('lang/en/vocab',                       'Vocabulary',                         '词汇',                   'language', 1, 4, 0.30, 0.10, 0.15, 0.20),
  ('lang/en/writing',                     'Writing',                            '写作',                   'language', 1, 3, 0.30, 0.10, 0.15, 0.20),
  ('lang/en/grammar',                     'Grammar',                            '语法',                   'language', 1, 2, 0.30, 0.10, 0.15, 0.20),

  ('lang/en/phonics/cvc-words',           'CVC word decoding',                  'CVC 单词拼读',           'language', 2, 1, 0.40, 0.10, 0.15, 0.10),  -- RF.1.3b
  ('lang/en/phonics/blends-digraphs',     'Initial blends and digraphs',        '首辅音连缀与字母组合',   'language', 2, 2, 0.35, 0.10, 0.15, 0.10),  -- RF.1.3c
  -- Comprehension items are typically multiple choice on a printed Card, so
  -- guess is high and a single correct answer must not carry much evidence.
  ('lang/en/reading/main-idea',           'Identify the main idea',             '主旨大意',               'language', 2, 2, 0.35, 0.10, 0.15, 0.25),  -- RI.2.2
  ('lang/en/reading/story-elements',      'Story elements',                     '故事要素',               'language', 2, 3, 0.30, 0.10, 0.15, 0.25),  -- RL.2.5
  ('lang/en/reading/inference',           'Draw an inference from evidence',    '根据文本推理',           'language', 2, 4, 0.25, 0.10, 0.20, 0.25),  -- RL.3.1
  ('lang/en/vocab/context-clues',         'Use context clues',                  '语境猜词',               'language', 2, 4, 0.25, 0.10, 0.15, 0.25),  -- L.3.4a
  ('lang/en/writing/complete-sentence',   'Write a complete sentence',          '完整句',                 'language', 2, 2, 0.35, 0.10, 0.15, 0.10),  -- L.1.1j
  ('lang/en/writing/paragraph-topic',     'Paragraph with a topic sentence',    '段落与主题句',           'language', 2, 4, 0.25, 0.10, 0.20, 0.10),  -- W.3.2
  ('lang/en/grammar/noun-verb-agreement', 'Subject-verb agreement',             '主谓一致',               'language', 2, 2, 0.35, 0.10, 0.15, 0.20),  -- L.1.1c
  ('lang/en/grammar/past-tense',          'Regular and irregular past tense',   '规则与不规则过去式',     'language', 2, 3, 0.30, 0.10, 0.15, 0.20),  -- L.2.1d

  -- ── Chinese ────────────────────────────────────────────────
  --
  -- Seeded a band below the same child's English on purpose. BHCS's heritage
  -- learners read Chinese well behind their English, which is the same prior
  -- app-worksheet's chineseBand() already applies to Debrief prose.
  ('lang/zh',                             'Chinese Language',                   '中文',                   'language', 0, 3, 0.30, 0.10, 0.15, 0.20),
  ('lang/zh/pinyin',                      'Pinyin',                             '拼音',                   'language', 1, 1, 0.30, 0.10, 0.15, 0.20),
  ('lang/zh/chars',                       'Characters',                         '汉字',                   'language', 1, 2, 0.30, 0.10, 0.15, 0.20),
  ('lang/zh/reading',                     'Chinese Reading',                    '中文阅读',               'language', 1, 3, 0.30, 0.10, 0.15, 0.20),
  ('lang/zh/writing',                     'Chinese Writing',                    '中文写作',               'language', 1, 4, 0.30, 0.10, 0.15, 0.20),

  ('lang/zh/pinyin/initials-finals',      'Initials and finals',                '声母与韵母',             'language', 2, 1, 0.40, 0.10, 0.15, 0.15),
  -- Four tones, four choices: the highest guess rate in the Blueprint.
  ('lang/zh/pinyin/tones',                'The four tones',                     '声调',                   'language', 2, 1, 0.35, 0.10, 0.20, 0.25),
  ('lang/zh/chars/grade1-set1',           'PEP Grade 1 characters 1-50',        '一年级字表（1-50）',     'language', 2, 1, 0.35, 0.10, 0.15, 0.10),
  ('lang/zh/chars/grade1-set2',           'PEP Grade 1 characters 51-150',      '一年级字表（51-150）',   'language', 2, 2, 0.30, 0.10, 0.15, 0.10),
  ('lang/zh/chars/grade2-set1',           'PEP Grade 2 characters 151-300',     '二年级字表（151-300）',  'language', 2, 3, 0.25, 0.10, 0.15, 0.10),
  ('lang/zh/chars/radicals',              'Radicals: 水木火土金',                '部首：水木火土金',       'language', 2, 3, 0.25, 0.10, 0.15, 0.20),
  ('lang/zh/reading/sentence-meaning',    'Understand a 2-3 clause sentence',   '句子理解',               'language', 2, 3, 0.25, 0.10, 0.15, 0.25),  -- HSK 2
  ('lang/zh/reading/passage-main-idea',   'Main idea of a short passage',       '短文主旨',               'language', 2, 4, 0.20, 0.10, 0.20, 0.25),  -- HSK 3
  -- Replaces the research doc's `copy-accuracy`, whose stated rubric was
  -- "correct stroke order". A photograph of finished paper cannot observe
  -- stroke order — it is a process, not an artifact — so that KC would have
  -- produced confident fabricated grades. 看拼音写汉字 is the standard PEP
  -- exercise and asks the same question the scan can actually answer: is the
  -- character on the page the right one?
  ('lang/zh/writing/char-from-pinyin',    'Write the character from pinyin',    '看拼音写汉字',           'language', 2, 3, 0.25, 0.10, 0.15, 0.05),
  ('lang/zh/writing/sentence-compose',    'Write a sentence about a picture',   '看图写话',               'language', 2, 4, 0.20, 0.10, 0.20, 0.05)

on conflict (id) do update set
  label_en   = excluded.label_en,
  label_zh   = excluded.label_zh,
  subject    = excluded.subject,
  depth      = excluded.depth,
  difficulty = excluded.difficulty,
  bkt_p_l0   = excluded.bkt_p_l0,
  bkt_p_t    = excluded.bkt_p_t,
  bkt_p_s    = excluded.bkt_p_s,
  bkt_p_g    = excluded.bkt_p_g;

-- ────────────────────────────────────────────────────────────
-- Retire the placeholder taxonomy
-- ────────────────────────────────────────────────────────────
--
-- Deliberately not `delete from kcs` with a cascade. The foreign keys from
-- student_kc_state, task_kcs and feedback_reports.next_focus_kc_id are left to
-- do their job: if anything already references a KC that is going away, this
-- migration fails loudly rather than quietly dropping a child's history.
--
-- It succeeds today because Atrium has never been deployed (BHCS-59) and the
-- placeholder graph was never assigned against. It is the last migration that
-- can assume that.

delete from kc_edges;

delete from kcs
where id not in (
  'math','math/base-ten','math/ops','math/fractions','math/measurement',
  'math/base-ten/place-value-hundreds','math/base-ten/add-3-digit','math/base-ten/subtract-3-digit',
  'math/ops/multiplication-facts','math/ops/division-as-inverse','math/ops/word-problems-1-step',
  'math/fractions/unit-fraction','math/fractions/equivalent','math/fractions/compare',
  'math/measurement/area-perimeter',
  'lang/en','lang/en/phonics','lang/en/reading','lang/en/vocab','lang/en/writing','lang/en/grammar',
  'lang/en/phonics/cvc-words','lang/en/phonics/blends-digraphs',
  'lang/en/reading/main-idea','lang/en/reading/story-elements','lang/en/reading/inference',
  'lang/en/vocab/context-clues',
  'lang/en/writing/complete-sentence','lang/en/writing/paragraph-topic',
  'lang/en/grammar/noun-verb-agreement','lang/en/grammar/past-tense',
  'lang/zh','lang/zh/pinyin','lang/zh/chars','lang/zh/reading','lang/zh/writing',
  'lang/zh/pinyin/initials-finals','lang/zh/pinyin/tones',
  'lang/zh/chars/grade1-set1','lang/zh/chars/grade1-set2','lang/zh/chars/grade2-set1','lang/zh/chars/radicals',
  'lang/zh/reading/sentence-meaning','lang/zh/reading/passage-main-idea',
  'lang/zh/writing/char-from-pinyin','lang/zh/writing/sentence-compose'
);

-- ────────────────────────────────────────────────────────────
-- Blueprint: structural edges ('contains')
-- ────────────────────────────────────────────────────────────
--
-- Root -> strand -> leaf. Carries no learning semantics; see decision 1 above.
-- Redundant with the id path today, and kept as real rows anyway so that a KC
-- can later be re-parented, or belong to two strands, without the id — which
-- is the primary key and the thing student history hangs off — having to move.

insert into kc_edges (from_kc_id, to_kc_id, edge_type) values
  ('math', 'math/base-ten',    'contains'),
  ('math', 'math/ops',         'contains'),
  ('math', 'math/fractions',   'contains'),
  ('math', 'math/measurement', 'contains'),
  ('math/base-ten',   'math/base-ten/place-value-hundreds', 'contains'),
  ('math/base-ten',   'math/base-ten/add-3-digit',          'contains'),
  ('math/base-ten',   'math/base-ten/subtract-3-digit',     'contains'),
  ('math/ops',        'math/ops/multiplication-facts',      'contains'),
  ('math/ops',        'math/ops/division-as-inverse',       'contains'),
  ('math/ops',        'math/ops/word-problems-1-step',      'contains'),
  ('math/fractions',  'math/fractions/unit-fraction',       'contains'),
  ('math/fractions',  'math/fractions/equivalent',          'contains'),
  ('math/fractions',  'math/fractions/compare',             'contains'),
  ('math/measurement','math/measurement/area-perimeter',    'contains'),

  ('lang/en', 'lang/en/phonics', 'contains'),
  ('lang/en', 'lang/en/reading', 'contains'),
  ('lang/en', 'lang/en/vocab',   'contains'),
  ('lang/en', 'lang/en/writing', 'contains'),
  ('lang/en', 'lang/en/grammar', 'contains'),
  ('lang/en/phonics', 'lang/en/phonics/cvc-words',           'contains'),
  ('lang/en/phonics', 'lang/en/phonics/blends-digraphs',     'contains'),
  ('lang/en/reading', 'lang/en/reading/main-idea',           'contains'),
  ('lang/en/reading', 'lang/en/reading/story-elements',      'contains'),
  ('lang/en/reading', 'lang/en/reading/inference',           'contains'),
  ('lang/en/vocab',   'lang/en/vocab/context-clues',         'contains'),
  ('lang/en/writing', 'lang/en/writing/complete-sentence',   'contains'),
  ('lang/en/writing', 'lang/en/writing/paragraph-topic',     'contains'),
  ('lang/en/grammar', 'lang/en/grammar/noun-verb-agreement', 'contains'),
  ('lang/en/grammar', 'lang/en/grammar/past-tense',          'contains'),

  ('lang/zh', 'lang/zh/pinyin',  'contains'),
  ('lang/zh', 'lang/zh/chars',   'contains'),
  ('lang/zh', 'lang/zh/reading', 'contains'),
  ('lang/zh', 'lang/zh/writing', 'contains'),
  ('lang/zh/pinyin',  'lang/zh/pinyin/initials-finals',    'contains'),
  ('lang/zh/pinyin',  'lang/zh/pinyin/tones',              'contains'),
  ('lang/zh/chars',   'lang/zh/chars/grade1-set1',         'contains'),
  ('lang/zh/chars',   'lang/zh/chars/grade1-set2',         'contains'),
  ('lang/zh/chars',   'lang/zh/chars/grade2-set1',         'contains'),
  ('lang/zh/chars',   'lang/zh/chars/radicals',            'contains'),
  ('lang/zh/reading', 'lang/zh/reading/sentence-meaning',  'contains'),
  ('lang/zh/reading', 'lang/zh/reading/passage-main-idea', 'contains'),
  ('lang/zh/writing', 'lang/zh/writing/char-from-pinyin',  'contains'),
  ('lang/zh/writing', 'lang/zh/writing/sentence-compose',  'contains');

-- ────────────────────────────────────────────────────────────
-- Blueprint: prerequisite edges
-- ────────────────────────────────────────────────────────────
--
-- Leaf to leaf only. Exactly three leaves have no incoming prerequisite — one
-- per subject — and they are the intended bootstrap floor:
--   math/base-ten/place-value-hundreds
--   lang/en/phonics/cvc-words
--   lang/zh/pinyin/initials-finals
-- Everything else in a subject is reachable from its entry point, so a
-- first-time student has exactly three places the frontier can legitimately
-- start. English writing and grammar hang off phonics rather than starting
-- fresh, which is why there are three and not five.
--
-- Ordering calls a teacher should overrule freely — this is exactly what the
-- 30-60 minute review pass in curriculum-content.md is for:
--   * pinyin initials/finals before tones. PEP teaches them together; putting
--     tones second assumes a child can read a syllable before they can pitch
--     it, which is the conservative order but not the only defensible one.
--   * division-as-inverse before unit-fraction. Partitioning is the shared
--     idea, but plenty of curricula introduce halves and quarters long before
--     formal division.

insert into kc_edges (from_kc_id, to_kc_id, edge_type) values
  -- Math: place value floor, then the two arithmetic chains, then fractions.
  ('math/base-ten/place-value-hundreds', 'math/base-ten/add-3-digit',       'prerequisite'),
  ('math/base-ten/add-3-digit',          'math/base-ten/subtract-3-digit',  'prerequisite'),
  ('math/base-ten/add-3-digit',          'math/ops/multiplication-facts',   'prerequisite'),
  ('math/ops/multiplication-facts',      'math/ops/division-as-inverse',    'prerequisite'),
  ('math/base-ten/add-3-digit',          'math/ops/word-problems-1-step',   'prerequisite'),
  ('math/base-ten/subtract-3-digit',     'math/ops/word-problems-1-step',   'prerequisite'),
  ('math/ops/division-as-inverse',       'math/fractions/unit-fraction',    'prerequisite'),
  ('math/fractions/unit-fraction',       'math/fractions/equivalent',       'prerequisite'),
  ('math/fractions/equivalent',          'math/fractions/compare',          'prerequisite'),
  ('math/ops/multiplication-facts',      'math/measurement/area-perimeter', 'prerequisite'),
  ('math/base-ten/add-3-digit',          'math/measurement/area-perimeter', 'prerequisite'),

  -- English: decode, then comprehend, then produce.
  ('lang/en/phonics/cvc-words',         'lang/en/phonics/blends-digraphs',     'prerequisite'),
  ('lang/en/phonics/blends-digraphs',   'lang/en/reading/main-idea',           'prerequisite'),
  ('lang/en/reading/main-idea',         'lang/en/reading/story-elements',      'prerequisite'),
  ('lang/en/reading/story-elements',    'lang/en/reading/inference',           'prerequisite'),
  ('lang/en/reading/main-idea',         'lang/en/vocab/context-clues',         'prerequisite'),
  ('lang/en/phonics/blends-digraphs',   'lang/en/writing/complete-sentence',   'prerequisite'),
  ('lang/en/writing/complete-sentence', 'lang/en/writing/paragraph-topic',     'prerequisite'),
  -- Cross-strand: you cannot write a topic sentence for an idea you cannot name.
  ('lang/en/reading/main-idea',         'lang/en/writing/paragraph-topic',     'prerequisite'),
  ('lang/en/writing/complete-sentence', 'lang/en/grammar/noun-verb-agreement', 'prerequisite'),
  ('lang/en/grammar/noun-verb-agreement','lang/en/grammar/past-tense',         'prerequisite'),

  -- Chinese: pinyin, then characters, then reading and production.
  ('lang/zh/pinyin/initials-finals',   'lang/zh/pinyin/tones',              'prerequisite'),
  ('lang/zh/pinyin/tones',             'lang/zh/chars/grade1-set1',         'prerequisite'),
  ('lang/zh/chars/grade1-set1',        'lang/zh/chars/grade1-set2',         'prerequisite'),
  ('lang/zh/chars/grade1-set2',        'lang/zh/chars/grade2-set1',         'prerequisite'),
  ('lang/zh/chars/grade1-set2',        'lang/zh/chars/radicals',            'prerequisite'),
  ('lang/zh/chars/grade2-set1',        'lang/zh/reading/sentence-meaning',  'prerequisite'),
  ('lang/zh/reading/sentence-meaning', 'lang/zh/reading/passage-main-idea', 'prerequisite'),
  -- Production needs the pinyin-to-character mapping, not just recognition.
  ('lang/zh/pinyin/tones',             'lang/zh/writing/char-from-pinyin',  'prerequisite'),
  ('lang/zh/chars/grade2-set1',        'lang/zh/writing/char-from-pinyin',  'prerequisite'),
  ('lang/zh/writing/char-from-pinyin', 'lang/zh/writing/sentence-compose',  'prerequisite'),
  ('lang/zh/reading/sentence-meaning', 'lang/zh/writing/sentence-compose',  'prerequisite');

-- ────────────────────────────────────────────────────────────
-- Blueprint: crossover edges
-- ────────────────────────────────────────────────────────────
--
-- The cross-over curriculum is a stated product goal, and the DAG has to carry
-- one from the start or the shape never gets tested. A word problem is the
-- canonical case: it fails for two entirely different reasons, and which one
-- it was is the single most useful thing a Debrief can tell a teacher.
--
-- Both languages, because at BHCS the same arithmetic arrives in both and a
-- child who can solve it in English may not be able to read it in Chinese.
--
-- 'crossover' is not 'prerequisite': it means co-tagged, so an attempt updates
-- both KCs. It must not gate.

insert into kc_edges (from_kc_id, to_kc_id, edge_type) values
  ('lang/en/reading/main-idea',        'math/ops/word-problems-1-step', 'crossover'),
  ('lang/zh/reading/sentence-meaning', 'math/ops/word-problems-1-step', 'crossover');

-- ────────────────────────────────────────────────────────────
-- Invariants
-- ────────────────────────────────────────────────────────────
--
-- Asserted here rather than left to a test, because the seed is data and a
-- test suite that does not run against a seeded database would not catch a
-- typo in a KC id — the foreign key would, but only for edges, and only for
-- ids that do not exist at all rather than ids pointing at the wrong node.

do $$
declare
  n_leaves int;
  n_orphans int;
  n_crossover int;
  bad_id text;
begin
  select count(*) into n_leaves from kcs where depth = 2;
  if n_leaves <> 30 then
    raise exception 'expected 30 assessable leaf KCs, found %', n_leaves;
  end if;

  -- Every non-root KC is reachable from its subject root.
  select count(*) into n_orphans
  from kcs k
  where k.depth > 0
    and not exists (select 1 from kc_edges e where e.to_kc_id = k.id and e.edge_type = 'contains');
  if n_orphans <> 0 then
    raise exception '% KCs have no containing parent', n_orphans;
  end if;

  select count(*) into n_crossover from kc_edges where edge_type = 'crossover';
  if n_crossover < 1 then
    raise exception 'the Blueprint must carry at least one cross-subject edge';
  end if;

  -- A 'contains' edge must go from shallower to deeper, exactly one level.
  select e.from_kc_id || ' -> ' || e.to_kc_id into bad_id
  from kc_edges e
  join kcs f on f.id = e.from_kc_id
  join kcs t on t.id = e.to_kc_id
  where e.edge_type = 'contains' and t.depth <> f.depth + 1
  limit 1;
  if bad_id is not null then
    raise exception 'contains edge skips a level: %', bad_id;
  end if;

  -- Prerequisites hold between assessable leaves only. A prerequisite pointing
  -- at a heading is the deadlock this file's header is about.
  select e.from_kc_id || ' -> ' || e.to_kc_id into bad_id
  from kc_edges e
  join kcs f on f.id = e.from_kc_id
  join kcs t on t.id = e.to_kc_id
  where e.edge_type in ('prerequisite', 'crossover')
    and (f.depth <> 2 or t.depth <> 2)
  limit 1;
  if bad_id is not null then
    raise exception 'prerequisite/crossover edge touches a non-leaf: %', bad_id;
  end if;

  -- The Blueprint is a DAG, and the frontier traversal in BHCS-30 will walk it
  -- without a visited set unless someone remembers to add one. A cycle here
  -- would not be a bad recommendation, it would be a hang.
  if exists (
    with recursive walk(node, path, cyc) as (
      select e.from_kc_id, array[e.from_kc_id], false
      from kc_edges e where e.edge_type = 'prerequisite'
      union all
      select e.to_kc_id, w.path || e.to_kc_id, e.to_kc_id = any(w.path)
      from walk w
      join kc_edges e on e.from_kc_id = w.node and e.edge_type = 'prerequisite'
      where not w.cyc
    )
    select 1 from walk where cyc
  ) then
    raise exception 'prerequisite edges contain a cycle — the Blueprint is not a DAG';
  end if;
end $$;

commit;
