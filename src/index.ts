#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.CYBER_AMBER_API_URL || "https://api.cyber-amber.com";

interface ArticlePoint {
  id: number;
  title: string;
  url: string;
  source: string;
  publish_date: string;
  desc: string;
  score: number;
}

interface ArticlesResult {
  points: ArticlePoint[];
}

interface TrendAtom {
  word_id: number;
  word_text: string;
  code_context: number;
  x: number;
  y: number;
  article_count: number;
  growth_week: number;
  growth_month: number;
  growth_year: number;
  spec: number;
  rarity: number;
  label_score: number;
  hint_words: string[];
  daily_counts: number[];
}

interface TrendsResult {
  atoms: TrendAtom[];
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const url = `${API_URL}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function upperFirstPerWord(s: string): string {
  return s.split(" ").map(w => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(" ");
}

function formatArticles(articles: ArticlePoint[]): string {
  if (articles.length === 0) return "No articles found.";
  return articles.map((a, i) => {
    const score = a.score > 0 ? ` [hotness: ${a.score.toFixed(1)}]` : "";
    return `${i + 1}. ${decodeHtmlEntities(a.title)}\n   Source: ${a.source} | ${a.publish_date}${score}\n   ${a.url}`;
  }).join("\n\n");
}

function formatTrends(atoms: TrendAtom[], period: "week" | "month" | "year"): string {
  if (atoms.length === 0) return "No trending keywords found.";
  const growthKey: keyof TrendAtom = period === "week" ? "growth_week" : period === "month" ? "growth_month" : "growth_year";
  return atoms.map((a, i) => {
    const growth = a[growthKey] as number;
    const sign = growth >= 0 ? "+" : "";
    const hints = a.hint_words && a.hint_words.length > 0
      ? ` | hints: ${a.hint_words.slice(0, 5).map(upperFirstPerWord).join(", ")}`
      : "";
    return `${i + 1}. ${upperFirstPerWord(a.word_text)} — ${sign}${(growth * 100).toFixed(0)}% ${period}, ${a.article_count} articles${hints}\n   word_id=${a.word_id} code=${a.code_context}`;
  }).join("\n\n");
}

const server = new McpServer({
  name: "cyber-amber",
  version: "1.3.0",
});

server.tool(
  "get_briefing",
  "Get top stories for a period, with one article per topic. Runs greedy pick-and-cover across hot articles so the list covers distinct stories (not duplicates of the same story across sources). Best default for 'what are the top stories right now?'.",
  {
    days: z.enum(["1", "3", "7"]).default("3").describe("Time window: 1, 3, or 7 days"),
    count: z.number().min(1).max(40).default(20).describe("Number of stories to return"),
  },
  async ({ days, count }) => {
    const result = await apiGet<ArticlesResult>("/briefing", { days, count });
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

server.tool(
  "get_hot_articles",
  "Get articles ranked purely by hotness score for a time period. May include multiple articles about the same story (from different sources) — use get_briefing if you want one article per topic.",
  {
    period: z.enum(["day", "3days", "week"]).default("3days").describe("Time period: day, 3days, or week"),
    count: z.number().min(1).max(40).default(20).describe("Number of articles to return"),
  },
  async ({ period, count }) => {
    const result = await apiPost<ArticlesResult>("/hot", { period, count });
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

server.tool(
  "get_hot_by_topic",
  "Get hot/trending articles on a specific topic. Provide a topic keyword (e.g. 'gardening', 'AI regulation', 'Ukraine') to find trending articles in that area.",
  {
    topic: z.string().describe("Topic keyword or phrase to search for"),
    period: z.enum(["day", "3days", "week"]).default("3days").describe("Time period: day, 3days, or week"),
    count: z.number().min(1).max(40).default(10).describe("Number of articles to return"),
    threshold: z.number().optional().describe("Minimum hotness score. Scores are normalized so ~100 = a typical top story of the period, and thresholds are comparable across day/3days/week. Anchors (measured across all topics): ~10 filters out low-signal noise (p75), ~25 = moderately notable (p90), ~40 = notable (p95), ~80 = clearly hot (p99), ~100+ = top stories, ~150+ = rare standouts (observed max typically 130–170). Omit for no floor; raise it when you only want the highest-impact stories on the topic."),
  },
  async ({ topic, period, count, threshold }) => {
    const body: Record<string, unknown> = { query: topic, period, count };
    if (threshold !== undefined) body.threshold = threshold;
    const result = await apiPost<ArticlesResult>("/hot_similar", body);
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

server.tool(
  "search_articles",
  "Search for articles by keyword. Returns articles matching the query, ranked by relevance. Optionally restrict results to a time range.",
  {
    query: z.string().describe("Search query"),
    count: z.number().min(1).max(40).default(10).describe("Number of articles to return"),
    time_from: z.string().optional().describe("Optional lower bound on publish_date (ISO 8601 or any parseable date)"),
    time_to: z.string().optional().describe("Optional upper bound on publish_date (ISO 8601 or any parseable date)"),
  },
  async ({ query, count, time_from, time_to }) => {
    const body: Record<string, unknown> = { query, count };
    if (time_from !== undefined) body.time_from = time_from;
    if (time_to !== undefined) body.time_to = time_to;
    const result = await apiPost<ArticlesResult>("/search", body);
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

server.tool(
  "get_trending_keywords",
  "Get keywords whose usage is rising or declining over a period. Each result includes a word_id + code_context that can be passed to get_keyword_articles to fetch articles for that keyword's specific topical sense. Use this to discover what's newly on the agenda (rising) or fading (declining).",
  {
    period: z.enum(["week", "month", "year"]).default("week").describe("Growth window: week, month, or year"),
    direction: z.enum(["rising", "declining"]).default("rising").describe("rising = fastest-growing, declining = fastest-fading"),
    limit: z.number().min(1).max(200).default(30).describe("Number of keywords to return"),
  },
  async ({ period, direction, limit }) => {
    const result = await apiGet<TrendsResult>("/trends", { period, direction, limit });
    return {
      content: [{ type: "text", text: formatTrends(result.atoms, period) }],
    };
  }
);

server.tool(
  "get_keyword_articles",
  "Get articles for a specific keyword-in-context, as returned by get_trending_keywords. word_id identifies the keyword, code identifies its topical sense (encoder code). Window defaults to the matching period; pass time_from/time_to to override.",
  {
    word_id: z.number().int().nonnegative().describe("Keyword ID from get_trending_keywords"),
    code: z.number().int().nonnegative().describe("Encoder code_context from get_trending_keywords"),
    period: z.enum(["week", "month", "year"]).default("week").describe("Default window for time_from if not supplied: last week/month/year"),
    count: z.number().min(1).max(100).default(20).describe("Number of articles to return"),
    time_from: z.string().optional().describe("Optional lower bound on publish_date (ISO 8601). Overrides `period`."),
    time_to: z.string().optional().describe("Optional upper bound on publish_date (ISO 8601). Defaults to now."),
  },
  async ({ word_id, code, period, count, time_from, time_to }) => {
    const now = new Date();
    const periodDays = period === "week" ? 7 : period === "month" ? 30 : 365;
    const defaultFrom = new Date(now.getTime() - periodDays * 24 * 3600 * 1000);
    const body = {
      word_id,
      code,
      time_from: time_from ?? defaultFrom.toISOString(),
      time_to: time_to ?? now.toISOString(),
      count,
    };
    const result = await apiPost<ArticlesResult>("/trend_articles", body);
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
