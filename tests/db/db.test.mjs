// اختبارات قاعدة البيانات: الصلاحيات (RLS)، دوال الطالب، التصحيح الآلي، منع التكرار، وتقييد المحاولات.
// تعمل على PostgreSQL محلي بعد تطبيق محاكاة Supabase والترحيلات (انظر run-db-tests.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
const T_A = randomUUID();
const T_B = randomUUID();

async function as(role, sub, sql, params = [], ip = '10.0.0.1') {
  await client.query('begin');
  try {
    if (role !== 'postgres') {
      await client.query(`select set_config('role', $1, true)`, [role]);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
      await client.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })]);
    }
    const r = await client.query(sql, params);
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
const teacher = (sub) => (sql, p) => as('authenticated', sub, sql, p);
const A = teacher(T_A);
const B = teacher(T_B);
const anon = (sql, p, ip) => as('anon', null, sql, p, ip);
const rpc1 = async (fn, sql, p) => (await fn(sql, p)).rows[0];

async function saveQ(fn, q, options = []) {
  const r = await fn('select public.save_question($1::jsonb, $2::jsonb) as id', [JSON.stringify(q), JSON.stringify(options)]);
  return r.rows[0].id;
}
async function options(qid) {
  return (await A('select id, position, text, is_correct, match_text from question_options where question_id=$1 order by position', [qid])).rows;
}
const join = async (code, name, team = null, ip) =>
  (await anon('select public.join_session($1,$2,$3) as r', [code, name, team], ip)).rows[0].r;
const state = async (p) => (await anon('select public.student_state($1,$2) as r', [p.participant_id, p.token])).rows[0].r;
const submit = async (p, sq, answer, req = randomUUID()) =>
  (await anon('select public.submit_response($1,$2,$3,$4::jsonb,$5) as r', [p.participant_id, p.token, sq, JSON.stringify(answer), req])).rows[0].r;

let qMcq, qMulti, qOrder, qMatch, qShort, qBlanks, qOpen, qTF;
let session, sqs = {}, s1, s2, s3;

before(async () => {
  await client.connect();
  await as('postgres', null, `insert into auth.users(id, email, raw_user_meta_data) values ($1,'a@test.local','{"full_name":"معلم أ"}'), ($2,'b@test.local','{}')`, [T_A, T_B]);
});
after(async () => { await client.end(); });

test('ملف المعلم يُنشأ تلقائيًا ويرى المعلم ملفه فقط', async () => {
  const r = await A('select id, full_name from profiles');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].full_name, 'معلم أ');
});

test('حفظ أسئلة من جميع الصيغ', async () => {
  qMcq = await saveQ(A, { type: 'mcq', answer_format: 'single', text: 'كم عدد أيام الأسبوع؟', points: 2, lesson: 'الزمن' },
    [{ text: '5' }, { text: '7', is_correct: true }, { text: '6' }, { text: '8' }]);
  qTF = await saveQ(A, { type: 'true_false', answer_format: 'single', text: 'الماء يغلي عند 100 درجة مئوية عند مستوى سطح البحر' },
    [{ text: 'صح', is_correct: true }, { text: 'خطأ' }]);
  qMulti = await saveQ(A, { type: 'multi_select', answer_format: 'multi', text: 'اختر الأعداد الزوجية' },
    [{ text: '2', is_correct: true }, { text: '3' }, { text: '4', is_correct: true }]);
  qOrder = await saveQ(A, { type: 'ordering', answer_format: 'order', text: 'رتب الأعداد تصاعديًا' },
    [{ text: 'واحد' }, { text: 'اثنان' }, { text: 'ثلاثة' }, { text: 'أربعة' }]);
  qMatch = await saveQ(A, { type: 'matching', answer_format: 'match', text: 'صِل كل دولة بعاصمتها' },
    [{ text: 'مصر', match_text: 'القاهرة' }, { text: 'الأردن', match_text: 'عمّان' }, { text: 'قطر', match_text: 'الدوحة' }]);
  qShort = await saveQ(A, { type: 'short_answer', answer_format: 'short', text: 'ما الركن الثاني من أركان الإسلام؟', answer_key: { accepted: ['الصلاة', 'إقام الصلاة'] } });
  qBlanks = await saveQ(A, { type: 'fill_blank', answer_format: 'blanks', text: 'عاصمة السعودية ___ وعاصمة الإمارات ___', answer_key: { blanks: [['الرياض'], ['أبوظبي', 'أبو ظبي']] } });
  qOpen = await saveQ(A, { type: 'open_ended', answer_format: 'open', text: 'ما أهم قيمة تعلمتها من الدرس؟' });
  assert.equal((await A('select count(*)::int c from questions')).rows[0].c, 8);
  assert.equal((await options(qMcq)).length, 4);
});

test('رفض صيغة إجابة لا تناسب نوع السؤال', async () => {
  await assert.rejects(saveQ(A, { type: 'mcq', answer_format: 'open', text: 'x' }), /questions_format_ok/);
});

