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

      const booted = await this.isBootCompleted();
      if (!booted) {
        return {
          success: false,
          message:
            'Android emulator is connected but not fully booted yet (sys.boot_completed != 1). Wait and retry.',
        };
      }

      console.log(`[ADB] Installing APK from ${apkPath}...`);
      const { stdout, stderr } = await execAdb(
        `adb -s ${this.targetDevice} install -r "${apkPath}"`,
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
      return {
        success: false,
        message: timedOut
          ? `APK install timed out after ${ADB_TIMEOUT_MS / 1000}s. Emulator may still be booting or too slow.`
          : err.message,
      };
    }
  }

  static async sendKeyEvent(keyCode: number): Promise<boolean> {
    try {
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
      await this.connect();
      const { stdout } = await execAdb(
        `adb -s ${this.targetDevice} shell pm list packages -3`,
        30_000
      );
      return stdout
        .split('\n')
        .map((line) => line.replace('package:', '').trim())
        .filter((pkg) => pkg.length > 0);
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
