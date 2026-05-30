// import * as azdata from 'azdata';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  AI_RECENT_PASTES_TIME_MS,
  ALLOWED_SCHEMES,
  COMMAND_DASHBOARD,
  DEFAULT_API_URL,
  Heartbeat,
  LogLevel,
  SEND_BUFFER_SECONDS,
  SYNC_AI_HEARTBEATS_DEBOUNCE_SECONDS,
} from './constants';
import { FileSelectionMap, HumanTypingMap, LineCounts, LinesInFiles } from './types';
import { Utils, safeFetch } from './utils';
import { Options, Setting } from './options';

import { Dependencies } from './dependencies';
import { Desktop } from './desktop';
import { Logger } from './logger';

export class Axiode {
  private editorName: string;
  private extension: any;
  private statusBar?: vscode.StatusBarItem = undefined;
  private statusBarTeamYou?: vscode.StatusBarItem = undefined;
  private statusBarTeamOther?: vscode.StatusBarItem = undefined;
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private lastDebug: boolean = false;
  private lastCompile: boolean = false;
  private lastAICodeGenerating: boolean = false;
  private lastCodeReviewing: boolean = false;
  private dedupe: FileSelectionMap = {};
  private debounceId: any = null;
  private debounceMs = 50;
  private AIDebounceId: any = null;
  private AIdebounceMs = 1000;
  private AIdebounceCount = 0;
  private AIrecentPastes: number[] = [];
  private dependencies: Dependencies;
  private options: Options;
  private logger: Logger;
  private fetchTodayInterval: number = 60000;
  private lastFetchToday: number = 0;
  private showStatusBar: boolean;
  private showCodingActivity: boolean;
  private showStatusBarTeam: boolean;
  private hasTeamFeatures: boolean;
  private disabled: boolean = true;
  private extensionPath: string;
  private isCompiling: boolean = false;
  private isDebugging: boolean = false;
  private isAICodeGenerating: boolean = false;
  private hasAICapabilities: boolean = false;
  private currentlyFocusedFile: string;
  private teamDevsForFileCache = {};
  private resourcesLocation: string;
  private lastApiKeyPrompted: number = 0;
  private isMetricsEnabled: boolean = false;
  private heartbeats: Heartbeat[] = [];
  private lastSent: number = 0;
  private linesInFiles: LinesInFiles = {};
  private lineChanges: LineCounts = { ai: {}, human: {} };
  private syncAIHeartbeatsDebounce?: NodeJS.Timeout = undefined;
  private filesWithHumanTyping: HumanTypingMap = {};

  constructor(extensionPath: string, logger: Logger) {
    this.extensionPath = extensionPath;
    this.logger = logger;
    this.setResourcesLocation();
    this.options = new Options(logger, this.resourcesLocation);
  }

  public initialize(): void {
    this.options.getSetting('settings', 'debug', false, (setting: Setting) => {
      if (setting.value === 'true') {
        this.logger.setLevel(LogLevel.DEBUG);
      }
      this.options.getSetting('settings', 'metrics', false, (metrics: Setting) => {
        if (metrics.value === 'true') {
          this.isMetricsEnabled = true;
        }

        this.dependencies = new Dependencies(this.options, this.logger, this.resourcesLocation);

        const extension = vscode.extensions.getExtension('axiode.axiode-vscode');
        this.extension = (extension != undefined && extension.packageJSON) || { version: '0.0.0' };
        this.editorName = Utils.getEditorName();

        this.hasAICapabilities = Utils.hasAIExtensions();

        this.options.getSetting('settings', 'disabled', false, (disabled: Setting) => {
          this.disabled = disabled.value === 'true';
          if (this.disabled) {
            this.dispose();
            return;
          }

          this.initializeDependencies();
        });
      });
    });
  }

  public dispose() {
    if (this.syncAIHeartbeatsDebounce) {
      clearTimeout(this.syncAIHeartbeatsDebounce);
      this.syncAIHeartbeatsDebounce = undefined;
    }
    this.sendHeartbeats();
    this.statusBar?.dispose();
    this.statusBarTeamYou?.dispose();
    this.statusBarTeamOther?.dispose();
    this.disposable?.dispose();
  }

  private setResourcesLocation() {
    const home = Desktop.getHomeDirectory();
    const folder = path.join(home, '.axiode');

    try {
      fs.mkdirSync(folder, { recursive: true });
      this.resourcesLocation = folder;
    } catch (e) {
      this.resourcesLocation = this.extensionPath;
    }
  }

