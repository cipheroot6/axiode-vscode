# DevPulse for VS Code

Real-time developer activity tracking for your [DevPulse](https://dev-pulse-application.vercel.app) workspace. Automatically tracks coding sessions, projects, languages, and activity patterns as you code.

## How It Works

DevPulse runs in the background while you code. It detects file edits, active editor windows, and project context — then sends lightweight heartbeats to your DevPulse dashboard. No manual time tracking, no toggling timers.

### Tracked Data

- **Coding sessions** — automatically started and ended based on editor activity
- **Projects & languages** — detected from your workspace
- **Activity patterns** — active coding time vs. idle periods
- **AI-assisted coding** — detects paired AI coding activity from supported extensions

## Getting Started

### 1. Install the Extension

Install from the VS Code Marketplace, or side-load via `.vsix`:

```bash
code --install-extension devpulse-vscode-1.0.0.vsix
```

### 2. Get Your API Key

1. Open your [DevPulse dashboard](https://dev-pulse-application.vercel.app)
2. Navigate to **Settings > API Keys**
3. Generate a new API key

### 3. Configure the Extension

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

- **DevPulse: Api Key** — enter your API key
- **DevPulse: Api Url** — defaults to `https://dev-pulse-application.vercel.app/api/v1`

Or set via config file:

```ini
[settings]
api_key = your-dev-pulse-api-key
api_url = https://dev-pulse-application.vercel.app
```

### 4. Verify It's Working

The VS Code status bar will show **DevPulse Initializing...** then **DevPulse: Today's coding time**. Open your DevPulse dashboard to see your sessions.

## Commands

| Command | Description |
|---------|-------------|
| `DevPulse: Api Key` | Set your DevPulse API key |
| `DevPulse: Api Url` | Configure your DevPulse instance URL |
| `DevPulse: Proxy` | Set HTTP proxy for API requests |
| `DevPulse: Enable/Disable Extension` | Toggle tracking |
| `DevPulse: Open Dashboard` | Open your DevPulse dashboard |
| `DevPulse: Open Log File` | View debug logs |
| `DevPulse: Status Bar Enabled` | Toggle status bar display |
| `DevPulse: Status Bar Coding Activity` | Toggle activity text in status bar |

## Status Bar

The status bar shows your coding activity for today. Click it to open your DevPulse dashboard.

## Configuration

Settings are available via VS Code's settings UI under the `devpulse.*` namespace:

| Setting | Default | Description |
|---------|---------|-------------|
| `devpulse.apiKey` | — | API key for authentication |
| `devpulse.apiUrl` | `https://dev-pulse-application.vercel.app/api/v1` | DevPulse instance URL |
| `devpulse.align` | `left` | Status bar alignment |
| `devpulse.alignPriority` | `1` | Status bar priority |

## Requirements

- VS Code ^1.89.0
- Active DevPulse workspace
- DevPulse API key

## Development

```bash
git clone https://github.com/cipheroot/devpulse-vscode.git
cd devpulse-vscode
npm install
npm run compile
```

To run locally, press `F5` in VS Code to open the Extension Development Host.

## License

BSD-3-Clause
