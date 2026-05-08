import type { Metadata } from 'next';
import { AgentTraceAdmin } from '@/components/agent-trace-admin';

export const metadata: Metadata = {
  title: 'Agent Trace | 邮轮特价助手',
};

export default function AdminAgentTracesPage() {
  return <AgentTraceAdmin />;
}
