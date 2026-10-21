/**
 * Decision Tree classifier (CART, Gini impurity) — pure TypeScript, runs in
 * the browser on real collected data. Trained on labeled Wi-Fi measurements
 * to predict performance: Good / Average / Poor.
 *
 * Features: download speed, upload speed, ping, jitter, packet loss.
 */

export type WifiLabel = "Good" | "Average" | "Poor";

export interface LabeledSample {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  packetLossPct: number;
  label: WifiLabel;
}

export type FeatureVector = Omit<LabeledSample, "label">;

const FEATURES = [
  "downloadMbps",
  "uploadMbps",
  "pingMs",
  "jitterMs",
  "packetLossPct",
] as const;
type FeatureName = (typeof FEATURES)[number];

export type TreeNode =
  | { kind: "leaf"; counts: Record<WifiLabel, number>; label: WifiLabel; samples: number }
  | {
      kind: "split";
      feature: FeatureName;
      threshold: number;
      left: TreeNode;
      right: TreeNode;
      samples: number;
    };

export interface Tree {
  root: TreeNode;
  maxDepth: number;
}

export interface Prediction {
  label: WifiLabel;
  confidence: number;
  distribution: Record<WifiLabel, number>;
}

const MAX_DEPTH = 6;
const MIN_SAMPLES_SPLIT = 4;
const MIN_SAMPLES_LEAF = 2;
const MAX_CANDIDATES = 40;

function emptyCounts(): Record<WifiLabel, number> {
  return { Good: 0, Average: 0, Poor: 0 };
}

function classCounts(rows: LabeledSample[]): Record<WifiLabel, number> {
  const counts = emptyCounts();
  for (const row of rows) counts[row.label]++;
  return counts;
}

function majorityLabel(counts: Record<WifiLabel, number>): WifiLabel {
  let best: WifiLabel = "Average";
  let bestCount = -1;
  (Object.keys(counts) as WifiLabel[]).forEach((label) => {
    if (counts[label] > bestCount) {
      best = label;
      bestCount = counts[label];
    }
  });
  return best;
}

function giniFromCounts(counts: Record<WifiLabel, number>, total: number): number {
  if (total === 0) return 0;
  let sum = 0;
  (Object.values(counts) as number[]).forEach((c) => {
    sum += (c / total) ** 2;
  });
  return 1 - sum;
}

function gini(rows: LabeledSample[]): number {
  const counts = classCounts(rows);
  return giniFromCounts(counts, rows.length);
}

function candidateThresholds(values: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 1) return [];
  const mids: number[] = [];
  for (let i = 1; i < sorted.length; i++) mids.push((sorted[i - 1] + sorted[i]) / 2);
  if (mids.length <= MAX_CANDIDATES) return mids;
  const step = mids.length / MAX_CANDIDATES;
  const picked: number[] = [];
  for (let i = 0; i < MAX_CANDIDATES; i++) picked.push(mids[Math.floor(i * step)]);
  return [...new Set(picked)];
}

interface SplitCandidate {
  feature: FeatureName;
  threshold: number;
  gain: number;
  left: LabeledSample[];
  right: LabeledSample[];
}

function bestSplit(rows: LabeledSample[]): SplitCandidate | null {
  const baseGini = gini(rows);
  let best: SplitCandidate | null = null;

  for (const feature of FEATURES) {
    const thresholds = candidateThresholds(rows.map((r) => r[feature] as number));
    for (const threshold of thresholds) {
      const left: LabeledSample[] = [];
      const right: LabeledSample[] = [];
      for (const row of rows) {
        if ((row[feature] as number) <= threshold) left.push(row);
        else right.push(row);
      }
      if (left.length < MIN_SAMPLES_LEAF || right.length < MIN_SAMPLES_LEAF) continue;
      const weighted = (left.length * gini(left) + right.length * gini(right)) / rows.length;
      const gain = baseGini - weighted;
      if (!best || gain > best.gain + 1e-12) {
        best = { feature, threshold, gain, left, right };
      }
    }
  }
  return best && best.gain > 1e-12 ? best : null;
}

