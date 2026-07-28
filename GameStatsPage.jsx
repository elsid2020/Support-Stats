const React = require('react');  
const { useSelector } = require('react-redux'); 
const { actions, selectors, util, MainPage } = require('vortex-api');  
const path = require('path');  
const iniFileMap = {  
  skyrim:               ['Skyrim/Skyrim.ini', 'Skyrim/SkyrimPrefs.ini'],  
  skyrimse:             ['Skyrim Special Edition/Skyrim.ini'],  
  skyrimvr:             ['Skyrim VR/Skyrim.ini', 'Skyrim VR/SkyrimVR.ini', 'Skyrim VR/SkyrimPrefs.ini'],  
  fallout3:             ['Fallout3/Fallout.ini', 'Fallout3/FalloutPrefs.ini', 'Fallout3/FalloutCustom.ini'],  
  fallout4:             ['Fallout4/Fallout4.ini', 'Fallout4/Fallout4Prefs.ini', 'Fallout4/Fallout4Custom.ini'],  
  fallout4vr:           ['Fallout4VR/Fallout4Custom.ini', 'Fallout4VR/Fallout4Prefs.ini'],  
  falloutnv:            ['FalloutNV/Fallout.ini', 'FalloutNV/FalloutPrefs.ini', 'FalloutNV/FalloutCustom.ini'],  
  starfield:            ['Starfield/Starfield.ini', 'Starfield/StarfieldPrefs.ini', 'Starfield/StarfieldCustom.ini'],  
  oblivion:             ['Oblivion/Oblivion.ini'],  
  enderal:              ['Enderal/Enderal.ini', 'Enderal/EnderalPrefs.ini'],  
  enderalspecialedition:['Enderal Special Edition/Enderal.ini', 'Enderal Special Edition/EnderalPrefs.ini'],  
};  

