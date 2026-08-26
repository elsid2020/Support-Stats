const React = require('react');
const { useSelector, useDispatch } = require('react-redux');
const { actions, selectors, util, fs, MainPage, log, Icon, IconButton, Toggle, Spinner } = require('vortex-api');
const nodeFs = require('fs');               // native Node fs — use only for statfsSync
const path = require('path');
const os = require('os');
const { shell, clipboard } = require('electron');
const { exec, execFile } = require('child_process');
const { count } = require('console');
const { json } = require('stream/consumers');
const semver = require('semver')

const iniFileMap = {
  skyrim: ['Skyrim/Skyrim.ini', 'Skyrim/SkyrimPrefs.ini'],
  skyrimse: ['Skyrim Special Edition/Skyrim.ini', 'Skyrim Special Edition/SkyrimPrefs.ini'],
  skyrimvr: ['Skyrim VR/Skyrim.ini', 'Skyrim VR/SkyrimVR.ini', 'Skyrim VR/SkyrimPrefs.ini'],
  fallout3: ['Fallout3/Fallout.ini', 'Fallout3/FalloutPrefs.ini', 'Fallout3/FalloutCustom.ini'],
  fallout4: ['Fallout4/Fallout4.ini', 'Fallout4/Fallout4Prefs.ini', 'Fallout4/Fallout4Custom.ini'],
  fallout4vr: ['Fallout4VR/Fallout4Custom.ini', 'Fallout4VR/Fallout4Prefs.ini'],
  falloutnv: ['FalloutNV/Fallout.ini', 'FalloutNV/FalloutPrefs.ini', 'FalloutNV/FalloutCustom.ini'],
  starfield: ['Starfield/Starfield.ini', 'Starfield/StarfieldPrefs.ini', 'Starfield/StarfieldCustom.ini'],
  oblivion: ['Oblivion/Oblivion.ini'],
  enderal: ['Enderal/Enderal.ini', 'Enderal/EnderalPrefs.ini'],
  enderalspecialedition: ['Enderal Special Edition/Enderal.ini', 'Enderal Special Edition/EnderalPrefs.ini'],
};
// const displayPath = fullPath.replace(/\\/g, '/').replace(/(\/Users\/)([^/]+)/i, '$1<USER>');
const skyrimLogsPath = path.join(util.getVortexPath('documents'), 'My Games', 'Skyrim Special Edition', 'SKSE');
const vortexLogsPath = path.join(process.env.APPDATA, 'Vortex');
const discordURL = "https://discord.gg/immersive-collections"
const filesToSkip = new Set([
  '__folder_managed_by_vortex',
  'vortex.deployment.json',
  'vortex.deployment.msgpack',
  'vortex.deployment.json.bak',
  'vortex.deployment.msgpack.bak',
  'user.json.vortex_backup',
  'user.json',
]);

function displayPath(fullPath) {
  const tempPath = fullPath.replace(/\\/g, '/').replace(/(\/(?:Users|home)\/)([^/]+)/i, '$1<USER>');
  return tempPath.replace(/\//g, '\\');
}

// const PLUGIN_EXTS = new Set(['.esp', '.esm', '.esl']);  
// const FLAG_LIGHT = 0x00000200; 

// Helper function for grabbing gpu info on Windows and Linux (Wine)
const GPU_CLASS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';

function execReg(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (err, stdout) => {
      if (err) return resolve('');
      resolve(stdout || '');
    });
  });
}

// Step 1: list the numbered subkeys (0000, 0001, ...) under the GPU class key  
async function getGpuSubkeys() {
  const output = await execReg(`reg query "${GPU_CLASS_KEY}"`);
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines
    .map((line) => line.split('\\').pop())
    .filter((sub) => /^\d{4}$/.test(sub));
}

// Step 2: read DriverDesc + qwMemorySize for one subkey  
async function getGpuInfo(subkey) {
  const output = await execReg(`reg query "${GPU_CLASS_KEY}\\${subkey}"`);
  const nameMatch = output.match(/DriverDesc\s+REG_\w+\s+(.+)/i);
  const memMatch = output.match(/HardwareInformation\.qwMemorySize\s+REG_QWORD\s+0x([0-9a-fA-F]+)/i);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();
  const isKnownVendor = /intel|amd|nvidia|radeon/i.test(name);
  if (!isKnownVendor) return null;

  const vramGB = memMatch
    ? Math.round((parseInt(memMatch[1], 16) / (1024 ** 3)) * 100) / 100
    : null;
  return { name, vramGB };
}

// Step 3: gather every GPU found under the class key  
async function getGpuList() {
  const subkeys = await getGpuSubkeys();
  const results = await Promise.all(subkeys.map(getGpuInfo));
  return results.filter(Boolean);
}

function formatGpuList(list) {
  if (list.length === 0) return 'GPU: Unknown';
  return list
    .map((g) => ` ${g.name} | ${g.vramGB != null ? g.vramGB + 'GB' : '—'}`)
    .join('\n');
}


function readPluginLightFlag(filePath) {
  return new Promise((resolve) => {
    const buf = Buffer.alloc(12);
    const fd = require('fs').open(filePath, 'r', (err, fd) => {
      if (err) return resolve(false);
      require('fs').read(fd, buf, 0, 12, 0, (err2, bytesRead) => {
        require('fs').close(fd, () => { });
        if (err2 || bytesRead < 12) return resolve(false);
        // Verify TES4 magic: bytes 0-3 must be "TES4"  
        if (buf.toString('ascii', 0, 4) !== 'TES4') return resolve(false);
        const flags = buf.readUInt32LE(8);
        resolve((flags & 0x200) !== 0); // FLAG_LIGHT  
      });
    });
  });
}

// MDI icon paths (hardcoded to avoid ES module import issues)  
const MDI_CHEVRON_DOUBLE_RIGHT = 'M5.59,7.41L7,6L13,12L7,18L5.59,16.59L10.17,12L5.59,7.41M11.59,7.41L13,6L19,12L13,18L11.59,16.59L16.17,12L11.59,7.41Z';
const MDI_CHEVRON_DOUBLE_DOWN = 'M16.59,5.59L18,7L12,13L6,7L7.41,5.59L12,10.17L16.59,5.59M16.59,11.59L18,13L12,19L6,13L7.41,11.59L12,16.17L16.59,11.59Z';
const MDI_CHECK_CIRCLE = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z';
const MDI_CLOSE_CIRCLE = 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z';
const discordIconPath = "M19.4308 5.26368C18.1561 4.67878 16.7892 4.24785 15.3599 4.00104C15.3339 3.99627 15.3079 4.00818 15.2945 4.03198C15.1187 4.34466 14.9239 4.75258 14.7876 5.0732C13.2503 4.84306 11.721 4.84306 10.2153 5.0732C10.0789 4.74545 9.87707 4.34466 9.70048 4.03198C9.68707 4.00897 9.66107 3.99707 9.63504 4.00104C8.20659 4.24706 6.83963 4.67799 5.56411 5.26368C5.55307 5.26844 5.54361 5.27638 5.53732 5.28669C2.94449 9.16032 2.23421 12.9387 2.58265 16.6703C2.58423 16.6886 2.59447 16.706 2.60867 16.7171C4.31934 17.9734 5.97642 18.7361 7.60273 19.2416C7.62876 19.2496 7.65634 19.24 7.6729 19.2186C8.05761 18.6933 8.40054 18.1393 8.69456 17.5568C8.71192 17.5227 8.69535 17.4822 8.65989 17.4687C8.11594 17.2624 7.598 17.0108 7.09977 16.7251C7.06037 16.7021 7.05721 16.6457 7.09347 16.6187C7.19831 16.5402 7.30318 16.4584 7.4033 16.3759C7.42141 16.3608 7.44665 16.3576 7.46794 16.3671C10.7411 17.8615 14.2846 17.8615 17.5191 16.3671C17.5404 16.3568 17.5657 16.36 17.5846 16.3751C17.6847 16.4576 17.7895 16.5402 17.8952 16.6187C17.9314 16.6457 17.9291 16.7021 17.8897 16.7251C17.3914 17.0163 16.8735 17.2624 16.3288 17.4679C16.2933 17.4814 16.2775 17.5227 16.2949 17.5568C16.5952 18.1385 16.9381 18.6924 17.3157 19.2178C17.3315 19.24 17.3599 19.2496 17.3859 19.2416C19.0201 18.7361 20.6772 17.9734 22.3879 16.7171C22.4028 16.706 22.4123 16.6894 22.4139 16.6711C22.8309 12.357 21.7154 8.60956 19.4568 5.28748C19.4513 5.27638 19.4419 5.26844 19.4308 5.26368ZM9.18335 14.3982C8.19792 14.3982 7.38594 13.4935 7.38594 12.3824C7.38594 11.2713 8.18217 10.3666 9.18335 10.3666C10.1924 10.3666 10.9965 11.2793 10.9807 12.3824C10.9807 13.4935 10.1845 14.3982 9.18335 14.3982ZM15.829 14.3982C14.8435 14.3982 14.0316 13.4935 14.0316 12.3824C14.0316 11.2713 14.8278 10.3666 15.829 10.3666C16.838 10.3666 17.6421 11.2793 17.6264 12.3824C17.6264 13.4935 16.838 14.3982 15.829 14.3982Z";
const SUCCESS_STRONG_CHECK = 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z'

function getDriveInfo(drivePath) {
  try {
    const root = require('path').parse(drivePath).root || drivePath;
    const stats = nodeFs.statfsSync(root);
    const freeGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    const totalGB = (stats.blocks * stats.bsize) / (1024 ** 3);
    return { root, freeGB, totalGB };
  } catch {
    return null;
  }
}

// Minimum versions considered "current"  
const MIN_VCPP_MINOR = 20;  // 14.20+ = VC++ 2019 or later  
const MIN_DOTNET_MAJOR = 9; // .NET 9+  

function getIniPaths(gameId) {
  const subPaths = iniFileMap[gameId?.toLowerCase()];
  if (!subPaths) return [];
  const docsPath = util.getVortexPath('documents');
  return subPaths.map(p => path.join(docsPath, 'My Games', p));
}

function getCollectionStats(collectionMod, mods, profile) {
  const rules = collectionMod.rules ?? [];
  const stats = { enabled: 0, disabled: 0, notInstalled: 0, ignored: 0 };

  rules
    .filter(r => ['requires', 'recommends'].includes(r.type))
    .forEach(rule => {
      if (rule.ignored === true) {
        stats.ignored++;
        return;
      }
      const referencedMod = util.findModByRef(rule.reference, mods);
      if (referencedMod === undefined) {
        stats.notInstalled++;
        return;
      }
      const isEnabled = profile?.modState?.[referencedMod.id]?.enabled === true;
      isEnabled ? stats.enabled++ : stats.disabled++;
    })


  return stats;
}