function buildNode(rows: LabeledSample[], depth: number): TreeNode {
  const counts = classCounts(rows);
  if (depth >= MAX_DEPTH || rows.length < MIN_SAMPLES_SPLIT) {
    return { kind: "leaf", counts, label: majorityLabel(counts), samples: rows.length };
  }
  const split = bestSplit(rows);
  if (!split) {
    return { kind: "leaf", counts, label: majorityLabel(counts), samples: rows.length };
  }
  return {
    kind: "split",
    feature: split.feature,
    threshold: split.threshold,
    left: buildNode(split.left, depth + 1),
    right: buildNode(split.right, depth + 1),
    samples: rows.length,
  };
}

/** Mulberry32 — small deterministic PRNG so training results are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Train a decision tree on labeled samples. */
export function trainTree(samples: LabeledSample[]): Tree {
  if (samples.length === 0) {
    return { root: { kind: "leaf", counts: emptyCounts(), label: "Average", samples: 0 }, maxDepth: MAX_DEPTH };
  }
  return { root: buildNode(samples, 0), maxDepth: MAX_DEPTH };
}

/** Predict a class for a feature vector, with leaf confidence. */
export function predictTree(tree: Tree, sample: FeatureVector): Prediction {
  let node = tree.root;
  while (node.kind === "split") {
    node = (sample[node.feature] as number) <= node.threshold ? node.left : node.right;
  }
  const total = node.counts.Good + node.counts.Average + node.counts.Poor;
  const confidence = total > 0 ? node.counts[node.label] / total : 0;
  return { label: node.label, confidence, distribution: { ...node.counts } };
}

/** Evaluate generalization with a deterministic 75/25 train/holdout split. */
export function evaluateTree(
  samples: LabeledSample[],
  seed = 42,
): { accuracy: number; holdoutCount: number; trainCount: number; correct: number } {
  if (samples.length < 5) {
    return { accuracy: 0, holdoutCount: 0, trainCount: samples.length, correct: 0 };
  }
  const rng = mulberry32(seed);
  const shuffled = shuffle(samples, rng);
  const holdoutSize = Math.max(2, Math.round(shuffled.length * 0.25));
  const train = shuffled.slice(holdoutSize);
  const holdout = shuffled.slice(0, holdoutSize);
  const tree = trainTree(train);
  let correct = 0;
  for (const row of holdout) {
    const { label } = predictTree(tree, row);
    if (label === row.label) correct++;
  }
  return {
    accuracy: holdout.length > 0 ? correct / holdout.length : 0,
    holdoutCount: holdout.length,
    trainCount: train.length,
    correct,
  };
}

export interface KeyRule {
  feature: FeatureName;
  threshold: number;
  samples: number;
}

/** The most sample-heavy split rules in the tree — shown as "key decisions". */
export function keyRules(tree: Tree, limit = 3): KeyRule[] {
  const splits: KeyRule[] = [];
  const walk = (node: TreeNode) => {
    if (node.kind === "split") {
      splits.push({ feature: node.feature, threshold: node.threshold, samples: node.samples });
      walk(node.left);
      walk(node.right);
    }
  };
  walk(tree.root);
  return splits.sort((a, b) => b.samples - a.samples).slice(0, limit);
}

/**
 * Rule-based fallback classifier using the blueprint's performance
 * thresholds. Used when too little labeled data exists to train on.
 */
export function ruleBasedLabel(sample: {
  downloadMbps: number;
  pingMs: number;
  packetLossPct: number;
}): WifiLabel {
  if (sample.downloadMbps < 10 || sample.pingMs > 150 || sample.packetLossPct > 5) {
    return "Poor";
  }
  if (sample.downloadMbps >= 40 && sample.pingMs <= 60 && sample.packetLossPct <= 1) {
    return "Good";
  }
  return "Average";
}
