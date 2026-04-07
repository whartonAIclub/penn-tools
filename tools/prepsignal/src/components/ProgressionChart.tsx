"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DIMENSIONS } from "@/lib/types";

interface Props {
  data: Record<string, string | number>[];
  priorityDimension: string;
}

// Subtle grays for non-priority lines; black for priority
const COLORS: Record<string, string> = {
  structuring: "#555",
  quantitative: "#888",
  creativity: "#aaa",
  synthesis: "#1a1a1a",
  communication: "#666",
  business_judgment: "#999",
};

export default function ProgressionChart({ data, priorityDimension }: Props) {
  if (data.length < 2) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "180px",
        color: "#999",
        fontSize: "13px",
        border: "1px dashed #d4d4d4",
        borderRadius: "4px",
      }}>
        Complete 2 sessions to see your trends
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
        <CartesianGrid stroke="#f0f0f0" strokeDasharray="4 3" />
        <XAxis dataKey="session" tick={{ fontSize: 11, fill: "#999" }} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#999" }} />
        <Tooltip
          contentStyle={{ fontSize: "12px", border: "1px solid #d4d4d4", borderRadius: "4px" }}
        />
        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
        {DIMENSIONS.map(({ key, label }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={label}
            stroke={key === priorityDimension ? "#1a1a1a" : COLORS[key]}
            strokeWidth={key === priorityDimension ? 2 : 1.5}
            strokeDasharray={key === priorityDimension ? undefined : undefined}
            dot={{ r: key === priorityDimension ? 4 : 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