test('عزل بيانات المعلمين: المعلم ب لا يرى ولا يعدّل أسئلة المعلم أ', async () => {
  assert.equal((await B('select count(*)::int c from questions')).rows[0].c, 0);
  assert.equal((await B('select count(*)::int c from question_options')).rows[0].c, 0);
  const u = await B(`update questions set text='اختراق' where id=$1`, [qMcq]);
  assert.equal(u.rowCount, 0);
  await assert.rejects(B(`insert into question_options(question_id, position, text) values ($1, 9, 'x')`, [qMcq]), /row-level security/);
  await assert.rejects(saveQ(B, { id: qMcq, type: 'mcq', answer_format: 'single', text: 'x' }), /NABD:NOT_FOUND/);
  await assert.rejects(B('select public.duplicate_question($1)', [qMcq]), /NABD:NOT_FOUND/);
});

test('الطالب (anon) لا يستطيع قراءة أي جدول حساس', async () => {
  for (const t of ['questions', 'question_options', 'sessions', 'session_questions', 'participants', 'responses', 'reports', 'profiles']) {
    await assert.rejects(anon(`select * from ${t} limit 1`), /permission denied/, t);
  }
  await anon('select * from session_signals limit 1');
  await assert.rejects(anon('select public.push_question($1)', [randomUUID()]), /permission denied/);
  await assert.rejects(anon('select public.save_question($1::jsonb)', ['{}']), /permission denied/);
});

test('إنشاء حصة برمز فريد وإضافة الأسئلة إليها', async () => {
  session = await rpc1(A, `insert into sessions(title, lesson) values ('حصة الاختبار','الزمن') returning *`);
  assert.match(session.code, /^[A-HJ-NP-Z2-9]{6}$/);
  for (const [k, id] of Object.entries({ qMcq, qTF, qMulti, qOrder, qMatch, qShort, qBlanks, qOpen })) {
    sqs[k] = await rpc1(A, 'insert into session_questions(session_id, question_id) values ($1,$2) returning *', [session.id, id]);
  }
  assert.equal(Number(sqs.qMcq.points), 2);
  assert.equal(sqs.qMcq.snapshot.options.length, 4);
  // المعلم ب لا يستطيع إضافة أسئلة لحصة غيره
  await assert.rejects(B('insert into session_questions(session_id, question_id) values ($1,$2)', [session.id, qMcq]), /row-level security|FORBIDDEN/);
  // ولا يستطيع المعلم أ استخدام سؤال لا يملكه
  const qb = await saveQ(B, { type: 'open_ended', answer_format: 'open', text: 'سؤال ب' });
  await assert.rejects(A('insert into session_questions(session_id, question_id) values ($1,$2)', [session.id, qb]), /NABD:FORBIDDEN/);
});

test('الانضمام: رمز خاطئ، اسم ناقص، ثم ثلاثة طلاب', async () => {
  assert.deepEqual(await join('ZZZZZZ', 'أحمد'), { ok: false, error: 'INVALID_CODE' });
  assert.equal((await join(session.code, ' ')).error, 'NAME_REQUIRED');
  const look = (await anon('select public.session_lookup($1) as r', [session.code.toLowerCase().split('').join(' ')])).rows[0].r;
  assert.equal(look.ok, true);
  assert.equal(look.session.title, 'حصة الاختبار');
  s1 = await join(session.code, 'أحمد');
  s2 = await join(session.code.toLowerCase(), 'سارة');
  s3 = await join(session.code, '  خالد   علي ');
  assert.equal(s1.ok && s2.ok && s3.ok, true);
  assert.equal(s3.display_name, 'خالد علي');
  assert.notEqual(s1.alias, s2.alias);
  const parts = await A('select count(*)::int c from participants where session_id=$1', [session.id]);
  assert.equal(parts.rows[0].c, 3);
  assert.equal((await B('select count(*)::int c from participants')).rows[0].c, 0);
});

test('قبل إرسال أي سؤال: لا يرى الطالب أسئلة', async () => {
  const st = await state(s1);
  assert.equal(st.ok, true);
  assert.equal(st.question, null);
  assert.equal(st.session.status, 'lobby');
  assert.equal((await state({ participant_id: s1.participant_id, token: 'bad' })).error, 'INVALID_PARTICIPANT');
});

test('إرسال سؤال: يظهر للطالب دون الإجابة الصحيحة', async () => {
  const before = (await anon('select version from session_signals where session_id=$1', [session.id])).rows[0].version;
  await A('select public.push_question($1)', [sqs.qMcq.id]);
  const after = (await anon('select version from session_signals where session_id=$1', [session.id])).rows[0].version;
  assert.ok(Number(after) > Number(before), 'تتغير إشارة المزامنة عند الإرسال');
  const st = await state(s1);
  assert.equal(st.session.status, 'live');
  assert.equal(st.question.sq_id, sqs.qMcq.id);
  assert.equal(st.question.options.length, 4);
  assert.equal(st.question.correct, null);
  assert.equal(st.question.can_answer, true);
  const raw = JSON.stringify(st);
  assert.ok(!raw.includes('is_correct":true') && !raw.includes('match_text'), 'لا تسريب للإجابة الصحيحة');
});

