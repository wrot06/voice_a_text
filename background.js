// Abrir o enfocar la pestaña del transcriptor al hacer clic en el icono de la extensión
chrome.action.onClicked.addListener(() => {
  openOrFocusTranscriber();
});

// Manejar atajo global de teclado (e.g. Alt+Shift+S)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-recording') {
    openOrFocusTranscriber((tab) => {
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle-recording' }).catch(() => {
          // Ignorar error si el script aún está cargando
        });
      }
    });
  }
});

function openOrFocusTranscriber(callback) {
  const url = chrome.runtime.getURL('index.html');
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(t => t.url && t.url.startsWith(url));
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        if (updatedTab && updatedTab.windowId) {
          chrome.windows.update(updatedTab.windowId, { focused: true });
        }
        if (callback) callback(existingTab);
      });
    } else {
      chrome.tabs.create({ url: 'index.html' }, (newTab) => {
        if (callback) callback(newTab);
      });
    }
  });
}

