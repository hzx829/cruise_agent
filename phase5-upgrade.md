# Phase 5: PC 端 UI + 聊天历史 + 主动通知

关联: [design.md](design.md) | [progress.md](progress.md)

---

## 1. 现状问题

| 问题 | 现状 | 影响 |
|------|------|------|
| **仅移动端布局** | 全屏 `h-dvh` + `max-w-3xl` 居中，无 sidebar | PC 端左右大量空白，无法切换会话 |
| **无聊天历史** | useChat 无 chatId，刷新丢失所有消息 | 分析结果/文案无法回看 |
| **无主动通知** | 纯请求-响应模式 | 错过新降价、价格变动等关键信息 |

---

## 2. 技术选型

| 需求 | 方案 | 理由 |
|------|------|------|
| Sidebar | shadcn/ui `<Sidebar>` | chatbot 项目已验证，响应式完善 |
| 聊天持久化 | **本地 SQLite**（新建写库）| 内部工具无需云端 DB，复用 better-sqlite3 |
| 聊天列表 | SWR + API Route `/api/history` | 与 chatbot 一致的分页模式 |
| 通知系统 | **Cron API Route + SSE 推送 + 通知面板** | 轻量，无需额外基础设施 |

---

## 3. 架构设计

### 3.1 整体布局变更

```
Before:                          After:
┌──────────────────────┐        ┌────────┬─────────────────────┐
│     max-w-3xl        │        │Sidebar │   Main Content      │
│   ┌──────────────┐   │        │        │                     │
│   │   Chat       │   │        │ 🚢     │  ┌───────────────┐  │
│   │   Messages   │   │        │ New    │  │  Chat Header  │  │
│   │              │   │        │ Chat   │  ├───────────────┤  │
│   │              │   │        │        │  │               │  │
│   │              │   │        │ Today  │  │   Messages    │  │
│   │              │   │        │ - chat1│  │               │  │
│   │              │   │        │ - chat2│  │               │  │
│   │              │   │        │        │  │               │  │
│   ├──────────────┤   │        │ Yester │  ├───────────────┤  │
│   │   Input      │   │        │ - chat3│  │    Input      │  │
│   └──────────────┘   │        │        │  └───────────────┘  │
│                      │        │ 🔔(2)  │                     │
└──────────────────────┘        └────────┴─────────────────────┘
                                 16rem     flex-1 (自适应)
```

**移动端**: Sidebar 折叠为 Sheet（抽屉），通过 hamburger 按钮触发

### 3.2 聊天持久化架构

```
┌─ cruise_agent ──────────────────────────────────────────────┐
│                                                             │
│  SQLite (readonly)              SQLite (read-write)         │
│  cruise_crawler/data/           cruise_agent/data/          │
│  cruise_deals.db                agent.db                    │
│  ├─ deals                       ├─ chats                    │
│  ├─ brands                      │   (id, title, created_at, │
│  ├─ price_history               │    updated_at)            │
│  └─ ...                         ├─ messages                 │
│                                 │   (id, chat_id, role,     │
│  [查询航线数据]                  │    parts_json, created_at)│
│                                 ├─ notifications            │
│                                 │   (id, type, title, data, │
│                                 │    read, created_at)      │
│                                 └─ notification_config      │
│                                     (key, value)            │
└─────────────────────────────────────────────────────────────┘
```

**关键决策**: 用独立的 `agent.db` 而非往 `cruise_deals.db` 写入，保持爬虫数据库的只读纯净性。

### 3.3 通知系统架构

```
┌─ 通知触发源 ─────────────────┐     ┌─ 推送通道 ──────────┐
│                              │     │                     │
│  ① Cron API Route            │     │  SSE EventSource    │
│     /api/cron/check-prices   │────▶│  /api/notifications │
│     (Vercel Cron / 外部触发)  │     │  /stream            │
│                              │     │                     │
│  ② 爬虫回调 (可选)            │     │  前端实时接收        │
│     cruise_crawler 爬完后     │────▶│  NotificationBell   │
│     POST /api/notify         │     │  组件 + Toast        │
│                              │     │                     │
│  ③ 手动触发                  │     │  Browser             │
│     用户请求 "检查最新降价"    │     │  Notification API   │
│                              │     │  (可选)              │
└──────────────────────────────┘     └─────────────────────┘
```