test('التصحيح الآلي ومنع التكرار', async () => {
  const opts = await options(qMcq);
  const right = opts.find((o) => o.is_correct).id;
  const wrong = opts.find((o) => !o.is_correct).id;
  const req = randomUUID();
  assert.equal((await submit(s1, sqs.qMcq.id, { option_id: right }, req)).status, 'accepted');
  assert.equal((await submit(s1, sqs.qMcq.id, { option_id: right }, req)).status, 'duplicate', 'إعادة الإرسال بعد الانقطاع');
  assert.equal((await submit(s1, sqs.qMcq.id, { option_id: wrong })).error, 'ALREADY_ANSWERED', 'لا يمكن تغيير الإجابة');
  assert.equal((await submit(s2, sqs.qMcq.id, { option_id: 'not-an-option' })).error, 'INVALID_ANSWER');
  assert.equal((await submit(s2, sqs.qMcq.id, { option_id: wrong })).status, 'accepted');
  assert.equal((await submit({ ...s3, token: 'x' }, sqs.qMcq.id, { option_id: right })).error, 'INVALID_PARTICIPANT');
  assert.equal((await submit(s3, sqs.qMcq.id, { option_id: right })).status, 'accepted');
  const rs = (await A('select participant_id, is_correct, score::float score, response_ms from responses where sq_id=$1', [sqs.qMcq.id])).rows;
  assert.equal(rs.length, 3);
  const by = Object.fromEntries(rs.map((r) => [r.participant_id, r]));
  assert.equal(by[s1.participant_id].is_correct, true);
  assert.equal(by[s1.participant_id].score, 2);
  assert.equal(by[s2.participant_id].is_correct, false);
  assert.equal(by[s2.participant_id].score, 0);
  assert.ok(by[s1.participant_id].response_ms >= 0);
  // الطالب لا يعرف صحة إجابته قبل الكشف
  const st = await state(s1);
  assert.equal(st.question.my_response.is_correct, null);
  assert.equal(st.question.can_answer, false);
  // المعلم ب لا يرى الإجابات
  assert.equal((await B('select count(*)::int c from responses')).rows[0].c, 0);
});

test('المعلم لا يستطيع تعديل الدرجة مباشرة (فقط عبر دالة التصحيح)', async () => {
  await assert.rejects(A('update responses set score = 100 where sq_id=$1', [sqs.qMcq.id]), /permission denied/);
  const r = await A('update responses set approved = true where sq_id=$1', [sqs.qMcq.id]);
  assert.equal(r.rowCount, 3);
});

test('إغلاق السؤال ثم كشف الإجابة', async () => {
  await A('select public.close_question($1)', [sqs.qMcq.id]);
  const right = (await options(qMcq)).find((o) => o.is_correct).id;
  assert.equal((await submit(s1, sqs.qMcq.id, { option_id: right })).error, 'QUESTION_CLOSED');
  let st = await state(s2);
  assert.equal(st.question.status, 'closed');
  assert.equal(st.question.correct, null, 'لا كشف قبل قرار المعلم');
  await A('select public.reveal_answer($1)', [sqs.qMcq.id]);
  st = await state(s2);
  assert.deepEqual(st.question.correct.option_ids, [right]);
  assert.equal(st.question.my_response.is_correct, false);
});

