const React = require('react');
const { useSelector } = require('react-redux');
const { actions, selectors, util, fs, MainPage, log } = require('vortex-api');
const nodeFs = require('fs');               // native Node fs — use only for statfsSync
const path = require('path');
const os = require('os');
const { shell } = require('electron'); 
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

const PLUGIN_EXTS = new Set(['.esp', '.esm', '.esl']);  
const FLAG_LIGHT = 0x00000200; 

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
const MDI_CHECK_CIRCLE = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z';
const MDI_CLOSE_CIRCLE = 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z';
const discordIconPath = "M19.4308 5.26368C18.1561 4.67878 16.7892 4.24785 15.3599 4.00104C15.3339 3.99627 15.3079 4.00818 15.2945 4.03198C15.1187 4.34466 14.9239 4.75258 14.7876 5.0732C13.2503 4.84306 11.721 4.84306 10.2153 5.0732C10.0789 4.74545 9.87707 4.34466 9.70048 4.03198C9.68707 4.00897 9.66107 3.99707 9.63504 4.00104C8.20659 4.24706 6.83963 4.67799 5.56411 5.26368C5.55307 5.26844 5.54361 5.27638 5.53732 5.28669C2.94449 9.16032 2.23421 12.9387 2.58265 16.6703C2.58423 16.6886 2.59447 16.706 2.60867 16.7171C4.31934 17.9734 5.97642 18.7361 7.60273 19.2416C7.62876 19.2496 7.65634 19.24 7.6729 19.2186C8.05761 18.6933 8.40054 18.1393 8.69456 17.5568C8.71192 17.5227 8.69535 17.4822 8.65989 17.4687C8.11594 17.2624 7.598 17.0108 7.09977 16.7251C7.06037 16.7021 7.05721 16.6457 7.09347 16.6187C7.19831 16.5402 7.30318 16.4584 7.4033 16.3759C7.42141 16.3608 7.44665 16.3576 7.46794 16.3671C10.7411 17.8615 14.2846 17.8615 17.5191 16.3671C17.5404 16.3568 17.5657 16.36 17.5846 16.3751C17.6847 16.4576 17.7895 16.5402 17.8952 16.6187C17.9314 16.6457 17.9291 16.7021 17.8897 16.7251C17.3914 17.0163 16.8735 17.2624 16.3288 17.4679C16.2933 17.4814 16.2775 17.5227 16.2949 17.5568C16.5952 18.1385 16.9381 18.6924 17.3157 19.2178C17.3315 19.24 17.3599 19.2496 17.3859 19.2416C19.0201 18.7361 20.6772 17.9734 22.3879 16.7171C22.4028 16.706 22.4123 16.6894 22.4139 16.6711C22.8309 12.357 21.7154 8.60956 19.4568 5.28748C19.4513 5.27638 19.4419 5.26844 19.4308 5.26368ZM9.18335 14.3982C8.19792 14.3982 7.38594 13.4935 7.38594 12.3824C7.38594 11.2713 8.18217 10.3666 9.18335 10.3666C10.1924 10.3666 10.9965 11.2793 10.9807 12.3824C10.9807 13.4935 10.1845 14.3982 9.18335 14.3982ZM15.829 14.3982C14.8435 14.3982 14.0316 13.4935 14.0316 12.3824C14.0316 11.2713 14.8278 10.3666 15.829 10.3666C16.838 10.3666 17.6421 11.2793 17.6264 12.3824C17.6264 13.4935 16.838 14.3982 15.829 14.3982Z";


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

function row(label, value) {
  return React.createElement('div', { style: { marginBottom: '10px' } },
    React.createElement('strong', null, label),
    value
  );
}


function ul(...items) {
  return React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
    ...items.map((text, i) => React.createElement('li', { key: i }, text))
  );
}


let winapi;
try { winapi = require('winapi-bindings'); } catch (e) { winapi = null; }





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



