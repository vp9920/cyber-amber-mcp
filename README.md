# Cyber Amber MCP Server

An MCP server that gives AI agents access to real-time news from [Cyber Amber](https://cyber-amber.com) — an unbiased news aggregation platform that visualizes articles as an interactive spatial map based on semantic similarity.

## Tools

| Tool | Description |
|------|-------------|
| `get_briefing` | Top stories for a period (1, 3, or 7 days) — one article per topic via greedy pick-and-cover |
| `get_hot_articles` | Hot/trending articles ranked by hotness score for a period (day, 3 days, week) |
| `get_hot_by_topic` | Hot articles within a specific topic (e.g. "gardening", "AI regulation"); supports a hotness threshold |
| `search_articles` | Search articles by keyword, with optional `time_from` / `time_to` |
| `get_trending_keywords` | Keywords whose usage is rising or declining over week / month / year |
| `get_keyword_articles` | Articles for a specific keyword-in-context (`word_id` + `code` from `get_trending_keywords`) |

## Setup

### Claude Code

```bash
npx cyber-amber-mcp
```

Or add it permanently:

```bash
claude mcp add --transport stdio cyber-amber-mcp -- npx cyber-amber-mcp
```

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cyber-amber": {
      "command": "npx",
      "args": ["cyber-amber-mcp"]
    }
  }
}
```

### Docker

A `Dockerfile` is included for users who prefer not to install Node locally.

Build:

```bash
docker build -t cyber-amber-mcp .
```

Run via Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cyber-amber": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "cyber-amber-mcp"]
    }
  }
}
```

Stdio is the only transport, so `-i` is required and `-t` is omitted.

### Configuration

Set `CYBER_AMBER_API_URL` if you want to point at a different API host (defaults to `https://api.cyber-amber.com`).

## Example queries

Once configured, you can ask your AI assistant things like:

- "What's hot in the news right now?"
- "What are today's top stories?"
- "What's hot in AI this week?"
- "Find me recent articles about climate policy"
- "What keywords are trending up this month?"
- "Show me articles for the rising keyword <X>"

## How it works

The server connects to the Cyber Amber API, which indexes news articles from hundreds of sources and computes hotness scores based on how many articles cover the same story. Higher scores mean more coverage — a genuinely trending topic, not just a popular category.

Topic-filtered queries (e.g. "what's hot in gardening") use an anchor article approach: the server finds a representative article for the topic, then uses its full semantic vector to find hot articles in the same area of the news landscape.

Trending keywords are computed via a half-vs-half log-odds growth score within the period, split by encoder code so a polysemous term (e.g. "Memory" → hardware vs biology) can render as multiple distinct trends.

## License

MIT