test('الصيغ الأخرى: متعدد، ترتيب، توصيل، قصيرة، فراغات، مفتوح', async () => {
  // متعدد
  await A('select public.push_question($1)', [sqs.qMulti.id]);
  const mo = await options(qMulti);
  const ids = mo.filter((o) => o.is_correct).map((o) => o.id);
  await submit(s1, sqs.qMulti.id, { option_ids: [...ids].reverse() });
  await submit(s2, sqs.qMulti.id, { option_ids: [ids[0]] });
  // ترتيب
  await A('select public.push_question($1)', [sqs.qOrder.id]);
  const oo = await options(qOrder);
  const st = await state(s1);
  assert.deepEqual(new Set(st.question.options.map((o) => o.id)), new Set(oo.map((o) => o.id)));
  await submit(s1, sqs.qOrder.id, { order: oo.map((o) => o.id) });
  await submit(s2, sqs.qOrder.id, { order: [...oo.map((o) => o.id)].reverse() });
  assert.equal((await submit(s3, sqs.qOrder.id, { order: [oo[0].id] })).error, 'INVALID_ANSWER');
  // توصيل
  await A('select public.push_question($1)', [sqs.qMatch.id]);
  const ms = await state(s1);
  assert.equal(ms.question.right_items.length, 3);
  assert.ok(!JSON.stringify(ms.question.options).includes('القاهرة'));
  const mt = await options(qMatch);
  await submit(s1, sqs.qMatch.id, { pairs: Object.fromEntries(mt.map((o) => [o.id, o.match_text.replace('ّ', '')])) });
  await submit(s2, sqs.qMatch.id, { pairs: { [mt[0].id]: 'القاهرة', [mt[1].id]: 'الدوحة', [mt[2].id]: 'عمّان' } });
  // قصيرة
  await A('select public.push_question($1)', [sqs.qShort.id]);
  await submit(s1, sqs.qShort.id, { text: '  الصَّلاةُ ' });
  await submit(s2, sqs.qShort.id, { text: 'الصوم' });
  // فراغات
  await A('select public.push_question($1)', [sqs.qBlanks.id]);
  assert.equal((await state(s1)).question.blank_count, 2);
  await submit(s1, sqs.qBlanks.id, { blanks: ['الرياض', 'ابو ظبي'] });
  await submit(s2, sqs.qBlanks.id, { blanks: ['الرياض', 'دبي'] });
  // مفتوح
  await A('select public.push_question($1)', [sqs.qOpen.id]);
  await submit(s1, sqs.qOpen.id, { text: 'الصدق' });
  await submit(s2, sqs.qOpen.id, { text: 'تواصل معي على 0501234567' });

  const g = async (sq, p) => (await A('select is_correct, score_ratio::float r, needs_review, flagged from responses where sq_id=$1 and participant_id=$2', [sq, p.participant_id])).rows[0];
  assert.equal((await g(sqs.qMulti.id, s1)).is_correct, true);
  assert.equal((await g(sqs.qMulti.id, s2)).is_correct, false);
  assert.equal((await g(sqs.qOrder.id, s1)).is_correct, true);
  assert.equal((await g(sqs.qOrder.id, s2)).is_correct, false);
  assert.equal((await g(sqs.qMatch.id, s1)).is_correct, true, 'تجاهل التشكيل في التوصيل');
  const m2 = await g(sqs.qMatch.id, s2);
  assert.equal(m2.is_correct, false);
  assert.ok(Math.abs(m2.r - 0.3333) < 0.001);
  assert.equal((await g(sqs.qShort.id, s1)).is_correct, true, 'تطبيع التشكيل والتاء المربوطة');
  const sh2 = await g(sqs.qShort.id, s2);
  assert.equal(sh2.is_correct, false);
  assert.equal(sh2.needs_review, true, 'الإجابة القصيرة غير المطابقة قابلة للمراجعة');
  assert.equal((await g(sqs.qBlanks.id, s1)).is_correct, true);
  assert.equal((await g(sqs.qBlanks.id, s2)).r, 0.5);
  const o1 = await g(sqs.qOpen.id, s1);
  assert.equal(o1.is_correct, null);
  assert.equal(o1.needs_review, true);
  assert.equal((await g(sqs.qOpen.id, s2)).flagged, true, 'رصد رقم الهاتف');
  // سؤال واحد فقط مفتوح في كل لحظة
  const open = (await A(`select count(*)::int c from session_questions where session_id=$1 and status='open'`, [session.id])).rows[0].c;
  assert.equal(open, 1);
});

test('التصحيح اليدوي للمعلم وحمايته', async () => {
  const rid = (await A('select id from responses where sq_id=$1 and participant_id=$2', [sqs.qOpen.id, s1.participant_id])).rows[0].id;
  await assert.rejects(B('select public.grade_response($1, true)', [rid]), /NABD:NOT_FOUND/);
  await A(`select public.grade_response($1, true, null, 'أحسنت')`, [rid]);
  const r = (await A('select is_correct, score::float s, needs_review, graded_by_teacher from responses where id=$1', [rid])).rows[0];
  assert.deepEqual(r, { is_correct: true, s: 1, needs_review: false, graded_by_teacher: true });
});

test('انتهاء الزمن وإعادة المحاولة', async () => {
  await A('select public.push_question($1, 30)', [sqs.qTF.id]);
  const tf = await options(qTF);
  await as('postgres', null, `update session_questions set closes_at = now() - interval '10 seconds' where id=$1`, [sqs.qTF.id]);
  assert.equal((await submit(s1, sqs.qTF.id, { option_id: tf[0].id })).error, 'TIME_UP');
  await A('select public.close_question($1)', [sqs.qTF.id]);
  await assert.rejects(A('select public.push_question($1)', [sqs.qTF.id]), /ALREADY_CLOSED/);
  await A('select public.reopen_question($1, null)', [sqs.qTF.id]);
  assert.equal((await submit(s1, sqs.qTF.id, { option_id: tf[1].id })).status, 'accepted');
  assert.equal((await submit(s1, sqs.qTF.id, { option_id: tf[0].id })).status, 'updated', 'إعادة المحاولة مفعلة');
  const r = (await A('select attempts, is_correct from responses where sq_id=$1 and participant_id=$2', [sqs.qTF.id, s1.participant_id])).rows[0];
  assert.deepEqual(r, { attempts: 2, is_correct: true });
});