---

## 4. 数据库 Schema

### 4.1 agent.db 表结构

```sql
-- 聊天会话
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,          -- nanoid
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 消息 (存储 AI SDK UIMessage 格式)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,          -- 服务端生成的 message id
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
  parts_json TEXT NOT NULL,     -- JSON.stringify(message.parts)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'price_drop' | 'new_deal' | 'daily_digest'
  title TEXT NOT NULL,
  body TEXT,                    -- 通知正文 (可选)
  data_json TEXT,               -- 关联的 deal 数据等
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- 通知配置
CREATE TABLE IF NOT EXISTS notification_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 默认配置
INSERT OR IGNORE INTO notification_config (key, value) VALUES
  ('daily_digest_enabled', 'true'),
  ('daily_digest_time', '09:00'),
  ('price_drop_threshold', '10'),    -- 降价超过 10% 才通知
  ('notify_brands', '["carnival","ncl","royal_caribbean_cn"]');
```

### 4.2 DB 连接层

```typescript
// lib/db/agent-db.ts — 新增写库连接
import Database from 'better-sqlite3';
import path from 'path';

const AGENT_DB_PATH = process.env.AGENT_DB_PATH
  || path.resolve(process.cwd(), 'data/agent.db');

// 确保 data 目录存在
import { mkdirSync } from 'fs';
mkdirSync(path.dirname(AGENT_DB_PATH), { recursive: true });

const agentDb = new Database(AGENT_DB_PATH);
agentDb.pragma('journal_mode = WAL');
agentDb.pragma('foreign_keys = ON');

// 自动建表
agentDb.exec(`
  CREATE TABLE IF NOT EXISTS chats (...);
  CREATE TABLE IF NOT EXISTS messages (...);
  CREATE TABLE IF NOT EXISTS notifications (...);
  CREATE TABLE IF NOT EXISTS notification_config (...);
`);

export default agentDb;
```

---

## 5. 核心实现细节

### 5.1 路由结构变更

```
app/
├── layout.tsx                    # RootLayout + ThemeProvider
├── globals.css
├── page.tsx                      # → redirect to /chat (新建会话)
│
├── chat/
│   ├── layout.tsx                # ★ SidebarProvider + AppSidebar + SidebarInset
│   ├── page.tsx                  # → createChat() + redirect to /chat/[id]
│   └── [id]/
│       └── page.tsx              # ★ 加载历史消息 → <Chat initialMessages={...} />
│
└── api/
    ├── chat/
    │   └── route.ts              # POST: streamText (现有，增加持久化)
    ├── history/
    │   └── route.ts              # GET: 聊天列表 (游标分页)
    ├── chat/[id]/
    │   └── route.ts              # DELETE: 删除单个聊天
    ├── notifications/
    │   ├── route.ts              # GET: 通知列表 / PATCH: 标记已读
    │   └── stream/
    │       └── route.ts          # GET: SSE 推送通道
    └── cron/
        └── check-prices/
            └── route.ts          # POST: 定时检查价格变动
```

### 5.2 聊天持久化流程 (参考 AI SDK 官方模式)

```typescript
// app/chat/page.tsx — 新建聊天
import { redirect } from 'next/navigation';
import { createChat } from '@/lib/db/chat-store';

export default async function ChatPage() {
  const id = await createChat();
  redirect(`/chat/${id}`);
}

// app/chat/[id]/page.tsx — 加载已有聊天
import { loadChat } from '@/lib/db/chat-store';
import { Chat } from '@/components/chat';

export default async function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { messages } = await loadChat(id);
  return <Chat id={id} initialMessages={messages} />;
}
```

