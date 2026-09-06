import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AdbService } from '../services/adbService';

const router = Router();

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for APK uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${cleanName}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('Only .apk files are supported.'));
    }
  },
});

// 1. Status route & Container Health Check
router.get('/status', async (req, res) => {
  const connected = await AdbService.connect();
  res.json({
    status: 'online',
    adbConnected: connected,
    streamUrl: process.env.STREAM_URL || 'http://localhost:6080',
    timestamp: new Date().toISOString(),
  });
});

// System Stats Route (Umbrel OS Storage & Resource Monitor)
router.get('/system/stats', async (req, res) => {
  try {
    const connected = await AdbService.connect();
    const memTotal = 16; // GB simulated reference
    const memUsed = 4.2;
    const cpuLoad = Math.floor(Math.random() * 15) + 10;
    const storageTotal = 100; // GB
    const storageUsed = 24.5;

    res.json({
      cpuLoad: `${cpuLoad}%`,
      memory: `${memUsed} GB / ${memTotal} GB`,
      storage: `${storageUsed} GB used of ${storageTotal} GB`,
      adbConnected: connected,
      uptime: process.uptime(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Curated Umbrel App Store Catalog Route
router.get('/appstore/apps', (req, res) => {
  const catalog = [
    {
      id: 'music-assistant',
      name: 'Music Assistant',
      category: 'Media',
      description: 'Manage your entire music library from one place.',
      icon: '🎵',
      gradient: 'from-amber-500/30 to-orange-600/30',
    },
    {
      id: 'adguard-home',
      name: 'AdGuard Home',
      category: 'Networking',
      description: 'Shield up! Surf the web ad-free and safely.',
      icon: '🛡️',
      gradient: 'from-emerald-500/30 to-teal-600/30',
    },
    {
      id: 'ollama-ai',
      name: 'Ollama AI',
      category: 'AI',
      description: 'Run large language models locally on your hardware.',
      icon: '🤖',
      gradient: 'from-purple-500/30 to-indigo-600/30',
    },
    {
      id: 'bitcoin-node',
      name: 'Bitcoin Node',
      category: 'Bitcoin',
      description: 'Run a fully validating self-sovereign Bitcoin node.',
      icon: '₿',
      gradient: 'from-amber-400/30 to-yellow-600/30',
    },
    {
      id: 'nextcloud',
      name: 'Nextcloud',
      category: 'Files & Productivity',
      description: 'Self-hosted productivity platform for your data.',
      icon: '☁️',
      gradient: 'from-blue-500/30 to-cyan-600/30',
    },
    {
      id: 'home-assistant',
      name: 'Home Assistant',
      category: 'Home & Automation',
      description: 'Open source home automation that puts local control first.',
      icon: '🏠',
      gradient: 'from-sky-500/30 to-blue-600/30',
    },
    {
      id: 'pi-hole',
      name: 'Pi-hole',
      category: 'Networking',
      description: 'Network-wide ad blocking for all your devices.',
      icon: '🥧',
      gradient: 'from-red-500/30 to-rose-600/30',
    },
    {
      id: 'tailscale',
      name: 'Tailscale',
      category: 'Networking',
      description: 'Zero-config VPN for secure remote access anywhere.',
      icon: '🔗',
      gradient: 'from-slate-500/30 to-zinc-600/30',
    },
  ];
  res.json({ apps: catalog });
});

// 2. Auth Route
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username && password) {
    res.json({ token: 'umbrella-session-token', username, success: true });
  } else {
    res.status(400).json({ error: 'Username and password required' });
  }
});

// 3. Upload Route
router.post('/upload', upload.single('apk'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No APK file provided' });
  }
  res.json({
    message: 'APK uploaded successfully',
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

// 4. Launch & Install Route
router.post('/launch', async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Filename required to launch' });
  }

  const apkPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'APK file not found on server' });
  }

  console.log(`[Umbrella OS] Installing and launching APK: ${filename}`);
  const installResult = await AdbService.installApk(apkPath);

  res.json({
    message: `APK installation initiated: ${installResult.message}`,
    success: installResult.success,
    streamUrl: process.env.STREAM_URL || 'http://localhost:6080',
  });
});

// 5. App Launcher Routes
router.get('/apps', async (req, res) => {
  try {
    const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    const apkFiles = files.filter((f) => f.endsWith('.apk'));

    const uploadedApps = apkFiles.map((filename) => ({
      filename,
      name: filename.replace(/^\d+-/, '').replace('.apk', ''),
      type: 'apk' as const,
    }));

    const installedPackages = await AdbService.listInstalledPackages();
    const systemApps = installedPackages.map((pkg) => ({
      packageName: pkg,
      name: pkg.split('.').pop() || pkg,
      type: 'package' as const,
    }));

    res.json({
      uploadedApps,
      installedPackages: systemApps,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/launch-package', async (req, res) => {
  const { packageName } = req.body;
  if (!packageName) {
    return res.status(400).json({ error: 'Package name required to launch' });
  }

  console.log(`[Umbrella OS] Launching package: ${packageName}`);
  const launchResult = await AdbService.launchPackage(packageName);

  res.json({
    message: `Package launch initiated: ${launchResult.message}`,
    success: launchResult.success,
    streamUrl: process.env.STREAM_URL || 'http://localhost:6080',
  });
});

// 6. Remote Input Event Route (HTTP fallback for WebSocket)
router.post('/input', async (req, res) => {
  const { keyCode, type, x, y } = req.body;
  if (type === 'key' && typeof keyCode === 'number') {
    const success = await AdbService.sendKeyEvent(keyCode);
    return res.json({ success });
  }
  if (type === 'touch' && typeof x === 'number' && typeof y === 'number') {
    const success = await AdbService.sendTouch(x, y);
    return res.json({ success });
  }
  res.status(400).json({ error: 'Invalid input payload' });
});

export default router;
