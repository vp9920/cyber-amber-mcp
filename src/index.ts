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

interface MetaItem {
  id: number;
  title: string;
  score: number;
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

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function formatArticles(articles: ArticlePoint[]): string {
  if (articles.length === 0) return "No articles found.";
  return articles.map((a, i) => {
    const score = a.score > 0 ? ` [hotness: ${a.score.toFixed(1)}]` : "";
    return `${i + 1}. ${a.title}\n   Source: ${a.source} | ${a.publish_date}${score}\n   ${a.url}`;
  }).join("\n\n");
}

const server = new McpServer({
  name: "cyber-amber",
  version: "1.0.0",
});

server.tool(
  "get_briefing",
  "Get today's top stories — one article per major topic, covering the most important news from the last 2 days",
  {
    count: z.number().min(1).max(40).default(20).describe("Number of top stories to return"),
  },
  async ({ count }) => {
    const result = await apiGet<ArticlesResult>("/briefing", { count: count.toString() });
    return {
      content: [{ type: "text", text: formatArticles(result.points) }],
    };
  }
);

server.tool(
  "get_hot_articles",
  "Get hot/trending articles for a time period. Returns articles ranked by hotness score.",
  {
    period: z.enum(["day", "3days", "week"]).default("3days").describe("Time period: day, 3days, or week"),
    count: z.number().min(1).max(40).default(20).describe("Number of articles to return"),
    threshold: z.number().optional().describe("Minimum hotness score threshold"),
  },
  async ({ period, count, threshold }) => {
    const mode = period === "day" ? "hot_today" : period === "3days" ? "hot_last_3days" : "hot_this_week";
    const body: Record<string, unknown> = {
      x: 0, y: 0,
      time_from: new Date(Date.now() - (period === "day" ? 1 : period === "3days" ? 3 : 7) * 86400000).toISOString(),
      time_to: new Date().toISOString(),
      count,
      mode,
    };
    if (threshold !== undefined) body.threshold = threshold;
    const result = await apiPost<ArticlesResult>("/geo_point", body);
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
    threshold: z.number().optional().describe("Minimum hotness score threshold"),
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
