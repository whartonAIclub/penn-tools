"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { DIMENSIONS } from "@/lib/types";
import type { SessionResult } from "@/lib/types";

interface Props {
  scores: SessionResult["scores"];
  priority: string; // dimension key to highlight
}

export default function SkillRadar({ scores, priority }: Props) {
  const data = DIMENSIONS.map(({ key, label }) => ({
    dimension: label,
    score: scores[key].score,
    fullMark: 5,
    isPriority: key === priority,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#efefef" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={({ x, y, payload }) => {
            const isPriority = data.find(d => d.dimension === payload.value)?.isPriority;
            return (
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill={isPriority ? "#1a1a1a" : "#666"}
                fontWeight={isPriority ? 700 : 400}
              >
                {payload.value}
              </text>
            );
          }}
        />
        <Radar
          dataKey="score"
          stroke="#1a1a1a"
          fill="#1a1a1a"
          fillOpacity={0.1}
          strokeWidth={1.5}
          dot={{ r: 3, fill: "#1a1a1a", strokeWidth: 0 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