function row(label, value) {
  return React.createElement('div', { style: { marginBottom: '10px' } },
    React.createElement('strong', null, label),
    value
  );
}


function ul(...items) {
  return React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
    ...items.map((text, i) => React.createElement('li', { key: i, dangerouslySetInnerHTML: { __html: text } }))
  );
}
function moreInfo(infoItem, tooltip) {
  return React.createElement('span', {
    onClick: scrollToSection(infoItem), // no arrow-wrapping — same bug as before  
    title: tooltip,
    style: {
      cursor: 'pointer',
      // marginLeft: '-4px',
      color: '#4fa3ff',
      fontWeight: 'bold',
      border: '1px solid #4fa3ff',
      borderRadius: '50%',
      width: '14px',
      height: '14px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.7em',
    },
  }, '?');
}

function statusIcon(isOk) {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    style: {
      width: '24px', height: '24px',
      fill: isOk ? '#4caf50' : '#f44336',
      flexShrink: 0, marginRight: '6px', verticalAlign: 'text'
    }
  }, React.createElement('path', { d: isOk ? MDI_CHECK_CIRCLE : null }));
}

function warningBell(tooltip) {
  return React.createElement(Icon, { tooltip: tooltip, name: 'notifications', style: { fill: '#e5a50a' } });
}
function locked(status, tooltip) {
  return React.createElement('span', { title: tooltip, style: { marginLeft: '-5px' } },
    React.createElement(Icon, { name: status ? 'locked' : 'unlocked', style: { fill: status ? '#4fe50a' : '#db3e3e' } }));
}

function includeWarning(basetext, isOK, optionaltext) {
  const parts = [basetext];

  if (!isOK) {
    parts.push(' ', warningBell());
  }

  if (optionaltext) {
    parts.push(' ', optionaltext);
  }

  return React.createElement('span', null, ...parts);
}

function sysRow(label, version, isCurrent) {
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'left', marginBottom: '4px', fontSize: '12px' }
  },
    React.createElement(statusIcon, { isOk: isCurrent }),
    React.createElement('span', null,
      label + ': ' + (version || 'Not found')
    )
  );
}

function reallyGoodRow(label) {
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'left', marginBottom: '4px', fontSize: '18px' }
  },
    React.createElement(statusIcon,null,null),
    React.createElement('span', null, label)
  );
}


let healthStatsBad = 13;


function healthRow(label, isGood, detail, onClick, tooltip) {
  if (!isGood) {
    healthStatsBad++;;
  const icon = isGood
    ? null //React.createElement('span', { style: { color: '#4caf50', marginRight: '6px', fontWeight: 'bold', alignItems: 'flex-start' } }, '✔')
    : React.createElement('span', { style: { color: '#f44336', marginRight: '6px', fontWeight: 'bold', alignItems: 'flex-start', fontSize: '14pt' } }, '✘');

  
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'flex-start', marginBottom: '4px',
      cursor: onClick ? 'pointer' : 'default',
      borderRadius: '4px',
      padding: '2px 4px',
      transition: 'background-color 0.15s ease',
    },
    onClick: onClick || undefined,
    title: tooltip || undefined,
    onMouseEnter: onClick
      ? (e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }
      : undefined,
    onMouseLeave: onClick
      ? (e) => { e.currentTarget.style.backgroundColor = 'transparent'; }
      : undefined,
  },
    icon,
    React.createElement('span', { style: { fontSize: '14pt' } }, label),
    detail
      ? React.createElement('span', { style: { marginLeft: '6px', opacity: 0.7, fontSize: '0.85em', alignItems: 'flex-start' } }, detail)
      : null,
    !isGood
      ? React.createElement('svg', {
        viewBox: '0 0 24 24',
        style: {
          width: '18px', height: '18px',
          fill: '#f44336',
          flexShrink: 0, marginRight: '6px', verticalAlign: 'middle',
          marginBottom: '-6px'
        }
      }, React.createElement('path', { d: MDI_CHEVRON_DOUBLE_RIGHT }))
      : null
  );
}}



function copyButton(text, tooltip) {
  return React.createElement('span', { title: tooltip || 'Copy to clipboard', style: { cursor: 'pointer', marginLeft: '6px' } },
    React.createElement('button', {
      className: 'btn-embed',
      style: { background: 'none', border: 'none', padding: 0 },
      onClick: () => require('electron').clipboard.writeText(text),
    },
      React.createElement(Icon, { name: 'clipboard-copy' })
    )
  );
}

let winapi;
try { winapi = require('winapi-bindings'); } catch (e) { winapi = null; }


function getSteamPath() {
  if (process.env.WINEPREFIX || process.env.WINELOADER) {
    // Wine host 
    const wineHomeDir = process.env.WINEHOMEDIR.substring(4,);
    const wineResult = path.join(wineHomeDir, '.local\\share\\Steam');
    return wineResult;
  } else if ((!process.env.WINEPREFIX || process.env.WINELOADER) && process.platform === 'win32') {
    // Windows host
    try {
      const winapi = require('winapi-bindings');
      const result = winapi.RegGetValue(
        'HKEY_CURRENT_USER',
        'Software\\Valve\\Steam',
        'SteamPath'
      );
      return result.value;
    } catch (err) {
      return undefined;
    }
  } else {
    // Linux host paths  
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const home = os.homedir();
    const candidates = [
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.steam', 'debian-installation'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
      path.join(home, '.steam', 'steam'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync)// (path.join(candidate, 'config', 'libraryfolders.vdf'))) {  
        return candidate;
    }
  }
  return undefined;
}

async function isReadOnly(filePath) {
  try {
    await fs.access(filePath, fs.constants.W_OK);
    return false; // writable  
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return true; // read-only / no write permission  
    }
    throw err; // e.g. ENOENT — file doesn't exist, handle separately  
  }
}

const steamPath = getSteamPath();

function getVcppVersion(arch) {
  if (!winapi) return null;
  try {
    const key = 'SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\' + arch;
    const result = winapi.RegGetValue('HKEY_LOCAL_MACHINE', key, 'Version');
    return result?.value || null;
  } catch (e) {
    return null;
  }
}

function isVcppCurrent(version) {
  if (!version) return false;
  const clean = version.replace(/^v/, '');
  const parts = clean.split('.');
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  return major >= 14 && minor >= MIN_VCPP_MINOR;
}

// Scroll to the faqItems
function scrollToSection(sectionId) {
  return () => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // flash highlight  
      const originalTransition = el.style.transition;
      const originalOutline = el.style.outline;
      const originalOutlineOffset = el.style.outlineOffset;

      el.style.transition = 'outline-color 0.3s ease';
      el.style.outline = '3px solid #ffb400';
      el.style.outlineOffset = '2px';

      setTimeout(() => {
        el.style.outline = originalOutline;
        el.style.outlineOffset = originalOutlineOffset;
        el.style.transition = originalTransition;
      }, 2000);

    }
  };
}