function StatusIcon({ isOk }) {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    style: {
      width: '14px', height: '14px',
      fill: isOk ? '#4caf50' : '#f44336',
      flexShrink: 0, marginRight: '6px', verticalAlign: 'middle'
    }
  }, React.createElement('path', { d: isOk ? MDI_CHECK_CIRCLE : MDI_CLOSE_CIRCLE }));
}

function sysRow(label, version, isCurrent) {
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'left', marginBottom: '4px', fontSize: '12px' }
  },
    React.createElement(StatusIcon, { isOk: isCurrent }),
    React.createElement('span', null,
      label + ': ' + (version || 'Not found')
    )
  );
}

function healthRow(label, isGood, detail, onClick, tooltip) {
  const icon = isGood
    ? React.createElement('span', { style: { color: '#4caf50', marginRight: '6px', fontWeight: 'bold' } }, '✔')
    : React.createElement('span', { style: { color: '#f44336', marginRight: '6px', fontWeight: 'bold' } }, '✘');

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', marginBottom: '4px',
      cursor: onClick ? 'pointer' : 'default',
    },
    onClick: onClick || undefined,
    title: tooltip || undefined,
  },
    icon,
    React.createElement('span', null, label),
    detail
      ? React.createElement('span', { style: { marginLeft: '6px', opacity: 0.7, fontSize: '0.85em' } }, detail)
      : null
  );
}


