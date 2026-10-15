import { LUCK, eventText, formatClock, goalText, luckTable } from './game';
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { normalizeAr, wordFrequencies, countBlanks, groupAnswers } from './text';
import { computeQuestionStats, levelFor, summarizeSession, computeLeaderboard, suggestActions, isPoll } from './stats';
import { toCsv, toXlsx, reportSheets } from './export';
import { parseCsv, parseImport, SAMPLE_CSV } from './importer';
import { questionSchema, optionsProblem, settingsSchema, joinSchema } from './schemas';
import type { Participant, ResponseRow, Session, SessionQuestion } from './types';

const T = { mastery: 80, reinforce: 50 };

function sq(id: string, opts: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id, session_id: 's', question_id: null, position: 1, status: 'closed', time_limit_seconds: null, points: 1,
    game_mode: 'none', multiplier: 1, team_id: null, allow_retry: false, revealed: true, opened_at: `2026-01-01T10:0${id.length}:00Z`,
    closes_at: null, closed_at: null, created_at: '',
    snapshot: {
      question_id: null, type: 'mcq', answer_format: 'single', text: `سؤال ${id}`, stimulus_kind: 'none', stimulus_text: null,
      stimulus_source: null, image_url: null, hint: null, explanation: null, bloom: 'understand', difficulty: 'medium', skill: 'مهارة',
      unit: '', lesson: 'درس', domain: '', answer_key: {},
      options: [
        { id: 'a', position: 0, text: 'خيار أ', match_text: null, is_correct: true },
        { id: 'b', position: 1, text: 'خيار ب', match_text: null, is_correct: false },
        { id: 'c', position: 2, text: 'خيار ج', match_text: null, is_correct: false },
      ],
    },
    ...opts,
  };
}
const part = (id: string, team: string | null = null): Participant => ({ id, session_id: 's', display_name: `طالب ${id}`, alias: `اسم ${id}`, team_id: team, is_removed: false, joined_at: '', last_seen_at: '' });
const resp = (sqId: string, p: string, option: string, correct: boolean | null, ms = 1000, score = correct ? 1 : 0): ResponseRow => ({
  id: `${sqId}${p}`, session_id: 's', sq_id: sqId, participant_id: p, answer: { option_id: option }, is_correct: correct, score_ratio: correct ? 1 : 0,
  score, needs_review: false, graded_by_teacher: false, teacher_feedback: null, approved: false, flagged: false, response_ms: ms, attempts: 1, created_at: '', updated_at: '',
});

describe('النص العربي', () => {
  it('يوحّد التشكيل والهمزات والتاء المربوطة والأرقام', () => {
    expect(normalizeAr('  الصَّلاةُ ')).toBe(normalizeAr('الصلاه'));
    expect(normalizeAr('إيمان')).toBe('ايمان');
    expect(normalizeAr('٣٤')).toBe('34');
    expect(normalizeAr('مُصطفى!')).toBe('مصطفي');
  });
  it('سحابة الكلمات تتجاهل الكلمات الشائعة وتعد الكلمة مرة لكل طالب', () => {
    const w = wordFrequencies(['الصدق في القول', 'الصدق الصدق', 'الأمانة والصدق', 'الأمانة']);
    expect(w[0]).toMatchObject({ count: 3 });
    expect(w.find((x) => x.display === 'في')).toBeUndefined();
    expect(w.find((x) => normalizeAr(x.display) === 'الامانه')?.count).toBe(2);
  });
  it('يجمع الإجابات المتطابقة ويعد الفراغات', () => {
    expect(groupAnswers(['الرياض', 'الرّياض', 'جدة'])[0]).toEqual({ text: 'الرياض', count: 2 });
    expect(countBlanks('أ ___ ب _____ ج __')).toBe(2);
  });
});

describe('مؤشرات الفهم', () => {
  const ps = ['1', '2', '3', '4', '5'].map((x) => part(x));
  const rs = [resp('q', '1', 'a', true, 2000), resp('q', '2', 'b', false, 4000), resp('q', '3', 'b', false, 3000), resp('q', '4', 'a', true, 1000)];
  const st = computeQuestionStats(sq('q'), ps, rs, T);
  it('يحسب المشاركة والصحة والتوزيع', () => {
    expect(st.eligible).toBe(5);
    expect(st.answered).toBe(4);
    expect(st.notAnswered).toBe(1);
    expect(st.participation).toBe(80);
    expect(st.correctPct).toBe(50);
    expect(st.distribution.map((d) => d.count)).toEqual([2, 2, 0]);
    expect(st.commonWrong?.key).toBe('b');
    expect(st.avgMs).toBe(2500);
    expect(st.level).toBe('yellow');
    expect(st.needSupport.sort()).toEqual(['2', '3', '5']);
  });
  it('المستويات بحدود قابلة للتعديل', () => {
    expect(levelFor(80, T)).toBe('green');
    expect(levelFor(79.9, T)).toBe('yellow');
    expect(levelFor(49, T)).toBe('red');
    expect(levelFor(null, T)).toBe('none');
    expect(levelFor(70, { mastery: 70, reinforce: 40 })).toBe('green');
  });
  it('يقترح إجراءً علاجيًا عند انخفاض الصحة', () => {
    const red = computeQuestionStats(sq('q'), ps, [resp('q', '1', 'b', false), resp('q', '2', 'b', false), resp('q', '3', 'b', false), resp('q', '4', 'a', true)], T);
    expect(red.level).toBe('red');
    expect(suggestActions(red, sq('q')).join(' ')).toMatch(/سؤالًا علاجيًا/);
  });
  it('سؤال موجه لفريق يحسب المستهدفين من الفريق فقط', () => {
    const teamPs = [part('1', 't1'), part('2', 't1'), part('3', 't2')];
    const s = computeQuestionStats(sq('q', { team_id: 't1' }), teamPs, [resp('q', '1', 'a', true)], T);
    expect(s.eligible).toBe(2);
    expect(s.missing).toEqual(['2']);
  });
});

