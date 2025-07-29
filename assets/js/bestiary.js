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
        <h3>Bestiary</h3>
        <p id="bestiary-close"><i class="fa fa-xmark"></i></p>
      </div>
      <ul class="bestiary-list" id="bestiary-list"></ul>
      <button id="bestiary-load-more">Load more</button>
    </div>`;

  const closeBtn = document.querySelector('#bestiary-close');
  const listEl = document.querySelector('#bestiary-list');
  const loadMoreBtn = document.querySelector('#bestiary-load-more');

  closeBtn.onclick = () => {
    sfxDecline.play();
    // Clean up aggressively
    if (imgObserver) imgObserver.disconnect();
    defaultModalElement.style.display = 'none';
    defaultModalElement.replaceChildren(); // drop references to nodes quickly
    menuModalElement.style.display = 'flex';
  };

  const ids = Object.keys(bestiary).sort((a, b) => Number(a) - Number(b));
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

  function renderBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(index + BATCH, ids.length);

    for (; index < end; index++) {
      const id = ids[index];
      const li = document.createElement('li');

      // Name (use textContent to avoid injection and layout thrash)
      const name = enemyIdMap[id] || id;
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
  renderBatch(); // first chunk
}
