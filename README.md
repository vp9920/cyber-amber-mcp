# Cyber Amber MCP Server

An MCP server that gives AI agents access to real-time news trends from [Cyber Amber](https://cyber-amber.com) — an unbiased news aggregation platform that visualizes articles as an interactive spatial map based on semantic similarity.

## Tools

| Tool | Description |
|------|-------------|
| `get_briefing` | Top stories — one article per major topic, covering the last 2 days |
| `get_hot_articles` | Hot/trending articles for a time period (day, 3 days, or week) |
| `get_hot_by_topic` | Hot articles in a specific topic (e.g. "gardening", "AI regulation") |
| `search_articles` | Search articles by keyword |

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

## Example queries

Once configured, you can ask your AI assistant things like:

- "What's hot in the news right now?"
- "What are today's top stories?"
- "What's trending in AI this week?"
- "Find me recent articles about climate policy"

## How it works

The server connects to the Cyber Amber API, which indexes news articles from hundreds of sources and computes hotness scores based on how many articles cover the same story. Higher scores mean more coverage — a genuinely trending topic, not just a popular category.

Topic-filtered queries (e.g. "what's hot in gardening") use an anchor article approach: the server finds a representative article for the topic, then uses its full semantic vector to find hot articles in the same area of the news landscape.

## License

MIT