// Collapsible FAQ item component  
function FaqItem({ heading, children }) {
  const [open, setOpen] = React.useState(false);

  return React.createElement('div', { style: { marginBottom: '8px', border: '1px solid #555', borderRadius: '4px' } },
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

const faqItems = [
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
    heading: 'No textures or meshes, faces not shown, purple room, only teeth showing etc.:',
    content: ul(
      'You have not launched & started a new game in Skyrim even once before installing this collection. Purge your mods, and launch Skyrim from Steam and play until Ralof says a sentence or two. Quit the game (no save) and enable deploy mods. Fixed. Enjoy.',
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
];




function openScreenshotTool() {
  if ( process.platform === 'win32') {
    
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
  const extensionVersion = "1.4.2 - WiP";
  const vortexVersion = useSelector((state) => state?.app?.appVersion || 'Unknown');
  const activeGameId = useSelector((state) => selectors.activeGameId(state));
  const game = activeGameId ? util.getGame(activeGameId) : null;
  const gameName = game ? game.name : 'Unknown';
  const { useEffect, useState, useRef } = React;
  const iniPaths = getIniPaths(activeGameId);
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
  const gamePath = gameDiscovery?.path || 'Not discovered';
  const mods = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return state?.persistent?.mods?.[gameId] || {};
  });

  const stagingPath = useSelector((state) => {
    const gameId = selectors.activeGameId(state);
    return selectors.installPathForGame(state, gameId);
  });

const [healthAsync, setHealthAsync] = useState({  
  updateAvailable: null,  
  updateVersion: null,  
  iniPresent: null,  
  suppressedMap: null,  
  aeDLCOwned: null,   // null=checking, true=owned, 'unknown'=no Steam data  
});  

const pluginList = useSelector(state =>  
  (state.session?.plugins?.pluginList) ?? {}  
);  
  
const nativeCount = Object.values(pluginList).filter(p => p.isNative).length;  
  
// true = full AE, false = not installed, 'partial' = some files missing  
const aeDLCInstalled =  
  nativeCount === 80 ? true :  
  nativeCount === 10 ? false :  
  nativeCount > 10   ? 'partial' :  
  null; // pluginList not loaded yet

function getSteamPath() {  
  if (process.platform === 'win32') {  
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
    // Linux/Wine host paths  
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
      if (fs.existsSync(path.join(candidate, 'config', 'libraryfolders.vdf'))) {  
        return candidate;  
      }  
    }  
    return undefined;  
  }  
}

  useEffect(() => {  
  async function checkAEOwnership() {  
    try {  
      const steamPath = getSteamPath(); // your existing helper  
      console.log('====steam path: ',steamPath)
      if (!steamPath) {  
        setHealthAsync(p => ({ ...p, aeDLCOwned: 'unknown' })); 
        console.log('=====no steam path: ', healthAsync.aeDLCOwned) 
        return;  
      }  
  
      // Check all userdata/<SteamID> directories  
      const userDataPath = path.join(steamPath, 'userdata');  
      let owned = false;  
      console.log('====owned: ', owned)
      try {  
        const userIds = await fs.readdirAsync(userDataPath);  
        for (const userId of userIds) {  
          const localConfigPath = path.join(  
            userDataPath, userId, 'config', 'localconfig.vdf'  
          );  
          try {  
            // Change 4: search whole file, not just AppTickets section  
            const data = await fs.readFileAsync(localConfigPath, 'utf8');  
            if (data.includes('"1746860"')) {  
              owned = true;  
              break;  
            }  
          } catch {  
            // this userdata entry has no localconfig.vdf, skip 
            console.log('====nolocalconfig.vdg') 
          }  
        }  
      } catch {  
        console.log('====userdata dir unreadable')
      }  
      console.log('====check 1: ', owned);
      if (!owned) {  
        // Fallback: appinfo_log.previous.txt (whole-file search, already was)  
        try {  
          const logPath = path.join(steamPath, 'logs', 'appinfo_log.previous.txt');  
          const logData = await fs.readFileAsync(logPath, 'utf8');  
          if (logData.includes('1746860=')) {  
            owned = true;  
          }  
        } catch (err) {  
          console.log('====log file not found  ')
          console.log('====ownership error: ', err?.message ?? err);
        }  
      }  
      console.log('====check2: ', owned);
      // Change 3: no 'not_owned' — only true or 'unknown'  
      setHealthAsync(p => ({  
        ...p,  
        aeDLCOwned: owned ? true : 'unknown',  
      }));  
    } catch (err) {  
      setHealthAsync(p => ({ ...p, aeDLCOwned: 'unknown' }));  
      console.log('====ownership: ',healthAsync.aeDLCOwned)
      console.log('====ownership error: ', err?.message ?? err);
    }  
  }  
  console.log('====final: ', healthAsync.aeDLCOwned);
  checkAEOwnership();  
}, []);

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
    if (process.env.WINEPREFIX) {
      // Try reading GPU from Linux sysfs  
      exec('vulkaninfo --summary |grep deviceName || echo Unknown',
        { timeout: 3000 },
        (err, stdout) => {
          setHardwareInfo(prev => ({
            ...prev,
            gpu: (!err && stdout.trim() && stdout.trim() !== 'Unknown')
              ? stdout.trim()
              : 'Unknown (Wine)'
          }));
        }
      );
    } else {
      // GPU — async via PowerShell/exec  
      exec(
        'powershell -NoProfile -NonInteractive -Command "'
        + '$gpu = (Get-WmiObject Win32_VideoController | Select-Object -First 1).Name; '
        + '$regBase = \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\'; '
        + '$vram = 0; '
        + 'Get-ChildItem $regBase -ErrorAction SilentlyContinue | ForEach-Object { '
        + '  $desc = (Get-ItemProperty $_.PSPath -Name DriverDesc -ErrorAction SilentlyContinue).DriverDesc; '
        + '  if ($desc -and $gpu -and ($desc -like (\'*\' + $gpu + \'*\') -or $gpu -like (\'*\' + $desc + \'*\'))) { '
        + '    $v = (Get-ItemProperty $_.PSPath -Name \'HardwareInformation.qwMemorySize\' -ErrorAction SilentlyContinue).\'HardwareInformation.qwMemorySize\'; '
        + '    if ($v) { $vram = $v } '
        + '  } '
        + '}; '
        + 'Write-Output ($gpu + \' | \' + [math]::Round($vram / 1GB, 0) + \' GB\')"',
        (err, stdout) => {
          if (err || !stdout.trim()) {
            setHardwareInfo(prev => ({ ...prev, gpu: 'Unknown' }));
            return;
          }
          setHardwareInfo(prev => ({ ...prev, gpu: stdout.trim() }));
        }
      );
    }
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
}, [gamePath]);

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

        setIsRemovable(disk?.isRemovable === true);
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
  const welcomeSeen = useSelector(state => state?.settings?.immersiveSupport?.welcomeSeen ?? false);  
  const dispatch = require('react-redux').useDispatch();  

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
        const dismissWelcome = () => dispatch({ type: 'IMMERSIVE_SET_WELCOME_SEEN', payload: true });  
        
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
    // --- INI files present ---  
    const checkIniFiles = async () => {
      const results = await Promise.all(
        iniPaths.map(p =>
          fs.statAsync(p)
            .then((stats) => stats.size > 0)
            .catch(() => false)
        )
      );
      const iniOk = iniPaths.length > 0 && results.every(r => r === true);
      setHealthAsync((p) => ({ ...p, iniPresent: iniOk }));
    };

    checkIniFiles();
  }, [activeGameId]);

  // Deployment  
  const isDeployed = !needToDeploy;

  const pluginsSorted = useSelector((state) =>
    state?.persistent?.immersiveSupport?.pluginsSorted === true
  );

  // Game launched (INI + shader cache)  
  const gameLaunched = healthAsync.iniPresent === true; // && healthAsync.shaderCachePresent === true;  

  // OneDrive in INI path  
  const hasOneDrive = iniPaths.some((p) => p.toLowerCase().includes('onedrive'));

  // Vortex update pending (non-beta)  
  const updatePending = healthAsync.updateAvailable === true;

  // SKSE64 as primary tool  
  // Tool IDs from script-extender-installer gameSupport.ts  
  const xseToolIdMap = {
    skyrim: 'skse', skyrimse: 'skse64', skyrimvr: 'sksevr',
    fallout4: 'f4se', fallout4vr: 'F4SEVR', falloutnv: 'nvse',
  };
  const expectedXseId = xseToolIdMap[activeGameId?.toLowerCase()];
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
    //// console.log('====scan triggered, gamePath:', gamePath, 'activeGameId:', activeGameId);
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
  const hasFnisOrNemesis = Object.entries(mods).some(([modId, mod]) => {
    const name = (mod.attributes?.name || mod.id || '').toLowerCase();
    const isBad = name.includes('fnis') ||
      name.includes('nemesis unlimited behavior engine') ||
      name.includes('nemesis behavior engine');
    const isEnabled = profile?.modState?.[modId]?.enabled === true;
    return isBad && isEnabled;
  });

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


  // Build a map of modId -> [collectionMod, ...]
  const collectionMap = React.useMemo(() => {
    const map = {};
    Object.values(mods).filter(m => m.type === 'collection').forEach(coll => {
      (coll.rules || []).forEach(rule => {
        const refId = rule.reference?.id;
        if (refId !== undefined) {
          if (!map[refId]) map[refId] = [];
          map[refId].push(coll);
        } else {
          // For rules that reference mods by MD5/logicalFileName/fileExpression  
          // rather than a direct ID, use findModByRef to resolve them  
          const installed = util.findModByRef(rule.reference, mods);
          if (installed !== undefined) {
            if (!map[installed.id]) map[installed.id] = [];
            map[installed.id].push(coll);
          }
        }
      });
    });
    return map;;
  }, [mods]);

  const enabledModIds = Object.keys(profile?.modState || {}).filter(
    (modId) => profile.modState[modId]?.enabled === true
  );
  const enabledModsCount = enabledModIds.length;
  const regularMods = Object.values(mods).filter(m => m.type !== 'collection');
  const disabledCount = regularMods.filter(m =>
    m.state === 'installed' && profile?.modState?.[m.id]?.enabled !== true
  ).length;

  const collectionCounts = {};
  let noneCount = 0;
  enabledModIds.forEach(modId => {
    const modColls = collectionMap[modId];
    if (!modColls || modColls.length === 0) {
      noneCount++;
    } else {
      modColls.forEach(coll => {
        const name = util.renderModName(coll) || coll.id;
        collectionCounts[name] = (collectionCounts[name] || 0) + 1;
      });
    }
  });


  //Get plugin details for the current game

  const eslGames = ['skyrimse', 'skyrimvr', 'fallout4', 'fallout4vr', 'starfield'];
  const eslGame = eslGames.includes(activeGameId?.toLowerCase());

  const isActive = (id) =>
    loadOrder[id]?.enabled === true || pluginList[id]?.isNative === true;

  // A plugin is disabled if it exists on disk, is not native, and is not active  
  const disabledPlugins = React.useMemo(() => Object.keys(pluginList).filter(
    (id) => !pluginList[id]?.isNative && !isActive(id)
  ), [pluginList, loadOrder]);

  const isValid = (id) =>
    (pluginList[id]?.deployed === true || pluginList[id]?.isNative === true) && isActive(id);

 /*onst isLight = (id) => {
    if (pluginInfo[id]?.isLight) return true;
    const filePath = pluginList[id]?.filePath || '';
    return filePath.toLowerCase().endsWith('.esl');
  };
*/


