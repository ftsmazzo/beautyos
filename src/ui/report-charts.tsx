"use client";

import { useEffect, useRef } from "react";
import ApexCharts from "apexcharts";

type BarPoint = { label: string; value: number; hint?: string };
type Slice = { label: string; value: number; color?: string };

const PALETTE = ["#206bc4", "#4299e1", "#2fb344", "#f59f00", "#d63939", "#ae3ec9", "#667382", "#0ca678"];

export function ReportBarChart({
  title,
  meta,
  points,
  formatValue,
}: {
  title: string;
  meta?: string;
  points: BarPoint[];
  formatValue: (value: number) => string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const signature = points.map((point) => `${point.label}:${point.value}`).join("|");

  useEffect(() => {
    if (!host.current || points.length === 0) return;
    const chart = new ApexCharts(host.current, {
      chart: {
        type: "bar",
        height: 280,
        fontFamily: "inherit",
        toolbar: { show: false },
        animations: { enabled: true, speed: 400 },
      },
      series: [{ name: title, data: points.map((point) => point.value) }],
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: "55%",
        },
      },
      colors: ["#206bc4"],
      dataLabels: { enabled: false },
      stroke: { show: true, width: 2, colors: ["transparent"] },
      xaxis: {
        categories: points.map((point) => point.label),
        labels: { style: { colors: "#667382", fontSize: "11px" } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: "#667382", fontSize: "11px" },
          formatter: (value: number) => formatValue(Math.round(value)),
        },
      },
      grid: {
        borderColor: "#e6e7e9",
        strokeDashArray: 3,
        padding: { top: 0, right: 8, bottom: 0, left: 8 },
      },
      tooltip: {
        y: {
          formatter: (value: number, opts?: { dataPointIndex?: number }) => {
            const hint = points[opts?.dataPointIndex ?? 0]?.hint;
            return hint ? `${formatValue(value)} · ${hint}` : formatValue(value);
          },
        },
      },
    });
    void chart.render();
    return () => {
      chart.destroy();
    };
    // signature cobre mudanças dos pontos sem recriar a cada render
  }, [title, signature, formatValue, points]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        {meta ? <div className="card-actions text-secondary">{meta}</div> : null}
      </div>
      <div className="card-body">
        {points.length === 0 ? <p className="text-secondary mb-0">Nada neste período.</p> : <div ref={host} />}
      </div>
    </div>
  );
}

export function ReportDonut({
  title,
  slices,
  formatValue,
  empty,
}: {
  title: string;
  slices: Slice[];
  formatValue: (value: number) => string;
  empty: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const usable = slices.filter((slice) => slice.value > 0);
  const signature = usable.map((slice) => `${slice.label}:${slice.value}`).join("|");

  useEffect(() => {
    if (!host.current || usable.length === 0) return;
    const total = usable.reduce((sum, slice) => sum + slice.value, 0);
    const chart = new ApexCharts(host.current, {
      chart: {
        type: "donut",
        height: 280,
        fontFamily: "inherit",
        animations: { enabled: true, speed: 400 },
      },
      series: usable.map((slice) => slice.value),
      labels: usable.map((slice) => slice.label),
      colors: usable.map((slice, index) => slice.color ?? PALETTE[index % PALETTE.length]),
      legend: {
        position: "bottom",
        fontSize: "12px",
      },
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "Total",
                formatter: () => formatValue(total),
              },
            },
          },
        },
      },
      tooltip: {
        y: { formatter: (value: number) => formatValue(value) },
      },
    });
    void chart.render();
    return () => {
      chart.destroy();
    };
  }, [signature, formatValue, usable]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
      </div>
      <div className="card-body">
        {usable.length === 0 ? <p className="text-secondary mb-0">{empty}</p> : <div ref={host} />}
      </div>
    </div>
  );
}