  public initializeDependencies(): void {
    this.logger.debug(`Initializing Axiode v${this.extension.version}`);

    const align = this.options.getStatusBarAlignment();
    const priority = this.options.getStatusBarPriority();

    this.statusBar = vscode.window.createStatusBarItem(
      'com.axiode.statusbar',
      align,
      priority + 2,
    );
    this.statusBar.name = 'Axiode';
    this.statusBar.command = COMMAND_DASHBOARD;

    this.statusBarTeamYou = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.statusBarTeamYou.name = 'Axiode Top dev';

    this.statusBarTeamOther = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.statusBarTeamOther.name = 'Axiode Team Total';

    this.options.getSetting('settings', 'status_bar_team', false, (statusBarTeam: Setting) => {
      this.showStatusBarTeam = statusBarTeam.value !== 'false';
      this.options.getSetting(
        'settings',
        'status_bar_enabled',
        false,
        (statusBarEnabled: Setting) => {
          this.showStatusBar = statusBarEnabled.value !== 'false';
          this.showCodingActivity =
            vscode.workspace.getConfiguration().get('axiode.status_bar_coding_activity') !== 'false';
          this.setStatusBarVisibility(this.showStatusBar);
          this.updateStatusBarText('Axiode Initializing...');
          this.updateStatusBarTooltip('Axiode: Initializing...');
          this.dependencies.checkAndInstallCli(() => {
            this.logger.debug('Axiode initialized');
            this.updateStatusBarTooltip('Axiode: Initialized');
            this.checkApiKey();
            this.setupEventListeners();
            this.getCodingActivity();
          });
        },
      );
    });
  }

  private updateStatusBarText(text?: string): void {
    if (!this.statusBar) return;
    if (!text) {
      this.statusBar.text = '$(clock)';
    } else {
      this.statusBar.text = '$(clock) ' + text;
    }
  }

  private updateStatusBarTooltip(tooltipText: string): void {
    if (!this.statusBar) return;
    this.statusBar.tooltip = tooltipText;
  }

  private statusBarShowingError(): boolean {
    if (!this.statusBar) return false;
    return this.statusBar.text.indexOf('Error') != -1;
  }

  private updateTeamStatusBarTextForCurrentUser(text?: string): void {
    if (!this.statusBarTeamYou) return;
    if (!text) {
      this.statusBarTeamYou.text = '';
    } else {
      this.statusBarTeamYou.text = text;
    }
  }

  private updateStatusBarTooltipForCurrentUser(tooltipText: string): void {
    if (!this.statusBarTeamYou) return;
    this.statusBarTeamYou.tooltip = tooltipText;
  }

  private updateTeamStatusBarTextForOther(text?: string): void {
    if (!this.statusBarTeamOther) return;
    if (!text) {
      this.statusBarTeamOther.text = '';
    } else {
      this.statusBarTeamOther.text = text;
      this.statusBarTeamOther.tooltip = 'Developer with the most time spent in this file';
    }
  }

  private updateStatusBarTooltipForOther(tooltipText: string): void {
    if (!this.statusBarTeamOther) return;
    this.statusBarTeamOther.tooltip = tooltipText;
  }

  public async promptForApiKey(hidden: boolean = true): Promise<void> {
    let defaultVal = await this.options.getApiKey();
    if (Utils.apiKeyInvalid(defaultVal ?? undefined)) defaultVal = '';
    const promptOptions = {
      prompt: 'Axiode Api Key',
      placeHolder: 'Enter your axiode api key',
      value: defaultVal!,
      ignoreFocusOut: true,
      password: hidden,
      validateInput: Utils.apiKeyInvalid.bind(this),
    };
    vscode.window.showInputBox(promptOptions).then((val) => {
      if (val != undefined) {
        const invalid = Utils.apiKeyInvalid(val);
        if (!invalid) {
          // Save to both VS Code settings (primary) and config file (fallback)
          vscode.workspace.getConfiguration().update('axiode.apiKey', val, vscode.ConfigurationTarget.Global);
          this.options.setSetting('settings', 'api_key', val, false);
          this.options.clearApiKeyCache();
          this.lastFetchToday = 0;
          this.getCodingActivity();
        } else vscode.window.setStatusBarMessage(invalid);
      } else vscode.window.setStatusBarMessage('Axiode api key not provided');
    });
  }

  public async promptForApiUrl(): Promise<void> {
    const apiUrl = await this.options.getApiUrl(true);
    const promptOptions = {
      prompt: `Axiode Api Url (Defaults to ${DEFAULT_API_URL})`,
      placeHolder: DEFAULT_API_URL,
      value: apiUrl,
      ignoreFocusOut: true,
      validateInput: Utils.validateApiUrl.bind(this),
    };
    vscode.window.showInputBox(promptOptions).then((val) => {
      if (val) {
        this.options.setSetting('settings', 'api_url', val, false);
      }
    });
  }

