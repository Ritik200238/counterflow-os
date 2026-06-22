import type { CrowdingIndex, CrowdingState } from "@/lib/types";
import type { Signals } from "@/lib/context";
import { mapRange, mean, round } from "@/lib/util/num";

// Agent Crowding Index (PRD §34). A market-wide read of how crowded the tokenized-
// stock tape looks to AI agents. Combines asset-level CrowdScores with cross-asset
// move correlation, news intensity, spread widening, and sector-confirmation
// weakness. Lifts CounterFlow OS from per-asset signals to an "OS-level" view.

function stateFor(index: number): CrowdingState {
  if (index >= 75) return "High AI-agent crowding";
  if (index >= 55) return "Elevated";
  if (index >= 30) return "Moderate";
  return "Low";
}

function recommendationFor(state: CrowdingState): string {
  switch (state) {
    case "High AI-agent crowding":
      return "Reduce momentum exposure; prefer fade / convergence; lower position size globally.";
    case "Elevated":
      return "Trim momentum sizing; favor CounterFlow Fade and Fair-Value Convergence.";
    case "Moderate":
      return "Balanced conditions; standard sizing with normal strategy routing.";
    case "Low":
      return "Crowding low; momentum-friendly environment, follow confirmed trends.";
  }
}

export function computeCrowdingIndex(signalsList: Signals[]): CrowdingIndex {
  const n = Math.max(1, signalsList.length);
  const crowdScores = signalsList.map((s) => s.crowd.score);
  const velocities = signalsList.map((s) => s.snapshot.priceVelocityPct);

  const avgCrowd = mean(crowdScores);
  const extremeShare = (crowdScores.filter((c) => c >= 70).length / n) * 100;

  const sumAbsVel = velocities.reduce((a, v) => a + Math.abs(v), 0);
  const alignment = sumAbsVel > 0 ? Math.abs(velocities.reduce((a, v) => a + v, 0)) / sumAbsVel : 0;
  const moveCorrelation = alignment * 100;

  const newsIntensity = mean(signalsList.map((s) => s.snapshot.newsIntensity)) * 100;
  const spreadWidening = mean(
    signalsList.map((s) => mapRange(s.snapshot.spreadPct, 0.1, 0.6, 0, 100)),
  );
  const sectorWeakness = mean(
    signalsList.map((s) => (1 - s.snapshot.sectorConfirmation) * 100),
  );

  const components = [
    { label: "Average CrowdScore", value: round(avgCrowd, 1), weight: 0.3 },
    { label: "Extreme-crowd asset share", value: round(extremeShare, 1), weight: 0.2 },
    { label: "Cross-asset move correlation", value: round(moveCorrelation, 1), weight: 0.15 },
    { label: "Sector-confirmation weakness", value: round(sectorWeakness, 1), weight: 0.12 },
    { label: "News / sentiment intensity", value: round(newsIntensity, 1), weight: 0.12 },
    { label: "Spread widening", value: round(spreadWidening, 1), weight: 0.11 },
  ];

  const index = round(
    components.reduce((acc, c) => acc + c.value * c.weight, 0),
    0,
  );
  const state = stateFor(index);

  return {
    index,
    state,
    extremeAssets: crowdScores.filter((c) => c >= 80).length,
    recommendation: recommendationFor(state),
    components,
    generatedAt: new Date().toISOString(),
  };
}
