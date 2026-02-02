// Bestiary system
// Structure: { [id]: { e: Number, k: Number, n?: String, img?: String } }
let bestiary = {};

const BESTIARY_DB = 'qdc';
const BESTIARY_STORE = 'bestiary';
let bestiaryDB;

function openBestiaryDB() {
  if (bestiaryDB) return Promise.resolve(bestiaryDB);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BESTIARY_DB, 1);
    request.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(BESTIARY_STORE)) {
        db.createObjectStore(BESTIARY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = function () {
      bestiaryDB = request.result;
      resolve(bestiaryDB);
    };
    request.onerror = function () { reject(request.error); };
  });
}

function idbRequest(reqOrTx) {
  // Supports both IDBRequest and IDBTransaction.
  return new Promise((resolve, reject) => {
    if (!reqOrTx) return resolve(null);

    // Transaction: wait for completion.
    if (typeof reqOrTx.objectStore === 'function') {
      reqOrTx.oncomplete = () => resolve();
      reqOrTx.onabort = () => reject(reqOrTx.error || new Error('IndexedDB transaction aborted'));
      reqOrTx.onerror = () => reject(reqOrTx.error || new Error('IndexedDB transaction error'));
      return;
    }

    // Request: resolve with result.
    reqOrTx.onsuccess = () => resolve(reqOrTx.result);
    reqOrTx.onerror = () => reject(reqOrTx.error);
  });
}

// Mapping of enemy IDs to sprite file names
const bestiarySprites = {};
for (const id in enemyData) {
    const spriteInfo = enemyData[id].sprite;
    bestiarySprites[id] = Array.isArray(spriteInfo) ? spriteInfo[0] : spriteInfo;
}

async function loadBestiary() {
    bestiary = {};
    try {
        const db = await openBestiaryDB();
        const tx = db.transaction(BESTIARY_STORE, 'readonly');
        const records = await idbRequest(tx.objectStore(BESTIARY_STORE).getAll());
        for (const r of records) {
      const entry = { e: r.e, k: r.k };
      if (typeof r.n === 'string' && r.n.trim()) entry.n = r.n;
      if (typeof r.img === 'string' && r.img) entry.img = r.img;
      bestiary[String(r.id)] = entry;
        }
        await idbRequest(tx);
    } catch (e) {
        bestiary = {};
    }
}

async function saveBestiary() {
    try {
        const db = await openBestiaryDB();
        const tx = db.transaction(BESTIARY_STORE, 'readwrite');
        const store = tx.objectStore(BESTIARY_STORE);
        for (const id in bestiary) {
            const entry = bestiary[id];
      const record = { id: Number(id), e: entry.e, k: entry.k };
      if (typeof entry.n === 'string' && entry.n.trim()) record.n = entry.n;
      if (typeof entry.img === 'string' && entry.img) record.img = entry.img;
      store.put(record);
        }
        await idbRequest(tx);
    } catch (e) {
        // ignore
    }
}

function addToBestiary(id) {
    const key = String(id);
    if (!bestiary[key]) {
    bestiary[key] = { e: 0, k: 0 };
    }
    bestiary[key].e++;
    saveBestiary();
}

function recordBestiaryKill(id) {
    const key = String(id);
    if (!bestiary[key]) {
        bestiary[key] = { e: 0, k: 0 };
    }
    bestiary[key].k++;
    saveBestiary();
}

function getBestiaryDisplayName(enemyId) {
  const entry = bestiary[String(enemyId)];
  if (entry && typeof entry.n === 'string' && entry.n.trim()) return entry.n.trim();
  try {
    if (typeof getEnemyTranslatedName === 'function') {
      const translated = getEnemyTranslatedName(enemyId);
      if (translated) return translated;
    }
  } catch {}
  return String(enemyId);
}

function getRenamePromptText(currentName) {
  try {
    if (typeof t === 'function') {
      return t('bestiary-rename-prompt', { name: currentName });
    }
  } catch {}
  return `Enter a custom name for ${currentName}. Leave empty to reset.`;
}