```typescript
// lib/db/chat-store.ts
import { generateId, UIMessage } from 'ai';
import agentDb from './agent-db';

export async function createChat(): Promise<string> {
  const id = generateId();
  agentDb.prepare('INSERT INTO chats (id) VALUES (?)').run(id);
  return id;
}

export async function loadChat(id: string): Promise<{ title: string; messages: UIMessage[] }> {
  const chat = agentDb.prepare('SELECT * FROM chats WHERE id = ?').get(id);
  if (!chat) throw new Error('Chat not found');

  const rows = agentDb.prepare(
    'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC'
  ).all(id);

  const messages: UIMessage[] = rows.map(row => ({
    id: row.id,
    role: row.role,
    parts: JSON.parse(row.parts_json),
    createdAt: new Date(row.created_at),
  }));

  return { title: chat.title, messages };
}

export async function saveMessages(chatId: string, messages: UIMessage[]) {
  const insert = agentDb.prepare(
    'INSERT OR REPLACE INTO messages (id, chat_id, role, parts_json, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = agentDb.transaction((msgs: UIMessage[]) => {
    for (const msg of msgs) {
      insert.run(msg.id, chatId, msg.role, JSON.stringify(msg.parts), msg.createdAt?.toISOString() || new Date().toISOString());
    }
  });

  transaction(messages);

  // 更新 chat 的 updated_at
  agentDb.prepare('UPDATE chats SET updated_at = datetime(\'now\') WHERE id = ?').run(chatId);
}

export async function updateChatTitle(chatId: string, title: string) {
  agentDb.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title, chatId);
}

export async function deleteChat(chatId: string) {
  agentDb.prepare('DELETE FROM chats WHERE id = ?').run(chatId); // CASCADE 删消息
}

export async function getChatList(options?: { limit?: number; endingBefore?: string }) {
  const limit = options?.limit || 20;
  if (options?.endingBefore) {
    return agentDb.prepare(
      'SELECT id, title, created_at, updated_at FROM chats WHERE updated_at < (SELECT updated_at FROM chats WHERE id = ?) ORDER BY updated_at DESC LIMIT ?'
    ).all(options.endingBefore, limit);
  }
  return agentDb.prepare(
    'SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC LIMIT ?'
  ).all(limit);
}
```

### 5.3 API Route 持久化改造

```typescript
// app/api/chat/route.ts — 关键改动
import { createIdGenerator, convertToModelMessages, streamText, UIMessage } from 'ai';
import { saveMessages, updateChatTitle } from '@/lib/db/chat-store';

export async function POST(req: Request) {
  const { message, id }: { message: UIMessage; id: string } = await req.json();

  // 从 DB 加载历史消息 (只发送最后一条，节省带宽)
  const { messages: previousMessages } = await loadChat(id);
  const messages = [...previousMessages, message];

  // 立即保存用户消息
  await saveMessages(id, [message]);

  const result = streamText({
    model: openaiCompatible('glm-4-flash'),
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: { /* 12 tools */ },
    stopWhen: stepCountIs(5),
  });

  // 消费流避免客户端断开丢失
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    onFinish: async ({ messages: finishedMessages }) => {
      // 保存 AI 回复消息
      const newMessages = finishedMessages.filter(
        m => !previousMessages.some(pm => pm.id === m.id) && m.id !== message.id
      );
      await saveMessages(id, newMessages);

      // 首条消息时用 AI 生成标题
      if (previousMessages.length === 0) {
        const title = await generateTitle(message);
        await updateChatTitle(id, title);
      }
    },
  });
}
```

### 5.4 前端 Transport 改造 (只发送最后一条消息)

```typescript
// components/chat.tsx
const { messages, sendMessage, status, stop } = useChat({
  id,
  messages: initialMessages,
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest({ messages, id }) {
      return {
        body: {
          message: messages[messages.length - 1],
          id,
        },
      };
    },
  }),
});
```

### 5.5 Sidebar 组件 (参考 chatbot 项目)

```typescript
// components/app-sidebar.tsx — 核心结构
'use client';

import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
         SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { SidebarHistory } from './sidebar-history';
import { Ship, Plus, Bell } from 'lucide-react';
import Link from 'next/link';

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/chat">
                <Ship /> 邮轮助手
              </Link>
            </SidebarMenuButton>
            {/* 新建对话按钮 */}
            <SidebarMenuButton asChild>
              <Link href="/chat"><Plus /></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarHistory />  {/* 按日期分组的聊天列表 */}
      </SidebarContent>

      <SidebarFooter>
        <NotificationBell />  {/* 通知铃铛 */}
        <ThemeToggle />       {/* 深色模式 */}
      </SidebarFooter>
    </Sidebar>
  );
}
```

### 5.6 SidebarHistory (SWR Infinite 分页)