test('بطاقة الحظ تعيد حساب الدرجات', async () => {
  const m = Number((await A('select public.draw_luck($1) m', [sqs.qTF.id])).rows[0].m);
  assert.ok(m >= 1 && m <= 3);
  const s = (await A('select score::float s from responses where sq_id=$1 and participant_id=$2', [sqs.qTF.id, s1.participant_id])).rows[0].s;
  assert.equal(s, m);
});

test('تقييد محاولات الدخول المتكررة لكل عنوان IP', async () => {
  for (let i = 0; i < 20; i++) await join('BADBAD', 'س', null, '10.9.9.9');
  assert.equal((await join(session.code, 'متطفل', null, '10.9.9.9')).error, 'RATE_LIMITED');
  assert.equal((await join(session.code, 'منى', null, '10.9.9.10')).ok, true, 'عنوان آخر غير متأثر');
});

test('الفرق: توزيع متوازن وسؤال موجه لفريق', async () => {
  const s = await rpc1(A, `insert into sessions(title, teams_enabled, leaderboard_enabled) values ('تحدي الفرق', true, true) returning *`);
  const t1 = await rpc1(A, `insert into session_teams(session_id, name, position) values ($1,'الصقور',0) returning *`, [s.id]);
  const t2 = await rpc1(A, `insert into session_teams(session_id, name, position) values ($1,'النخيل',1) returning *`, [s.id]);
  const a = await join(s.code, 'عمر');
  const b = await join(s.code, 'ليلى');
  const c = await join(s.code, 'يوسف', t1.id);
  const teams = (await A('select team_id, count(*)::int c from participants where session_id=$1 group by team_id', [s.id])).rows;
  assert.equal(teams.length, 2);
  assert.equal((await join(s.code, 'زائر', randomUUID())).error, 'INVALID_TEAM');
  const sq = await rpc1(A, 'insert into session_questions(session_id, question_id, team_id, game_mode) values ($1,$2,$3,$4) returning *', [s.id, qTF, t2.id, 'team']);
  await A('select public.push_question($1)', [sq.id]);
  const tf = await options(qTF);
  const pa = (await A('select team_id from participants where id=$1', [a.participant_id])).rows[0].team_id;
  const results = [];
  for (const p of [a, b, c]) results.push(await submit(p, sq.id, { option_id: tf[0].id }));
  assert.ok(results.some((r) => r.error === 'NOT_YOUR_TEAM'));
  assert.ok(results.some((r) => r.ok));
  assert.ok(pa);
  // النقاط تظهر للطالب بعد الكشف فقط
  const me = [a, b, c][results.findIndex((r) => r.ok)];
  assert.equal(Number((await state(me)).me.points), 0);
  await A('select public.reveal_answer($1)', [sq.id]);
  assert.equal(Number((await state(me)).me.points), 1);
});

test('السؤال الذهبي يضاعف الدرجة، وتحدي الخمس ثوانٍ يضبط المؤقت', async () => {
  const s = await rpc1(A, `insert into sessions(title) values ('ألعاب') returning *`);
  const g = await rpc1(A, `insert into session_questions(session_id, question_id, game_mode) values ($1,$2,'golden') returning *`, [s.id, qMcq]);
  const f = await rpc1(A, `insert into session_questions(session_id, question_id, game_mode) values ($1,$2,'five_seconds') returning *`, [s.id, qTF]);
  const p = await join(s.code, 'هند');
  await A('select public.push_question($1)', [g.id]);
  const right = (await options(qMcq)).find((o) => o.is_correct).id;
  await submit(p, g.id, { option_id: right });
  assert.equal((await A('select score::float s from responses where sq_id=$1', [g.id])).rows[0].s, 4);
  await A('select public.push_question($1)', [f.id]);
  assert.equal((await A('select time_limit_seconds t from session_questions where id=$1', [f.id])).rows[0].t, 5);
  await A('select public.cancel_timer($1)', [f.id]);
  assert.equal((await A('select closes_at from session_questions where id=$1', [f.id])).rows[0].closes_at, null);
});

test('الحصة المجهولة: لا تُطلب أسماء', async () => {
  const s = await rpc1(A, `insert into sessions(title, anonymous) values ('مجهولة', true) returning *`);
  const p = await join(s.code, null);
  assert.equal(p.ok, true);
  assert.equal(p.display_name, p.alias);
});

test('السؤال الناقص لا يُرسل ويُعرض سبب عربي', async () => {
  const bad = await saveQ(A, { type: 'mcq', answer_format: 'single', text: 'سؤال بلا إجابة صحيحة' }, [{ text: 'أ' }, { text: 'ب' }]);
  const sq = await rpc1(A, 'insert into session_questions(session_id, question_id) values ($1,$2) returning *', [session.id, bad]);
  await assert.rejects(A('select public.push_question($1)', [sq.id]), (e) => e.message === 'NABD:QUESTION_INCOMPLETE' && /إجابة صحيحة واحدة/.test(e.hint));
});

