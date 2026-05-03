-- Atrium initial schema
-- Mirrors the domain model in CLAUDE.md:
--   Room       = kcs (knowledge components)
--   Blueprint  = kcs + kc_edges (DAG)
--   Floor plan = student_kc_state
--   Visit      = sessions
--   Card       = tasks + task_kcs
--   Debrief    = feedback_reports

-- ────────────────────────────────────────────────────────────
-- Blueprint: the skill graph
-- ────────────────────────────────────────────────────────────

create table kcs (
  id          text primary key,                 -- e.g. "math/fractions/equivalent"
  label_en    text not null,
  label_zh    text not null,
  subject     text not null,                    -- math | language | art | science
  depth       int  not null default 0,          -- 0 = root subject, higher = more specific
  bkt_p_l0    float8 not null default 0.3,
  bkt_p_t     float8 not null default 0.1,
  bkt_p_s     float8 not null default 0.1,
  bkt_p_g     float8 not null default 0.2,
  created_at  timestamptz not null default now()
);

create table kc_edges (
  from_kc_id  text not null references kcs(id),
  to_kc_id    text not null references kcs(id),
  edge_type   text not null default 'prerequisite',  -- prerequisite | crossover
  primary key (from_kc_id, to_kc_id)
);

-- ────────────────────────────────────────────────────────────
-- Floor plan: per-student mastery state (BKT posterior)
-- ────────────────────────────────────────────────────────────

create table student_kc_state (
  student_id   text     not null,               -- BHCS portal student ID
  kc_id        text     not null references kcs(id),
  mastery_prob float8   not null default 0.0,   -- P(mastery) after last update
  attempts     int      not null default 0,
  last_seen_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (student_id, kc_id)
);

create index on student_kc_state (student_id, mastery_prob);

-- ────────────────────────────────────────────────────────────
-- Cards: task templates + their target KCs
-- ────────────────────────────────────────────────────────────

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  title_en       text not null,
  title_zh       text not null,
  difficulty     int  not null check (difficulty between 1 and 5),
  est_minutes    int  not null default 15,
  rubric_json    jsonb,                          -- per-question evaluation rubric
  template_html  text,                          -- HTML template for worksheet rendering
  created_at     timestamptz not null default now()
);

create table task_kcs (
  task_id  uuid not null references tasks(id),
  kc_id    text not null references kcs(id),
  primary key (task_id, kc_id)
);

-- ────────────────────────────────────────────────────────────
-- Visits: kiosk sessions
-- ────────────────────────────────────────────────────────────

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  task_count  int not null default 0
);

create table session_tasks (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id),
  task_id       uuid not null references tasks(id),
  scan_url      text,                            -- stored scan image
  ai_eval_json  jsonb,                           -- raw evaluator output
  teacher_override_json jsonb,                   -- teacher correction, if any
  submitted_at  timestamptz
);

-- ────────────────────────────────────────────────────────────
-- Debrief: structured feedback report (chess.com-style)
-- ────────────────────────────────────────────────────────────

create table feedback_reports (
  id                  uuid primary key default gen_random_uuid(),
  session_task_id     uuid not null references session_tasks(id),
  student_id          text not null,
  overall_quality     text not null check (overall_quality in ('mastered','shaky','needs-help','not-yet')),
  questions_json      jsonb not null,
  summary_en          text not null,
  summary_zh          text not null,
  next_focus_kc_id    text references kcs(id),
  visible_to_parent   boolean not null default true,
  created_at          timestamptz not null default now()
);

