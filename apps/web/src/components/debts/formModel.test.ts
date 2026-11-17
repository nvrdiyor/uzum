import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeDebt, cardOpeningStatement, debtCreateSchema, type DebtDetail } from '@savdoiq/shared';
import { blank, build, fromDebt } from './formModel';

const today = '2026-11-18';
const context = (date = today, edit: DebtDetail | null = null) => ({
  today: date,
  anchor: edit?.terms.trackedFrom ?? date,
  edit,
  isOwner: true,
  t: (key: string) => key,
  dateText: (date: string) => date,
});

function osmon(day: string) {
  return {
    ...blank('card', today, true),
    cardProduct: 'tbc-osmon' as const,
    amount: 10_000_000,
    annual: 40,
    cashRate: 45,
    minPct: '8',
    stmtDay: day,
    cardDebt: 5_000_000,
    billed: 5_000_000,
    minLeft: 400_000,
    minTouched: true,
  };
}

function detail(terms: DebtDetail['terms'], date = today): DebtDetail {
  const result = analyzeDebt(terms, [], date);
  return {
    id: 'osmon', kind: 'card', lender: 'TBC Bank', title: 'Osmon', note: '', ownerOnly: true,
    terms, calc: result.calc, soon: result.soon, lastUse: null, entryCount: 0,
    createdAt: `${today}T00:00:00Z`, updatedAt: `${today}T00:00:00Z`,
    entries: [], schedule: result.schedule, usage: [], canEdit: true, isOwner: true, today: date,
  };
}

test('Osmon statement on 18 November is open and due on 12 December', () => {
  const built = build(osmon('18'), context());
  assert.deepEqual(built.errors, {});
  assert.equal(built.body.statementDay, 18);
  assert.equal(built.cardNextDue, '2026-12-12');
  assert.equal(built.stmt?.due, '2026-12-12');
  assert.equal(debtCreateSchema.parse(built.body).statementDay, 18);
  assert.deepEqual(cardOpeningStatement(built.terms), {
    statementDate: today, due: '2026-12-12', pending: true,
  });
  const { calc } = analyzeDebt(built.terms, [], today);
  assert.equal(calc.next?.date, '2026-12-12');
  assert.equal(calc.next?.card?.statementDate, today);
  assert.equal(calc.next?.card?.estimate, false);
  assert.equal(calc.next?.remaining, 400_000);
  assert.equal(calc.card?.grace?.left, 5_000_000);
});

test('editing an existing Osmon card applies the explicit statement day', () => {
  const original = build(osmon('24'), context());
  const saved = detail(original.terms);
  const built = build({ ...fromDebt(saved), stmtDay: '18' }, context(today, saved));
  assert.deepEqual(built.errors, {});
  assert.equal(built.body.statementDay, 18);
  assert.equal(built.terms.trackedFrom, saved.terms.trackedFrom);
  assert.equal(analyzeDebt(built.terms, [], today).calc.next?.date, '2026-12-12');
});

test('a saved day 31 survives editing after a short month', () => {
  const saved = detail(build(osmon('31'), context()).terms, '2027-03-01');
  const built = build(fromDebt(saved), context('2027-03-01', saved));
  assert.deepEqual(built.errors, {});
  assert.equal(built.body.statementDay, 31);
  assert.equal(built.cardNextDue, '2027-03-24');
});

test('statement day must be an integer from 1 to 31', () => {
  for (const day of ['', '0', '32', '-18', '18.5', 'abc']) {
    const built = build(osmon(day), context());
    assert.equal(built.errors.stmtDay, 'err.stmtDay');
    assert.equal(built.blocking, true);
  }
});

test('Infin keeps its bank-defined first-day statement', () => {
  const built = build({ ...osmon('18'), cardProduct: 'infin-black' }, context());
  assert.deepEqual(built.errors, {});
  assert.equal(built.body.statementDay, 1);
  assert.equal(built.cardNextDue, '2026-11-20');
});
