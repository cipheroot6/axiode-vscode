import * as vscode from 'vscode';

import {
  COMMAND_API_KEY,
  COMMAND_API_URL,
  COMMAND_DASHBOARD,
  COMMAND_DEBUG,
  COMMAND_DISABLE,
  COMMAND_STATUS_BAR_CODING_ACTIVITY,
  COMMAND_STATUS_BAR_ENABLED,
  LogLevel,
} from '../constants';

import { Logger } from './logger';
import { Axiode } from './wakatime';

var axiode: Axiode;

export function activate(ctx: vscode.ExtensionContext) {
  const logger = new Logger('axiode');
  axiode = new Axiode(logger, ctx.globalState);

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

  ctx.subscriptions.push(axiode);
  axiode.initialize();
}

export function deactivate() {
  axiode.dispose();
}