test('التعديل قبل الإرسال ينعكس، وبعد الإرسال تبقى اللقطة ثابتة', async () => {
  const q = await saveQ(A, { type: 'open_ended', answer_format: 'open', text: 'النص الأول' });
  const sq = await rpc1(A, 'insert into session_questions(session_id, question_id) values ($1,$2) returning *', [session.id, q]);
  await saveQ(A, { id: q, type: 'open_ended', answer_format: 'open', text: 'النص المعدل' });
  await A('select public.push_question($1)', [sq.id]);
  assert.equal((await state(s1)).question.text, 'النص المعدل');
  await saveQ(A, { id: q, type: 'open_ended', answer_format: 'open', text: 'تعديل بعد الإرسال' });
  assert.equal((await state(s1)).question.text, 'النص المعدل');
});

test('إنهاء الحصة يمنع الإجابة والانضمام ويحفظ النتائج', async () => {
  await A('select public.end_session($1)', [session.id]);
  assert.equal((await join(session.code, 'متأخر')).error, 'SESSION_ENDED');
  assert.equal((await submit(s3, sqs.qOpen.id, { text: 'متأخر' })).error, 'SESSION_ENDED');
  const st = await state(s1);
  assert.equal(st.session.status, 'ended');
  assert.equal(st.question, null);
  const n = (await A('select count(*)::int c from responses where session_id=$1', [session.id])).rows[0].c;
  assert.ok(n >= 15);
  await A(`insert into reports(session_id, summary) values ($1, '{"ok":true}')`, [session.id]);
  assert.equal((await B('select count(*)::int c from reports')).rows[0].c, 0);
  await assert.rejects(B(`insert into reports(session_id, summary) values ($1, '{}')`, [session.id]), /row-level security|duplicate/);
});

test('حذف السؤال من البنك لا يمس نتائج الحصص السابقة', async () => {
  await A('delete from questions where id=$1', [qMcq]);
  const r = (await A('select snapshot->>\'text\' t from session_questions where id=$1', [sqs.qMcq.id])).rows[0];
  assert.equal(r.t, 'كم عدد أيام الأسبوع؟');
  assert.equal((await A('select count(*)::int c from responses where sq_id=$1', [sqs.qMcq.id])).rows[0].c, 3);
});

test('الأسئلة الفورية: سؤال رأي (نعم/لا) بلا إجابة صحيحة، وسؤال صح/خطأ مصحح', async () => {
  const s = await rpc1(A, `insert into sessions(title, is_quick) values ('أسئلة فورية', true) returning *`);
  const p1 = await join(s.code, 'منى');
  const p2 = await join(s.code, 'يوسف');
  const snap = (text, correct, poll) => ({
    question_id: null, type: 'true_false', answer_format: 'single', text,
    stimulus_kind: 'none', answer_key: poll ? { poll: true } : {},
    options: [{ id: randomUUID(), position: 0, text: 'نعم', is_correct: correct === 0 }, { id: randomUUID(), position: 1, text: 'لا', is_correct: correct === 1 }],
  });
  // سؤال رأي: لا يُسمح بإجابة صحيحة فيه
  const bad = await rpc1(A, 'insert into session_questions(session_id, snapshot) values ($1,$2::jsonb) returning *', [s.id, JSON.stringify(snap('هل فهمت؟', 0, true))]);
  await assert.rejects(A('select public.push_question($1, 0)', [bad.id]), /QUESTION_INCOMPLETE/);
  const poll = await rpc1(A, 'insert into session_questions(session_id, snapshot) values ($1,$2::jsonb) returning *', [s.id, JSON.stringify(snap('هل فهمت الدرس؟', -1, true))]);
  await A('select public.push_question($1, 0)', [poll.id]);
  const st = await state(p1);
  assert.equal(st.question.text, 'هل فهمت الدرس؟');
  assert.equal(st.question.closes_at, null);
  assert.equal((await submit(p1, poll.id, { option_id: poll.snapshot.options[0].id })).ok, true);
  assert.equal((await submit(p2, poll.id, { option_id: poll.snapshot.options[1].id })).ok, true);
  const rs = (await A('select is_correct, needs_review, score from responses where sq_id=$1', [poll.id])).rows;
  assert.equal(rs.length, 2);
  assert.ok(rs.every((r) => r.is_correct === null && r.needs_review === false && r.score === null), 'سؤال الرأي لا يُصحَّح');
  await A('select public.reveal_answer($1)', [poll.id]);
  assert.equal((await state(p1)).question.correct.option_ids, null);
  // سؤال صح/خطأ مصحح: طرحه يُغلق سؤال الرأي
  const tf = await rpc1(A, 'insert into session_questions(session_id, snapshot) values ($1,$2::jsonb) returning *', [s.id, JSON.stringify(snap('الشمس نجم', 0, false))]);
  await A('select public.push_question($1, 0)', [tf.id]);
  assert.equal((await A('select status from session_questions where id=$1', [poll.id])).rows[0].status, 'closed');
  await submit(p1, tf.id, { option_id: tf.snapshot.options[0].id });
  await submit(p2, tf.id, { option_id: tf.snapshot.options[1].id });
  const graded = (await A('select is_correct from responses where sq_id=$1 order by is_correct desc', [tf.id])).rows.map((r) => r.is_correct);
  assert.deepEqual(graded, [true, false]);
  // المعلم ب لا يستطيع إضافة سؤال فوري لحصة غيره
  await assert.rejects(B('insert into session_questions(session_id, snapshot) values ($1,$2::jsonb)', [s.id, JSON.stringify(snap('x', 0, false))]), /row-level security/);
});

