import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const ANDROID_HOST = process.env.ANDROID_HOST || 'localhost';
const ANDROID_ADB_PORT = process.env.ANDROID_ADB_PORT || '5555';

export class AdbService {
  private static targetDevice = `${ANDROID_HOST}:${ANDROID_ADB_PORT}`;

  static async connect(): Promise<boolean> {
    try {
      const { stdout: connectOut } = await execPromise(`adb connect ${this.targetDevice}`);
      console.log(`[ADB Connect]: ${connectOut.trim()}`);
      if (connectOut.includes('connected') && !connectOut.includes('cannot connect') && !connectOut.includes('failed to connect')) {
        return true;
      }
      
      // Fallback: check if any local emulator or USB device is already connected via adb devices
      const { stdout: devicesOut } = await execPromise('adb devices');
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

  static async installApk(apkPath: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();
      console.log(`[ADB] Installing APK from ${apkPath}...`);
      const { stdout, stderr } = await execPromise(`adb -s ${this.targetDevice} install -r "${apkPath}"`);
      console.log(`[ADB Install Result]: ${stdout || stderr}`);
      return { success: true, message: stdout.trim() };
    } catch (err: any) {
      console.error(`[ADB Install Error]:`, err);
      return { success: false, message: err.message };
    }
  }

  static async sendKeyEvent(keyCode: number): Promise<boolean> {
    try {
      await execPromise(`adb -s ${this.targetDevice} shell input keyevent ${keyCode}`);
      return true;
    } catch (err: any) {
      console.error(`[ADB KeyEvent Error]:`, err.message);
      return false;
    }
  }

  static async sendText(text: string): Promise<boolean> {
    try {
      // Escape special characters for shell
      const escapedText = text.replace(/([ "$\\])/g, '\\$1');
      await execPromise(`adb -s ${this.targetDevice} shell input text "${escapedText}"`);
      return true;
    } catch (err: any) {
      console.error(`[ADB Text Input Error]:`, err.message);
      return false;
    }
  }

  static async sendTouch(x: number, y: number): Promise<boolean> {
    try {
      await execPromise(`adb -s ${this.targetDevice} shell input tap ${x} ${y}`);
      return true;
    } catch (err: any) {
      console.error(`[ADB Touch Error]:`, err.message);
      return false;
    }
  }

  static async sendSwipe(x1: number, y1: number, x2: number, y2: number, duration: number = 300): Promise<boolean> {
    try {
      await execPromise(`adb -s ${this.targetDevice} shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
      return true;
    } catch (err: any) {
      console.error(`[ADB Swipe Error]:`, err.message);
      return false;
    }
  }

  static async listInstalledPackages(): Promise<string[]> {
    try {
      await this.connect();
      const { stdout } = await execPromise(`adb -s ${this.targetDevice} shell pm list packages -3`);
      const packages = stdout
        .split('\n')
        .map((line) => line.replace('package:', '').trim())
        .filter((pkg) => pkg.length > 0);
      return packages;
    } catch (err: any) {
      console.error(`[ADB List Packages Error]:`, err.message);
      return [];
    }
  }

  static async launchPackage(packageName: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();
      console.log(`[ADB] Launching package: ${packageName}`);
      const { stdout, stderr } = await execPromise(
        `adb -s ${this.targetDevice} shell monkey -p "${packageName}" -c android.intent.category.LAUNCHER 1`
      );
      return { success: true, message: stdout.trim() || stderr.trim() };
    } catch (err: any) {
      console.error(`[ADB Launch Package Error]:`, err.message);
      return { success: false, message: err.message };
    }
  }
}