function getBestiaryActionLabel(key, fallback) {
  try {
    if (typeof t === 'function') {
      const label = t(key);
      if (label && label !== key) return label;
    }
  } catch {}
  return fallback;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getBestiaryCustomImage(enemyId) {
  const entry = bestiary[String(enemyId)];
  if (entry && typeof entry.img === 'string' && entry.img) return entry.img;
  return null;
}

function getBestiaryEnemySpriteSrc(enemyId, fallbackSpriteName) {
  const custom = getBestiaryCustomImage(enemyId);
  if (custom) return custom;
  const spriteName = fallbackSpriteName || bestiarySprites[enemyId];
  if (!spriteName) return '';
  return `./assets/sprites/${spriteName}.webp`;
}

function openBestiaryModal() {
  sfxOpen.play();
  menuModalElement.style.display = 'none';
  defaultModalElement.style.display = 'flex';
  defaultModalElement.innerHTML = `
    <div class="content" id="bestiary-modal">
      <div class="content-head">
        <h3 data-i18n="bestiary">Bestiary</h3>
        <p id="bestiary-close"><i class="fa fa-xmark"></i></p>
      </div>
      <div class="bestiary-controls" id="bestiary-controls">
        <span class="label" data-i18n="sort">Sort</span>
        <select id="bestiary-sort-by" aria-label="Sort by">
          <!--<option value="id" data-i18n="bestiary-sort.id">ID</option>-->
          <option value="name" data-i18n="bestiary-sort.name">Name</option>
          <option value="encounters" data-i18n="bestiary-sort.encounters">Encounters</option>
          <option value="kills" data-i18n="bestiary-sort.kills">Kills</option>
        </select>
        <select id="bestiary-sort-dir" aria-label="Sort direction">
          <option value="asc" data-i18n="bestiary-sort.asc">Ascending</option>
          <option value="desc" data-i18n="bestiary-sort.desc">Descending</option>
        </select>
      </div>
      <ul class="bestiary-list" id="bestiary-list"></ul>
      <button id="bestiary-load-more" data-i18n="load-more">Load more</button>
    </div>`;
  applyTranslations(defaultModalElement);
  const closeBtn = document.querySelector('#bestiary-close');
  const listEl = document.querySelector('#bestiary-list');
  const loadMoreBtn = document.querySelector('#bestiary-load-more');
  const sortByEl = document.querySelector('#bestiary-sort-by');
  const sortDirEl = document.querySelector('#bestiary-sort-dir');

  closeBtn.onclick = () => {
    sfxDecline.play();
    // Clean up aggressively
    if (imgObserver) imgObserver.disconnect();
    defaultModalElement.style.display = 'none';
    defaultModalElement.replaceChildren(); // drop references to nodes quickly
    menuModalElement.style.display = 'flex';
  };

  const BESTIARY_SORT_BY_KEY = 'bestiarySortBy';
  const BESTIARY_SORT_DIR_KEY = 'bestiarySortDir';

  const savedSortBy = (localStorage.getItem(BESTIARY_SORT_BY_KEY) || '').trim();
  const savedSortDir = (localStorage.getItem(BESTIARY_SORT_DIR_KEY) || '').trim();
  sortByEl.value = ['id', 'name', 'encounters', 'kills'].includes(savedSortBy) ? savedSortBy : 'name';
  sortDirEl.value = ['asc', 'desc'].includes(savedSortDir) ? savedSortDir : 'asc';

  let ids = [];
  const BATCH = 10;
  let index = 0;

  // Lazy image loader (assign src only when in view)
  const imgObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const img = e.target;
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
        imgObserver.unobserve(img);
      }
    }
  }, { root: listEl, rootMargin: '200px' });

  function getSortValue(enemyId, sortBy) {
    switch (sortBy) {
      case 'encounters':
        return (bestiary[enemyId] && bestiary[enemyId].e) ? bestiary[enemyId].e : 0;
      case 'kills':
        return (bestiary[enemyId] && bestiary[enemyId].k) ? bestiary[enemyId].k : 0;
      case 'name':
        return getBestiaryDisplayName(enemyId) || '';
      case 'id':
      default:
        return Number(enemyId);
    }
  }

  function computeSortedIds() {
    const sortBy = sortByEl.value;
    const sortDir = sortDirEl.value;
    const base = Object.keys(bestiary);

    // Cache expensive name lookups during sort.
    const nameCache = Object.create(null);
    const getName = (enemyId) => {
      if (nameCache[enemyId] != null) return nameCache[enemyId];
      const v = getSortValue(enemyId, 'name');
      nameCache[enemyId] = v;
      return v;
    };

    const dir = sortDir === 'desc' ? -1 : 1;

    base.sort((a, b) => {
      let cmp = 0;

      if (sortBy === 'name') {
        const nameA = getName(a);
        const nameB = getName(b);
        cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      } else if (sortBy === 'encounters' || sortBy === 'kills') {
        const va = getSortValue(a, sortBy);
        const vb = getSortValue(b, sortBy);
        cmp = (va - vb);
      } else {
        cmp = (Number(a) - Number(b));
      }

      if (cmp === 0) {
        // Stable-ish tie-breaker: ID ascending
        cmp = Number(a) - Number(b);
      }

      return cmp * dir;
    });

    return base;
  }

  function resetAndRender() {
    localStorage.setItem(BESTIARY_SORT_BY_KEY, sortByEl.value);
    localStorage.setItem(BESTIARY_SORT_DIR_KEY, sortDirEl.value);

    ids = computeSortedIds();
    index = 0;
    listEl.replaceChildren();
    imgObserver.disconnect();
    loadMoreBtn.style.display = ids.length > BATCH ? 'block' : 'none';
    renderBatch();
  }

  function renderBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(index + BATCH, ids.length);

    for (; index < end; index++) {
      const id = ids[index];
      const li = document.createElement('li');

      // Name (use textContent to avoid injection and layout thrash)
      // let name = enemyIdMap[id] || id;
      let name = getBestiaryDisplayName(id);
      // if (typeof getEnemyTranslatedName === 'function') {
        // const translated = getEnemyTranslatedName(id);
      //   if (translated) name = translated;
      // }

      const sprite = bestiarySprites[id];
      const renameBtn = document.createElement('button');
      renameBtn.className = 'bestiary-rename';
      renameBtn.type = 'button';
      const renameLabel = getBestiaryActionLabel('rename', 'Rename');
      renameBtn.setAttribute('aria-label', renameLabel);
      renameBtn.setAttribute('title', renameLabel);
      renameBtn.innerHTML = '<i class="fa fa-pen"></i>';

      const imageBtn = document.createElement('button');
      imageBtn.className = 'bestiary-image';
      imageBtn.type = 'button';
      const imageLabel = getBestiaryActionLabel('change-image', 'Change image');
      imageBtn.setAttribute('aria-label', imageLabel);
      imageBtn.setAttribute('title', imageLabel);
      imageBtn.innerHTML = '<i class="fa fa-image"></i>';

      const imageResetBtn = document.createElement('button');
      imageResetBtn.className = 'bestiary-image-reset';
      imageResetBtn.type = 'button';
      const removeLabel = getBestiaryActionLabel('remove-image', 'Remove custom image');
      imageResetBtn.setAttribute('aria-label', removeLabel);
      imageResetBtn.setAttribute('title', removeLabel);
      imageResetBtn.innerHTML = '<i class="fa fa-trash-can"></i>';
      const hasCustomImage = !!getBestiaryCustomImage(id);
      imageResetBtn.disabled = !hasCustomImage;
      imageResetBtn.style.display = hasCustomImage ? '' : 'none';
      imageBtn.style.display = hasCustomImage ? 'none' : '';

      const nameEl = document.createElement('span');
      nameEl.textContent = name;

      // Stats
      const stats = bestiary[id];
      const statEl = document.createElement('span');
      statEl.className = 'stats';
      statEl.textContent = `E:${stats.e} K:${stats.k}`;

      // Image - lazy + async decode + explicit size (use thumbnails if possible)
      const spriteSrc = getBestiaryEnemySpriteSrc(id, sprite);
      if (spriteSrc) {
        const img = document.createElement('img');
        img.loading = 'lazy';     // browser native lazy load
        img.decoding = 'async';
        img.alt = name;
        img.width = 64;           // set real thumbnail dims if you have them
        img.height = 64;
        // Prefer a small thumbnail path if available:
        // img.dataset.src = `./assets/sprites/thumbs/${sprite}.webp`;
        img.dataset.src = spriteSrc;
        imgObserver.observe(img);
        li.appendChild(img);
      }

      const imageInput = document.createElement('input');
      imageInput.type = 'file';
      imageInput.accept = 'image/*';
      imageInput.className = 'bestiary-image-input';
      imageInput.style.display = 'none';

      imageBtn.onclick = () => {
        imageInput.value = '';
        imageInput.click();
      };

      imageInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (file.type && !file.type.startsWith('image/')) {
          console.warn('Unsupported file type for bestiary image.');
          return;
        }
        try {
          const dataUrl = await readFileAsDataURL(file);
          if (!bestiary[String(id)]) bestiary[String(id)] = { e: 0, k: 0 };
          bestiary[String(id)].img = dataUrl;
          saveBestiary();

          let img = li.querySelector('img');
          if (!img) {
            img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = name;
            img.width = 64;
            img.height = 64;
            li.insertBefore(img, li.firstChild);
          }
          img.dataset.src = dataUrl;
          img.src = dataUrl;
          imageResetBtn.disabled = false;
          imageResetBtn.style.display = '';
          imageBtn.style.display = 'none';

          if (typeof enemy !== 'undefined' && enemy && String(enemy.id) === String(id)) {
            const enemySprite = document.querySelector('#enemy-sprite');
            if (enemySprite) enemySprite.src = dataUrl;
          }
        } catch (err) {
          console.warn('Failed to load bestiary image.', err);
        }
      });

      renameBtn.onclick = () => {
        sfxOpen.play();
        const current = getBestiaryDisplayName(id);
        const next = prompt(getRenamePromptText(current), (bestiary[String(id)] && bestiary[String(id)].n) ? bestiary[String(id)].n : current);
        if (next == null) return;
        const trimmed = String(next).trim();
        if (!bestiary[String(id)]) bestiary[String(id)] = { e: 0, k: 0 };
        if (!trimmed) {
          delete bestiary[String(id)].n;
        } else {
          bestiary[String(id)].n = trimmed;
        }
        saveBestiary();

        // Update UI immediately.
        name = getBestiaryDisplayName(id);
        nameEl.textContent = name;
        const img = li.querySelector('img');
        if (img) img.alt = name;

        // If we are sorting by name, the list order may change.
        if (sortByEl.value === 'name') {
          resetAndRender();
        }
      };

      imageResetBtn.onclick = () => {
        if (imageResetBtn.disabled) return;
        sfxDecline.play();
        if (!bestiary[String(id)]) bestiary[String(id)] = { e: 0, k: 0 };
        delete bestiary[String(id)].img;
        saveBestiary();

        const fallbackSrc = getBestiaryEnemySpriteSrc(id, sprite);
        let img = li.querySelector('img');
        if (img) {
          if (fallbackSrc) {
            img.dataset.src = fallbackSrc;
            img.src = fallbackSrc;
          } else {
            img.remove();
            img = null;
          }
        } else if (fallbackSrc) {
          img = document.createElement('img');
          img.loading = 'lazy';
          img.decoding = 'async';
          img.alt = name;
          img.width = 64;
          img.height = 64;
          img.dataset.src = fallbackSrc;
          img.src = fallbackSrc;
          li.insertBefore(img, li.firstChild);
        }

        if (typeof enemy !== 'undefined' && enemy && String(enemy.id) === String(id)) {
          const enemySprite = document.querySelector('#enemy-sprite');
          if (enemySprite && fallbackSrc) enemySprite.src = fallbackSrc;
        }

        imageResetBtn.disabled = true;
        imageResetBtn.style.display = 'none';
        imageBtn.style.display = '';
      };

      li.appendChild(imageInput);
      li.appendChild(imageBtn);
      li.appendChild(imageResetBtn);
      li.appendChild(renameBtn);
      li.appendChild(nameEl);
      li.appendChild(statEl);
      frag.appendChild(li);
    }

    listEl.appendChild(frag);

    if (index >= ids.length) {
      loadMoreBtn.style.display = 'none';
    }
  }

  loadMoreBtn.onclick = renderBatch;
  sortByEl.onchange = resetAndRender;
  sortDirEl.onchange = resetAndRender;
  resetAndRender(); // first chunk
}