const [pluginHeaders, setPluginHeaders] = React.useState({});  

const isLight = (id) => {  
  if (pluginInfo[id]?.isLight) {
    // console.log('====isLight from pluginInfo!')
    return true};  
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
}, [gamePath, activeGameId]);


  const activePlugins = React.useMemo(() => Object.keys(pluginList).filter(isValid), [pluginList, loadOrder]);
  const lightPlugins = React.useMemo(() => eslGame ? activePlugins.filter(isLight) : [], [activePlugins, pluginInfo, pluginHeaders]);
  const regularPlugins = React.useMemo(() => activePlugins.filter((id) => !isLight(id)), [activePlugins, pluginInfo, pluginHeaders]);

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
      'Unmanaged Files (hardlink count \u2264 1)',
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
        }, 'Welcome'),
      )
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
          React.createElement('h2', null, 'Immersive Support - Support Stats ', extensionVersion),
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
              React.createElement('strong', null, 'OS: '),
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
            React.createElement('div', null,
              React.createElement('strong', null, 'GPU: '),
              hardwareInfo.gpu
            ),
          ),
          React.createElement('hr', null),

          React.createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start' } },

            // Column 1: Path/folder data  
            React.createElement('div', { style: { flex: '1' } },
              row('Active Game: ', healthAsync.aeDLCOwned === true ? `${gameName} (with AE DLC)` : gameName),
              row('Game Path: ', isRemovable ? `${gamePath} (Removable)` : gamePath),
              row('Staging Folder: ', stagingPath || 'Not configured'),
              React.createElement('div', { style: { marginBottom: '10px' } },
                React.createElement('strong', null, 'INI Files:'),
                iniPaths.length > 0
                  ? React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                    ...iniPaths.map(p => React.createElement('li', { key: p }, p))
                  )
                  : React.createElement('span', null, ' Not available for this game'),
                React.createElement('div', null,
                  // React.createElement('strong', null, 'Discovered Tools'),
                  expectedXseId !== undefined
                    ? React.createElement('div', { style: { marginBottom: '4px' } },
                      React.createElement('strong', null, 'SKSE: '),
                      xseExistsAtExpected
                        ? React.createElement('span', {
                          style: { cursor: 'pointer', opacity: 0.8 },
                          title: 'Click to copy path',
                          onClick: () => {
                            navigator.clipboard.writeText(expectedXsePath);
                            api.sendNotification({ type: 'success', message: 'SKSE path copied', displayMS: 2000 });
                          }
                        }, expectedXsePath)
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
                React.createElement('span', { style: { fontWeight: 'bold' } }, 'Space Used: '),
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
              React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                ...Object.entries(collectionCounts).map(([name, count]) =>
                  React.createElement('li', { key: name }, `${name}: ${count}`)
                ),
                React.createElement('li', { key: '__none__' }, `None: ${noneCount}`)
              ),
            ),

            //Column 2
            React.createElement('div', { style: { flexShrink: 0, textAlign: 'left', minWidth: '220px' } },
              row('Total Active Plugins: ', activePlugins.length),
              row('Disabled Plugins: ', disabledPlugins.length),
              row('Full Plugins: ', `${regularPlugins.length} / ${regularLimit}`),
              row('Light Plugins: ', eslGame ? `${lightPlugins.length} / ${lightLimit}` : 'Not supported'),
              row('Unmanaged Files: ',
                unmanagedFiles.loading
                  ? 'Scanning...'
                  : React.createElement('div', null,

                    React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
                      React.createElement('li', null, `${unmanagedFiles.plugins.length} plugins, ${unmanagedFiles.dlls.length} DLLs, ` +
                        `${unmanagedFiles.textures.length} textures,`),
                      React.createElement('li', null, `${unmanagedFiles.meshes.length} meshes, ` +
                        `${unmanagedFiles.animations.length} animations`
                      ),),
                    React.createElement('button', {
                      onClick: () => setRefreshKey(k => k + 1),
                      className: 'btn btn-default btn-xs', style: { marginRight: '6px' }
                    }, 'Refresh'),
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
                    ...installedCollections.map(mod =>
                      React.createElement('li', { key: mod.id },
                        util.renderModName(mod) || mod.id
                      )
                    )
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
          React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Health Checks'),
          React.createElement('div', {
            style: { display: 'flex', gap: '32px', justifyContent: 'center' }
          },
            // Column 1  
            React.createElement('div', { style: { flex: '0 0 auto' } },
              healthRow('Mods Deployed', !needToDeploy, null,
                () => api.events.emit("show-main-page", "Mods")),
              healthRow('Plugins Sorted', pluginsSorted, null,
                () => api.events.emit("show-main-page", "gamebryo-plugins")),
              healthRow('INI Files Present', gameLaunched, healthAsync.iniPresent === null),
              healthRow('OneDrive NOT in INI Path', !hasOneDrive, false),
              healthRow(`Creations OK: ${nativeCount}/${creationsExpected}`, (healthAsync.aeDLCOwned === true && nativeCount === 80) || (healthAsync.aeDLCOwned === 'unknown' && nativeCount === 10), aeDLCInstalled === null
                ? 'Checking...'
                : null),
              healthRow('Not a removable drive', !isRemovable, null),
            ),
            // Column 2  
            React.createElement('div', { style: { flex: '0 0 auto' } },
              healthRow('No Vortex Update Pending', !updatePending, healthAsync.updateAvailable === null, null,
                healthAsync.updateAvailable === null
                ? 'Checking...'
                : healthAsync.updateAvailable && healthAsync.updateVersion 
                  ? `${healthAsync.updateVersion} Pending`
                  : 'Vortex is up to date'),
              healthRow('SKSE64 is Default Launcher', isXsePrimary, false),
              healthRow('FNIS/Nemesis Not Installed', !hasFnisOrNemesis, false),
              healthRow('No Unmanaged Files', !hasUnmanagedFiles,
                unmanagedFiles.loading
                  ? 'Scanning...'
                  : hasUnmanagedFiles ? `${totalUnmanaged} files` : null,
                hasUnmanagedFiles ? showUnmanagedDialog : null),
              healthRow('Suppressed Notifications',
                suppressedCount === 0,
                suppressedCount > 0 ? `${suppressedCount} suppressed` : null,
                suppressedCount > 0
                  ? () => {
                    suppressedIds.forEach(id =>
                      api.suppressNotification?.(id, false));
                    api.events.emit('trigger-test-run', 'gamemode-activated');
                  }
                  : null,
                suppressedCount > 0 ? tooltipText : null)
            ),
          )
        ),
        React.createElement('h3', null, 'Troubleshooting'),
        React.createElement('p', { style: { marginBottom: '12px', fontStyle: 'italic' } },
          'Stop. Do not remove or reinstall things on the first error prompt you are seeing. ' +
          'This is not a Commodore 64 — hitting the PC or redoing the same things won\'t result in a different outcome. ' +
          'Most errors you get are explained below. You\'ll be able to solve most of them.'
        ),
        ...faqItems.map((item, i) =>
          React.createElement(FaqItem, { key: i, heading: item.heading }, item.content)
        )

      ))
  );
}

module.exports = GameStatsPage;