const skyrimLogsPath = path.join(util.getVortexPath('documents'), 'My Games', 'Skyrim Special Edition', 'SKSE');  
const vortexLogsPath = path.join(process.env.APPDATA, 'Vortex');
const discordURL = "https://discord.gg/immersive-collections"
  
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
      'Make sure your Vortex is up to date. Restart Vortex and you should receive a notification about a new Vortex version if it is not up to date.',  
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
      'Make sure your Vortex is up to date. Restart Vortex and you should receive a notification about a new Vortex version if it is not up to date.',  
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
      'User is still trying to open the game from Steam instead of the script extender. User needs to only launch the game from Dashboard → Script Extender play prompt.',  
    ),  
  },  
  {  
    heading: 'SKSE Loader Prompt:',  
    content: ul(  
      'User does not have the latest version of Microsoft Visual C++ Redistributable. Simply install the latest version from the internet. Most users have this but new computers do not come with this software already installed.',  
      'User has pirated software.',  
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

  
function GameStatsPage({ api }) {  
  const activeGameId  = useSelector((state) => selectors.activeGameId(state));  
  const profile       = useSelector((state) => selectors.activeProfile(state));  
  const vortexVersion = useSelector((state) => state?.app?.appVersion || 'Unknown');  
  
  const gameDiscovery = useSelector((state) => {  
    const gameId = selectors.activeGameId(state);  
    return state?.settings?.gameMode?.discovered?.[gameId] || {};  
  });

  const stagingPath = useSelector((state) => {  
    const gameId = selectors.activeGameId(state);
    return selectors.installPathForGame(state, gameId);  
  });  
  
  const mods = useSelector((state) => {  
    const gameId = selectors.activeGameId(state);  
    return state?.persistent?.mods?.[gameId] || {};  
  });  

  const totalModsInstalled = Object.values(mods).filter(  
    m => m.type !== 'collection' && m.state === 'installed'  
    ).length;

  const game     = activeGameId ? util.getGame(activeGameId) : null;  
  const gameName = game ? game.name : 'Unknown';  
  const gamePath = gameDiscovery?.path || 'Not discovered';  
  const iniPaths = getIniPaths(activeGameId);
  
  const gameInfo = useSelector((state) => {  
    const gameId = selectors.activeGameId(state);  
    return state.persistent.gameMode.gameInfo?.[gameId] || {};  
  });  
  
  const spaceUsed     = gameInfo?.size?.value;  
  const spaceNoLinks  = gameInfo?.size_nolinks?.value;  
  
// Format with Vortex's built-in formatter  
  const spaceUsedStr    = spaceUsed    != null ? util.bytesToString(spaceUsed)    : 'Calculating...';  
  const spaceNoLinksStr = spaceNoLinks != null ? util.bytesToString(spaceNoLinks) : 'Calculating...';
  
  const allProfiles = useSelector((state) => state?.persistent?.profiles || {});  
  
  const pluginList = useSelector((state) => state?.session?.plugins?.pluginList || {});  
  const pluginInfo = useSelector((state) => state?.session?.plugins?.pluginInfo || {});  
  const loadOrder  = useSelector((state) => state?.loadOrder || {});  
  
  const { useEffect, useState } = React;  
  
// State to track if game path is on removable drive  
  const [isRemovable, setIsRemovable] = useState(false);  
  
// Check if game path is on removable drive  
  useEffect(() => {  
    if (!gameDiscovery?.path) return;  
  
    const checkRemovable = async () => {  
      try {  
        const winapi = require('winapi-bindings');  
        const volume = winapi.GetVolumePathName(gamePath);  
          
        const drivelist = require('drivelist').list;  
        const disks = await drivelist();  
        
        const disk = disks.find(d =>   
          d.mountpoints && d.mountpoints.some(mp => mp.path === volume)  
        );  
         
        setIsRemovable(disk?.isRemovable === true);  
      } catch (err) {  
        console.error('Failed to check removable drive:', err);  
        setIsRemovable(false);  
      }  
    };  
  
    checkRemovable();  
  }, [gameDiscovery?.path]);
  
// Check if the welcome notification has been suppressed  
	const isSuppressed = useSelector((state) =>   
	  state?.settings?.notifications?.suppress?.['game-stats-welcome'] === true  
	);  
  
	useEffect(() => {  
  if (!isSuppressed) {  
    api.showDialog(  
      'info',  
      'Welcome to Immersive Support',  {  
        htmlText: '<h4 style="margin-top:0">Important things to remember for I&amp;A:</h4>'
		  + '<br><br>'
          + '<ul style="margin:0;padding-left:20px;list-style-type:disc">'  
          + '<li>Profiles are not separate</li>'  
          + '<li>Mods or collections in other profiles will almost always prevent the collection from starting</li>'  
          + '<li>You don\'t need to run any tools — this has been done for you</li>'  
          + '<li>The collection uses BHUNP as a body mod</li>'  
          + '<li>The collection uses OBody to change body shape'  
          + '<ul style="margin:0;padding-left:20px;list-style-type:circle">'  
          + '<li>Simply press "O" while targeting a female NPC or no target to change your PC body</li>'  
          + '</ul></li>'  
          + '<li>Do not use the body sliders in character creation/racemenu</li>'  
          + '<li>You are not stuck and it\'s not a bug — Ostim scenes are controlled using the numpad'  
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
        api.store.dispatch(actions.suppressNotification('game-stats-welcome', true));  
      }  
    });  
  }  
}, [isSuppressed, api]);
  
//Build a map of modId -> [collectionMod, ...]
const collectionMap = {};  
Object.values(mods).filter(m => m.type === 'collection').forEach(coll => {  
  (coll.rules || []).forEach(rule => {  
    const refId = rule.reference?.id;  
    if (refId !== undefined) {  
      if (!collectionMap[refId]) collectionMap[refId] = [];  
      collectionMap[refId].push(coll);  
    } else {  
			// For rules that reference mods by MD5/logicalFileName/fileExpression  
			// rather than a direct ID, use findModByRef to resolve them  
      const installed = util.findModByRef(rule.reference, mods);  
      if (installed !== undefined) {  
        if (!collectionMap[installed.id]) collectionMap[installed.id] = [];  
        collectionMap[installed.id].push(coll);  
      }  
    }  
  });  
});  
  
  const enabledModIds = Object.keys(profile?.modState || {}).filter(  
    (modId) => profile.modState[modId]?.enabled === true  
  );  
  const enabledModsCount = enabledModIds.length;  
  const regularMods = Object.values(mods).filter(m => m.type !== 'collection');  
  const disabledCount = regularMods.filter(m =>  
    m.state === 'installed' && profile?.modState?.[m.id]?.enabled !== true  
  ).length;  

//The uninstalled and never installed counts aren't reliable and unnecessary

/*const uninstalledCount = regularMods.filter(m =>  
  m.state === 'downloaded' && m.attributes?.wasInstalled === true  
).length;  
const neverInstalledCount = regularMods.filter(m =>  
  m.state === 'downloaded' && !m.attributes?.wasInstalled  
).length;
*/

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
  const eslGame  = eslGames.includes(activeGameId?.toLowerCase());  
  
  const isActive = (id) =>  
    loadOrder[id]?.enabled === true || pluginList[id]?.isNative === true;  
  
// A plugin is disabled if it exists on disk, is not native, and is not active  
  const disabledPlugins = Object.keys(pluginList).filter(  
    (id) => !pluginList[id]?.isNative && !isActive(id)  
  );
	
  const isValid = (id) =>  
    (pluginList[id]?.deployed === true || pluginList[id]?.isNative === true) && isActive(id);  
  
  const isLight = (id) => {  
    if (pluginInfo[id]?.isLight) return true;  
    const filePath = pluginList[id]?.filePath || '';  
    return filePath.toLowerCase().endsWith('.esl');  
  };  
  
  const activePlugins  = Object.keys(pluginList).filter(isValid);  
  const lightPlugins   = eslGame ? activePlugins.filter(isLight) : [];  
  const regularPlugins = activePlugins.filter((id) => !isLight(id));  
  
  const regularLimit = eslGame ? 254 : 255;  
  const lightLimit   = 4096;  
  
  const profileName = profile?.name || 'None'; 
  
// Get profiles for the current game  
  const gameProfiles = useSelector((state) => {  
    const gameId = selectors.activeGameId(state);  
    const allProfiles = state.persistent.profiles || {};  
    return Object.keys(allProfiles)  
      .filter((id) => allProfiles[id].gameId === gameId)  
      .map((id) => allProfiles[id]);  
  });  
  
// Get enabled mod count for each profile  
  const profileModCounts = useSelector((state) => {  
    const counts = {};  
    gameProfiles.forEach((profile) => {  
      counts[profile.id] = selectors.enabledModCountForProfile(state, profile.id);  
    });  
    return counts;  
  });
 
  const gameProfileCount = gameProfiles.length;  
  
  const installedCollections = Object.values(mods).filter(  
    (mod) => mod.type === 'collection' && mod.state === 'installed'  
  );  
  const collectionCount = installedCollections.length;  
  

//=========================== Render the page  ==========================================================

  return React.createElement(MainPage, null,  
    React.createElement(MainPage.Header, null,  
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
		React.createElement('button', {  
		  style: { float: 'right' },  
		  className: 'btn btn-default',  
		  onClick: () => util.opn('https://discord.gg/immersive-collections').catch(() => undefined)  
		}, 'Discord Server'),
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
          }  
       },  
		React.createElement('h2', null, 'Vital Statistics'),  
        row('Vortex Version: ', vortexVersion),  
        React.createElement('hr', null),  
		
	React.createElement('div', { style: { display: 'flex', gap: '24px', alignItems: 'flex-start' } },  
  
  // Column 1: Path/folder data  
	  React.createElement('div', { style: { flex: '1' } },  	
        row('Active Game: ', gameName),  
        row('Game Path: ', isRemovable ? `${gamePath} (Removable)` : gamePath),
		row('Staging Folder: ', stagingPath || 'Not configured'),
        React.createElement('div', { style: { marginBottom: '10px' } },  
          React.createElement('strong', null, 'INI Files:'),  
          iniPaths.length > 0  
            ? React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },  
                ...iniPaths.map(p => React.createElement('li', { key: p }, p))  
              )  
            : React.createElement('span', null, ' Not available for this game')  
          ),
	  ),
	  
  // Column 2: Space used data (right column)  
	  React.createElement('div', { style: { flexShrink: 0, textAlign: 'right', minWidth: '220px' } },  
		React.createElement('div', { style: { marginBottom: '4px' } },  
		  React.createElement('span', { style: { fontWeight: 'bold' } }, 'Space Used: '),  
		  React.createElement('span', null, spaceUsedStr)  
      ),  
      React.createElement('div', null,  
        React.createElement('span', { style: { fontWeight: 'bold' } }, 'Space Used (No Symlinks): '),  
        React.createElement('span', null, spaceNoLinksStr)    
		),
	  )
	)
        React.createElement('hr', null),  
  
        React.createElement('div', { style: { marginBottom: '10px' } },  
          React.createElement('strong', null,),
		  row('Enabled Mods: ', `${enabledModsCount}`),
		  row('Disabled Mods: ', `${disabledCount}`),
          React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },  
            ...Object.entries(collectionCounts).map(([name, count]) =>  
              React.createElement('li', { key: name }, `${name}: ${count}`)  
            ),  
            React.createElement('li', { key: '__none__' }, `None: ${noneCount}`)  
          )  
        ),  
        row('Total Active Plugins: ', activePlugins.length),  
		row('Disabled Plugins: ', disabledPlugins.length),
        row('Full Plugins: ', `${regularPlugins.length} / ${regularLimit}`),  
        row('Light Plugins: ', eslGame ? `${lightPlugins.length} / ${lightLimit}` : 'Not supported'),  
        React.createElement('hr', null),  
  
        row('Active Profile: ', profileName),  
        React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },  
		  ...gameProfiles.map((p) =>  
			React.createElement('li', { key: p.id }, `${p.name} (${profileModCounts[p.id] || 0})`)  
		  )  
		),  
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
        React.createElement('h3', null, 'Troubleshooting'),  
        React.createElement('p', { style: { marginBottom: '12px', fontStyle: 'italic' } },  
          'Stop. Do not remove or reinstall things on the first error prompt you are seeing. ' +  
          'This is not a Commodore 64 — hitting the PC or redoing the same things won\'t result in a different outcome. ' +  
          'Most errors you get are explained below. You\'ll be able to solve most of them.'  
        ),  
        ...faqItems.map((item, i) =>  
          React.createElement(FaqItem, { key: i, heading: item.heading }, item.content)  
        )  
      )  
    )  
  );  
}  
  
module.exports = GameStatsPage;