```typescript
// components/sidebar-history.tsx
'use client';

import useSWRInfinite from 'swr/infinite';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const PAGE_SIZE = 20;

function getKey(pageIndex: number, previousPageData: any) {
  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;
  if (!previousPageData?.chats?.length) return null;
  const last = previousPageData.chats.at(-1);
  return `/api/history?ending_before=${last.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory() {
  const { data, size, setSize, isValidating } = useSWRInfinite(getKey, fetcher);
  const params = useParams();
  const currentChatId = params?.id;

  const chats = data?.flatMap(page => page.chats) ?? [];

  // 按日期分组: 今天 / 昨天 / 最近 7 天 / 更早
  const grouped = groupChatsByDate(chats);

  return (
    <>
      {Object.entries(grouped).map(([label, items]) => (
        <SidebarGroup key={label}>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          {items.map(chat => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === currentChatId}
            />
          ))}
        </SidebarGroup>
      ))}
      {/* 滚动触发加载更多 */}
      <LoadMoreTrigger onLoadMore={() => setSize(size + 1)} />
    </>
  );
}
```

---

## 6. 主动通知系统

### 6.1 通知类型

| 类型 | 触发条件 | 内容 |
|------|----------|------|
| `price_drop` | 检测到降价 > 阈值 | "🔥 {船名} {目的地} 降价 {pct}%！{oldPrice}→{newPrice}" |
| `new_deal` | 爬虫发现全新航线 | "🆕 新上架: {品牌} {目的地} {duration}天 {price}起" |
| `daily_digest` | 每日定时 | "📊 今日概览: {dropCount} 条降价, 最大降幅 {maxDrop}%" |

### 6.2 行业调研: chatbot 中主动通知的常见实现方式

chatbot 类产品中的主动通知通常有以下几种实现模式:

#### 方案 A: Polling + 通知面板（✅ 推荐，最简单）
- 前端定时轮询 `GET /api/notifications?unread=true`（30s 间隔）
- Sidebar 底部显示🔔铃铛 + 未读数量 badge
- 点击展开通知面板（Popover），显示通知列表
- 点击通知可直接创建新聊天并自动发送查询指令
- **优点**: 实现最简单，无需 SSE/WebSocket 基础设施
- **缺点**: 有延迟（取决于轮询间隔）

#### 方案 B: SSE (Server-Sent Events)
- 客户端打开 `EventSource` 连接到 `/api/notifications/stream`
- 后端有新通知时推送事件
- **优点**: 实时性好
- **缺点**: 需要保持长连接，Vercel 等 serverless 环境有限制

#### 方案 C: Web Push Notifications (浏览器通知)
- 使用 Service Worker + Push API
- 即使页面关闭也能推送
- **优点**: 最像原生 App 体验
- **缺点**: 需要 VAPID 密钥、Service Worker，实现复杂

#### 方案 D: 注入式通知（聊天内）
- 新开/恢复聊天时，自动在聊天开头注入系统通知
- 类似 "📢 自上次对话以来, 有 3 条航线降价..."
- **优点**: 无需额外 UI，利用现有聊天界面
- **缺点**: 只有打开聊天才能看到

### 6.3 推荐方案: A + D 组合

考虑到 cruise_agent 是内部工具、部署在本地/单机:

1. **Polling 通知面板** — Sidebar 铃铛 + Badge + Popover 列表
2. **聊天内注入** — 新建对话时自动附加最近未读通知摘要到 system prompt
3. **Cron 触发** — 后台脚本定时调 `/api/cron/check-prices` 生成通知

```typescript
// 通知检查 API (外部 cron 触发)
// app/api/cron/check-prices/route.ts

import { getTopPriceDrops, getNewDeals } from '@/lib/db/queries';
import { createNotification, getNotificationConfig } from '@/lib/db/notification-store';

