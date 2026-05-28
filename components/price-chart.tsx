'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  Legend,
} from 'recharts';

interface ChartData {
  chartType: 'bar' | 'scatter';
  title: string;
  data: Record<string, unknown>[];
}

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

export function PriceChart({ chart }: { chart: ChartData }) {
  if (!chart?.data || chart.data.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">暂无图表数据</div>
    );
  }

  return (
    <div className="max-w-full overflow-hidden rounded-xl border bg-card p-3 sm:p-4">
      <h4 className="mb-3 break-words text-sm font-semibold text-card-foreground">
        📊 {chart.title}
      </h4>
      <div className="max-w-full overflow-x-auto">
        <div className="h-56 min-w-[320px] sm:h-64 sm:min-w-0">
          {chart.chartType === 'scatter' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 8, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="duration_days"
                  name="天数"
                  type="number"
                  fontSize={12}
                />
                <YAxis dataKey="price" name="价格" fontSize={12} width={52} />
                <Tooltip
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString()}`,
                    name === 'price' ? '价格' : String(name),
                  ]}
                />
                <Scatter name="航线" data={chart.data} fill="#3b82f6">
                  {chart.data.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={COLORS[idx % COLORS.length]}
                      opacity={0.7}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chart.data}
                margin={{ top: 10, right: 8, bottom: 28, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={getXAxisKey(chart.data)}
                  fontSize={12}
                  height={48}
                  interval={0}
                  tick={{ fontSize: 11 }}
                  tickFormatter={truncateTick}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis fontSize={12} width={52} />
                <Tooltip />
                <Legend />
                {getBarKeys(chart.data).map((key, idx) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={COLORS[idx % COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function truncateTick(value: unknown): string {
  const label = String(value ?? '');
  return label.length > 8 ? `${label.slice(0, 8)}…` : label;
}

function getXAxisKey(data: Record<string, unknown>[]): string {
  if (!data[0]) return 'name';
  const keys = Object.keys(data[0]);
  // 优先选择字符串类型的 key 作为 X 轴
  const labelKeys = [
    'name',
    'brand_id',
    'price_range',
    'destination',
    'id',
    'name_cn',
  ];
  for (const k of labelKeys) {
    if (keys.includes(k)) return k;
  }
  return keys[0];
}

function getBarKeys(data: Record<string, unknown>[]): string[] {
  if (!data[0]) return [];
  const xKey = getXAxisKey(data);
  return Object.keys(data[0]).filter(
    (k) =>
      k !== xKey &&
      k !== 'currency' &&
      k !== 'brand_id' &&
      typeof data[0][k] === 'number'
  );
}
