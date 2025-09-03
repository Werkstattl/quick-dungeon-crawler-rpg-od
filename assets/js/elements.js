const playerNameElement = document.querySelector('#player-name');
const playerLvlElement = document.querySelector('#player-lvl');
const playerHpElement = document.querySelector('#player-hp');
const playerCombatHpElement = document.querySelector('#player-hp-battle');
const playerAtkElement = document.querySelector('#player-atk');
const playerDefElement = document.querySelector('#player-def');
const playerAtkSpdElement = document.querySelector('#player-atkspd');
const playerVampElement = document.querySelector('#player-vamp');
const playerCrateElement = document.querySelector('#player-crate');
const playerCdmgElement = document.querySelector('#player-cdmg');
const playerDodgeElement = document.querySelector('#player-dodge');
const defaultModalElement = document.querySelector('#defaultModal');
const confirmationModalElement = document.querySelector('#confirmationModal');
const sellRarityElement = document.querySelector('#sell-rarity');
const menuModalElement = document.querySelector('#menuModal');
const sortInventoryElement = document.querySelector('#sort-inventory');

// Close modals when clicking outside their content
(function setupModalClickAway() {
  const containers = Array.from(document.querySelectorAll('.modal-container'));
  const shouldIgnore = new Set(['combatPanel', 'lvlupPanel']);

  const restoreDimmedUI = () => {
    const ids = ['dungeon-main', 'inventory', 'character-creation', 'title-screen'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.filter = 'brightness(100%)';
    });
  };

  containers.forEach(container => {
    if (shouldIgnore.has(container.id)) return;
    container.addEventListener('click', (e) => {
      let clickedInsideContent = false;
      if (typeof e.composedPath === 'function') {
        const path = e.composedPath();
        clickedInsideContent = path && path.some(node => node && node.classList && node.classList.contains('content'));
      }
      if (!clickedInsideContent) {
        // Fallback if composedPath isn't available
        clickedInsideContent = !!(e.target && typeof e.target.closest === 'function' && e.target.closest('.content'));
      }
      if (clickedInsideContent) return;

      switch (container.id) {
        case 'defaultModal':
          if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') sfxDecline.play();
          if (typeof closeDefaultModal === 'function') {
            closeDefaultModal();
          } else {
            container.style.display = 'none';
          }
          restoreDimmedUI();
          break;
        case 'inventory':
          if (typeof closeInventory === 'function') {
            // closeInventory already plays sound and restores brightness
            closeInventory();
          } else {
            if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') sfxDecline.play();
            container.style.display = 'none';
            restoreDimmedUI();
          }
          break;
        case 'companionModal':
          if (typeof closeCompanionModal === 'function') {
            closeCompanionModal();
          } else {
            container.style.display = 'none';
            restoreDimmedUI();
          }
          break;
        case 'forgeModal':
          if (typeof closeForgeModal === 'function') {
            closeForgeModal();
          } else {
            container.style.display = 'none';
            restoreDimmedUI();
          }
          break;
        case 'equipmentInfo':
          if (typeof closeEquipmentInfo === 'function') {
            closeEquipmentInfo();
          } else {
            container.style.display = 'none';
            restoreDimmedUI();
          }
          break;
        case 'menuModal':
        case 'confirmationModal':
          if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') sfxDecline.play();
          container.style.display = 'none';
          restoreDimmedUI();
          break;
        default:
          if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') sfxDecline.play();
          container.style.display = 'none';
          restoreDimmedUI();
          break;
      }
    });
  });
})();
