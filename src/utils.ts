import * as vscode from 'vscode';
import { COMMON_AI_EXTENSIONS, TIME_BETWEEN_HEARTBEATS_MS } from './constants';

export class Utils {
  private static appNames = {
    'Arduino IDE': 'arduino',
    'Azure Data Studio': 'azdata',
    'Claude Code': 'claude-code',
    Cursor: 'cursor',
    IDX: 'idx',
    Kiro: 'kiro',
    Melty: 'melty',
    OpenCode: 'opencode',
    Onivim: 'onivim',
    'Onivim 2': 'onivim',
    PearAI: 'pearai',
    Qoder: 'qoder',
    'SQL Operations Studio': 'sqlops',
    Trae: 'trae',
    Void: 'void',
    Windsurf: 'windsurf',
  };

  public static quote(str: string): string {
    if (str.includes(' ')) return `"${str.replace(/"/g, '\\"')}"`;
    return str;
  }

  public static apiKeyInvalid(key?: string): string {
    const err = 'Invalid api key... check https://axiode.vercel.app/settings for your key';
    if (!key) return err;
    const re = new RegExp(
      '^axiode_([0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}|[0-9A-F]{64})$',
      'i',
    );
    if (!re.test(key)) return err;
    return '';
  }

  public static validateApiUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url.trim();
    return '';
  }

  public static validateProxy(proxy: string): string {
    if (!proxy) return '';
    let re;
    if (proxy.indexOf('\\') === -1) {
      re = new RegExp('^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?[\\w\\.-]+(:\\d+)?$', 'i');
    } else {
      re = new RegExp('^.*\\\\.+$', 'i');
    }
    if (!re.test(proxy)) {
      const ipv6 = new RegExp(
        '^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(:\\d+)?$',
        'i',
      );
      if (!ipv6.test(proxy)) {
        return 'Invalid proxy. Valid formats are https://user:pass@host:port or socks5://user:pass@host:port or domain\\user:pass';
      }
    }
    return '';
  }

  public static formatDate(date: Date): String {
    let months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    let ampm = 'AM';
    let hour = date.getHours();
    if (hour > 11) {
      ampm = 'PM';
      hour = hour - 12;
    }
    if (hour == 0) {
      hour = 12;
    }
    let minute = date.getMinutes();
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hour}:${
      minute < 10 ? `0${minute}` : minute
    } ${ampm}`;
  }

  public static obfuscateKey(key: string): string {
    let newKey = '';
    if (key) {
      newKey = key;
      if (key.length > 4)
        newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
    }
    return newKey;
  }

  public static wrapArg(arg: string): string {
    if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
    return arg;
  }

  public static formatArguments(binary: string, args: string[]): string {
    let clone = args.slice(0);
    clone.unshift(this.wrapArg(binary));
    let newCmds: string[] = [];
    let lastCmd = '';
    for (let i = 0; i < clone.length; i++) {
      if (lastCmd == '--key') newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
      else newCmds.push(this.wrapArg(clone[i]));
      lastCmd = clone[i];
    }
    return newCmds.join(' ');
  }

  public static isRemoteUri(uri: vscode.Uri): boolean {
    if (!uri) return false;
    return uri.scheme === 'vscode-remote';
  }

  public static apiUrlToDashboardUrl(url: string): string {
    url = url
      .replace('://api.', '://')
      .replace('/api/v1', '')
      .replace(/^api\./, '')
      .replace('/api', '');
    return url;
  }

  public static enoughTimePassed(lastHeartbeat: number, now: number): boolean {
    return lastHeartbeat + TIME_BETWEEN_HEARTBEATS_MS < now;
  }

  public static isPullRequest(uri: vscode.Uri): boolean {
    if (!uri) return false;
    return uri.scheme === 'pr';
  }

  public static isCodexCodeReview(e: vscode.TabChangeEvent): boolean {
    const isCodexDiff = (tab: vscode.Tab): boolean => {
      if (!tab.isActive) return false;
      const viewType = (tab.input as { viewType?: string } | undefined)?.viewType;
      if (!viewType?.includes('chatgpt')) return false;
      return tab.label.toLowerCase().includes('codex diff');
    };
    return [...e.opened, ...e.changed].some(isCodexDiff);
  }

  public static isAIChatSidebar(uri: vscode.Uri | undefined): boolean {
    // check if the active tab is a known AI sidebar/webview (Copilot, Claude, Codeium, etc.)
    const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
    const viewType = (activeTab?.input as { viewType?: string } | undefined)?.viewType?.toLowerCase() ?? '';
    
    const aiIdentifiers = [
      'antigravity',
      'claude',
      'codeium',
      'cody',
      'continue',
      'copilot',
      'cursor',
      'gemini',
      'opencode',
      'supermaven',
      'tabnine',
      'windsurf',
      'chatgpt'
    ];

    if (viewType && aiIdentifiers.some(id => viewType.includes(id))) {
      return true;
    }

    // check if the active uri has an AI sidebar scheme
    if (!uri) return false;
    if (uri.fsPath.endsWith('.log')) return false;
    
    const scheme = uri.scheme.toLowerCase();
    if (scheme === 'vscode-chat-code-block') return true;
    if (scheme === 'openai-codex') return true;
    if (aiIdentifiers.some(id => scheme === id)) {
      return true;
    }

    return false;
  }

  public static isPossibleAICodeInsert(e: vscode.TextDocumentChangeEvent): boolean {
    if (e.document.fileName.endsWith('.log')) return false;
    if (e.contentChanges.length !== 1) return false;

    const text = e.contentChanges?.[0].text.trim();
    if (text.length <= 2) return false;

    // inserted text must be 2+ lines or single line 50+ chars long to qualify as AI
    return (text.match(/[\n\r]/g) || []).length > 2 || text.length > 50;
  }

  public static getFocusedFile(document?: vscode.TextDocument): string | undefined {
    const doc = document ?? vscode.window.activeTextEditor?.document;
    if (doc) {
      const file = doc.fileName;
      if (Utils.isRemoteUri(doc.uri)) {
        return `${doc.uri.authority}${doc.uri.path}`.replace('ssh-remote+', 'ssh://');
        // TODO: how to support 'dev-container', 'attached-container', 'wsl', and 'codespaces' schemes?
      }
      return file;
    }
  }

  public static isPossibleHumanCodeInsert(e: vscode.TextDocumentChangeEvent): boolean {
    if (e.contentChanges.length !== 1) return false;
    if (
      e.contentChanges?.[0].text.trim().length === 1 &&
      e.contentChanges?.[0].text !== '\n' &&
      e.contentChanges?.[0].text !== '\r'
    )
      return true;
    if (e.contentChanges?.[0].text.length === 0) return true;
    return false;
  }

  public static getEditorName(): string {
    if (this.appNames[vscode.env.appName]) {
      return this.appNames[vscode.env.appName];
    }

    const appRoot = vscode.env.appRoot.toLowerCase();
    for (const editor of Object.keys(this.appNames)) {
      if (appRoot.includes(editor.toLowerCase())) {
        return this.appNames[editor];
      }
    }

    if (vscode.env.appName.toLowerCase().includes('visual')) {
      return 'vscode';
    } else {
      return vscode.env.appName.replace(/\s/g, '').toLowerCase();
    }
  }

  public static hasAIExtensions(): boolean {
    return COMMON_AI_EXTENSIONS.some((assistant) => {
      return assistant.extensionIds.some((id) => {
        const extension = vscode.extensions.getExtension(id);
        return extension && extension.isActive;
      });
    });
  }

  public static buildUserAgentString(
    editorName: string,
    extensionVersion: string,
    aiName: string | undefined = undefined,
  ): string {
    const ai = aiName ? ` ${aiName}` : '';
    return editorName + '/' + vscode.version + ai + ' vscode-axiode/' + extensionVersion;
  }

  public static withinSeconds(
    relativeTo: number,
    compareTo: number,
    withinSeconds: number,
  ): boolean {
    return Math.abs(relativeTo - compareTo) <= withinSeconds;
  }
}

/**
 * Safe fetch wrapper — uses global fetch (available in VS Code 1.90+ / Node 20+)
 * and falls back to Node's built-in https module for forks running older Node builds.
 */
export async function safeFetch(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; proxy?: string; noSSLVerify?: boolean } = {},
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; arrayBuffer: () => Promise<ArrayBuffer> }> {
  if (typeof fetch === 'function') {
    return fetch(url, options as RequestInit) as any;
  }

  // Fallback: Node https module (for forks with Node < 18 / unstable fetch)
  // This branch is only reachable in the desktop extension host, never in web.
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require('https') as typeof import('https');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const http = require('http') as typeof import('http');
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyData = options.body ? Buffer.from(options.body, 'utf-8') : undefined;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(bodyData ? { 'Content-Length': bodyData.length } : {}),
        },
        rejectUnauthorized: !options.noSSLVerify,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            json: async () => JSON.parse(buffer.toString('utf-8')),
            arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
          });
        });
      },
    );

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}