create index on feedback_reports (student_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- Leaf economy: eco-first print credit system
-- Students earn Leaves by submitting Cards; spend to print.
-- ────────────────────────────────────────────────────────────

create table student_print_state (
  student_id    text    primary key,
  leaf_balance  int     not null default 2   -- 2 bootstrap Leaves on enrollment
                        check (leaf_balance between 0 and 5),
  lifetime_earned   int not null default 2,  -- total Leaves ever earned (for reporting)
  lifetime_spent    int not null default 0,  -- total Cards ever printed
  updated_at    timestamptz not null default now()
);

create table print_events (
  id            uuid primary key default gen_random_uuid(),
  student_id    text not null,
  session_id    uuid references sessions(id),
  event_type    text not null check (event_type in ('earn','spend','grant','refund')),
  amount        int  not null check (amount > 0),
  reason        text,                         -- e.g. "submission", "bootstrap", "printer_error", "teacher_grant"
  granted_by    text,                         -- teacher user_id for 'grant' events; null otherwise
  created_at    timestamptz not null default now()
);

create index on print_events (student_id, created_at desc);
create index on print_events (event_type, created_at desc);

-- ────────────────────────────────────────────────────────────
-- Seed: minimal 30-KC skill tree for the 6-week pilot
-- Subjects: Chinese reading, English reading, Math
-- ────────────────────────────────────────────────────────────

insert into kcs (id, label_en, label_zh, subject, depth) values
  -- Math roots
  ('math',                          'Mathematics',                '数学',       'math',     0),
  ('math/numbers',                  'Numbers & Counting',         '数与计算',   'math',     1),
  ('math/arithmetic',               'Arithmetic',                 '算术',       'math',     1),
  ('math/arithmetic/add',           'Addition',                   '加法',       'math',     2),
  ('math/arithmetic/sub',           'Subtraction',                '减法',       'math',     2),
  ('math/arithmetic/mul',           'Multiplication',             '乘法',       'math',     2),
  ('math/arithmetic/div',           'Division',                   '除法',       'math',     2),
  ('math/fractions',                'Fractions',                  '分数',       'math',     1),
  ('math/fractions/equivalent',     'Equivalent Fractions',       '等值分数',   'math',     2),
  ('math/fractions/compare',        'Comparing Fractions',        '比较分数',   'math',     2),
  ('math/word-problems',            'Word Problems',              '应用题',     'math',     1),

  -- English reading roots
  ('lang/en',                       'English Language',           '英语',       'language', 0),
  ('lang/en/phonics',               'Phonics',                    '自然拼读',   'language', 1),
  ('lang/en/sight-words',           'Sight Words',                '识词',       'language', 1),
  ('lang/en/reading-comp',          'Reading Comprehension',      '阅读理解',   'language', 1),
  ('lang/en/reading-comp/main-idea','Main Idea',                  '主旨',       'language', 2),
  ('lang/en/reading-comp/sequence', 'Sequence of Events',         '事件顺序',   'language', 2),
  ('lang/en/reading-comp/vocab',    'Vocabulary in Context',      '语境词汇',   'language', 2),
  ('lang/en/writing',               'Writing',                    '写作',       'language', 1),
  ('lang/en/writing/sentences',     'Complete Sentences',         '完整句',     'language', 2),

  -- Chinese reading roots
  ('lang/zh',                       'Chinese Language',           '中文',       'language', 0),
  ('lang/zh/pinyin',                'Pinyin',                     '拼音',       'language', 1),
  ('lang/zh/hanzi',                 'Hanzi Characters',           '汉字',       'language', 1),
  ('lang/zh/hanzi/radicals',        'Radicals',                   '部首',       'language', 2),
  ('lang/zh/hanzi/stroke-order',    'Stroke Order',               '笔顺',       'language', 2),
  ('lang/zh/hanzi/frequency-1',     'Tier-1 Hanzi (1–100)',       '常用字1-100','language', 2),
  ('lang/zh/reading-comp',          'Chinese Reading Comprehension','中文阅读', 'language', 1),
  ('lang/zh/reading-comp/retell',   'Retelling',                  '复述',       'language', 2),
  ('lang/zh/writing',               'Chinese Writing',            '中文写作',   'language', 1),
  ('lang/zh/writing/sentences',     'Chinese Complete Sentences', '完整中文句', 'language', 2);

-- Prerequisite edges (sample)
insert into kc_edges (from_kc_id, to_kc_id, edge_type) values
  ('math/arithmetic/add', 'math/arithmetic/sub',       'prerequisite'),
  ('math/arithmetic/mul', 'math/arithmetic/div',       'prerequisite'),
  ('math/arithmetic/add', 'math/fractions',            'prerequisite'),
  ('math/fractions',      'math/fractions/equivalent', 'prerequisite'),
  ('math/fractions',      'math/fractions/compare',    'prerequisite'),
  -- cross-subject: word problems need both arithmetic and reading comprehension
  ('math/arithmetic/add', 'math/word-problems',        'prerequisite'),
  ('lang/en/reading-comp','math/word-problems',        'crossover'),
  ('lang/zh/hanzi',       'lang/zh/reading-comp',      'prerequisite'),
  ('lang/zh/pinyin',      'lang/zh/hanzi',             'prerequisite');