export async function POST(req: Request) {
  // 验证 cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const config = getNotificationConfig();
  const threshold = parseInt(config.price_drop_threshold);

  // 检查价格变动
  const drops = getTopPriceDrops({ limit: 10 });
  const significantDrops = drops.filter(d => Math.abs(d.drop_pct) >= threshold);

  for (const drop of significantDrops) {
    createNotification({
      type: 'price_drop',
      title: `🔥 ${drop.ship_name} 降价 ${Math.abs(drop.drop_pct).toFixed(0)}%`,
      body: `${drop.destination} ${drop.duration_days}天 ${drop.price_currency}${drop.price}`,
      data: drop,
    });
  }

  // 新上架航线
  const newDeals = getNewDeals({ since: '24h' });
  if (newDeals.length > 0) {
    createNotification({
      type: 'new_deal',
      title: `🆕 ${newDeals.length} 条新航线上架`,
      body: newDeals.slice(0, 3).map(d => `${d.brand_name} ${d.destination}`).join(', '),
      data: { count: newDeals.length, deals: newDeals.slice(0, 5) },
    });
  }

  return Response.json({ drops: significantDrops.length, newDeals: newDeals.length });
}
```

### 6.4 通知面板组件

```typescript
// components/notification-bell.tsx
'use client';

import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRouter } from 'next/navigation';

