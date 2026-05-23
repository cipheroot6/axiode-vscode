# Axiode for VS Code

Real-time developer activity tracking for your [Axiode](https://axiode.vercel.app) workspace. Automatically tracks coding sessions, projects, languages, and activity patterns as you code.

## How It Works

Axiode runs in the background while you code. It detects file edits, active editor windows, and project context — then sends lightweight heartbeats to your Axiode dashboard. No manual time tracking, no toggling timers.

### Tracked Data

- **Coding sessions** — automatically started and ended based on editor activity
- **Projects & languages** — detected from your workspace
- **Activity patterns** — active coding time vs. idle periods
- **AI-assisted coding** — detects paired AI coding activity from supported extensions

## Getting Started

### 1. Install the Extension

Install from the VS Code Marketplace, or side-load via `.vsix`:

```bash
code --install-extension axiode-vscode-1.0.0.vsix
```

### 2. Get Your API Key

1. Open your [Axiode dashboard](https://axiode.vercel.app)
2. Navigate to **Settings > API Keys**
3. Generate a new API key

### 3. Configure the Extension

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

- **Axiode: Api Key** — enter your API key
- **Axiode: Api Url** — defaults to `https://axiode.vercel.app/api/v1`

Or set via config file:

```ini
[settings]
api_key = your-axiode-api-key
api_url = https://axiode.vercel.app
```

### 4. Verify It's Working

The VS Code status bar will show **Axiode Initializing...** then **Axiode: Today's coding time**. Open your Axiode dashboard to see your sessions.

## Commands

| Command | Description |
|---------|-------------|
| `Axiode: Api Key` | Set your Axiode API key |
| `Axiode: Api Url` | Configure your Axiode instance URL |
| `Axiode: Proxy` | Set HTTP proxy for API requests |
| `Axiode: Enable/Disable Extension` | Toggle tracking |
| `Axiode: Open Dashboard` | Open your Axiode dashboard |
| `Axiode: Open Log File` | View debug logs |
| `Axiode: Status Bar Enabled` | Toggle status bar display |
| `Axiode: Status Bar Coding Activity` | Toggle activity text in status bar |

## Status Bar

The status bar shows your coding activity for today. Click it to open your Axiode dashboard.

## Configuration

Settings are available via VS Code's settings UI under the `axiode.*` namespace:

| Setting | Default | Description |
|---------|---------|-------------|
| `axiode.apiKey` | — | API key for authentication |
| `axiode.apiUrl` | `https://axiode.vercel.app/api/v1` | Axiode instance URL |
| `axiode.align` | `left` | Status bar alignment |
| `axiode.alignPriority` | `1` | Status bar priority |

## Requirements

- VS Code ^1.89.0
- Active Axiode workspace
- Axiode API key

## Development

```bash
git clone https://github.com/cipheroot/axiode-vscode.git
cd axiode-vscode
npm install
npm run compile
```

To run locally, press `F5` in VS Code to open the Extension Development Host.

## License

BSD-3-Clause