test('تحدي الكأس: لعب ذاتي، نقاط، رقم الحظ، أخذ النقاط والدرع والتجميد والقصف، والفوز بالكأس', async () => {
  const s = await rpc1(A, `insert into sessions(title, mode, teams_enabled, game) values ('تحدي الكأس', 'self', true, $1::jsonb) returning *`,
    [JSON.stringify({ end: 'target', target: 60, powers: true, prize: 'كأس الفصل' })]);
  const t1 = await rpc1(A, `insert into session_teams(session_id, name, position) values ($1,'الصقور',0) returning *`, [s.id]);
  const t2 = await rpc1(A, `insert into session_teams(session_id, name, position) values ($1,'النجوم',1) returning *`, [s.id]);
  const mk = (i) => ({ question_id: null, type: 'true_false', answer_format: 'single', text: `عبارة رقم ${i} صحيحة`, stimulus_kind: 'none', answer_key: {},
    explanation: 'شرح', options: [{ id: randomUUID(), position: 0, text: 'صح', is_correct: true }, { id: randomUUID(), position: 1, text: 'خطأ', is_correct: false }] });
  for (let i = 1; i <= 8; i++) await A('insert into session_questions(session_id, snapshot) values ($1,$2::jsonb)', [s.id, JSON.stringify(mk(i))]);
  const p1 = await join(s.code, 'سارة', t1.id);
  const p2 = await join(s.code, 'خالد', t2.id);
  const p3 = await join(s.code, 'ريم', t2.id);
  const gs = async (p) => (await anon('select public.game_state($1,$2) as r', [p.participant_id, p.token])).rows[0].r;
  const gsub = async (p, sq, answer) => (await anon('select public.game_submit($1,$2,$3,$4::jsonb,$5) as r', [p.participant_id, p.token, sq, JSON.stringify(answer), randomUUID()])).rows[0].r;
  const power = async (p, target, team) => (await anon('select public.game_use_power($1,$2,$3,$4) as r', [p.participant_id, p.token, target, team])).rows[0].r;
  const answerRight = async (p) => {
    const q = (await gs(p)).question;
    const sq = (await A('select snapshot from session_questions where id=$1', [q.sq_id])).rows[0].snapshot;
    return gsub(p, q.sq_id, { option_id: sq.options.find((o) => o.is_correct).id });
  };

  // قبل البدء: الطالب ينتظر، وواجهة الطالب تعرف أنها تحدٍّ
  assert.equal((await state(p1)).session.mode, 'self');
  let g = await gs(p1);
  assert.equal(g.session.status, 'lobby');
  assert.equal(g.question, null);
  // معلم آخر لا يستطيع البدء
  await assert.rejects(B('select public.game_start($1)', [s.id]), /NOT_FOUND/);
  await A('select public.game_start($1)', [s.id]);

  g = await gs(p1);
  assert.equal(g.session.status, 'live');
  assert.equal(g.question.number, 1);
  assert.ok(g.question.options.every((o) => !('is_correct' in o)), 'لا تُكشف الإجابة الصحيحة');
  // إجابة خاطئة: صفر نقاط وتظهر الإجابة الصحيحة فورًا
  const wrong = await gsub(p1, g.question.sq_id, { option_id: (await A('select snapshot from session_questions where id=$1', [g.question.sq_id])).rows[0].snapshot.options[1].id });
  assert.equal(wrong.correct, false);
  assert.equal(wrong.gain, 0);
  assert.equal(wrong.correct_text, 'صح');
  assert.equal((await gsub(p1, g.question.sq_id, { option_id: randomUUID() })).error, 'ALREADY_ANSWERED');
  // ثلاث إجابات صحيحة متتالية تمنح رمية رقم حظ
  for (let i = 0; i < 3; i++) assert.equal((await answerRight(p1)).gain, 10);
  g = await gs(p1);
  assert.equal(g.me.points, 30);
  assert.equal(g.me.spins, 1);
  assert.equal(g.me.answered, 4);
  assert.equal(g.question.number, 5);
  const roll = (await anon('select public.game_roll($1,$2) as r', [p1.participant_id, p1.token])).rows[0].r;
  assert.ok(roll.ok && roll.number >= 1 && roll.number <= 6);
  assert.equal((await anon('select public.game_roll($1,$2) as r', [p1.participant_id, p1.token])).rows[0].r.error, 'NO_SPINS');

  // الطالب لا يرى جداول اللعبة مباشرة
  await assert.rejects(anon('select * from game_players'), /permission denied/);

  // خذ نقاطًا من زميل
  await answerRight(p2); await answerRight(p2);
  await as('postgres', null, `update game_players set power='take', points=30, double_next=false, shield_until=null where participant_id=$1`, [p1.participant_id]);
  let r = await power(p1, p2.participant_id, null);
  assert.equal(r.amount, 10);
  assert.equal((await gs(p2)).me.points, 10);
  // الدرع يصد المحاولة
  await as('postgres', null, `update game_players set shield_until=now()+interval '1 minute' where participant_id=$1`, [p2.participant_id]);
  await as('postgres', null, `update game_players set power='take' where participant_id=$1`, [p1.participant_id]);
  r = await power(p1, p2.participant_id, null);
  assert.equal(r.result, 'blocked');
  assert.equal((await gs(p2)).me.points, 10);
  // التجميد يمنع الإجابة مؤقتًا
  await as('postgres', null, `update game_players set power='freeze' where participant_id=$1`, [p1.participant_id]);
  await power(p1, p3.participant_id, null);
  const q3 = (await gs(p3)).question;
  assert.equal((await gsub(p3, q3.sq_id, { option_id: randomUUID() })).error, 'FROZEN');
  // قصف مجموعة: كل عضو غير محمي يخسر حتى 5 نقاط
  await as('postgres', null, `update game_players set points=20, frozen_until=null where participant_id=$1`, [p3.participant_id]);
  await as('postgres', null, `update game_players set power='bomb' where participant_id=$1`, [p1.participant_id]);
  assert.equal((await power(p1, null, t1.id)).error, 'INVALID_TARGET', 'لا يقصف مجموعته');
  r = await power(p1, null, t2.id);
  assert.equal(r.amount, 5);
  assert.equal(r.blocked, 1);
  assert.equal((await gs(p3)).me.points, 15);
  g = await gs(p1);
  assert.ok(g.events.some((e) => e.kind === 'take' && e.amount === 10));
  assert.ok(g.board.length === 3 && g.teams.length === 2);

  // بلوغ الهدف يمنح الكأس وينهي التحدي
  await as('postgres', null, `update game_players set points=55, double_next=false where participant_id=$1`, [p1.participant_id]);
  const win = await answerRight(p1);
  assert.equal(win.won, true);
  g = await gs(p2);
  assert.equal(g.session.status, 'ended');
  assert.equal(g.session.winner.id, p1.participant_id);
  assert.equal((await gsub(p2, q3.sq_id, { option_id: randomUUID() })).error, 'GAME_OVER');
  // المعلم يرى الترتيب والأحداث، والنتائج محفوظة في التقرير
  assert.equal((await A('select count(*)::int n from game_players where session_id=$1', [s.id])).rows[0].n, 3);
  assert.equal((await B('select count(*)::int n from game_players where session_id=$1', [s.id])).rows[0].n, 0);
  assert.ok((await A('select count(*)::int n from responses where session_id=$1', [s.id])).rows[0].n >= 7);
});

