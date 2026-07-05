import { randomBytes } from 'crypto';
import agentDb from './agent-db';

export type BillingOrderStatus =
  | 'created'
  | 'paying'
  | 'fulfilled'
  | 'closed'
  | 'refunded';

export interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  quotaMessages: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingOrder {
  id: string;
  userId: string;
  planId: string;
  outTradeNo: string;
  provider: string;
  subject: string;
  amountCents: number;
  currency: string;
  quotaMessages: number;
  status: BillingOrderStatus;
  alipayTradeNo: string | null;
  tradeStatus: string | null;
  paidAt: string | null;
  fulfilledAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  orderId: string | null;
  runId: string | null;
  delta: number;
  reason: string;
  note: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  provider: string;
  orderId: string | null;
  outTradeNo: string | null;
  providerTradeNo: string | null;
  eventType: string;
  tradeStatus: string | null;
  signatureValid: boolean;
  rawJson: string;
  createdAt: string;
}

export interface AdminBillingOrder extends BillingOrder {
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userBalance: number;
}

interface BillingPlanRow {
  id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  quota_messages: number;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BillingOrderRow {
  id: string;
  user_id: string;
  plan_id: string;
  out_trade_no: string;
  provider: string;
  subject: string;
  amount_cents: number;
  currency: string;
  quota_messages: number;
  status: BillingOrderStatus;
  alipay_trade_no: string | null;
  trade_status: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreditLedgerRow {
  id: string;
  user_id: string;
  order_id: string | null;
  run_id: string | null;
  delta: number;
  reason: string;
  note: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
}

interface CreditGrantRow {
  id: string;
  user_id: string;
  order_id: string | null;
  ledger_id: string | null;
  total: number;
  remaining: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentEventRow {
  id: string;
  provider: string;
  order_id: string | null;
  out_trade_no: string | null;
  provider_trade_no: string | null;
  event_type: string;
  trade_status: string | null;
  signature_valid: number;
  raw_json: string;
  created_at: string;
}

interface AdminBillingOrderRow extends BillingOrderRow {
  user_display_name: string | null;
  user_avatar_url: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_balance: number | null;
}

const SUCCESS_TRADE_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

function createOutTradeNo(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `CS${stamp}${randomBytes(6).toString('hex').toUpperCase()}`;
}

function addMonthsIso(value: string | null | undefined, months: number): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return addMonthsIso(undefined, months);
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

function mapPlan(row: BillingPlanRow): BillingPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    amountCents: row.amount_cents,
    currency: row.currency,
    quotaMessages: row.quota_messages,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrder(row: BillingOrderRow): BillingOrder {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    outTradeNo: row.out_trade_no,
    provider: row.provider,
    subject: row.subject,
    amountCents: row.amount_cents,
    currency: row.currency,
    quotaMessages: row.quota_messages,
    status: row.status,
    alipayTradeNo: row.alipay_trade_no,
    tradeStatus: row.trade_status,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLedger(row: CreditLedgerRow): CreditLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    orderId: row.order_id,
    runId: row.run_id,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapPaymentEvent(row: PaymentEventRow): PaymentEvent {
  return {
    id: row.id,
    provider: row.provider,
    orderId: row.order_id,
    outTradeNo: row.out_trade_no,
    providerTradeNo: row.provider_trade_no,
    eventType: row.event_type,
    tradeStatus: row.trade_status,
    signatureValid: Boolean(row.signature_valid),
    rawJson: row.raw_json,
    createdAt: row.created_at,
  };
}

function mapAdminOrder(row: AdminBillingOrderRow): AdminBillingOrder {
  return {
    ...mapOrder(row),
    userDisplayName: row.user_display_name,
    userAvatarUrl: row.user_avatar_url,
    userEmail: row.user_email,
    userPhone: row.user_phone,
    userBalance: row.user_balance ?? 0,
  };
}

const stmtListActivePlans = agentDb.prepare(`
  SELECT *
  FROM billing_plans
  WHERE active = 1
  ORDER BY sort_order ASC, amount_cents ASC
`);

const stmtGetPlan = agentDb.prepare(`
  SELECT * FROM billing_plans WHERE id = ? LIMIT 1
`);

const stmtInsertOrder = agentDb.prepare(`
  INSERT INTO billing_orders (
    id, user_id, plan_id, out_trade_no, subject, amount_cents, currency,
    quota_messages, status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created')
`);

const stmtGetOrderById = agentDb.prepare(`
  SELECT * FROM billing_orders WHERE id = ? LIMIT 1
`);

const stmtGetOrderForUser = agentDb.prepare(`
  SELECT * FROM billing_orders WHERE id = ? AND user_id = ? LIMIT 1
`);

const stmtGetOrderByOutTradeNo = agentDb.prepare(`
  SELECT * FROM billing_orders WHERE out_trade_no = ? LIMIT 1
`);

const stmtMarkOrderPaying = agentDb.prepare(`
  UPDATE billing_orders
  SET status = 'paying', updated_at = datetime('now')
  WHERE id = ?
    AND user_id = ?
    AND status IN ('created', 'paying')
`);

const stmtInsertPaymentEvent = agentDb.prepare(`
  INSERT INTO payment_events (
    id, provider, order_id, out_trade_no, provider_trade_no, event_type,
    trade_status, signature_valid, raw_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtFulfillOrder = agentDb.prepare(`
  UPDATE billing_orders
  SET status = 'fulfilled',
      alipay_trade_no = COALESCE(?, alipay_trade_no),
      trade_status = ?,
      paid_at = COALESCE(paid_at, ?),
      fulfilled_at = COALESCE(fulfilled_at, datetime('now')),
      updated_at = datetime('now')
  WHERE id = ?
`);

const stmtMarkOrderClosed = agentDb.prepare(`
  UPDATE billing_orders
  SET status = 'closed',
      trade_status = COALESCE(?, trade_status),
      closed_at = COALESCE(closed_at, datetime('now')),
      updated_at = datetime('now')
  WHERE id = ?
    AND status IN ('created', 'paying', 'closed')
`);

const stmtInsertPurchaseCredit = agentDb.prepare(`
  INSERT OR IGNORE INTO credit_ledger (
    id, user_id, order_id, delta, reason, note, created_by, expires_at
  )
  VALUES (?, ?, ?, ?, 'purchase', ?, 'alipay', ?)
`);

const stmtGetPurchaseCreditForOrder = agentDb.prepare(`
  SELECT id
  FROM credit_ledger
  WHERE order_id = ? AND reason = 'purchase'
  LIMIT 1
`);

const stmtInsertCreditGrant = agentDb.prepare(`
  INSERT OR IGNORE INTO credit_grants (
    id, user_id, order_id, ledger_id, total, remaining, expires_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtCreditBalance = agentDb.prepare(`
  SELECT COALESCE(SUM(remaining), 0) AS balance
  FROM credit_grants
  WHERE user_id = ?
    AND remaining > 0
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
`);

const stmtListRecentOrdersForUser = agentDb.prepare(`
  SELECT *
  FROM billing_orders
  WHERE user_id = ?
  ORDER BY datetime(created_at) DESC, created_at DESC
  LIMIT ?
`);

const stmtListLedgerForUser = agentDb.prepare(`
  SELECT *
  FROM credit_ledger
  WHERE user_id = ?
  ORDER BY datetime(created_at) DESC, created_at DESC
  LIMIT ?
`);

const stmtChargeChatCredit = agentDb.prepare(`
  INSERT INTO credit_ledger (
    id, user_id, run_id, delta, reason, note, created_by
  )
  VALUES (?, ?, ?, ?, 'chat', ?, 'system')
`);

const stmtGetChatCreditForRun = agentDb.prepare(`
  SELECT id
  FROM credit_ledger
  WHERE run_id = ? AND reason = 'chat'
  LIMIT 1
`);

const stmtListConsumableCreditGrants = agentDb.prepare(`
  SELECT *
  FROM credit_grants
  WHERE user_id = ?
    AND remaining > 0
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
  ORDER BY
    expires_at IS NULL ASC,
    datetime(expires_at) ASC,
    datetime(created_at) ASC,
    created_at ASC
`);

const stmtUpdateCreditGrantRemaining = agentDb.prepare(`
  UPDATE credit_grants
  SET remaining = ?,
      updated_at = datetime('now')
  WHERE id = ?
`);

const stmtManualCreditAdjustment = agentDb.prepare(`
  INSERT INTO credit_ledger (
    id, user_id, delta, reason, note, created_by
  )
  VALUES (?, ?, ?, 'manual', ?, ?)
`);

const stmtListAdminOrders = agentDb.prepare(`
  SELECT
    o.*,
    u.display_name AS user_display_name,
    u.avatar_url AS user_avatar_url,
    u.email AS user_email,
    u.phone AS user_phone,
    (
      SELECT COALESCE(SUM(remaining), 0)
      FROM credit_grants g
      WHERE g.user_id = o.user_id
        AND g.remaining > 0
        AND (g.expires_at IS NULL OR datetime(g.expires_at) > datetime('now'))
    ) AS user_balance
  FROM billing_orders o
  LEFT JOIN users u ON u.id = o.user_id
  WHERE
    (? IS NULL OR o.status = ?)
    AND (
      ? IS NULL
      OR o.id LIKE ?
      OR o.out_trade_no LIKE ?
      OR o.alipay_trade_no LIKE ?
      OR o.user_id LIKE ?
      OR u.display_name LIKE ?
      OR u.email LIKE ?
      OR u.phone LIKE ?
    )
  ORDER BY datetime(o.created_at) DESC, o.created_at DESC
  LIMIT ?
`);

const stmtListAdminEvents = agentDb.prepare(`
  SELECT *
  FROM payment_events
  WHERE
    (? IS NULL OR order_id = ? OR out_trade_no = ?)
  ORDER BY datetime(created_at) DESC, created_at DESC
  LIMIT ?
`);

const stmtListAdminLedger = agentDb.prepare(`
  SELECT *
  FROM credit_ledger
  WHERE (? IS NULL OR user_id = ?)
  ORDER BY datetime(created_at) DESC, created_at DESC
  LIMIT ?
`);

const stmtListReconcileOrders = agentDb.prepare(`
  SELECT *
  FROM billing_orders
  WHERE status IN ('created', 'paying')
  ORDER BY datetime(created_at) ASC, created_at ASC
  LIMIT ?
`);

export function listActiveBillingPlans(): BillingPlan[] {
  return (stmtListActivePlans.all() as BillingPlanRow[]).map(mapPlan);
}

export function getBillingPlan(planId: string): BillingPlan | null {
  const row = stmtGetPlan.get(planId) as BillingPlanRow | undefined;
  return row ? mapPlan(row) : null;
}

export function createBillingOrder(input: {
  userId: string;
  planId: string;
}): BillingOrder {
  const plan = getBillingPlan(input.planId);
  if (!plan || !plan.active) {
    throw new Error('Plan is not available.');
  }

  const id = createId('ord');
  const subject = `邮轮特价助手 · ${plan.name}`;
  stmtInsertOrder.run(
    id,
    input.userId,
    plan.id,
    createOutTradeNo(),
    subject,
    plan.amountCents,
    plan.currency,
    plan.quotaMessages,
  );

  return getBillingOrderById(id) as BillingOrder;
}

export function getBillingOrderById(orderId: string): BillingOrder | null {
  const row = stmtGetOrderById.get(orderId) as BillingOrderRow | undefined;
  return row ? mapOrder(row) : null;
}

export function getBillingOrderForUser(
  orderId: string,
  userId: string,
): BillingOrder | null {
  const row = stmtGetOrderForUser.get(orderId, userId) as
    | BillingOrderRow
    | undefined;
  return row ? mapOrder(row) : null;
}

export function getBillingOrderByOutTradeNo(
  outTradeNo: string,
): BillingOrder | null {
  const row = stmtGetOrderByOutTradeNo.get(outTradeNo) as
    | BillingOrderRow
    | undefined;
  return row ? mapOrder(row) : null;
}

export function markBillingOrderPaying(
  orderId: string,
  userId: string,
): BillingOrder | null {
  stmtMarkOrderPaying.run(orderId, userId);
  return getBillingOrderForUser(orderId, userId);
}

export function recordPaymentEvent(input: {
  provider?: string;
  orderId?: string | null;
  outTradeNo?: string | null;
  providerTradeNo?: string | null;
  eventType: string;
  tradeStatus?: string | null;
  signatureValid: boolean;
  raw: unknown;
}): string {
  const id = createId('evt');
  stmtInsertPaymentEvent.run(
    id,
    input.provider ?? 'alipay',
    input.orderId ?? null,
    input.outTradeNo ?? null,
    input.providerTradeNo ?? null,
    input.eventType,
    input.tradeStatus ?? null,
    input.signatureValid ? 1 : 0,
    JSON.stringify(input.raw),
  );
  return id;
}

function consumeCreditGrants(userId: string, points: number): boolean {
  let remainingToCharge = points;
  const grants = stmtListConsumableCreditGrants.all(userId) as CreditGrantRow[];
  const balance = grants.reduce((sum, grant) => sum + grant.remaining, 0);
  if (balance < points) return false;

  for (const grant of grants) {
    if (remainingToCharge <= 0) break;
    const charged = Math.min(grant.remaining, remainingToCharge);
    stmtUpdateCreditGrantRemaining.run(grant.remaining - charged, grant.id);
    remainingToCharge -= charged;
  }

  return remainingToCharge === 0;
}

export function fulfillPaidBillingOrder(input: {
  outTradeNo: string;
  alipayTradeNo?: string | null;
  tradeStatus: string;
  amountCents: number;
  paidAt?: string | null;
}): { ok: boolean; reason?: string; order?: BillingOrder } {
  return agentDb.transaction(() => {
    const order = getBillingOrderByOutTradeNo(input.outTradeNo);
    if (!order) return { ok: false, reason: 'order_not_found' };

    if (order.amountCents !== input.amountCents) {
      return { ok: false, reason: 'amount_mismatch', order };
    }

    if (!SUCCESS_TRADE_STATUSES.has(input.tradeStatus)) {
      return { ok: false, reason: 'trade_not_success', order };
    }

    const paidAt = input.paidAt ?? new Date().toISOString();
    const expiresAt = addMonthsIso(paidAt, 1);
    stmtFulfillOrder.run(
      input.alipayTradeNo ?? null,
      input.tradeStatus,
      paidAt,
      order.id,
    );
    const ledgerId = createId('crd');
    stmtInsertPurchaseCredit.run(
      ledgerId,
      order.userId,
      order.id,
      order.quotaMessages,
      `${order.subject} / ${order.outTradeNo}`,
      expiresAt,
    );
    const purchaseCredit = stmtGetPurchaseCreditForOrder.get(order.id) as
      | { id: string }
      | undefined;
    if (purchaseCredit?.id) {
      stmtInsertCreditGrant.run(
        createId('grt'),
        order.userId,
        order.id,
        purchaseCredit.id,
        order.quotaMessages,
        order.quotaMessages,
        expiresAt,
      );
    }

    return {
      ok: true,
      order: getBillingOrderById(order.id) ?? order,
    };
  })();
}

export function markBillingOrderClosed(input: {
  orderId: string;
  tradeStatus?: string | null;
}): BillingOrder | null {
  stmtMarkOrderClosed.run(input.tradeStatus ?? 'TRADE_CLOSED', input.orderId);
  return getBillingOrderById(input.orderId);
}

export function getCreditBalance(userId: string): number {
  const row = stmtCreditBalance.get(userId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

export function listRecentBillingOrders(
  userId: string,
  limit = 10,
): BillingOrder[] {
  return (stmtListRecentOrdersForUser.all(userId, limit) as BillingOrderRow[]).map(
    mapOrder,
  );
}

export function listCreditLedger(
  userId: string,
  limit = 20,
): CreditLedgerEntry[] {
  return (stmtListLedgerForUser.all(userId, limit) as CreditLedgerRow[]).map(
    mapLedger,
  );
}

export function chargeChatCredit(input: {
  userId: string;
  runId: string;
  points?: number;
  note?: string | null;
}): boolean {
  const points = Math.max(Math.trunc(input.points ?? 1), 1);
  return agentDb.transaction(() => {
    const existing = stmtGetChatCreditForRun.get(input.runId);
    if (existing) return false;
    if (!consumeCreditGrants(input.userId, points)) return false;
    stmtChargeChatCredit.run(
      createId('crd'),
      input.userId,
      input.runId,
      -points,
      input.note ?? 'AI 对话',
    );
    return true;
  })();
}

export function adjustUserCredits(input: {
  userId: string;
  delta: number;
  note?: string | null;
  createdBy?: string | null;
}): CreditLedgerEntry {
  return agentDb.transaction(() => {
    if (input.delta < 0 && !consumeCreditGrants(input.userId, Math.abs(input.delta))) {
      throw new Error('Insufficient active credits.');
    }

    const id = createId('crd');
    stmtManualCreditAdjustment.run(
      id,
      input.userId,
      input.delta,
      input.note ?? null,
      input.createdBy ?? 'admin',
    );
    if (input.delta > 0) {
      stmtInsertCreditGrant.run(
        createId('grt'),
        input.userId,
        null,
        id,
        input.delta,
        input.delta,
        null,
      );
    }
    const row = agentDb
      .prepare('SELECT * FROM credit_ledger WHERE id = ?')
      .get(id) as CreditLedgerRow;
    return mapLedger(row);
  })();
}

export function listAdminBillingOrders(input: {
  q?: string;
  status?: string;
  limit?: number;
}): AdminBillingOrder[] {
  const q = input.q?.trim();
  const like = q ? `%${q}%` : null;
  const status = input.status?.trim() || null;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  return (
    stmtListAdminOrders.all(
      status,
      status,
      like,
      like,
      like,
      like,
      like,
      like,
      like,
      like,
      limit,
    ) as AdminBillingOrderRow[]
  ).map(mapAdminOrder);
}

export function listAdminPaymentEvents(input: {
  orderKey?: string;
  limit?: number;
}): PaymentEvent[] {
  const orderKey = input.orderKey?.trim() || null;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  return (
    stmtListAdminEvents.all(orderKey, orderKey, orderKey, limit) as PaymentEventRow[]
  ).map(mapPaymentEvent);
}

export function listAdminCreditLedger(input: {
  userId?: string;
  limit?: number;
}): CreditLedgerEntry[] {
  const userId = input.userId?.trim() || null;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  return (stmtListAdminLedger.all(userId, userId, limit) as CreditLedgerRow[]).map(
    mapLedger,
  );
}

export function listOrdersForPaymentReconcile(limit = 20): BillingOrder[] {
  return (stmtListReconcileOrders.all(limit) as BillingOrderRow[]).map(mapOrder);
}