  public promptForProxy(): void {
    this.options.getSetting('settings', 'proxy', false, (proxy: Setting) => {
      let defaultVal = proxy.value;
      if (!defaultVal) defaultVal = '';
      const promptOptions = {
        prompt: 'Axiode Proxy',
        placeHolder: `Proxy format is https://user:pass@host:port (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: Utils.validateProxy.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then((val) => {
        if (val || val === '') this.options.setSetting('settings', 'proxy', val, false);
      });
    });
  }

  public promptForDebug(): void {
    this.options.getSetting('settings', 'debug', false, (debug: Setting) => {
      let defaultVal = debug.value;
      if (!defaultVal || defaultVal !== 'true') defaultVal = 'false';
      const items: string[] = ['true', 'false'];
      const promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'debug', newVal, false);
        if (newVal === 'true') {
          this.logger.setLevel(LogLevel.DEBUG);
          this.logger.debug('Debug enabled');
        } else {
          this.logger.setLevel(LogLevel.INFO);
        }
      });
    });
  }

  public promptToDisable(): void {
    this.options.getSetting('settings', 'disabled', false, (setting: Setting) => {
      const previousValue = this.disabled;
      let currentVal = setting.value;
      if (!currentVal || currentVal !== 'true') currentVal = 'false';
      const items: string[] = ['disable', 'enable'];
      const helperText = currentVal === 'true' ? 'disabled' : 'enabled';
      const promptOptions = {
        placeHolder: `disable or enable (extension is currently "${helperText}")`,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'enable' && newVal !== 'disable') return;
        this.disabled = newVal === 'disable';
        if (this.disabled != previousValue) {
          if (this.disabled) {
            this.options.setSetting('settings', 'disabled', 'true', false);
            this.logger.debug('Extension disabled, will not report code stats to dashboard');
            this.dispose();
          } else {
            this.options.setSetting('settings', 'disabled', 'false', false);
            this.initializeDependencies();
          }
        }
      });
    });
  }

  public promptStatusBarIcon(): void {
    this.options.getSetting('settings', 'status_bar_enabled', false, (setting: Setting) => {
      let defaultVal = setting.value;
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      const items: string[] = ['true', 'false'];
      const promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'true' && newVal !== 'false') return;
        this.options.setSetting('settings', 'status_bar_enabled', newVal, false);
        this.showStatusBar = newVal === 'true'; // cache setting to prevent reading from disc too often
        this.setStatusBarVisibility(this.showStatusBar);
      });
    });
  }

  public promptStatusBarCodingActivity(): void {
    this.options.getSetting('settings', 'status_bar_coding_activity', false, (setting: Setting) => {
      let defaultVal = setting.value;
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      const items: string[] = ['true', 'false'];
      const promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'true' && newVal !== 'false') return;
        this.options.setSetting('settings', 'status_bar_coding_activity', newVal, false);
        if (newVal === 'true') {
          this.logger.debug('Coding activity in status bar has been enabled');
          this.showCodingActivity = true;
          this.getCodingActivity();
        } else {
          this.logger.debug('Coding activity in status bar has been disabled');
          this.showCodingActivity = false;
          if (!this.statusBarShowingError()) {
            this.updateStatusBarText();
          }
        }
      });
    });
  }

  public async openDashboardWebsite(): Promise<void> {
    const apiUrl = await this.options.getApiUrl(true);
    const dashboardUrl = Utils.apiUrlToDashboardUrl(apiUrl);
    vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
  }

  public openConfigFile(): void {
    const path = this.options.getConfigFile(false);
    if (path) {
      const uri = vscode.Uri.file(path);
      vscode.window.showTextDocument(uri);
    }
  }

  public openLogFile(): void {
    const path = this.options.getLogFile();
    if (path) {
      const uri = vscode.Uri.file(path);
      vscode.window.showTextDocument(uri);
    }
  }

  private checkApiKey(): void {
    this.options.hasApiKey((hasApiKey) => {
      if (!hasApiKey) this.promptForApiKey();
    });
  }

  private setStatusBarVisibility(isVisible: boolean): void {
    if (isVisible) {
      this.statusBar?.show();
      this.statusBarTeamYou?.show();
      this.statusBarTeamOther?.show();
      this.logger.debug('Status bar icon enabled.');
    } else {
      this.statusBar?.hide();
      this.statusBarTeamYou?.hide();
      this.statusBarTeamOther?.hide();
      this.logger.debug('Status bar icon disabled.');
    }
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    const subscriptions: vscode.Disposable[] = [];

    // When user changes axiode.apiKey in Settings UI, pick it up immediately
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('axiode.apiKey')) {
        this.options.clearApiKeyCache();
        this.lastFetchToday = 0; // force immediate status bar refresh
        this.getCodingActivity();
      }
    }, this, subscriptions);

    vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection, this, subscriptions);
    vscode.window.onDidChangeTextEditorVisibleRanges(
      this.onDidChangeTextEditorVisibleRanges,
      this,
      subscriptions,
    );
    vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this, subscriptions);
    vscode.window.onDidChangeActiveTextEditor(this.onChangeTab, this, subscriptions);
    vscode.window.onDidChangeVisibleTextEditors(
      this.onDidChangeVisibleTextEditors,
      this,
      subscriptions,
    );
    vscode.window.tabGroups.onDidChangeTabs(this.onDidChangeTabs, this, subscriptions);
    vscode.window.onDidChangeWindowState(this.onDidChangeWindowState, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, subscriptions);

    vscode.workspace.onDidChangeNotebookDocument(this.onChangeNotebook, this, subscriptions);
    vscode.window.onDidChangeNotebookEditorSelection(
      this.onDidChangeNotebookEditorSelection,
      this,
      subscriptions,
    );
    vscode.workspace.onDidSaveNotebookDocument(this.onSaveNotebook, this, subscriptions);

    vscode.window.onDidChangeActiveTerminal(this.onDidChangeActiveTerminal, this, subscriptions);
    vscode.window.onDidOpenTerminal(this.onDidOpenTerminal, this, subscriptions);

    vscode.tasks.onDidStartTask(this.onDidStartTask, this, subscriptions);
    vscode.tasks.onDidEndTask(this.onDidEndTask, this, subscriptions);

    vscode.debug.onDidChangeActiveDebugSession(this.onDebuggingChanged, this, subscriptions);
    vscode.debug.onDidChangeBreakpoints(this.onDebuggingChanged, this, subscriptions);
    vscode.debug.onDidStartDebugSession(this.onDidStartDebugSession, this, subscriptions);
    vscode.debug.onDidTerminateDebugSession(this.onDidTerminateDebugSession, this, subscriptions);
    vscode.lm.onDidChangeChatModels(this.onDidChangeChatModels, this, subscriptions);

    // create a combined disposable for all event subscriptions
    this.disposable = vscode.Disposable.from(...subscriptions);
  }

  private onDebuggingChanged(): void {
    this.logger.debug('onDebuggingChanged');
    this.syncAIHeartbeatsDebounced();
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidStartDebugSession(): void {
    this.logger.debug('onDidStartDebugSession');
    this.syncAIHeartbeatsDebounced();
    this.isDebugging = true;
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidTerminateDebugSession(): void {
    this.logger.debug('onDidTerminateDebugSession');
    this.syncAIHeartbeatsDebounced();
    this.isDebugging = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidStartTask(e: vscode.TaskStartEvent): void {
    this.logger.debug('onDidStartTask');
    this.syncAIHeartbeatsDebounced();
    if (e.execution.task.isBackground) return;
    if (e.execution.task.detail && e.execution.task.detail.indexOf('watch') !== -1) return;
    this.isCompiling = true;
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidEndTask(): void {
    this.logger.debug('onDidEndTask');
    this.syncAIHeartbeatsDebounced();
    this.isCompiling = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onChangeSelection(e: vscode.TextEditorSelectionChangeEvent): void {
    this.syncAIHeartbeatsDebounced();
    if (!ALLOWED_SCHEMES.includes(e.textEditor?.document?.uri?.scheme)) return;
    if (e.kind === vscode.TextEditorSelectionChangeKind.Command) return;
    this.logger.debug('onChangeSelection');
    if (Utils.isAIChatSidebar(e.textEditor?.document?.uri)) {
      this.isAICodeGenerating = true;
    }
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
    this.syncAIHeartbeatsDebounced();
    if (!ALLOWED_SCHEMES.includes(e.document?.uri?.scheme)) return;
    this.logger.debug('onChangeTextDocument');

    if (e.contentChanges.find((v) => v.text.length === 1)) {
      const file = Utils.getFocusedFile(e.document);
      if (file) {
        this.filesWithHumanTyping[file] = true;
      }
    }

    if (Utils.isAIChatSidebar(e.document?.uri)) {
      this.isAICodeGenerating = true;
      this.AIdebounceCount = 0;
    } else if (Utils.isPossibleAICodeInsert(e)) {
      const now = Date.now();
      if (this.recentlyAIPasted(now) && this.hasAICapabilities) {
        this.isAICodeGenerating = true;
        this.AIdebounceCount = 0;
      }
      this.AIrecentPastes.push(now);
    } else if (Utils.isPossibleHumanCodeInsert(e)) {
      this.AIrecentPastes = [];
      if (this.isAICodeGenerating) {
        this.AIdebounceCount++;
        clearTimeout(this.AIDebounceId);
        this.AIDebounceId = setTimeout(() => {
          if (this.AIdebounceCount > 1) {
            this.isAICodeGenerating = false;
          }
        }, this.AIdebounceMs);
      }
    } else if (this.isAICodeGenerating) {
      this.AIdebounceCount = 0;
      clearTimeout(this.AIDebounceId);
      this.updateLineNumbers();
    }

    if (!this.isAICodeGenerating) return;

    this.onEvent(false);
  }

  private onChangeTab(e: vscode.TextEditor | undefined): void {
    this.syncAIHeartbeatsDebounced();
    if (!ALLOWED_SCHEMES.includes(e?.document?.uri?.scheme ?? '')) return;
    this.logger.debug('onChangeTab');
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidChangeTabs(e: vscode.TabChangeEvent): void {
    this.logger.debug('onDidChangeTabs');
    this.syncAIHeartbeatsDebounced();
    if (Utils.isCodexCodeReview(e)) {
      this.appendCodeReviewHeartbeat();
      return;
    }
    if (!this.isAICodeGenerating) return;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private async appendCodeReviewHeartbeat(): Promise<void> {
    if (this.disabled) return;

    const time = Date.now();
    if (this.lastCodeReviewing && !Utils.enoughTimePassed(this.lastHeartbeat, time)) return;

    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document;
    const file = doc ? Utils.getFocusedFile(doc) : undefined;
    const entity = file ?? 'Codex Diff';

    const heartbeat: Heartbeat = {
      entity,
      time: time / 1000,
      is_write: false,
      category: 'code reviewing',
    };

    if (doc) {
      heartbeat.language = doc.languageId;
      heartbeat.lines_in_file = doc.lineCount;
      if (editor) {
        heartbeat.lineno = editor.selection.start.line + 1;
        heartbeat.cursorpos = editor.selection.start.character + 1;
      }
      const project = this.getProjectName(doc.uri);
      if (project) heartbeat.alternate_project = project;
      const folder = this.getProjectFolder(doc.uri);
      if (folder) heartbeat.project_folder = folder;
      if (doc.isUntitled) heartbeat.is_unsaved_entity = true;
    } else {
      heartbeat.entity_type = 'app';
      const wsf = vscode.workspace.workspaceFolders?.[0];
      if (wsf) {
        heartbeat.alternate_project = wsf.name;
        heartbeat.project_folder = wsf.uri.fsPath;
      }
    }

    this.lastFile = entity;
    this.lastHeartbeat = time;
    this.lastCodeReviewing = true;

    this.logger.debug(
      `Appending code-reviewing heartbeat to local buffer: ${JSON.stringify(heartbeat, null, 2)}`,
    );
    this.heartbeats.push(heartbeat);

    await this.sendHeartbeatsIfNecessary();
  }

  private onSave(e: vscode.TextDocument | undefined): void {
    this.logger.debug('onSave');

    const file = Utils.getFocusedFile(e);
    if (file) {
      this.filesWithHumanTyping[file] = true;
    }

    this.syncAIHeartbeatsDebounced();
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(true);
  }

  private onChangeNotebook(_e: vscode.NotebookDocumentChangeEvent): void {
    this.logger.debug('onChangeNotebook');
    this.syncAIHeartbeatsDebounced();
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onSaveNotebook(_e: vscode.NotebookDocument | undefined): void {
    this.logger.debug('onSaveNotebook');
    this.syncAIHeartbeatsDebounced();
    this.updateLineNumbers();
    this.onEvent(true);
  }

  private onDidChangeTextEditorVisibleRanges(_e: vscode.TextEditorVisibleRangesChangeEvent): void {
    this.logger.debug('onDidChangeTextEditorVisibleRanges');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidChangeVisibleTextEditors(_e: readonly vscode.TextEditor[]): void {
    this.logger.debug('onDidChangeVisibleTextEditors');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidChangeWindowState(e: vscode.WindowState): void {
    if (!e.focused) return;
    this.logger.debug('onDidChangeWindowState');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidChangeNotebookEditorSelection(_e: vscode.NotebookEditorSelectionChangeEvent): void {
    this.logger.debug('onDidChangeNotebookEditorSelection');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidChangeActiveTerminal(_e: vscode.Terminal | undefined): void {
    this.logger.debug('onDidChangeActiveTerminal');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidOpenTerminal(_e: vscode.Terminal): void {
    this.logger.debug('onDidOpenTerminal');
    this.syncAIHeartbeatsDebounced();
  }

  private onDidChangeChatModels(): void {
    this.logger.debug('onDidChangeChatModels');
    this.syncAIHeartbeatsDebounced();
  }

  private updateLineNumbers(): void {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) return;
    const file = Utils.getFocusedFile(doc);
    if (!file) return;

    const now = Date.now();
    const current = doc.lineCount;
    if (this.linesInFiles[file] === undefined) {
      this.linesInFiles[file] = { lines: current, updatedAt: now };
    }

    const prev = this.linesInFiles[file] ?? { lines: current, updatedAt: now };
    let delta = current - prev.lines;

    // prevent counting large copy/paste as human typed lines of code
    if (delta > 50 && Math.abs(now - prev.updatedAt) < 60000) {
      delta = 0;
    }

    const changes = this.isAICodeGenerating ? this.lineChanges.ai : this.lineChanges.human;
    changes[file] = (changes[file] ?? 0) + delta;

    this.linesInFiles[file] = { lines: current, updatedAt: now };
  }

  private onEvent(isWrite: boolean): void {
    this.sendHeartbeatsIfNecessary();

    clearTimeout(this.debounceId);
    this.debounceId = setTimeout(() => {
      if (this.disabled) return;
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const doc = editor.document;
        if (doc) {
          const file = Utils.getFocusedFile(doc);
          if (!file) {
            return;
          }
          if (this.currentlyFocusedFile !== file) {
            this.updateTeamStatusBarFromJson();
            this.updateTeamStatusBar(doc);
          }

          const time: number = Date.now();
          if (
            isWrite ||
            Utils.enoughTimePassed(this.lastHeartbeat, time) ||
            this.lastFile !== file ||
            this.lastDebug !== this.isDebugging ||
            this.lastCompile !== this.isCompiling ||
            this.lastAICodeGenerating !== this.isAICodeGenerating
          ) {
            this.appendHeartbeat(
              doc,
              time,
              editor.selection.start,
              isWrite,
              this.isCompiling,
              this.isDebugging,
              this.isAICodeGenerating,
            );
            this.lastFile = file;
            this.lastHeartbeat = time;
            this.lastDebug = this.isDebugging;
            this.lastCompile = this.isCompiling;
            this.lastAICodeGenerating = this.isAICodeGenerating;
          }
        }
      }
    }, this.debounceMs);
  }

  private async appendHeartbeat(
    doc: vscode.TextDocument,
    time: number,
    selection: vscode.Position,
    isWrite: boolean,
    isCompiling: boolean,
    isDebugging: boolean,
    isAICoding: boolean,
  ): Promise<void> {
    const file = Utils.getFocusedFile(doc);
    if (!file) return;

    // prevent sending the same heartbeat (https://github.com/wakatime/vscode-axiode/issues/163)
    if (isWrite && this.isDuplicateHeartbeat(file, time, selection)) return;

    const now = Date.now();

    const heartbeat: Heartbeat = {
      entity: file,
      time: now / 1000,
      is_write: isWrite,
      lineno: selection.line + 1,
      cursorpos: selection.character + 1,
      lines_in_file: doc.lineCount,
      language: doc.languageId,
      ai_line_changes: this.lineChanges.ai[file],
      human_line_changes: this.lineChanges.human[file],
    };

    // Remove human line changes if we never detected human typing
    if (!this.filesWithHumanTyping[file]) heartbeat.human_line_changes = 0;
    this.filesWithHumanTyping[file] = false;

    this.lineChanges = { ai: {}, human: {} };

    if (isDebugging) {
      heartbeat.category = 'debugging';
    } else if (isCompiling) {
      heartbeat.category = 'building';
    } else if (isAICoding) {
      heartbeat.category = 'ai coding';
    } else if (Utils.isPullRequest(doc.uri)) {
      heartbeat.category = 'code reviewing';
    }
    this.lastCodeReviewing = heartbeat.category === 'code reviewing';

    const project = this.getProjectName(doc.uri);
    if (project) heartbeat.alternate_project = project;

    const folder = this.getProjectFolder(doc.uri);
    if (folder) heartbeat.project_folder = folder;

    if (doc.isUntitled) heartbeat.is_unsaved_entity = true;

    if (Utils.isRemoteUri(doc.uri)) {
      try {
        const tmpFile = path.join(
          os.tmpdir(),
          `axiode-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        await fs.promises.writeFile(tmpFile, doc.getText(), {
          encoding: doc.encoding as BufferEncoding,
        });
        heartbeat.local_file = tmpFile;
        heartbeat.entity = doc.fileName;
      } catch (e) {
        this.logger.debugException(e);
      }
    }

    this.logger.debug(`Appending heartbeat to local buffer: ${JSON.stringify(heartbeat, null, 2)}`);
    this.heartbeats.push(heartbeat);

    await this.sendHeartbeatsIfNecessary();
  }

  private async sendHeartbeatsIfNecessary() {
    if (Date.now() - this.lastSent > SEND_BUFFER_SECONDS * 1000) {
      await this.sendHeartbeats();
    }
  }

  private async sendHeartbeats(): Promise<void> {
    const apiKey = await this.options.getApiKey();
    if (apiKey) {
      await this._sendHeartbeats();
    } else {
      await this.promptForApiKey();
    }
  }

  private syncAIHeartbeatsDebounced(): void {
    if (this.disabled) return;
    if (this.syncAIHeartbeatsDebounce) clearTimeout(this.syncAIHeartbeatsDebounce);

    this.syncAIHeartbeatsDebounce = setTimeout(() => {
      this.syncAIHeartbeatsDebounce = undefined;
      this.syncAIHeartbeats();
    }, SYNC_AI_HEARTBEATS_DEBOUNCE_SECONDS * 1000);
  }

  private async syncAIHeartbeats(): Promise<void> {
    // AI heartbeats are already sent via _sendHeartbeats with ai_line_changes field
    // Nothing extra to sync — this is handled in the main heartbeat payload
    this.logger.debug('AI heartbeats sync: handled via main heartbeat payload');
  }

  private async _sendHeartbeats(): Promise<void> {
    const heartbeat = this.heartbeats.shift();
    if (!heartbeat) return;

    this.lastSent = Date.now();

    const extraHeartbeats = this.getExtraHeartbeats();
    const allHeartbeats = [heartbeat, ...extraHeartbeats];

    const apiKey = await this.options.getApiKey();
    if (!apiKey) {
      await this.promptForApiKey();
      return;
    }

    const apiUrl = await this.options.getApiUrl(true);

    const toPayload = (h: Heartbeat) => ({
      entity: h.entity,
      type: h.entity_type || 'file',
      time: h.time,
      is_write: h.is_write,
      ...(h.lineno && { lineno: h.lineno }),
      ...(h.cursorpos && { cursorpos: h.cursorpos }),
      ...(h.lines_in_file && { lines_in_file: h.lines_in_file }),
      ...(h.category && { category: h.category }),
      ...(h.alternate_project && { project: h.alternate_project }),
      ...(h.project_folder && { project_root_count: 1, branch: undefined }),
      ...(h.language && { language: h.language }),
      ...(h.ai_line_changes && { ai_line_changes: h.ai_line_changes }),
      ...(h.human_line_changes && { human_line_changes: h.human_line_changes }),
      ...(h.is_unsaved_entity && { is_unsaved_entity: true }),
      ...(h.plugin
        ? { plugin: h.plugin }
        : {
            plugin: Utils.buildUserAgentString(
              this.editorName,
              this.extension.version,
              h.agent,
            ),
          }),
    });

    const payload = allHeartbeats.map(toPayload);
    const cleanup = allHeartbeats
      .map((h) => h.local_file)
      .filter(Boolean) as string[];

    try {
      const response = await safeFetch(
        allHeartbeats.length === 1
          ? `${apiUrl}/users/current/heartbeats`
          : `${apiUrl}/users/current/heartbeats.bulk`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': `${this.editorName}/${vscode.version} vscode-axiode/${this.extension.version}`,
          },
          body: JSON.stringify(allHeartbeats.length === 1 ? payload[0] : payload),
        },
      );

      if (response.ok) {
        this.logger.debug(`Heartbeat(s) sent successfully (${response.status})`);
        if (this.showStatusBar) {
          this.lastFetchToday = 0; // force immediate status bar refresh after successful heartbeat
          this.getCodingActivity();
        }
      } else if (response.status === 401 || response.status === 403) {
        const error_msg = 'Invalid Api Key (401); Make sure your Api Key is correct!';
        if (this.showStatusBar) {
          this.updateStatusBarText('Axiode Error');
          this.updateStatusBarTooltip(`Axiode: ${error_msg}`);
        }
        this.logger.error(error_msg);
        const now = Date.now();
        if (this.lastApiKeyPrompted < now - 86400000) {
          await this.promptForApiKey(false);
          this.lastApiKeyPrompted = now;
        }
      } else if (response.status === 0 || response.status >= 500) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.updateStatusBarText();
          this.updateStatusBarTooltip(
            'Axiode: working offline... coding activity will sync next time we are online',
          );
        }
        this.logger.warn(`Working offline (${response.status})`);
        // re-queue heartbeats so they aren't lost
        this.heartbeats.unshift(...allHeartbeats);
      } else {
        const error_msg = `Error sending heartbeat (${response.status})`;
        if (this.showStatusBar) {
          this.updateStatusBarText('Axiode Error');
          this.updateStatusBarTooltip(`Axiode: ${error_msg}`);
        }
        this.logger.error(error_msg);
      }
    } catch (e) {
      this.logger.debugException(e);
      if (this.showStatusBar) {
        if (!this.showCodingActivity) this.updateStatusBarText();
        this.updateStatusBarTooltip(
          'Axiode: working offline... coding activity will sync next time we are online',
        );
      }
      // re-queue heartbeats so they aren't lost
      this.heartbeats.unshift(...allHeartbeats);
    } finally {
      cleanup.forEach((tmpfile) => {
        try { fs.unlinkSync(tmpfile); } catch (_) {}
      });
    }
  }

  private getExtraHeartbeats() {
    const heartbeats: Heartbeat[] = [];
    while (true) {
      const h = this.heartbeats.shift();
      if (!h) return heartbeats;
      heartbeats.push(h);
    }
  }

  private async getCodingActivity() {
    if (!this.showStatusBar) return;

    const cutoff = Date.now() - this.fetchTodayInterval;
    if (this.lastFetchToday > cutoff) return;

    const apiKey = await this.options.getApiKey();
    if (!apiKey) return;

    this.lastFetchToday = Date.now();

    await this._getCodingActivity();
  }

  private async _getCodingActivity() {
    const apiKey = await this.options.getApiKey();
    if (!apiKey) return;

    const apiUrl = await this.options.getApiUrl(true);

    this.logger.debug(`Fetching coding activity for Today from api: ${apiUrl}`);

    try {
      const response = await safeFetch(`${apiUrl}/users/current/statusbar/today`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': `${this.editorName}/${vscode.version} vscode-axiode/${this.extension.version}`,
          'X-Timezone-Offset': String(new Date().getTimezoneOffset()),
        },
      });

      if (!this.showStatusBar) return;

      if (response.ok) {
        const jsonData: any = await response.json();
        const data = jsonData?.data;
        if (data) this.hasTeamFeatures = data.has_team_features;
        let output = data?.grand_total?.text;
        if (
          vscode.workspace.getConfiguration().get('axiode.status_bar_hide_categories') != 'true' &&
          data?.categories?.length > 1
        ) {
          output = data.categories.map((x: any) => x.text + ' ' + x.name).join(', ');
        }
        if (output && output.trim()) {
          if (this.showCodingActivity) {
            this.updateStatusBarText(output.trim());
            this.updateStatusBarTooltip("Axiode: Today's coding time. Click to visit dashboard.");
          } else {
            this.updateStatusBarText();
            this.updateStatusBarTooltip(output.trim());
          }
        } else {
          this.updateStatusBarText();
          this.updateStatusBarTooltip('Axiode: Calculating time spent today in background...');
        }
        this.updateTeamStatusBar();
      } else if (response.status === 401 || response.status === 403) {
        this.logger.debug(`Invalid API key (${response.status})`);
        this.updateStatusBarText();
        this.updateStatusBarTooltip('Axiode: Invalid API key. Run "Axiode API Key" to update.');
      } else {
        this.logger.debug(`Error fetching today coding activity (${response.status})`);
        this.updateStatusBarText();
        this.updateStatusBarTooltip('Axiode: Calculating time spent today in background...');
      }
    } catch (e) {
      this.logger.debugException(e);
      if (this.showStatusBar) {
        this.updateStatusBarText();
        this.updateStatusBarTooltip('Axiode: working offline...');
      }
    }
  }

  private async updateTeamStatusBar(doc?: vscode.TextDocument) {
    if (!this.showStatusBarTeam) return;
    if (!this.hasTeamFeatures) return;
    if (!this.dependencies.isCliInstalled()) return;

    if (!doc) {
      doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
    }

    const file = Utils.getFocusedFile(doc);
    if (!file) {
      return;
    }

    this.currentlyFocusedFile = file;

    // TODO: expire cached text after some hours
    if (this.teamDevsForFileCache[file]) {
      this.updateTeamStatusBarFromJson(this.teamDevsForFileCache[file]);
      return;
    }

    const user_agent =
      this.editorName + '/' + vscode.version + ' vscode-axiode/' + this.extension.version;
    const args = ['--output', 'json', '--plugin', Utils.quote(user_agent)];

    args.push('--file-experts', Utils.quote(file));

    args.push('--entity', Utils.quote(file));

    if (this.isMetricsEnabled) args.push('--metrics');

    const apiKey = await this.options.getApiKey();
    if (!Utils.apiKeyInvalid(apiKey)) args.push('--key', Utils.quote(apiKey));

    const apiUrl = await this.options.getApiUrl();
    if (apiUrl) args.push('--api-url', Utils.quote(apiUrl));

    const project = this.getProjectName(doc.uri);
    if (project) args.push('--alternate-project', Utils.quote(project));

    const folder = this.getProjectFolder(doc.uri);
    if (folder) args.push('--project-folder', Utils.quote(folder));

    args.push(
      '--config',
      Utils.quote(this.options.getConfigFile(false)),
      '--log-file',
      Utils.quote(this.options.getLogFile()),
    );

    if (doc.isUntitled) args.push('--is-unsaved-entity');

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(`Fetching devs for file from api: ${Utils.formatArguments(binary, args)}`);
    const options = Desktop.buildOptions();

    try {
      const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
        if (error != null) {
          if (stderr && stderr.toString() != '') this.logger.debug(stderr.toString());
          if (stdout && stdout.toString() != '') this.logger.debug(stdout.toString());
          this.logger.debug(error.toString());
        }
      });
      let output = '';
      if (proc.stdout) {
        proc.stdout.on('data', (data: string | null) => {
          if (data) output += data;
        });
      }
      proc.on('close', (code, _signal) => {
        if (code == 0) {
          if (output && output.trim()) {
            let jsonData;
            try {
              jsonData = JSON.parse(output);
            } catch (e) {
              this.logger.debug(
                `Error parsing devs for file as json:\n${output}\nCheck your ${this.options.getLogFile()} file for more details.`,
              );
            }

            if (jsonData) this.teamDevsForFileCache[file!] = jsonData;

            // make sure this file is still the currently focused file
            if (file !== this.currentlyFocusedFile) {
              return;
            }

            this.updateTeamStatusBarFromJson(jsonData);
          } else {
            this.updateTeamStatusBarTextForCurrentUser();
            this.updateTeamStatusBarTextForOther();
          }
        } else if (code == 102 || code == 112) {
          // noop, working offline
        } else {
          this.logger.debug(
            `Error fetching devs for file (${code}); Check your ${this.options.getLogFile()} file for more details.`,
          );
        }
      });
    } catch (e) {
      this.logger.debugException(e);
    }
  }

  private updateTeamStatusBarFromJson(jsonData?: any) {
    if (!jsonData) {
      this.updateTeamStatusBarTextForCurrentUser();
      this.updateTeamStatusBarTextForOther();
      return;
    }

    const you = jsonData.you;
    const other = jsonData.other;

    if (you) {
      this.updateTeamStatusBarTextForCurrentUser('You: ' + you.total.text);
      this.updateStatusBarTooltipForCurrentUser('Your total time spent in this file');
    } else {
      this.updateTeamStatusBarTextForCurrentUser();
    }
    if (other) {
      this.updateTeamStatusBarTextForOther(other.user.name + ': ' + other.total.text);
      this.updateStatusBarTooltipForOther(
        other.user.long_name + '’s total time spent in this file',
      );
    } else {
      this.updateTeamStatusBarTextForOther();
    }
  }

  private recentlyAIPasted(time: number): boolean {
    this.AIrecentPastes = this.AIrecentPastes.filter((x) => x + AI_RECENT_PASTES_TIME_MS >= time);
    return this.AIrecentPastes.length > 3;
  }

  private isDuplicateHeartbeat(file: string, time: number, selection: vscode.Position): boolean {
    let duplicate = false;
    const minutes = 10;
    const milliseconds = minutes * 60000;
    if (
      this.dedupe[file] &&
      this.dedupe[file].lastHeartbeatAt + milliseconds > time &&
      this.dedupe[file].selection.line == selection.line &&
      this.dedupe[file].selection.character == selection.character
    ) {
      duplicate = true;
    }
    this.dedupe[file] = {
      selection: selection,
      lastHeartbeatAt: time,
    };
    return duplicate;
  }

  private getProjectName(uri: vscode.Uri): string {
    if (!vscode.workspace) return '';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      try {
        return workspaceFolder.name;
      } catch (e) {}
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
      return vscode.workspace.workspaceFolders[0].name;
    }
    return vscode.workspace.name || '';
  }

  private getProjectFolder(uri: vscode.Uri): string {
    if (!vscode.workspace) return '';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      try {
        return workspaceFolder.uri.fsPath;
      } catch (e) {}
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return '';
  }
}