test('تحدي الكأس بالوقت: ينتهي تلقائيًا عند انتهاء المدة', async () => {
  const s = await rpc1(A, `insert into sessions(title, mode, game) values ('تحدي بالوقت', 'self', '{"end":"time","minutes":5}') returning *`);
  await A('insert into session_questions(session_id, snapshot) values ($1,$2::jsonb)', [s.id, JSON.stringify({ question_id: null, type: 'true_false', answer_format: 'single', text: 'سؤال', stimulus_kind: 'none', answer_key: {},
    options: [{ id: randomUUID(), position: 0, text: 'صح', is_correct: true }, { id: randomUUID(), position: 1, text: 'خطأ', is_correct: false }] })]);
  const p = await join(s.code, 'هدى');
  await A('select public.game_start($1)', [s.id]);
  const q = (await anon('select public.game_state($1,$2) as r', [p.participant_id, p.token])).rows[0].r.question;
  const snapQ = (await A('select snapshot from session_questions where id=$1', [q.sq_id])).rows[0].snapshot;
  assert.equal((await anon('select public.game_submit($1,$2,$3,$4::jsonb) as r', [p.participant_id, p.token, q.sq_id, JSON.stringify({ option_id: snapQ.options[0].id })])).rows[0].r.gain, 10);
  const live = (await A('select ends_at > now() + interval \'4 minutes\' ok from sessions where id=$1', [s.id])).rows[0];
  assert.equal(live.ok, true);
  await as('postgres', null, `update sessions set ends_at = now() - interval '1 second' where id=$1`, [s.id]);
  const g = (await anon('select public.game_state($1,$2) as r', [p.participant_id, p.token])).rows[0].r;
  assert.equal(g.session.status, 'ended');
  assert.equal(g.session.winner.id, p.participant_id);
  // الحصص العادية لا تقبل دوال اللعبة
  const n = await rpc1(A, `insert into sessions(title) values ('حصة عادية') returning *`);
  const pn = await join(n.code, 'علي');
  assert.equal((await anon('select public.game_state($1,$2) as r', [pn.participant_id, pn.token])).rows[0].r.error, 'NOT_A_GAME');
  assert.equal((await state(pn)).session.mode, 'live');
});
