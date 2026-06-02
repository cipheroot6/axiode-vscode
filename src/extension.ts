import * as vscode from 'vscode';

import {
  COMMAND_API_KEY,
  COMMAND_API_URL,
  COMMAND_CONFIG_FILE,
  COMMAND_DASHBOARD,
  COMMAND_DEBUG,
  COMMAND_DISABLE,
  COMMAND_LOG_FILE,
  COMMAND_PROXY,
  COMMAND_STATUS_BAR_CODING_ACTIVITY,
  COMMAND_STATUS_BAR_ENABLED,
  LogLevel,
} from './constants';

import { Logger } from './logger';
import { Axiode } from './wakatime';

var axiode: Axiode;

export function activate(ctx: vscode.ExtensionContext) {
  const logger = new Logger(LogLevel.INFO);
  axiode = new Axiode(ctx.extensionPath, logger);

  ctx.globalState?.setKeysForSync(['axiode.apiKey']);

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_API_KEY, function () {
      axiode.promptForApiKey();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_API_URL, function () {
      axiode.promptForApiUrl();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_PROXY, function () {
      axiode.promptForProxy();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DEBUG, function () {
      axiode.promptForDebug();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DISABLE, function () {
      axiode.promptToDisable();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_ENABLED, function () {
      axiode.promptStatusBarIcon();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_CODING_ACTIVITY, function () {
      axiode.promptStatusBarCodingActivity();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DASHBOARD, function () {
      axiode.openDashboardWebsite();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_CONFIG_FILE, function () {
      axiode.openConfigFile();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_LOG_FILE, function () {
      axiode.openLogFile();
    }),
  );

  ctx.subscriptions.push(axiode);

  axiode.initialize();
}

export function deactivate() {
  axiode.dispose();
}