// Collapsible FAQ item component  
function FaqItem({ heading, children, id }) {
  const [open, setOpen] = React.useState(false);

  return React.createElement('div', { id, style: { marginBottom: '8px', border: '1px solid #555', borderRadius: '4px' } },
    React.createElement('div', {
      onClick: () => setOpen(!open),
      style: {
        padding: '8px 12px',
        cursor: 'pointer',
        background: '#3a3a3a',
        fontWeight: 'bold',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }
    },
      heading,
      React.createElement('span', null, open ? '▲' : '▼')
    ),
    open
      ? React.createElement('div', { style: { padding: '10px 14px', background: '#2a2a2a' } }, children)
      : null
  );
}
function buildFaqItems(api, gamePath) {
  return [
    {
      heading: 'Crash to desktop when clicking new game:',
      content: ul(
        'Make sure your Vortex is up to date. Restart Vortex and you should receive a notification about a new Vortex version if it is not up to date. If it\'s very old just go to <a href="https://www.nexusmods.com/vortex" target="_blank">https://www.nexusmods.com/vortex</a> and download the latest version.',
        'Pirated version of the game is installed. Go buy the game. You\'ll find no support otherwise.',
        'Mods have not been deployed. Do not rely on auto deploy - Simply click on Deploy Mods on the Mods tab in Vortex.',
        'Plugins are disabled and have not been sorted. Click 1 plugin, then control+a to select all then Enable at the bottom. Then, click on Sort Now on the Plugins tab in Vortex.',
        'User has extra mods installed. Profiles do not keep mods or collections separate',
        'Wrong version of the game is installed (VR version, downgraded Special Edition, Original launch version etc.)',
      ),
    },
    {
      heading: 'Infinite loadscreen on start up:',
      content: ul(
        'Make sure your Vortex is up to date. Restart Vortex and you should receive a notification about a new Vortex version if it is not up to date. If it\'s very old just go to <a href="https://www.nexusmods.com/vortex" target="_blank">https://www.nexusmods.com/vortex</a> and download the latest version.',
        'Plugins are disabled / not sorted. Simply restart Vortex, select one plugin then press Ctrl+A and press Enable at the bottom. Follow that with clicking the Sort Now button at the top.',
      ),
    },
    {
      heading: 'Can\'t launch via script extender — it\'s grayed out:',
      content: ul(
        'Just restarting Vortex may make it work.',
        'You may have had SKSE before (old version or Steam version) and when you downloaded it again with the collection, Vortex did not know what to do. Simply click on the 3 dots on the side of the script extender, click Edit, and for the Target Path navigate to your Skyrim game folder and select "skse64_loader.exe". Make sure it looks similar to: .....Steam\\steamapps\\common\\Skyrim Special Edition\\skse64_loader.exe',
      ),
    },
    {
      heading: 'Script extender 000, wrong version error:',
      content: ul(
        'You are still trying to open the game from Steam instead of the script extender. You needs to only launch the game using SKSE65 → From Tools or a desktop shortcut that points to the script extender.',
      ),
    },
    {
      heading: 'SKSE Loader Prompt:',
      content: ul(
        'You do not have the latest version of Microsoft Visual C++ Redistributable. Simply install the latest version from the internet. Most users have this but new computers do not come with this software already installed.',
        'You have pirated software.',
      ),
    },
    {
      heading: 'INI Files missing OR No textures or meshes, faces not shown, purple room, only teeth showing etc.:',
      id: 'notlaunchedthegame',
      content: ul(
        'You have not launched & started a new game in Skyrim even once before installing this collection. Purge your mods, and launch Skyrim from Steam and play until Ralof says a sentence or two. Quit the game (no save) and deploy mods, make sure all plugins are enabled and click Sort Now. Enjoy.',
      ),
    },
    {
      heading: "How do I remove OneDrive?",
      id: 'removeonedrive',
      content: ul(
        'Even if you have previously uninstalled OneDrive, it tends to leave a OneDrive folder in your Documents path. This will interfere with Skyrim. Follow these directions: ',
        '<a href="https://docs.google.com/document/d/1Ot0l8uFv-AJZr1X6vRMQNovhua_NUtE_HhbkrfJi1Ss/edit?usp=sharing">How do I remove OneDrive?</a>',
      ),
    },
    {
      heading: 'External / Removeable USB drives',
      id: 'externaldrive',
      content: ul(
        'USB drives have multiple issues that make them unsuitable for modded Skyrim',
        '1. Even the fastest drives do not have the performance to keep up with the huge amount of file operations in modded Skyrim.',
        '2. USB drives commonly come pre-formatted to use the exFAT filesystem. This is almost universally usable, but does not support the hardlinks Vortex needs to reliably deploy mods. Reformatting to NTFS would help, but not fix problem #1',
        'If you are using a USB drive, you need 1) to Purge your mods in Vortex, 2) use Steam to move your game to an internal drive, and 3) use Vortex (Game Settings > Mods) to move your staging folder and files to the same drive you moved Skyrim to.'
      ),
    },
    {
      heading: 'Failed To Install Dependency:',
      content: ul(
        'Make sure your Vortex is up to date. Restart Vortex and you\'ll receive a notification about a new Vortex version if it is not up to date.',
        'Check the error code by pressing "More" to understand it. 500 is purely a Nexus server error — trying again later should fix it. 501 means you have hit your download quota for the day.',
        'A read-only file error means you need to restart Vortex as you are trying to reopen the same file.',
      ),
    },
    {
      heading: 'This Collection Not Being Installed Because It Is Meant For VR:',
      content: ul(
        'Update Vortex to the latest version. If this doesn\'t fix it, go to Extensions in Vortex. Disable Skyrim VR. Restart.',
      ),
    },
    {
      heading: 'FNIS Detected',
      id: 'removefnis',
      content: React.createElement(React.Fragment, null,
        React.createElement('p', null, 'Neither FNIS or Nemesis are used by the collection...'),
        React.createElement('p', null,
          '    1. In Vortex goto Skyrim > Game Settings -> ',
          React.createElement('label', {
            style: { cursor: 'pointer', textDecoration: 'underline', color: '#3daee9' },
            onClick: () => {
              api.events.emit("show-main-page", "game_settings");

            },
          }, 'Interface'),
          ' Run FNIS on Deployment (Toggle this off!)',
        ),
        ul(
          '2. Then go to mods tab. Disable anything related to FNIS or Nemesis...',
          '3. Search for "pandora output" and REMOVE IT...',
          '4. Then either go to Skyrim => Collections tab...',
          '   Click on the "resume" button...',
        ),
      )
    },
    {
      heading: 'Unmanage files found',
      id: 'unmanagedfiles',
      content: ul(
        'Unamanged files are found in your Skyrim Data folder and can interfere with your new collection.',
        'If you have unmanaged files, these are commonly leftover files from old modding that didn\'t use a mod manager OR',
        'Improperly installed mods, OR',
        'Improperly removed mods',
        '*Exception: By default Bodyslide will put meshes into the Skyrim Data folder. If you haven\'t done this or don\'t know what this means, it doesn\'t apply :).',
      ),
    },
    {
      heading: 'Lock or rollback Skyrim version',
      id: 'lockversioninfo',
      content:
        React.createElement('p', null,
          React.createElement('button', {
            className: 'btn btn-default',
            onClick: () => util.opn(gamePath.replace(/(\\common\\Skyrim\ Special\ Edition)/gm, '')).catch(() => undefined)
          }, 'Steam Folder'),
          ul(
            'Locking your Skyrim Special Edition(SSE) version will prevent any future SSE updates from breaking the collection.',
            '<br>',
            'To <b><i>lock</i></b> your SSE verion, click the button above to open the folder,',
            'Right click <code>appmanifest_489830.acf</code> and select Properties',
            'Click the <b>Read-only</b> box to check the box and prevent those troublesome updates.',
            'Click Apply then OK',
            '<br>',
            'If you need to roll-back your SSE Version, Press ⊞Win + R (or go to Start > Run) and enter <code>steam://nav/console</code>',
            '<br>',
            'These will download the <b>SSE 1.6.1170</b> files:'),
          React.createElement('div', { style: { marginLeft: '20px', fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }, 'download_depot 489830 489831 8442952117333549665', copyButton('download_depot 489830 489831 8442952117333549665')),
          React.createElement('div', { style: { marginLeft: '20px', fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }, 'download_depot 489830 489832 8042843504692938467', copyButton('download_depot 489830 489832 8042843504692938467')),
          React.createElement('div', { style: { marginLeft: '20px', fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }, 'download_depot 489830 489833 1914580699073641964', copyButton('download_depot 489830 489833 1914580699073641964')),
          ul('for Creation Kit:',),
          React.createElement('div', { style: { marginLeft: '20px', fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }, 'download_depot 1946180 1946182 7716046898922594451', copyButton('download_depot 1946180 1946182 7716046898922594451')),
          React.createElement('div', { style: { marginLeft: '20px', fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }, 'download_depot 1946180 1946183 9161772268289920525', copyButton('download_depot 1946180 1946183 9161772268289920525')),
          ul('<br>',
            'After download the files can be found in SSE Steam path under \\steam\\steamapps\\content\\app_489830',
            `Simply copy/move the files to your SSE folder`
          ),),
    },
    {
      heading: 'New content catalog check',
      id: 'newcontentcatalog',
      content:
        React.createElement('p', null,
          React.createElement('button', {
            className: 'btn btn-default',
            onClick: () => util.opn(path.join(process.env.LOCALAPPDATA, 'Skyrim Special Edition')).catch(() => undefined)
          }, 'Open'),
          ul(
            'The 1.7.x SSE update changed the format of the contentcatalog.txt used to log installed Creations. The new format is incompatible with the 1.6.1170 version of SSE',
            'This will cause a crash while trying to load the game - roughly just after the Bethesda logo appears',
            'Delete the new <code>contentcatalog.txt</code> file and the game will be fine. This file is not required and will be recreated as needed in the correct format if you have downgraded',
          ),),


    },

  ];

}

/*
function SettingsImmersiveSupport({ api }) {  
  const dispatch = useDispatch();  
  const enabled = useSelector(isAutoOpenEnabled);  
  
  const onToggle = () => {  
    dispatch({ type: 'SET_AUTO_OPEN', payload: { value: !enabled } });  
  };  
  
  return React.createElement('form', null,  
    React.createElement(Toggle, { checked: enabled, onToggle }, 'Automatically open Immersive Support on startup')  
  );  
}  */

function isAutoOpenEnabled(state) {
  return state.persistent?.immersiveSupport?.autoOpenEnabled ?? true;
}


function openScreenshotTool() {
  if (process.platform === 'win32') {

    shell.openExternal('ms-screenclip:');
    return;
  }

  if (process.platform === 'linux') {

    // Try tools in order of preference  
    const tools = [
      'flameshot gui',           // cross-desktop, most popular  
      'gnome-screenshot -i',     // GNOME  
      'spectacle -r',            // KDE  
      'xfce4-screenshooter -r',  // XFCE  
      'scrot -s',                // minimal fallback (CLI, no GUI)  
    ];

    function tryNext(index) {
      if (index >= tools.length) return;
      const [cmd, ...args] = tools[index].split(' ');
      exec(`which ${cmd}`, (err) => {
        if (!err) {
          exec(tools[index]);
        } else {
          tryNext(index + 1);
        }
      });
    }

    tryNext(0);
    return;
  }

  // macOS  
  if (process.platform === 'darwin') {
    exec('screencapture -i -c'); // interactive, copies to clipboard  
  }
}

/*==================Main Function================================================================================= 
*
*
*
*                          MAIN COMPONENT
*
*
*
*
===================================================================================================================*/
function GameStatsPage({ api }) {
  const extensionVersion = "1.7.1";
  const vortexVersion = useSelector((state) => state?.app?.appVersion || 'Unknown');
  const activeGameId = useSelector((state) => selectors.activeGameId(state));
  const game = activeGameId ? util.getGame(activeGameId) : null;
  const gameName = game ? game.name : 'Unknown';

  const { useEffect, useState, useRef } = React;
  const rawIniPaths = getIniPaths(activeGameId);
  const displayIniPaths = rawIniPaths.map(displayPath);
  const [refreshKey, setRefreshKey] = React.useState(0);


  const gameInfo = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return state.persistent.gameMode.gameInfo?.[gameId] || {};
  });
  const profile = useSelector((state) => selectors.activeProfile(state));


  const gameDiscovery = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return state?.settings?.gameMode?.discovered?.[gameId] || {};
  });
  const exeVersion = require('exe-version');
  const gamePath = gameDiscovery?.path || 'Not discovered';
  const gameVersion = exeVersion.getProductVersionLocalized(path.join(gamePath, 'SkyrimSE.exe'));

  const steamGame = gamePath.toLowerCase().includes('\\steamapps\\common\\skyrim special edition');
  const mods = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return state?.persistent?.mods?.[gameId] || {};
  });

  const stagingPath = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    const rawPath = selectors.installPathForGame(state, gameId);
    return displayPath(rawPath || 'Not discovered');
  });

  const pendingRef = React.useRef(0);
  const [settled, setSettled] = React.useState(false);

  function beginCheck() {
    pendingRef.current++;
    setSettled(false);
  }
  function endCheck() {
    pendingRef.current--;
    if (pendingRef.current === 0) setSettled(true);
  }

  const knownActivators = {
    'symlink_activator': 'Symlinks',
    'hardlink_activator': 'Hardlinks',
    'move_activator': 'Move Files',
  };

  const activatorId = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return state?.settings?.mods?.activator[gameId] || 'unknown';
  });

  const enabled = useSelector(isAutoOpenEnabled);
  const onToggle = () => dispatch({ type: 'SET_AUTO_OPEN', payload: { value: !enabled } });

  const deploymentMethodLabel = activatorId
    ? (knownActivators[activatorId] ?? activatorId)   // fallback to raw id if unmapped  
    : 'Unknown';

  const [healthAsync, setHealthAsync] = useState({
    updateAvailable: null,
    updateVersion: null,
    iniPresent: false,
    suppressedMap: null,
    aeDLCOwned: null,   // null=checking, true=owned, 'unknown'=no Steam data 
    aeDLCOwnedManual: false,   // true=checked manually
    activatorType: deploymentMethodLabel,
  });

  const pluginList = useSelector(state =>
    (state.session?.plugins?.pluginList) ?? {}
  );

  const fnisAutoRunCheck = useSelector((state) => util.getSafe(state, ['settings', 'fnis', 'autoRun'], false));

  const nativeCount = Object.values(pluginList).filter(p => p.isNative).length;

  healthStatsBad = 0;   // <-- reset count each render. runs at the start of every render 

  // true = full AE, false = not installed, 'partial' = some files missing  
  const aeDLCInstalled =
    nativeCount === 80 ? true :
      nativeCount === 10 ? false :
        nativeCount > 10 ? 'partial' :
          null; // pluginList not loaded yet



  const [contentCatalogCheck, setContentCatalogCheck] = React.useState(null);

  useEffect(() => {
    let cancelled = false;
    beginCheck();
    const catalogPath = path.join(process.env.LOCALAPPDATA || '', 'Skyrim Special Edition', 'contentcatalog.txt');
    const csv2Pattern = /^CSV2_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    async function newContentCatalogCheck() {
      try {
        const data = await nodeFs.promises.readFile(catalogPath, { encoding: 'utf8' });
        const found = data.split(/\r?\n/).some(line => csv2Pattern.test(line.trim()));
        if (!cancelled) endCheck(); setContentCatalogCheck(found);
      } catch (err) {
        if (!cancelled) endCheck(); setContentCatalogCheck(false);
      }
    }

    newContentCatalogCheck();

    return () => { cancelled = true; };
  }, [refreshKey]);

  const acfPath = path.join(gamePath.replace(/(\\common\\Skyrim\ Special\ Edition)/gm, ''), 'appmanifest_489830.acf')

  const [skyrimVersionLocked, setSkyrimVerionLocked] = React.useState(null);

  // --- read-only skyrim check ---
  useEffect(() => {
    let cancelled = false;
    beginCheck();
    (async () => {
      try {
        await nodeFs.promises.access(acfPath, nodeFs.constants.W_OK);
        if (!cancelled) endCheck(); setSkyrimVerionLocked(false);
      } catch (err) {
        if (!cancelled) endCheck(); setSkyrimVerionLocked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // ----- check for ae dlc ownership --- 
  useEffect(() => {
    let cancelled = false;
    beginCheck();
    function extractBracedSection(text, key) {
      // depth-aware brace matching instead of a naive regex
      const keyIdx = text.search(new RegExp(`"${key}"\\s*\\{`, 'i'));
      if (keyIdx === -1) return null;
      const openIdx = text.indexOf('{', keyIdx);
      let depth = 0;
      for (let i = openIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
          depth--;
          if (depth === 0) return text.slice(openIdx + 1, i);
        }
      }
      return null; // unterminated — treat as not found
    }

    async function readWithTimeout(filePath, ms = 3000) {
      return Promise.race([
        fs.readFileAsync(filePath, 'utf8'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);
    }

    async function checkAEOwnership() {

      if (!cancelled) endCheck(); setHealthAsync(p => ({ ...p, aeDLCOwnedManual: false }));

      try {
        // const steamPath = getSteamPath();
        if (!steamPath) {
          if (!cancelled) endCheck(); setHealthAsync(p => ({ ...p, aeDLCOwned: 'unknown' }));
          return;
        }
        const userDataPath = path.join(steamPath, 'userdata');
        let owned = false;

        try {
          const userIds = await fs.readdirAsync(userDataPath);
          for (const userId of userIds) {
            const localConfigPath = path.join(userDataPath, userId, 'config', 'localconfig.vdf');
            try {
              let data = await readWithTimeout(localConfigPath);
              if (data.charCodeAt(0) === 0xfeff) data = data.slice(1); // strip BOM
              const section = extractBracedSection(data, 'apptickets');
              if (section && /"1746860"/.test(section)) {
                owned = true;
                break;
              }
            } catch (err) {
              if (err.code && err.code !== 'ENOENT') {
                console.warn(`AE ownership check: unexpected error reading ${localConfigPath}`, err);
              }
            }
          }
        } catch (err) {
          if (err.code && err.code !== 'ENOENT') {
            console.warn('AE ownership check: unexpected error listing userdata', err);
          }
        }

        if (!owned) {
          try {
            const logPath = path.join(steamPath, 'logs', 'appinfo_log.previous.txt');
            const logData = await readWithTimeout(logPath);
            if (logData.includes('1746860=')) owned = true;
          } catch { /* diagnostic fallback unavailable, ignore */ }
        }

        if (!cancelled) endCheck(); {
          setHealthAsync(p =>
            p.aeDLCOwnedManual ? p : { ...p, aeDLCOwned: owned ? true : 'unknown' }
          );
        }
      } catch {
        if (!cancelled) endCheck(); setHealthAsync(p => (p.aeDLCOwnedManual ? p : { ...p, aeDLCOwned: 'unknown' }));
      }
    }

    checkAEOwnership();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const creationsExpected = healthAsync.aeDLCOwned === true ? 80 : 10;



  const totalModsInstalled = Object.values(mods).filter(
    m => m.type !== 'collection' && m.state === 'installed'
  ).length;

  const [hardwareInfo, setHardwareInfo] = React.useState({
    cpu: 'Loading...',
    ram: 'Loading...',
    gpu: 'Loading...',
    os: 'Loading...',
  });

  React.useEffect(() => {
    let cancelled = false;
    beginCheck();
    const { exec } = require('child_process');
    // OS  
    getOSFlavor().then(flavor =>
      setHardwareInfo(prev => ({ ...prev, os: flavor }))
    );

    // CPU — synchronous  
    const cpus = os.cpus();
    if (cpus && cpus.length > 0) {
      setHardwareInfo(prev => ({ ...prev, cpu: cpus[0].model.trim() }));
    }

    // RAM — synchronous  
    const totalRam = os.totalmem();
    setHardwareInfo(prev => ({ ...prev, ram: (totalRam / (1024 ** 3)).toFixed(1) + ' GB' }));

    // GPU
    if (process.platform === 'win32') {
      // Will work for Wine or Windows  
      let cancelled = false;

      getGpuList().then((list) => {
        if (cancelled) return;
        setHealthAsync((p) => ({ ...p, gpu: list }));
      });
    }
    return () => { cancelled = true; };

  }, []);


  function getOSFlavor() {
    return new Promise((resolve) => {
      if (process.env.WINEPREFIX || process.env.WINELOADER) {
        // Wine on Linux — check this BEFORE the win32 branch  
        nodeFs.readFile('Z:\\run\\host\\etc\\os-release', 'utf8', (err, data) => {
          if (err) {
            nodeFs.readFile('Z:\\proc\\version', 'utf8', (err2, vdata) => {
              if (err2) return resolve('Linux (via Wine)');
              const match = vdata.match(/Linux version (\S+)/);
              resolve(match ? `Linux ${match[1]} (via Wine)` : 'Linux (via Wine)');
            });
            return;
          }
          const match = data.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
          resolve(match ? `${match[1]} (via Wine)` : 'Linux (via Wine)');
        });
      } else if (process.platform === 'win32') {
        exec(
          'powershell -NoProfile -Command "(Get-WmiObject Win32_OperatingSystem).Caption"',
          (err, stdout) => {
            if (err || !stdout.trim()) {
              resolve(`Windows (${require('os').release()})`);
            } else {
              resolve(stdout.trim().replace('Microsoft ', ''));
            }
          }
        );
      } else if (process.platform === 'linux') {
        nodeFs.readFile('/etc/os-release', 'utf8', (err, data) => {
          if (err) return resolve(`Linux (${require('os').release()})`);
          const match = data.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
          resolve(match ? match[1] : `Linux (${require('os').release()})`);
        });
      } else {
        resolve(`${require('os').type()} ${require('os').release()}`);
      }
    });
  }

  //for health checks
  const suppressedNotifications = useSelector((state) =>
    state.settings.notifications.suppress ?? {}
  );
  const activeNotifications = useSelector((state) =>
    state.session.notifications.notifications || []
  );
  const needToDeploy = useSelector((state) =>
    state.persistent?.deployment?.needToDeploy?.[activeGameId] === true
  );

  const [manifest, setManifest] = React.useState(null);

  useEffect(() => {
    let cancelled = false;
    beginCheck();

    async function fetchManifest() {
      try {
        const result = await util.getManifest(api, undefined, activeGameId);
        if (!cancelled) endCheck(); setManifest(result);
      } catch (err) {
        if (!cancelled) endCheck(); setManifest(null);
      }
    }

    fetchManifest();

    return () => { cancelled = true; };
  }, [activeGameId, refreshKey]); // add refreshKey if you want manual re-check support  

  const deployedFileCount = manifest?.files?.length ?? null;
  const isDeployed = deployedFileCount !== null && !needToDeploy && deployedFileCount > 0;


  const loadOrder = useSelector((state) => state.loadOrder || {});
  const primaryToolId = useSelector((state) =>
    state.settings?.interface?.primaryTool?.[activeGameId] ?? null
  );
  const primaryToolPath = useSelector((state) =>
    state.settings?.gameMode?.discovered?.[activeGameId]?.tools?.[primaryToolId]?.path
  );
  const isSKSEPrimary = primaryToolPath
    ? path.basename(primaryToolPath).toLowerCase() === 'skse64_loader.exe'
    : false;

  const discoveredTools = useSelector((state) =>
    state.settings?.gameMode?.discovered?.[activeGameId]?.tools ?? {}
  );

  const toolList = Object.values(discoveredTools)
    .filter(tool => tool.path != null && tool.hidden !== true)
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));

  const MAX_VISIBLE_TOOLS = 5;
  const [toolsExpanded, setToolsExpanded] = React.useState(false);

  const visibleTools = toolsExpanded ? toolList : toolList.slice(0, MAX_VISIBLE_TOOLS);

  const spaceUsed = gameInfo?.size?.value;
  const spaceNoLinks = gameInfo?.size_nolinks?.value;

  const [driveInfo, setDriveInfo] = useState({ game: null, system: null });

  useEffect(() => {
    if (!gamePath || gamePath === 'Not discovered') return;

    const systemRoot = process.platform === 'win32'
      ? (process.env.SystemDrive || 'C:') + '\\'
      : '/';

    setDriveInfo({
      game: getDriveInfo(gamePath),
      system: getDriveInfo(systemRoot),
    });
  }, [gamePath, refreshKey]);

  // Format with Vortex's built-in formatter  
  const spaceUsedStr = spaceUsed != null ? util.bytesToString(spaceUsed) : 'Calculating...';
  const spaceNoLinksStr = spaceNoLinks != null ? util.bytesToString(spaceNoLinks) : 'Calculating...';


  const [runtimeInfo, setRuntimeInfo] = useState({ vcx64: null, vcx86: null, }); //dotnet: null });  

  useEffect(() => {
    const vcx64 = getVcppVersion('x64');
    const vcx86 = getVcppVersion('x86');
    setRuntimeInfo(prev => ({ ...prev, vcx64, vcx86 }));

  }, []);

  // const pluginList = useSelector((state) => state?.session?.plugins?.pluginList || {});
  const pluginInfo = useSelector((state) => state?.session?.plugins?.pluginInfo || {});



  // State to track if game path is on removable drive  
  const [isRemovable, setIsRemovable] = useState(false);

  // Check if game path is on removable drive  
  useEffect(() => {
    if (!gameDiscovery?.path) return;

    const checkRemovable = async () => {
      if (!winapi) return;
      try {
        const volume = winapi.GetVolumePathName(gamePath);

        const drivelist = require('drivelist').list;
        const disks = await drivelist();

        const disk = disks.find(d =>
          d.mountpoints && d.mountpoints.some(mp => mp.path === volume)
        );

        if (!disk) {
          setIsRemovable(false);
          return;
        }

        // drivelist device is usually \\.\PHYSICALDRIVE#
        const diskNumber = disk.device.match(/PHYSICALDRIVE(\d+)/i)?.[1];

        if (diskNumber === undefined) {
          setIsRemovable(false);
          return;
        }

        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        // Better as long as the user has PowerShell available (Windows 7+). For Wine we need a better solution.
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "Get-Disk -Number ${diskNumber} | Select-Object -ExpandProperty BusType"`
        );

        setIsRemovable(stdout.trim() === 'USB');

      } catch (err) {
        setIsRemovable(false);
      }
    };


    checkRemovable();
  }, [gameDiscovery?.path]);



  // Check if the welcome notification has been suppressed  
  const isSuppressed = useSelector((state) =>
    state?.settings?.notifications?.suppress?.['game-stats-welcome'] === true
  );

  const isImmersiveCollectionEnabled = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    const profile = selectors.activeProfile(state);
    if (!gameId || !profile) return false;

    const mods = state.persistent.mods[gameId] || {};
    const modState = profile.modState || {};

    return Object.values(mods).some((mod) => {
      if (mod.type !== 'collection') return false;
      const name = (mod.attributes?.customFileName ?? mod.attributes?.name ?? '').toLowerCase();
      return name.includes('immersive') && name.includes('adult')
        && modState[mod.id]?.enabled === true;
    });
  });

  const hasShownWelcome = useRef(false);
  const welcomeSeen = true; //useSelector(state => state?.settings?.immersiveSupport?.welcomeSeen ?? false);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!welcomeSeen && isImmersiveCollectionEnabled && !hasShownWelcome.current) {
      hasShownWelcome.current = true;  // set before showing to prevent double-fire  
      showWelcomeDialog();
    }
  }, [isSuppressed, isImmersiveCollectionEnabled, api, welcomeSeen]);

  const showWelcomeDialog = () => {
    api.showDialog(
      'info',
      'Welcome to Immersive Support',
      {
        htmlText: '<style>'
          + '#game-stats-welcome { display: flex !important; align-items: center; }'
          + '#game-stats-welcome .modal-dialog { margin: auto !important; height: auto !important; }'
          + '#game-stats-welcome .dialog-container { min-height: 0 !important; }'
          + '#game-stats-welcome .dialog-content-html { flex: 0 0 auto !important; font-size: 14px !important; line-height: 1.4em !important; }'
          + '</style>'
          + '<h4 style="margin-top:0">Important things to remember for I&amp;A:</h4>'
          + '<br><br>'
          + '<ul style="margin:0;padding-left:20px;list-style-type:disc">'
          + '<li>Profiles are not separate</li>'
          + '<ul style="margin:0;padding-left:20px;list-style-type:circle">'
          + '<li>Old mods or collections in other profiles will almost always prevent the collection from starting correctly</li>'
          + '</ul></li>'
          + '<li>You don\'t need to run any tools — this has been done for you</li>'
          + '<li>The collection uses <b>BHUNP</b> as a body mod</li>'
          + '<li>The collection uses <b>OBody</b> to change body shape'
          + '<ul style="margin:0;padding-left:20px;list-style-type:circle">'
          + '<li>Simply <b>press "O"</b> while targeting a female NPC or no target to change your PC body</li>'
          + '</ul></li>'
          + '<li>Do not use the body sliders in character creation/racemenu</li>'
          + '<li>Ostim scenes are controlled using the numpad <a href="https://staticdelivery.nexusmods.com/mods/1704/images/160440/160440-1777391906-681226431.png" target="_blank">keybinds</a>'
          + '<ul style="margin:0;padding-left:20px;list-style-type:circle">'
          + '<li>Check the Ostim MCM for details or to change keybinds</li>'
          + '</ul></li>'
          + '<li>The collection uses Pandora for animations — FNIS or Nemesis should not be installed or run</li>'
          + '</ul>'
          + '<br><br>'
          + '<h4 style="margin-bottom:0"><strong>Screenshot everything above the Troubleshooting section for the Discord Support Team</strong></h4>',
        checkboxes: [
          {
            id: 'dont_show_again',
            value: false,
            text: "Don't show this again",
          },
        ],
      },
      [{ label: 'Got it' }],
      'game-stats-welcome'
    ).then((result) => {
      if (result.input['dont_show_again']) {
        const dismissWelcome = () => dispatch({ type: 'SET_WELCOME_SEEN', payload: true });

      }
    });
  }


  const updateChannel = useSelector(state => state.settings?.update?.channel ?? 'stable');

  // Separate useEffect that check the github repo API. rate limit 60/IP per hour
  useEffect(() => {
    const currentVersion = util.getApplication().version;
    const channel = updateChannel;

    util.github.releases()
      .then(releases => {
        // Filter based on channel: include prereleases only on beta channel  
        const candidates = releases.filter(rel =>
          channel !== 'stable' ? true : !rel.prerelease
        );

        // Find the newest release that is newer than the current version  
        const latest = candidates
          .filter(rel => semver.valid(rel.name) && semver.gt(rel.name, currentVersion))
          .sort((a, b) => semver.compare(b.name, a.name))[0];

        setHealthAsync(p => ({
          ...p,
          updateAvailable: latest !== undefined,
          updateVersion: latest?.name ?? null,
        }));
      })
      .catch(() => {
        setHealthAsync(p => ({ ...p, updateAvailable: false, updateVersion: null }));
      });
  }, []);

  useEffect(() => {
    const checkIniFiles = async () => {
      try {
        const results = await Promise.all(
          rawIniPaths.map(async (p) => {
            try {
              const stats = await fs.statAsync(p);
              return stats.size > 0;
            } catch {
              return false;
            }
          })
        );

        const statusMap = rawIniPaths.reduce((acc, path, index) => {
          acc[path] = results[index];
          return acc;
        }, {});


        setHealthAsync((p) => ({
          ...p,
          iniPresent: statusMap
        }));

      } catch (error) {
        console.error("Error checking INI files:", error);
        // Ensure state is never null in case of error
        setHealthAsync((p) => ({ ...p, iniPresent: {} }));
      }
    };

    checkIniFiles();
  }, [activeGameId, refreshKey]);

  /*  useEffect(() => {
      // --- INI files present ---  
      const checkIniFiles = async () => {
        const results = await Promise.all(
          iniPaths.map(p =>
            fs.statAsync(p)
              .then((stats) => stats.size > 0)
              .catch(() => false)
          )
        );
        console.log('====INI file check results:', results);
        const iniOk = iniPaths.length > 0 && results.every(r => r === true);
        setHealthAsync((p) => ({ ...p, iniPresent: results }));
      };
  
      checkIniFiles();
    }, [activeGameId, refreshKey]); */

  // Deployment  


  const pluginsSorted = useSelector((state) =>
    state?.persistent?.immersiveSupport?.pluginsSorted === true
  );

  // Game launched  
  const gameLaunched = rawIniPaths.every((p) => healthAsync.iniPresent[p] === true);

  // OneDrive in INI path  
  const hasOneDrive = rawIniPaths.some((p) => p.toLowerCase().includes('onedrive'));

  // Vortex update pending (non-beta)  
  const updatePending = healthAsync.updateAvailable === true;

  // SKSE64 as primary tool  
  // Tool IDs from script-extender-installer gameSupport.ts  
  const xseToolIdMap = {
    skyrim: 'skse', skyrimse: 'skse64', skyrimvr: 'sksevr',
    fallout4: 'f4se', fallout4vr: 'F4SEVR', falloutnv: 'nvse',
  };
  const expectedXseId = xseToolIdMap[activeGameId];
  const isXsePrimary = expectedXseId
    ? primaryToolId === expectedXseId
    : primaryToolId !== null;

  // const skseToolId = skseToolIdMap[activeGameId];
  const xseTool = expectedXseId ? discoveredTools[expectedXseId] : undefined;

  // Determine status  

  let xseStatus = null;  // no flags = configured  
  if (!expectedXseId) {
    xseStatus = null;  // not a Skyrim variant — don't show the row at all  
  } else if (!xseTool || !xseTool.path) {
    xseStatus = 'not installed';
  } else if (xseTool.hidden) {
    xseStatus = 'hidden';
  }

  // Check if the binary actually exists at the expected location  
  const xseExecutable = xseTool?.path?.replace(/^.*[\\/]/, '') ?? null;
  const expectedXsePath = gamePath && xseExecutable ? path.join(gamePath, xseExecutable) : null;

  // You need to do this check asynchronously  
  const [xseExistsAtExpected, setXseExistsAtExpected] = useState(false);
  const [xseExistsAtStored, setXseExistsAtStored] = useState(false);

  //// attempt at checking xse
  useEffect(() => {
    if (!expectedXsePath) return;
    fs.statAsync(expectedXsePath)
      .then(() => setXseExistsAtExpected(true))
      .catch(() => setXseExistsAtExpected(false));

    if (xseTool?.path) {
      fs.statAsync(xseTool.path)
        .then(() => setXseExistsAtStored(true))
        .catch(() => setXseExistsAtStored(false));
    } else {
      setXseExistsAtStored(false); // ← reset when path is gone  
    }
  }, [expectedXsePath, xseTool?.path, refreshKey]);


  const [rawUnmanaged, setRawUnmanaged] = useState({ plugins: [], animations: [], meshes: [], textures: [], dlls: [], loading: true });
  const unmanagedFiles = React.useMemo(() => ({
    ...rawUnmanaged,
    plugins: rawUnmanaged.plugins.filter(f => !pluginList[f.name.toLowerCase()]?.isNative),
  }), [rawUnmanaged, pluginList]);

  const dataPath = path.join(gamePath, 'Data');

  useEffect(() => {
    if (!gamePath || gamePath === 'Not discovered') return;
    setRawUnmanaged(prev => ({ ...prev, loading: true }));
    function walkUnmanaged(dirPath, maxDepth) {
      if (maxDepth <= 0) return Promise.resolve([]);
      return fs.readdirAsync(dirPath)
        .then(entries => Promise.all(
          entries.map(entry => {
            if (filesToSkip.has(entry)) return Promise.resolve([]);
            const fullPath = path.join(dirPath, entry);
            return fs.statAsync(fullPath)
              .then(stats => {
                if (stats.isDirectory()) return walkUnmanaged(fullPath, maxDepth - 1);
                return stats.nlink <= 1
                  ? [{ name: entry, parentDir: path.basename(dirPath) }]
                  : [];
              })
              .catch(() => []);
          })
        ))
        .then(results => [].concat(...results))
        .catch(() => []);
    }

    const scanPlugins = walkUnmanaged(dataPath, 1)
      .then(files => files.filter(f =>
        ['.esp', '.esm', '.esl'].includes(path.extname(f.name).toLowerCase()))
      );


    const scanDlls = walkUnmanaged(path.join(dataPath, 'SKSE', 'Plugins'), 1).then(files =>
      files.filter(f => path.extname(f.name).toLowerCase() === '.dll')
    );

    const scanTextures = walkUnmanaged(path.join(dataPath, 'textures'), 10).then(files =>
      files.filter(f => ['.dds', '.png'].includes(path.extname(f.name).toLowerCase()))
    );

    const scanMeshesAndAnims = walkUnmanaged(path.join(dataPath, 'meshes'), 10)
      .then(files => {
        const meshes = [];
        const animations = [];
        files.forEach(f => {
          const ext = path.extname(f.name).toLowerCase();
          if (ext === '.hkx' || ext === '.hkb' || f.parentDir.toLowerCase() === 'animations') {
            animations.push(f);
          } else {
            meshes.push(f);
          }
        });
        return { meshes, animations };
      })
      .catch(() => ({ meshes: [], animations: [] }));

    Promise.all([scanPlugins, scanDlls, scanTextures, scanMeshesAndAnims])
      .then(([plugins, dlls, textures, meshesAndAnims]) => {
        setRawUnmanaged({
          plugins,
          dlls,
          textures,
          meshes: meshesAndAnims.meshes,
          animations: meshesAndAnims.animations,
          loading: false,
        });
      })
      .catch(() => {
        setRawUnmanaged(prev => ({ ...prev, loading: false }));
      });


  }, [gamePath, activeGameId, refreshKey]);


  const totalUnmanaged = unmanagedFiles.plugins.length + unmanagedFiles.dlls.length +
    unmanagedFiles.textures.length + unmanagedFiles.meshes.length + unmanagedFiles.animations.length;
  const hasUnmanagedFiles = !unmanagedFiles.loading && totalUnmanaged > 0;

  // FNIS or Nemesis installed and enabled  
  const hasFnisOrNemesisMods = Object.entries(mods).some(([modId, mod]) => {
    const name = (mod.attributes?.name || mod.id || '').toLowerCase();
    const isBad =
      name.includes('fnis data') ||
      name.includes('fores new idles') ||
      name.includes('nemesis unlimited behavior engine') ||
      name.includes('nemesis behavior engine');
    
    const isEnabled = profile?.modState?.[modId]?.enabled === true;
    console.log('====FNIS check: ',`isBad: ${isBad} & isEnabled: ${isEnabled}`)
    return isBad && isEnabled;
  });

  const fnisAutoRunEnabled = fnisAutoRunCheck;
  const fnisOrNemesisDetected = hasFnisOrNemesisMods || fnisAutoRunEnabled;

  // Suppressed notifications
  const suppressedIds = Object.keys(suppressedNotifications)
    .filter(id => suppressedNotifications[id] === true);
  const suppressedCount = suppressedIds.length;


  const knownLabels = {
    'test-master-missing': 'Missing masters',
    'test-rules-unfulfilled': 'Plugin dependencies not fulfilled',
    'test-global-files': 'INI files missing',
    'test-oblivion-fonts': 'Missing Oblivion fonts',
    'test-skyrim-fonts': 'Missing Skyrim fonts',
    'game-stats-welcome': 'Welcome dialog',

  };

  // Cross-reference with active notifications for severity (best-effort — dismissed ones show 'unknown')  
  const suppressedWithType = suppressedIds.map(id => {

    const notif = activeNotifications.find(n => n.id === id);
    return {
      id,
      label: notif?.message ?? knownLabels[id] ?? id,  // falls back to raw ID if not active  
      type: notif?.type ?? 'unknown',
    };
  });

  const tooltipText = suppressedWithType
    .map(n => n.label)
    .join('\n');


  // Build a map of modId -> [{ coll, type }, ...]  
  const collectionMap = React.useMemo(() => {
    const map = {};
    Object.values(mods).filter(m => m.type === 'collection').forEach(coll => {
      (coll.rules || []).forEach(rule => {
        const refId = rule.reference?.id;
        const entry = { coll, type: rule.type }; // 'requires' | 'recommends'  
        if (refId !== undefined) {
          if (!map[refId]) map[refId] = [];
          map[refId].push(entry);
        } else {
          const installed = util.findModByRef(rule.reference, mods);
          if (installed !== undefined) {
            if (!map[installed.id]) map[installed.id] = [];
            map[installed.id].push(entry);
          }
        }
      });
    });
    return map;
  }, [mods, refreshKey]);

  const enabledModIds = Object.keys(profile?.modState || {}).filter(
    (modId) => profile.modState[modId]?.enabled === true
  );
  const enabledModsCount = enabledModIds.length;
  const regularMods = Object.values(mods).filter(m => m.type !== 'collection');
  const disabledCount = regularMods.filter(m =>
    m.state === 'installed' && profile?.modState?.[m.id]?.enabled !== true
  ).length;

  const collectionCounts = {}; // name -> { total, required, optional }  
  let noneCount = 0;
  enabledModIds.forEach(modId => {
    const modColls = collectionMap[modId];
    if (!modColls || modColls.length === 0) {
      noneCount++;
    } else {
      modColls.forEach(({ coll, type }) => {
        const name = util.renderModName(coll) || coll.id;
        if (!collectionCounts[name]) {
          collectionCounts[name] = { total: 0, required: 0, optional: 0 };
        }
        collectionCounts[name].total++;
        if (type === 'requires') {
          collectionCounts[name].required++;
        } else {
          collectionCounts[name].optional++;
        }
      });
    }
  });

  //Get plugin details for the current game

  const eslGames = ['skyrimse', 'skyrimvr', 'fallout4', 'fallout4vr', 'starfield'];
  const eslGame = eslGames.includes(activeGameId);

  const isActive = (id) =>
    loadOrder[id]?.enabled === true || pluginList[id]?.isNative === true;

  // A plugin is disabled if it exists on disk, is not native, and is not active  
  const disabledPlugins = React.useMemo(() => Object.keys(pluginList).filter(
    (id) => !pluginList[id]?.isNative && !isActive(id)
  ), [pluginList, loadOrder, refreshKey]);

  const isValid = (id) =>
    (pluginList[id]?.deployed === true || pluginList[id]?.isNative === true) && isActive(id);

  const [pluginHeaders, setPluginHeaders] = React.useState({});

  const isLight = (id) => {
    if (pluginInfo[id]?.isLight) {
      return true
    };
    const filePath = pluginList[id]?.filePath || '';
    if (filePath.toLowerCase().endsWith('.esl')) return true;
    return pluginHeaders[id] === true;
  };

  useEffect(() => {
    if (!gamePath || gamePath === 'Not discovered') return;
    const dataPath = path.join(gamePath, 'Data');
    const ids = Object.keys(pluginList).filter(id =>
      pluginList[id]?.deployed || pluginList[id]?.isNative
    );
    Promise.all(
      ids.map(id => {
        const filePath = pluginList[id]?.filePath || path.join(dataPath, id);
        return readPluginLightFlag(filePath)
          .then(isLight => [id, isLight])
          .catch(() => [id, false]);
      })
    ).then(results => {
      setPluginHeaders(Object.fromEntries(results));
    });
  }, [gamePath, activeGameId, refreshKey]);


  const activePlugins = React.useMemo(() => Object.keys(pluginList).filter(isValid), [pluginList, loadOrder, refreshKey]);
  const lightPlugins = React.useMemo(() => eslGame ? activePlugins.filter(isLight) : [], [activePlugins, pluginInfo, pluginHeaders, refreshKey]);
  const regularPlugins = React.useMemo(() => activePlugins.filter((id) => !isLight(id)), [activePlugins, pluginInfo, pluginHeaders, refreshKey]);
  const missingMasters = React.useMemo(() => {
    const activeSet = new Set(activePlugins.map(id => id.toLowerCase()));
    const result = {};
    activePlugins.forEach(id => {
      const masters = pluginHeaders[id]?.masterList ?? [];
      const missing = masters.filter(m => !activeSet.has(m.toLowerCase()));
      if (missing.length > 0) result[id] = missing;
    });
    return result;
  }, [activePlugins, pluginHeaders, refreshKey]);

  const regularLimit = eslGame ? 254 : 255;
  const lightLimit = 4096;

  const profileName = profile?.name || 'None';

  const { shallowEqual } = require('react-redux');

  // Get profiles for the current game  
  const gameProfiles = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    const allProfiles = state.persistent.profiles || {};
    return Object.keys(allProfiles)
      .filter((id) => allProfiles[id].gameId === gameId)
      .map((id) => allProfiles[id]);
  }, shallowEqual);

  // Get enabled mod count for each profile  
  const profileModCounts = useSelector((state) => {
    const counts = {};
    gameProfiles.forEach((profile) => {
      const mods = state.persistent.mods[profile.gameId] || {};
      counts[profile.id] = Object.keys(profile.modState || {})
        .filter(id => profile.modState[id]?.enabled && mods[id]?.state === 'installed')
        .length;
    });
    return counts;
  }, shallowEqual);

  const gameProfileCount = gameProfiles.length;

  const installedCollections = Object.values(mods).filter(
    (mod) => mod.type === 'collection' && mod.state === 'installed'
  );
  const collectionCount = installedCollections.length;

  function showUnmanagedDialog() {
    const categories = [
      { label: 'Plugins', files: unmanagedFiles.plugins },
      { label: 'DLLs', files: unmanagedFiles.dlls },
      { label: 'Textures', files: unmanagedFiles.textures },
      { label: 'Meshes', files: unmanagedFiles.meshes },
      { label: 'Animations', files: unmanagedFiles.animations },
    ].filter(cat => cat.files.length > 0);

    const htmlContent = categories.length > 0
      ? categories.map(cat =>
        `<h4 style="margin:8px 0 4px">${cat.label} (${cat.files.length})</h4>`
        + `<ul style="margin:0;padding-left:20px">`
        + cat.files.map(f => `<li>${f.parentDir}\\${f.name}</li>`).join('')
        + `</ul>`
      ).join('')
      : '<p>No unmanaged files detected.</p>';

    api.showDialog(
      'info',
      `Unmanaged Files in ${gamePath}\\Data`,
      {
        htmlText: '<style>'
          + '#game-stats-unmanaged { display: flex !important; align-items: center; }'
          + '#game-stats-unmanaged .modal-dialog { margin: auto !important; height: auto !important; }'
          + '#game-stats-unmanaged .dialog-container { min-height: 0 !important; }'
          + '#game-stats-unmanaged .dialog-content-html { flex: 0 0 auto !important; font-size: 14px !important; line-height: 1.4em !important; }'
          + '</style>'
          + htmlContent
      },
      [{ label: 'Close' }],
      'game-stats-unmanaged'
    );
  }

  const faqItems = buildFaqItems(api, gamePath);

  //=========================== Render the page  ==========================================================

  return React.createElement(MainPage, null,
    React.createElement(MainPage.Header, null,
      // Left button group
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        React.createElement('button', {
          className: 'btn btn-default',
          onClick: () => util.opn(skyrimLogsPath).catch(() => undefined)
        }, 'Skyrim Logs'),
        React.createElement('button', {
          className: 'btn btn-default',
          onClick: () => util.opn(vortexLogsPath).catch(() => undefined)
        }, 'Vortex Logs'),
        React.createElement('button', {
          className: 'btn btn-default',
          onClick: () => util.opn(gamePath).catch(() => undefined)
        }, 'Game Folder'),
      ),
      // spacer — pushes everything after it to the right  
      React.createElement('div', { className: 'flex-fill' }),

      //Right button group
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        React.createElement('button', {
          onClick: openScreenshotTool,
          className: 'btn btn-default btn-s',
          title: '⊞Win + Shift + S',
        }, 'Take Screenshot'),
        React.createElement('button', {
          className: 'btn btn-default',
          style: { display: 'flex', alignItems: 'center' },
          onClick: () => util.opn('https://discord.gg/immersive-collections').catch(() => undefined)
        },
          React.createElement('svg', {
            viewBox: '0 0 24 24',
            width: '16',
            height: '16',
            style: { marginRight: '4px', fill: 'currentColor', flexShrink: 0 }
          },
            React.createElement('path', { d: discordIconPath })
          ),
          'Immersive Discord'
        ),
        React.createElement('button', {
          className: 'btn btn-default',
          onClick: showWelcomeDialog
        }, 'Tips'),
        React.createElement('div', { style: { marginBottom: '-6px' } },
          React.createElement('span', { title: 'Make Immersive Support the default tab' },
            React.createElement(Toggle, { checked: enabled, onToggle }, 'Automatically open')
          ),
        ),
      ),

    ),
    React.createElement(MainPage.Body, null,
      React.createElement('div', { style: { padding: '20px', overflowY: 'auto', height: '100%' } },

        // Orange box wrapping everything EXCEPT the FAQ  
        React.createElement('div', {
          style: {
            border: '2px solid orange',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '24px',
            position: 'relative',
          }
        },
          React.createElement('h2', null, 'Support Stats - Immersive Support'),
          row('v' + extensionVersion),
          row('Vortex Version: ', vortexVersion),
          React.createElement('div', {
            style: {
              position: 'absolute',
              top: '12px',
              right: '12px',
              textAlign: 'left',
              fontSize: '12px',
              opacity: 0.75,
              lineHeight: '1.6',
            }
          },
            React.createElement('div', null,
              React.createElement('strong', null, ' OS: '),
              hardwareInfo.os,
            ),
            React.createElement('div', null,
              React.createElement('strong', null, 'CPU: '),
              hardwareInfo.cpu
            ),
            React.createElement('div', null,
              React.createElement('strong', null, 'RAM: '),
              hardwareInfo.ram
            ),

            React.createElement('div', { style: { display: 'flex', whiteSpace: 'pre' } },
              React.createElement('strong', null, 'GPU: '),
              React.createElement('div', null,
                formatGpuList(healthAsync.gpu ?? [])),
            ),
          ),
          React.createElement('hr', null),

          React.createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start' } },

            // Column 1: Path/folder data
            React.createElement('div', { style: { flex: '1' } },
              React.createElement('div', { style: { marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('strong', null, 'Active Game: '),
                `${gameName} (${gameVersion}`,
                skyrimVersionLocked !== null
                  ? React.createElement('span', { style: { marginBottom: '5px', marginLeft: '0px', marginRight: '0px' } }, locked(skyrimVersionLocked, skyrimVersionLocked ? 'Skyrim version locked' : 'Skyrim version unlocked'))
                  : null,
                React.createElement('span', { style: { marginBottom: '5px', marginLeft: '-3px' } }, moreInfo('lockversioninfo', 'Game version tips'), ' )'),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: healthAsync.aeDLCOwned === true,
                    onChange: (e) => {
                      const checked = e.target.checked;
                      setHealthAsync(p => ({ ...p, aeDLCOwned: checked ? true : 'unknown', aeDLCOwnedManual: true }));
                    },
                    style: { marginRight: '6px', verticalAlign: 'middle' },
                  }),
                  React.createElement('span', { style: { position: 'relative', top: '3px' } },
                    'AE DLC Owned ',
                    React.createElement('span', {
                      style: { fontSize: '0.8em', color: '#888', marginLeft: '4px' },
                    }, healthAsync.aeDLCOwnedManual ? '(manual)' : '(auto)')
                  )
                )),
              row('Game Path: ', includeWarning(gamePath, steamGame, (isRemovable ? '(Removable)' : null))),
              row('Staging Folder: ', stagingPath || 'Not configured'),
              React.createElement('div', { style: { marginBottom: '10px' } },
                React.createElement('strong', null, 'INI Files:'),
                rawIniPaths.length > 0
                  ? React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                    ...rawIniPaths
                      .filter(p => healthAsync.iniPresent[p])
                      .map(p => React.createElement('li', { key: p }, displayPath(p)))
                  )
                  : React.createElement('span', null, ' Not available'),
                React.createElement('div', null,
                  // React.createElement('strong', null, 'Discovered Tools'),
                  expectedXseId !== undefined
                    ? React.createElement('div', { style: { marginBottom: '4px' } },
                      React.createElement('strong', null, 'SKSE: '),
                      xseExistsAtExpected
                        ? React.createElement('span', { style: { marginLeft: '4px' } }, expectedXsePath, copyButton(expectedXsePath))

                        /* ? React.createElement('span', {
                           style: { cursor: 'pointer', opacity: 0.8 },
                           title: 'Click to copy path',
                           onClick: () => { 
                             navigator.clipboard.writeText(expectedXsePath);
                             api.sendNotification({ type: 'success', message: 'SKSE path copied', displayMS: 2000 });
                           }
                         }, expectedXsePath) */
                        : xseExistsAtStored
                          ? React.createElement('span', { style: { marginLeft: '4px' } }, expectedXsePath, copyButton(xseTool.path))
                          : React.createElement('span', { style: { opacity: 0.6 } }, 'Not found'),
                      xseStatus === 'hidden'
                        ? React.createElement('span', {
                          style: {
                            marginLeft: '6px',
                            opacity: 0.6,
                            fontSize: '0.85em',
                            fontStyle: 'italic',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          },
                          title: 'Click to restore this tool',
                          onClick: () => {
                            const store = api.store;

                            // Step 1: Un-hide the tool (sets hidden: false)  
                            store.dispatch(actions.setToolVisible(activeGameId, expectedXseId, true));

                            // Step 2: Clear the custom flag so re-discovery can update the path  
                            store.dispatch(actions.addDiscoveredTool(
                              activeGameId,
                              expectedXseId,
                              { ...xseTool, custom: false, hidden: false },
                              false
                            ));

                            // Step 3: Trigger re-discovery to find the actual current path  
                            api.emitAndAwait('discover-tools', activeGameId)
                              .then(() => {
                                api.sendNotification({
                                  type: 'success',
                                  message: 'SKSE tool restored and path refreshed',
                                  displayMS: 3000,
                                });
                              });
                          }
                        }, '(hidden — click to restore!)')
                        : xseStatus
                          ? React.createElement('span', {
                            style: { marginLeft: '6px', opacity: 0.6, fontSize: '0.85em', fontStyle: 'italic' }
                          }, `(${xseStatus})`)
                          : null
                    )
                    : null,

                )
              ),
            ),
            // Column 2  
            React.createElement('div', { style: { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px' } },
              React.createElement('div', null,
                row('Game Drive Free - ', driveInfo.game
                  ? `${driveInfo.game.root} — ${driveInfo.game.freeGB.toFixed(1)} GB free of ${driveInfo.game.totalGB.toFixed(1)} GB`
                  : 'Unknown'
                ),
                row('System Drive Free - ', driveInfo.system
                  ? `${driveInfo.system.root} — ${driveInfo.system.freeGB.toFixed(1)} GB free of ${driveInfo.system.totalGB.toFixed(1)} GB`
                  : 'Unknown'
                ),
                React.createElement('span', { style: { fontWeight: 'bold' } }, `Space Used (${deploymentMethodLabel}): `),
                React.createElement('span', null, spaceUsedStr)
              ),
              React.createElement('div', null,
                React.createElement('span', { style: { fontWeight: 'bold' } }, 'Space Used (No Links): '),
                React.createElement('span', null, spaceNoLinksStr)
              ),
              healthRow('VC++ x64', isVcppCurrent(runtimeInfo.vcx64), runtimeInfo.vcx64),
              healthRow('VC++ x86', isVcppCurrent(runtimeInfo.vcx86), runtimeInfo.vcx86),
            ),
          ),

          React.createElement('hr', null),

          React.createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start' } },
            // Column 1
            React.createElement('div', { style: { flex: '1' } },
              React.createElement('strong', null,),
              row('Enabled Mods: ', `${enabledModsCount}`),
              row('Disabled Mods: ', `${disabledCount}`),
              row('Collection: enabled mods (required + optional)', null),
              React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                ...Object.entries(collectionCounts).map(([name, { total, required, optional }]) =>
                  React.createElement('li', { key: name }, `${name}: ${total} (${required} + ${optional})`),
                ),
                React.createElement('li', { key: '__none__' }, `None: ${noneCount}`)
              ),
            ),

            //Column 2
            React.createElement('div', { style: { flexShrink: 0, textAlign: 'left', minWidth: '220px' } },
              // StatusIcon({ type: pluginsProper ? 'success' : 'error', style: { marginRight: '6px' } }),
              row('Total Active Plugins: ', `${activePlugins.length} `),
              row('Disabled Plugins: ', disabledPlugins.length),
              row('Full Plugins: ', `${regularPlugins.length} / ${regularLimit}`),
              row('Light Plugins: ', eslGame ? `${lightPlugins.length} / ${lightLimit}` : 'Not supported'),
              row(
                React.createElement('span', null,
                  'Unmanaged Files: ',
                  moreInfo('unmanagedfiles', 'More info'),
                ),
                unmanagedFiles.loading
                  ? 'Scanning...'
                  : React.createElement('div', null,

                    React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                      React.createElement('li', null, `${unmanagedFiles.plugins.length} plugins, ${unmanagedFiles.dlls.length} DLLs, ` +
                        `${unmanagedFiles.textures.length} textures,`),
                      React.createElement('li', null, `${unmanagedFiles.meshes.length} meshes, ` +
                        `${unmanagedFiles.animations.length} animations`
                      ),),

                  )),
            ),
          ),
          React.createElement('hr', null),

          React.createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start' } },
            //column 1
            React.createElement('div', { style: { flex: '1' } },
              row('Active Profile: ', profileName),
              React.createElement('ul', { style: { margin: '2px 0' } },
                row('Active Mods per Profile: '),
                React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                  ...gameProfiles.map((p) =>
                    React.createElement('li', { key: p.id }, `${p.name} (${profileModCounts[p.id] || 0})`)
                  ))
              ),
            ),

            //column 2
            React.createElement('div', { style: { marginBottom: '10px' } },
              React.createElement('div', { style: { marginBottom: '10px' } },
                React.createElement('strong', null, `Installed Collections (${collectionCount}):`),
                collectionCount > 0
                  ? React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                    ...installedCollections.map(mod => {
                      const stats = getCollectionStats(mod, mods, profile);
                      const tooltipText =
                        `Enabled: ${stats.enabled}\n` +
                        `Disabled: ${stats.disabled}\n` +
                        `Not Installed: ${stats.notInstalled}\n` +
                        `Ignored: ${stats.ignored}`;

                      return React.createElement('li', { key: mod.id, title: tooltipText },
                        util.renderModName(mod) || mod.id
                      );
                    })
                  )
                  : React.createElement('span', null, ' None')
              ),
            ),
          ),
        ),

        // ── Health Checks ──────────────────────────────────────────────────────────  

        React.createElement('div', {
          style: {
            border: '2px solid orange',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '16px',
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              // alignItems: 'center',      // vertically align header/button/columns on the same line  
              flexWrap: 'wrap',          // allow the columns to drop below if there's no room  
              gap: '12px',
              marginBottom: '12px',
            }
          },
            // Left side: header stacked above button  
            React.createElement('div', {
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginRight: '16px', // gap between this stack and the columns  
              }
            },
              React.createElement('h3', { style: { width: 'fit-content', marginTop: 0, marginBottom: '8px' } }, 'Health Stats'),
              React.createElement('button', {
                onClick: () => setRefreshKey(k => k + 1),
                className: 'btn btn-default btn-xs',
                style: { marginBottom: 0, width: 'fit-content' },
              }, 'Refresh')
            ),
            
            !settled  
  ? React.createElement('div', {  
      style: {  
        display: 'flex',  
        alignItems: 'center',  
        justifyContent: 'center', 
        marginLeft: '20px', 
        flex: 1,  
        minHeight: '160px', // give the box enough height to actually center within  
      }  
    },  
      React.createElement(Spinner, {  
        className: 'health-check-spinner',  
        style: {  
          width: '48px',  
          height: '48px',  
          opacity: 0.4, 
        }  
      })  
    )
            : React.createElement('div', {
              style: {
                display: 'flex',
                justifyContent: 'center',
                flex: 1,
              }
            },
              // Column 1  
              React.createElement('div', {
                style: {
                  display: 'grid',
                  gridAutoFlow: 'column',
                  // gridTemplateRows: 'repeat(6, auto)',
                  // gridTemplateColumns: 'repeat(3, 1fr)', // change 3 to however many columns you want  
                  // columnGap: '16px',
                  rowGap: '0px',
                },
              },

                // React.createElement('div', { style: { gridColumn: '1' } },

                healthRow(isDeployed ? null : 'Mods Not Deployed', isDeployed, null,
                  !isDeployed
                  ? () => api.events.emit("show-main-page", "Mods")
                  : null, "Jump to Mods tab"),

                healthRow(pluginsSorted ? null : 'Plugins Not Sorted', pluginsSorted, null,
                  !pluginsSorted
                  ? () => api.events.emit("show-main-page", "gamebryo-plugins")
                  : null, "Jump to Plugins tab"),

                healthRow(gameLaunched ? null : 'INI Files Not Present', gameLaunched, false,
                  !gameLaunched
                    ? scrollToSection('notlaunchedthegame')
                    : null,
                  !gameLaunched
                    ? 'You failed to launch the game before you modded it. Click for details.'
                    : null),

                healthRow(!hasOneDrive ? null : 'OneDrive found in INI Path', !hasOneDrive, false,
                  hasOneDrive
                    ? scrollToSection('removeonedrive')
                    : null,
                  hasOneDrive
                    ? 'OneDrive found. Click to learn how to remove it.'
                    : null),

                healthRow(
                  ((healthAsync.aeDLCOwned === true && nativeCount === 80) || (healthAsync.aeDLCOwned === 'unknown' && nativeCount === 10))
                    ? null
                    : `Creations/DLC missing: ${nativeCount}/${creationsExpected}`,
                  (healthAsync.aeDLCOwned === true && nativeCount === 80) || (healthAsync.aeDLCOwned === 'unknown' && nativeCount === 10),
                  aeDLCInstalled === null
                    ? 'Checking...'
                    : null,
                  null,
                  'If the total count is incorrect, use the AE DLC checkbox to toggle ownership'),

                healthRow(!isRemovable ? null : 'Removable drive found', !isRemovable, null,
                  isRemovable
                    ? scrollToSection('externaldrive')
                    : null,
                  isRemovable
                    ? "Removable drives are not suppoted. Click for details"
                    : null),

                healthRow(!updatePending ? null : 'Vortex Update Pending', !updatePending, healthAsync.updateAvailable === null, null,
                  healthAsync.updateAvailable === null
                    ? 'Checking...'
                    : healthAsync.updateAvailable && healthAsync.updateVersion
                      ? `${healthAsync.updateVersion} Pending`
                      : 'Vortex is up to date'),

                healthRow(
                  healthAsync.activatorType === "Hardlinks" ? null : 'Experimental Deployment Method: ' + healthAsync.activatorType,
                  healthAsync.activatorType === "Hardlinks", null,
                  healthAsync.activatorType !== "Hardlinks"
                    ? () => {
                      api.events.emit("show-main-page", "game_settings");
                      api.store.dispatch(actions.setSettingsPage("Mods"))
                    }
                    : null,
                  healthAsync.activatorType !== "Hardlinks"
                    ? "Open Game Settings"
                    : null
                ),

                healthRow(isXsePrimary ? null : 'SKSE64 Not Default Launcher', isXsePrimary, false, 
                  !isXsePrimary
                  ? () => api.events.emit("show-main-page", "tools_page")
                  : null, "Jump to Tools tab"),

                healthRow(fnisOrNemesisDetected ? 'FNIS/Nemesis found' : null, !fnisOrNemesisDetected, false,
                  fnisOrNemesisDetected
                    ? scrollToSection('removefnis')
                    : null,
                  fnisOrNemesisDetected
                    ? 'FNIS and Nemesis are not used. Click for details.'
                    : null),

                healthRow(!hasUnmanagedFiles ? null : 'Unmanaged files found', !hasUnmanagedFiles,
                  unmanagedFiles.loading
                    ? 'Scanning...'
                    : hasUnmanagedFiles ? `${totalUnmanaged} files` : null,
                  hasUnmanagedFiles
                    ? showUnmanagedDialog
                    : null,
                  hasUnmanagedFiles
                    ? 'Click here to see a list of unmanaged files'
                    : null),

                healthRow(suppressedCount === 0 ? null : 'Suppressed Notifications',
                  suppressedCount === 0,
                  suppressedCount > 0 ? `${suppressedCount} suppressed` : null,
                  suppressedCount > 0
                    ? () => {
                      suppressedIds.forEach(id =>
                        api.suppressNotification?.(id, false));
                      api.events.emit('trigger-test-run', 'gamemode-activated');
                    }
                    : null,
                  suppressedCount > 0 ? tooltipText : null),

                healthRow(
                  !contentCatalogCheck ? null : 'Incompatible contentcatalog.txt file',
                  !contentCatalogCheck, null,
                  contentCatalogCheck
                    ? scrollToSection('newcontentcatalog')
                    : null,
                  null),
                // healthRow(healthStatsBad == 0 ? 'Your vitals are looking good!' : null, healthStatsBad == 0, null, null, healthStatsBad == 0 ? 'No obvious problems' : null),
                healthStatsBad == 0
                ? React.createElement('span', {style: { alignItems: 'left', alignContent: 'center', fontSize: "14pt", gridColumn: '1', title: "No obvious problems found" } }, reallyGoodRow("Vitals look good!"))
                : null,

              ),),),
        ),

        React.createElement('h3', null, 'Troubleshooting'),
        React.createElement('p', { style: { marginBottom: '12px', fontStyle: 'italic' } },
          'Stop. Do not remove or reinstall things on the first error prompt you are seeing. ' +
          'This is not a Commodore 64 — hitting the PC or redoing the same things won\'t result in a different outcome. ' +
          'Most errors you get are explained below. You\'ll be able to solve most of them.'
        ),

        ...faqItems.map((item, i) =>
          React.createElement(FaqItem, { key: i, heading: item.heading, id: item.id }, item.content)
        )

      )),
  );
}

module.exports = GameStatsPage;
/// module.exports.SettingsImmersiveSupport = SettingsImmersiveSupport;
module.exports.isAutoOpenEnabled = isAutoOpenEnabled;