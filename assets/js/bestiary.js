// Bestiary system
// Structure: { [id]: { e: Number, k: Number } }
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

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
            bestiary[String(r.id)] = { e: r.e, k: r.k };
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
            store.put({ id: Number(id), e: entry.e, k: entry.k });
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
  sortByEl.value = ['id', 'name', 'encounters', 'kills'].includes(savedSortBy) ? savedSortBy : 'id';
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
        try {
          return (typeof getEnemyTranslatedName === 'function' ? (getEnemyTranslatedName(enemyId) || '') : '') || '';
        } catch {
          return '';
        }
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
      let name = getEnemyTranslatedName(id)
      // if (typeof getEnemyTranslatedName === 'function') {
        // const translated = getEnemyTranslatedName(id);
      //   if (translated) name = translated;
      // }
      const nameEl = document.createElement('span');
      nameEl.textContent = name;

      // Stats
      const stats = bestiary[id];
      const statEl = document.createElement('span');
      statEl.className = 'stats';
      statEl.textContent = `E:${stats.e} K:${stats.k}`;

      // Image - lazy + async decode + explicit size (use thumbnails if possible)
      const sprite = bestiarySprites[id];
      if (sprite) {
        const img = document.createElement('img');
        img.loading = 'lazy';     // browser native lazy load
        img.decoding = 'async';
        img.alt = name;
        img.width = 64;           // set real thumbnail dims if you have them
        img.height = 64;
        // Prefer a small thumbnail path if available:
        // img.dataset.src = `./assets/sprites/thumbs/${sprite}.webp`;
        img.dataset.src = `./assets/sprites/${sprite}.webp`;
        imgObserver.observe(img);
        li.appendChild(img);
      }

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