describe('التقرير ولوحة الصدارة', () => {
  const session = { id: 's', title: 'حصة', code: 'ABCDEF', lesson: 'درس', unit: '', grade: '', class_id: null, created_at: '', started_at: null, ended_at: null } as unknown as Session;
  const ps = ['1', '2', '3'].map((x) => part(x));
  const sqs = [sq('q1'), sq('q22', { game_mode: 'exit' }), sq('q333', { status: 'draft', opened_at: null })];
  const rs = [resp('q1', '1', 'a', true), resp('q1', '2', 'b', false), resp('q1', '3', 'b', false), resp('q22', '1', 'a', true), resp('q22', '2', 'a', true)];
  const s = summarizeSession(session, sqs, ps, rs, [], T);
  it('يلخص الحصة ويحدد الأصعب ومن يحتاج دعمًا', () => {
    expect(s.questionsAsked).toBe(2);
    expect(s.overallCorrectPct).toBe(60);
    expect(s.hardest[0].sq_id).toBe('q1');
    expect(s.reteach.length).toBe(1);
    expect(s.students[0].id).toBe('1');
    expect(s.needSupport.map((x) => x.id)).toEqual(['3']); // الطالب 2 عند 50% = يحتاج تعزيزًا لا معالجة
    expect(s.exitTicket?.sq_id).toBe('q22');
    expect(s.recommendations.at(-1)).toMatch(/ليست حكمًا نهائيًا/);
  });
  it('لوحة الصدارة تستخدم الأسئلة المكشوفة فقط وتحسب الناجين', () => {
    const lb = computeLeaderboard([sq('q1', { game_mode: 'survival' }), sq('q22', { revealed: false })], ps, rs, []);
    expect(lb.players[0].id).toBe('1');
    expect(lb.players[0].points).toBe(1);
    expect(lb.players.find((p) => p.id === '2')!.survivor).toBe(false);
    expect(lb.hasSurvival).toBe(true);
  });
  it('التصدير إلى CSV و Excel', () => {
    const csv = toCsv([['أ', 'ب,ج'], ['=SUM(1)', 5]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"ب,ج"');
    expect(csv).toContain("'=SUM(1)");
    const xlsx = toXlsx(reportSheets(s, { includeNames: true }));
    const files = unzipSync(xlsx);
    expect(Object.keys(files)).toContain('xl/worksheets/sheet3.xml');
    const sheet = strFromU8(files['xl/worksheets/sheet3.xml']);
    expect(sheet).toContain('طالب 1');
    expect(sheet).toContain('rightToLeft="1"');
    const anon = strFromU8(unzipSync(toXlsx(reportSheets(s, { includeNames: false })))['xl/worksheets/sheet3.xml']);
    expect(anon).not.toContain('طالب 1');
  });
});

describe('التحقق والاستيراد', () => {
  it('يحلل CSV مع علامات الاقتباس', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
  });
  it('يستورد ملف القالب النموذجي بالكامل', () => {
    const rows = parseImport(SAMPLE_CSV, 'x.csv');
    const bad = rows.filter((r) => !r.ok);
    expect(bad).toEqual([]);
    expect(rows.length).toBe(7);
    const mcq = rows[0].question!;
    expect(mcq.options.filter((o) => o.is_correct).map((o) => o.text)).toEqual(['7']);
    expect(rows[3].question!.answer_key.blanks).toEqual([['الأكسجين', 'اكسجين']]);
    expect(rows[5].question!.options[1].match_text).toBe('الكوكب الأحمر');
  });
  it('يرفض الصفوف الناقصة برسالة عربية', () => {
    const rows = parseImport('type,text,options,correct\nmcq,سؤال بلا إجابة,أ|ب,\nunknown,س,,', 'x.csv');
    expect(rows[0].error).toMatch(/إجابة صحيحة/);
    expect(rows[1].error).toMatch(/نوع السؤال غير معروف/);
  });
  it('يستورد JSON', () => {
    const rows = parseImport(JSON.stringify([{ type: 'صح أو خطأ', text: 'الأرض كروية', correct: '1' }]), 'q.json');
    expect(rows[0].ok).toBe(true);
    expect(rows[0].question!.type).toBe('true_false');
  });
  it('يشترط مصدر الآية أو الحديث', () => {
    const base = { type: 'text_based', answer_format: 'open', text: 'استنبط قيمة', stimulus_kind: 'ayah', stimulus_text: 'نص يدخله المعلم', stimulus_source: '', grade: '', unit: '', lesson: '', domain: '', difficulty: 'medium', bloom: 'analyze', skill: '', points: 1, time_limit_seconds: null, answer_key: {}, tags: [], is_favorite: false, options: [] };
    const r = questionSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(questionSchema.safeParse({ ...base, stimulus_source: 'سورة ... الآية ...' }).success).toBe(true);
  });
  it('قواعد اكتمال الأسئلة تطابق قاعدة البيانات', () => {
    expect(optionsProblem('true_false', 'single', [{ text: 'صح', is_correct: true }], '', {})).toMatch(/خيارين/);
    expect(optionsProblem('fill_blank', 'blanks', [], 'بلا فراغ', {})).toMatch(/___/);
    expect(optionsProblem('fill_blank', 'blanks', [], 'أ ___ ب ___', { blanks: [['x']] })).toMatch(/عدد/);
    expect(optionsProblem('matching', 'match', [{ text: 'أ', match_text: '', is_correct: false }, { text: 'ب', match_text: 'x', is_correct: false }], '', {})).toMatch(/الطرف المقابل/);
  });
  it('الإعدادات ورمز الدخول', () => {
    expect(settingsSchema.safeParse({ mastery: 70, reinforce: 80, default_time: 30, hide_names: false, anonymous: false }).success).toBe(false);
    expect(joinSchema.parse({ code: ' ab-c ١٢٣ ' }).code).toBe('ABC123');
  });
});

describe('الأسئلة الفورية (سؤال رأي)', () => {
  it('سؤال الرأي لا يدخل في نسب الصحة ولا يُعد بانتظار التصحيح', () => {
    const base = sq('p');
    const poll = sq('p', { snapshot: { ...base.snapshot, type: 'true_false', answer_key: { poll: true }, options: base.snapshot.options.slice(0, 2).map((o) => ({ ...o, is_correct: false })) } });
    expect(isPoll(poll)).toBe(true);
    const ps = ['1', '2', '3'].map((x) => part(x));
    const rs = [resp('p', '1', 'a', null), resp('p', '2', 'a', null), resp('p', '3', 'b', null)];
    const st = computeQuestionStats(poll, ps, rs, T);
    expect(st.pending).toBe(0);
    expect(st.correctPct).toBeNull();
    expect(st.distribution.map((d) => [d.count, d.isCorrect])).toEqual([[2, null], [1, null]]);
    expect(st.commonWrong).toBeNull();
    expect(suggestActions(st, poll).join(' ')).toContain('سؤال رأي');
    const sum = summarizeSession({ id: 's', title: 'فوري', status: 'ended' } as Session, [poll], ps, rs, [], T);
    expect(sum.students.every((s) => s.pending === 0)).toBe(true);
  });
});

describe('تحدي الكأس', () => {
  it('نصوص الأحداث بلا كلمة سرقة', () => {
    const kinds = ['streak', 'roll_treasure', 'roll_big_treasure', 'roll_double', 'roll_take', 'roll_shield', 'roll_freeze', 'roll_raid', 'roll_bomb', 'take', 'freeze', 'blocked_take', 'blocked_freeze', 'raid', 'bomb', 'trophy'];
    for (const kind of kinds) {
      const t = eventText({ kind, amount: 10, actor: 'سارة', target: 'خالد', team: 'النجوم' });
      expect(t).not.toMatch(/سرق/);
      expect(t.length).toBeGreaterThan(5);
    }
    expect(eventText({ kind: 'take', amount: 10, actor: 'سارة', target: 'خالد', team: null })).toBe('🤝 سارة أخذ 10 نقاط من خالد');
    for (const v of Object.values(LUCK)) expect(v.title + v.text).not.toMatch(/سرق/);
  });
  it('جدول رقم الحظ يتغير مع المجموعات', () => {
    expect(luckTable(false).map((x) => x.info.title)).toEqual(['كنز صغير', 'مضاعف النقاط', 'خذ نقاطًا من زميل', 'درع الحماية', 'تجميد زميل', 'كنز كبير']);
    expect(luckTable(true)[4].info.title).toBe('انتزاع من مجموعة');
    expect(luckTable(true)[5].info.title).toBe('قصف مجموعة');
  });
  it('الهدف والوقت', () => {
    expect(goalText({ end: 'target', target: 150 })).toContain('150');
    expect(goalText({ end: 'time', minutes: 5 })).toContain('5 دقائق');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});
