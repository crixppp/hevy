import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";
const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("en-AU", { maximumFractionDigits: d });
export default function Chart({
  data,
  metric = "sets",
  unit = "sets",
  kind = "area",
}: {
  data: any[];
  metric?: string;
  unit?: string;
  kind?: "area" | "bar" | "line";
}) {
  const shared = {
    data,
    margin: { top: 15, right: 20, left: 0, bottom: 0 },
    accessibilityLayer: true,
  };
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`${unit} over time. Exact values available in the data table below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {kind === "area" ? (
            <AreaChart {...shared}>
              <defs>
                <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--accent)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--accent)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={35}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  color: "var(--text)",
                }}
                formatter={(v) => [fmt(Number(v), 1), unit]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#green)"
                isAnimationActive={false}
              />
            </AreaChart>
          ) : kind === "bar" ? (
            <BarChart {...shared}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                }}
              />
              <Bar
                dataKey={metric}
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <LineChart {...shared}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                width={44}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                }}
                formatter={(v) => [fmt(Number(v), 1), unit]}
              />
              <Line
                type="linear"
                dataKey={metric}
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View chart data · {unit}</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / item</th>
                <th>{unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td>
                    {d.date ?? d.label}
                    {d.partial ? " (partial week)" : ""}
                  </td>
                  <td>{fmt(d[metric], 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