export function NotificationBell() {
  const { data } = useSWR('/api/notifications?unread=true', fetcher, {
    refreshInterval: 30_000, // 30 秒轮询
  });

  const unreadCount = data?.notifications?.length || 0;
  const router = useRouter();

  const handleClick = async (notification: Notification) => {
    // 标记已读
    await fetch(`/api/notifications`, {
      method: 'PATCH',
      body: JSON.stringify({ id: notification.id }),
    });

    // 创建新聊天并跳转（预填查询指令）
    if (notification.type === 'price_drop') {
      router.push(`/chat?prompt=${encodeURIComponent('查看最新降价航线')}`);
    }
  };

  return (
    <Popover>
      <PopoverTrigger>
        <div className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <h3 className="font-semibold mb-2">通知</h3>
        {data?.notifications?.map(n => (
          <div key={n.id} onClick={() => handleClick(n)}
               className="p-2 hover:bg-muted rounded cursor-pointer">
            <div className="font-medium text-sm">{n.title}</div>
            <div className="text-xs text-muted-foreground">{n.body}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(n.created_at), { locale: zhCN, addSuffix: true })}
            </div>
          </div>
        ))}
        {unreadCount === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            暂无新通知 ✨
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

### 6.5 Cron 调度方式

| 部署环境 | 调度方式 | 配置 |
|----------|----------|------|
| 本地开发 | **node-cron** 进程内定时 | `cron.schedule('0 9 * * *', ...)` |
| Vercel 部署 | **Vercel Cron** | `vercel.json` 中配置 cron |
| 自建服务器 | **系统 crontab** | `curl -X POST http://localhost:3000/api/cron/check-prices` |

本地开发推荐使用 `node-cron`:

```typescript
// lib/cron.ts (仅开发环境)
import cron from 'node-cron';

if (process.env.NODE_ENV === 'development') {
  // 每天 9:00 和 18:00 检查
  cron.schedule('0 9,18 * * *', async () => {
    await fetch('http://localhost:3000/api/cron/check-prices', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  });
}
```

---

## 7. 新增依赖

```bash
pnpm add swr date-fns node-cron
pnpm add -D @types/node-cron
```

已有但需安装 shadcn 组件:
```bash
npx shadcn@latest add sidebar popover dropdown-menu tooltip sheet
```

---

## 8. 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `lib/db/agent-db.ts` | 写库连接 (agent.db) |
| `lib/db/chat-store.ts` | 聊天 CRUD (create/load/save/delete/list) |
| `lib/db/notification-store.ts` | 通知 CRUD |
| `app/chat/layout.tsx` | ★ Sidebar 布局 (SidebarProvider + AppSidebar) |
| `app/chat/page.tsx` | 新建聊天 → redirect |
| `app/chat/[id]/page.tsx` | 加载历史消息 → `<Chat>` |
| `app/api/history/route.ts` | 聊天列表 (GET, 分页) |
| `app/api/chat/[id]/route.ts` | 删除聊天 (DELETE) |
| `app/api/notifications/route.ts` | 通知列表 + 标记已读 |
| `app/api/cron/check-prices/route.ts` | Cron 价格检查 |
| `components/app-sidebar.tsx` | 侧边栏组件 |
| `components/sidebar-history.tsx` | 聊天历史列表 (SWR Infinite) |
| `components/chat-header.tsx` | 聊天页头部（标题 + 操作） |
| `components/notification-bell.tsx` | 通知铃铛 + Popover |
| `components/ui/sidebar.tsx` | shadcn Sidebar 基础组件 |
| `components/ui/popover.tsx` | shadcn Popover |
| `components/ui/sheet.tsx` | shadcn Sheet (移动端抽屉) |
| `components/ui/tooltip.tsx` | shadcn Tooltip |
| `hooks/use-mobile.ts` | `useIsMobile()` hook |
| `lib/cron.ts` | 开发环境 cron 调度 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `app/page.tsx` | 改为 redirect → `/chat` |
| `app/layout.tsx` | 简化（去掉 Chat 直接渲染） |
| `app/api/chat/route.ts` | 增加消息持久化 + consumeStream + prepareSendMessages |
| `components/chat.tsx` | 接收 `id` + `initialMessages` prop，改 transport 为只发最后一条 |
| `package.json` | 新增 swr, date-fns, node-cron |

---

## 9. 分步实施计划

### Step 1: 数据层 — agent.db + chat-store (0.5 天)

- [ ] 创建 `lib/db/agent-db.ts` 连接 + 建表
- [ ] 创建 `lib/db/chat-store.ts` — createChat, loadChat, saveMessages, updateChatTitle, deleteChat, getChatList
- [ ] 单元测试: 验证 CRUD 正确性

### Step 2: 路由 + 持久化 (0.5 天)

- [ ] 新建 `app/chat/page.tsx` — createChat + redirect
- [ ] 新建 `app/chat/[id]/page.tsx` — loadChat + `<Chat>`
- [ ] 改造 `app/api/chat/route.ts` — onFinish 保存, consumeStream, prepareSendMessagesRequest
- [ ] 新建 `app/api/history/route.ts` — getChatList 分页
- [ ] 新建 `app/api/chat/[id]/route.ts` — DELETE
- [ ] 改造 `components/chat.tsx` — 接收 id/initialMessages，改 transport
- [ ] 改造 `app/page.tsx` — redirect → /chat

### Step 3: Sidebar 布局 (1 天)

- [ ] 安装 shadcn sidebar, popover, sheet, tooltip, dropdown-menu
- [ ] 创建 `hooks/use-mobile.ts`
- [ ] 创建 `app/chat/layout.tsx` — SidebarProvider + AppSidebar + SidebarInset
- [ ] 创建 `components/app-sidebar.tsx` — 品牌 logo + 新建按钮
- [ ] 创建 `components/sidebar-history.tsx` — SWR Infinite + 日期分组
- [ ] 创建 `components/chat-header.tsx` — 标题 + 移动端 sidebar trigger
- [ ] 适配深色模式

### Step 4: 通知系统 (1 天)

- [ ] 创建 `lib/db/notification-store.ts` — createNotification, getUnread, markRead
- [ ] 创建 `app/api/notifications/route.ts` — GET + PATCH
- [ ] 创建 `app/api/cron/check-prices/route.ts` — 价格变动检测
- [ ] 创建 `components/notification-bell.tsx` — 铃铛 + Popover + Badge
- [ ] 创建 `lib/cron.ts` — 开发环境 node-cron
- [ ] 集成通知到 system prompt（新建对话时注入最近通知摘要）

### Step 5: 打磨 (0.5 天)

- [ ] Chat 标题 AI 自动生成（首条消息后异步调用）
- [ ] 删除聊天确认对话框
- [ ] 聊天列表空状态 UI
- [ ] 通知设置页面（阈值、品牌选择）
- [ ] 更新 progress.md

---

## 10. 数据流总览

```
用户打开 /chat
  → createChat() → redirect /chat/{id}
  → SidebarHistory 加载 GET /api/history

用户发送消息
  → useChat.sendMessage → POST /api/chat { message, id }
  → 服务端 loadChat(id) 拼接历史
  → saveMessages(id, [userMsg])
  → streamText(...) → 流式返回
  → onFinish → saveMessages(id, assistantMsgs)
  → 首条消息 → generateTitle → updateChatTitle
  → mutate('/api/history') 刷新 sidebar

Cron 定时触发
  → POST /api/cron/check-prices
  → 查询 price_history 变动
  → createNotification(...)
  → 前端 30s 后 SWR 轮询到新通知
  → NotificationBell 显示 badge
  → 用户点击 → 新建聊天自动查询
```
