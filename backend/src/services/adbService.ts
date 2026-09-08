import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const ANDROID_HOST = process.env.ANDROID_HOST || 'localhost';
const ANDROID_ADB_PORT = process.env.ANDROID_ADB_PORT || '5555';
const ADB_TIMEOUT_MS = Number(process.env.ADB_TIMEOUT_MS || 120_000);

async function execAdb(command: string, timeoutMs: number = ADB_TIMEOUT_MS) {
  return execPromise(command, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
}

export class AdbService {
  private static targetDevice = `${ANDROID_HOST}:${ANDROID_ADB_PORT}`;

  static async connect(): Promise<boolean> {
    try {
      const { stdout: connectOut } = await execAdb(`adb connect ${this.targetDevice}`, 15_000);
      console.log(`[ADB Connect]: ${connectOut.trim()}`);
      if (
        connectOut.includes('connected') &&
        !connectOut.includes('cannot connect') &&
        !connectOut.includes('failed to connect')
      ) {
        return true;
      }

      const { stdout: devicesOut } = await execAdb('adb devices', 15_000);
      const lines = devicesOut.trim().split('\n').slice(1);
      const activeDevice = lines.find((line) => line.includes('\tdevice'));
      if (activeDevice) {
        const devId = activeDevice.split('\t')[0].trim();
        this.targetDevice = devId;
        console.log(`[ADB Service]: Found local active device -> ${devId}`);
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`[ADB Connect Warning]: ${err.message}`);
      return false;
    }
  }

  /** true when emulator finished booting (sys.boot_completed == 1) */
  static async isBootCompleted(): Promise<boolean> {
    try {
      const connected = await this.connect();
      if (!connected) return false;
      const { stdout } = await execAdb(
        `adb -s ${this.targetDevice} shell getprop sys.boot_completed`,
        15_000
      );
      return stdout.trim() === '1';
    } catch (err: any) {
      console.warn(`[ADB Boot Check]: ${err.message}`);
      return false;
    }
  }

  static async installApk(apkPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const connected = await this.connect();
      if (!connected) {
        return {
          success: false,
          message: 'ADB device not connected. Wait for the Android emulator to finish booting.',
        };
      }

      // Wait briefly for boot; if adb already reports "device", proceed anyway
      // (sys.boot_completed can lag while the emulator is usable).
      let booted = await this.isBootCompleted();
      if (!booted) {
        for (let i = 0; i < 6 && !booted; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          booted = await this.isBootCompleted();
        }
        if (!booted) {
          console.warn('[ADB] sys.boot_completed still 0 — continuing install (device is connected)');
        }
      }

      console.log(`[ADB] Installing APK from ${apkPath}...`);
      // -r replace existing, -d allow version downgrade (INSTALL_FAILED_VERSION_DOWNGRADE)
      const { stdout, stderr } = await execAdb(
        `adb -s ${this.targetDevice} install -r -d "${apkPath}"`,
        ADB_TIMEOUT_MS
      );
      const output = `${stdout || ''}${stderr || ''}`.trim();
      console.log(`[ADB Install Result]: ${output}`);

      // adb install prints "Success" on success; treat missing Success as failure
      if (!/Success/i.test(output)) {
        return {
          success: false,
          message: output || 'adb install did not report Success',
        };
      }

      return { success: true, message: output };
    } catch (err: any) {
      console.error(`[ADB Install Error]:`, err);
      const timedOut = err.killed || /ETIMEDOUT|TIMEOUT|timed out/i.test(String(err.message));
      // Prefer full adb stdout/stderr over truncated "Command failed: adb..."
      const adbOut = [err.stdout, err.stderr]
        .filter((s: unknown) => typeof s === 'string' && s.trim())
        .join('\n')
        .trim();
      let detail = adbOut || String(err.message || err);
      // If message is the generic Command failed wrapper, peel stderr from it when present
      if (!adbOut && typeof err.message === 'string') {
        const m = err.message.replace(/^Command failed:\s*/i, '').trim();
        // Drop the echoed command line; keep failure body after first newline
        const nl = m.indexOf('\n');
        if (nl >= 0) detail = m.slice(nl + 1).trim() || m;
        else detail = m;
      }
      return {
        success: false,
        message: timedOut
          ? `APK install timed out after ${ADB_TIMEOUT_MS / 1000}s. Emulator may still be booting or too slow.`
          : detail,
      };
    }
  }

  static async sendKeyEvent(keyCode: number): Promise<boolean> {
    try {
      await this.connect();
      await execAdb(`adb -s ${this.targetDevice} shell input keyevent ${keyCode}`, 15_000);
      return true;
    } catch (err: any) {
      console.error(`[ADB KeyEvent Error]:`, err.message);
      return false;
    }
  }

  static async sendText(text: string): Promise<boolean> {
    try {
      const escapedText = text.replace(/([ "$\\])/g, '\\$1');
      await execAdb(`adb -s ${this.targetDevice} shell input text "${escapedText}"`, 15_000);
      return true;
    } catch (err: any) {
      console.error(`[ADB Text Input Error]:`, err.message);
      return false;
    }
  }

  static async sendTouch(x: number, y: number): Promise<boolean> {
    try {
      await execAdb(`adb -s ${this.targetDevice} shell input tap ${x} ${y}`, 15_000);
      return true;
    } catch (err: any) {
      console.error(`[ADB Touch Error]:`, err.message);
      return false;
    }
  }

  static async sendSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300
  ): Promise<boolean> {
    try {
      await execAdb(
        `adb -s ${this.targetDevice} shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`,
        15_000
      );
      return true;
    } catch (err: any) {
      console.error(`[ADB Swipe Error]:`, err.message);
      return false;
    }
  }

    static async listInstalledPackages(): Promise<string[]> {
    try {
      const connected = await this.connect();
      if (!connected) return [];

      // Prefer third-party packages; if empty (or device still settling), fall back to launchable apps
      const { stdout } = await execAdb(
        `adb -s ${this.targetDevice} shell pm list packages -3`,
        30_000
      );
      let packages = stdout
        .split('\n')
        .map((line) => line.replace('package:', '').trim())
        .filter((pkg) => pkg.length > 0);

      if (packages.length === 0) {
        const { stdout: launchable } = await execAdb(
          `adb -s ${this.targetDevice} shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER`,
          30_000
        );
        packages = [
          ...new Set(
            launchable
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.includes('/'))
              .map((line) => line.split('/')[0])
              .filter((pkg) => pkg && !pkg.startsWith('com.android.') && pkg !== 'android')
          ),
        ];
      }

      return packages;
    } catch (err: any) {
      console.error(`[ADB List Packages Error]:`, err.message);
      return [];
    }
  }

  static async launchPackage(packageName: string): Promise<{ success: boolean; message: string }> {
    try {
      const connected = await this.connect();
      if (!connected) {
        return { success: false, message: 'ADB device not connected' };
      }
      console.log(`[ADB] Launching package: ${packageName}`);
      const { stdout, stderr } = await execAdb(
        `adb -s ${this.targetDevice} shell monkey -p "${packageName}" -c android.intent.category.LAUNCHER 1`,
        60_000
      );
      return { success: true, message: stdout.trim() || stderr.trim() };
    } catch (err: any) {
      console.error(`[ADB Launch Package Error]:`, err.message);
      return { success: false, message: err.message };
    }
  }
}
