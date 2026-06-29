"use client";

import { useMemo, useState } from "react";
import { buildInsights, profileHealth, type ProfileMetrics } from "@/lib/insights";
import { topFamilies } from "@/lib/roleFamily";
import { makeColorOf, CATEGORICAL, WORKPLACE_COLORS } from "@/components/insights/colors";
import { AutoInsightsPanel } from "@/components/insights/AutoInsightsPanel";
import { Scorecard } from "@/components/insights/Scorecard";
import { TimeSeriesChart } from "@/components/insights/TimeSeriesChart";
import { Histogram } from "@/components/insights/Histogram";
import { Funnel } from "@/components/insights/Funnel";
import { StackedBar, type Segment } from "@/components/insights/StackedBar";

type Ev = { profileId: string; day: string };

export function InsightsDashboard({
  metrics,
  events,
  dayKeys,
  todayKey,
}: {
  metrics: ProfileMetrics[];
  events: Ev[];
  dayKeys: string[];
  todayKey: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const profiles = useMemo(() => metrics.map((m) => ({ id: m.profileId, name: m.name })), [metrics]);
  const colorOf = useMemo(() => makeColorOf(profiles), [profiles]);

  const insights = useMemo(() => buildInsights(metrics, todayKey), [metrics, todayKey]);
  const shownInsights = selected ? insights.filter((i) => i.profileId === selected) : insights;
  const visible = selected ? metrics.filter((m) => m.profileId === selected) : metrics;
  const scopeLabel = selected ? metrics.find((m) => m.profileId === selected)?.name ?? "" : "All profiles";

  const agg = useMemo(() => aggregate(visible), [visible]);

  if (metrics.length === 0) {
    return <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">No profiles yet — create one to start tailoring.</p>;
  }

  return (
    <div className="space-y-8">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">View:</span>
        <Chip active={selected === null} onClick={() => setSelected(null)} dot={null}>All</Chip>
        {profiles.map((p) => (
          <Chip key={p.id} active={selected === p.id} onClick={() => setSelected(selected === p.id ? null : p.id)} dot={colorOf(p.id)}>
            {p.name}
          </Chip>
        ))}
      </div>

      {/* 1. Action panel */}
      <Section title="What needs attention" desc="Auto-detected problems and the recommended action, per profile.">
        <AutoInsightsPanel insights={shownInsights} colorOf={colorOf} />
      </Section>

      {/* 2. Scorecards */}
      <Section title="Profile health" desc="Click a profile to focus the charts below on it.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => (
            <Scorecard
              key={m.profileId}
              m={m}
              health={profileHealth(m, todayKey)}
              color={colorOf(m.profileId)}
              selected={selected === m.profileId}
              onSelect={() => setSelected(selected === m.profileId ? null : m.profileId)}
            />
          ))}
        </div>
      </Section>

      {/* 3. Applications over time */}
      <Section title="Applications over time" desc="Submitted applications per profile — switch daily / weekly / monthly.">
        <TimeSeriesChart profiles={profiles} events={events} dayKeys={dayKeys} colorOf={colorOf} />
      </Section>

      {/* 4. Fit + funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="ATS match distribution" desc={`How well resumes score — ${scopeLabel}. Below 60 is red.`}>
          <Histogram buckets={agg.fitBuckets} />
        </Section>
        <Section title="Tailoring funnel" desc={`Where jobs drop off — ${scopeLabel}.`}>
          <Funnel fetched={agg.fetched} tailored={agg.distinctTailored} applied={agg.applied} color="#0284c7" />
        </Section>
      </div>

      {/* 5. Role + workplace */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Role mix" desc="Share of each profile's jobs by role family.">
          <ProfileRows profiles={visible} colorOf={colorOf} segmentsOf={roleSegments} empty="No jobs yet." />
        </Section>
        <Section title="Applied workplace mix" desc="Remote / hybrid / onsite / in-person of the jobs you applied to.">
          <ProfileRows profiles={visible} colorOf={colorOf} segmentsOf={workplaceSegments} empty="No applications yet." />
        </Section>
      </div>

      {/* 6. Apply quality */}
      <Section title="Apply quality" desc="Did applications use a tailored resume?">
        <ProfileRows profiles={visible} colorOf={colorOf} segmentsOf={applyQualitySegments} empty="No applications yet." />
      </Section>
    </div>
  );
}

// ---- composition helpers ----

function aggregate(ms: ProfileMetrics[]) {
  const fitBuckets = [0, 0, 0, 0, 0, 0];
  let fetched = 0, distinctTailored = 0, applied = 0;
  for (const m of ms) {
    m.fitBuckets.forEach((c, i) => (fitBuckets[i] += c));
    fetched += m.fetched;
    distinctTailored += m.distinctTailored;
    applied += m.applied;
  }
  return { fitBuckets, fetched, distinctTailored, applied };
}

function roleSegments(m: ProfileMetrics): Segment[] {
  return topFamilies(m.roleFamilies, 6).map((f, i) => ({ label: f.family, value: f.count, color: CATEGORICAL[i % CATEGORICAL.length] }));
}
function workplaceSegments(m: ProfileMetrics): Segment[] {
  return [
    { label: "Remote", value: m.workplace.remote, color: WORKPLACE_COLORS.remote },
    { label: "Hybrid", value: m.workplace.hybrid, color: WORKPLACE_COLORS.hybrid },
    { label: "Onsite", value: m.workplace.onsite, color: WORKPLACE_COLORS.onsite },
    { label: "In-person", value: m.workplace.inPerson, color: WORKPLACE_COLORS.inPerson },
    { label: "Unknown", value: m.workplace.unknown, color: WORKPLACE_COLORS.unknown },
  ];
}
function applyQualitySegments(m: ProfileMetrics): Segment[] {
  return [
    { label: "Tailored", value: m.appliedTailored.yes, color: "#059669" },
    { label: "Untailored", value: m.appliedTailored.no, color: "#e11d48" },
    { label: "Unknown", value: m.appliedTailored.unknown, color: "#cbd5e1" },
  ];
}

function ProfileRows({
  profiles,
  colorOf,
  segmentsOf,
  empty,
}: {
  profiles: ProfileMetrics[];
  colorOf: (id: string) => string;
  segmentsOf: (m: ProfileMetrics) => Segment[];
  empty: string;
}) {
  const withData = profiles.filter((m) => segmentsOf(m).some((s) => s.value > 0));
  if (withData.length === 0) return <p className="py-2 text-xs text-neutral-400">{empty}</p>;
  return (
    <div className="space-y-3">
      {withData.map((m) => (
        <div key={m.profileId}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: colorOf(m.profileId) }} />
            {m.name}
          </div>
          <StackedBar segments={segmentsOf(m)} />
        </div>
      ))}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {desc && <p className="mb-3 text-xs text-neutral-500">{desc}</p>}
      {children}
    </section>
  );
}

function Chip({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot: string | null; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-sky-400 bg-sky-50 text-sky-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-100"}`}
    >
      {dot && <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: dot }} />}
      {children}
    </button>
  );
}
