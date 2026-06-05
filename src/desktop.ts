import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';
import * as path from 'path';

export class Desktop {
  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }

  public static isPortable(): boolean {
    return !!process.env['VSCODE_PORTABLE'];
  }

  public static getHomeDirectory(): string {
    let home = process.env.AXIODE_HOME || process.env.WAKATIME_HOME;
    if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
    if (this.isPortable()) return process.env['VSCODE_PORTABLE'] as string;
    return process.env[this.isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
  }

  public static buildOptions(stdin?: boolean): Object {
    const options: child_process.ExecFileOptions = {
      windowsHide: true,
      env: { ...process.env },
    };
    if (stdin) {
      (options as any).stdio = ['pipe', 'pipe', 'pipe'] as StdioOptions;
    }
    
    let home = this.getHomeDirectory();
    // Prevent nesting if home already ends with .axiode
    if (!home.endsWith('.axiode') && !home.endsWith('.wakatime')) {
      home = path.join(home, '.axiode');
    }
    
    // Explicitly set WAKATIME_HOME to the .axiode folder to isolate offline databases
    options.env!['WAKATIME_HOME'] = home;
    options.env!['AXIODE_HOME'] = home;
    
    return options;
  }
}
