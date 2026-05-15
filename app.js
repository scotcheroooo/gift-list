const STORAGE_KEY = "giftListApp.shared.v2";
const CURRENT_USER_KEY = "giftListApp.currentUserHash.v1";

const sampleData = {
  interests:
    "Right now I am interested in cozy room decor, art supplies, games, useful desk stuff, favorite snacks, and anything that feels personal.",
  users: [],
  gifts: [
    {
      id: crypto.randomUUID(),
      name: "Dual-tip art marker set",
      price: 24.99,
      store: "Amazon",
      url: "https://www.amazon.com/",
      image:
        "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
      note: "Any colorful marker set is fine. Alcohol markers are best.",
      bought: false,
      boughtBy: "",
      boughtByHash: "",
      addedAt: Date.now() - 5000
    },
    {
      id: crypto.randomUUID(),
      name: "Soft throw blanket",
      price: 32,
      store: "Target",
      url: "https://www.target.com/",
      image:
        "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80",
      note: "Neutral colors or sage green would be great.",
      bought: false,
      boughtBy: "",
      boughtByHash: "",
      addedAt: Date.now() - 4000
    },
    {
      id: crypto.randomUUID(),
      name: "Bookstore gift card",
      price: 15,
      store: "Local bookstore",
      url: "https://bookshop.org/",
      image:
        "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80",
      note: "Any amount works.",
      bought: false,
      boughtBy: "",
      boughtByHash: "",
      addedAt: Date.now() - 3000
    }
  ]
};

let state = loadLocalState();
let currentUserHash = localStorage.getItem(CURRENT_USER_KEY) || "";
let activeGiftId = "";
let database = null;
let auth = null;
let rootRef = null;
let legacyStateRef = null;
let firebaseReady = false;
let hasLoadedRemote = false;
let ownerSignedIn = false;
let remoteNeedsOwnerSetup = false;
let editingGiftId = "";

const els = {
  welcomeScreen: document.querySelector("#welcomeScreen"),
  giftScreen: document.querySelector("#giftScreen"),
  createTab: document.querySelector("#createTab"),
  returnTab: document.querySelector("#returnTab"),
  createForm: document.querySelector("#createForm"),
  returnForm: document.querySelector("#returnForm"),
  authMessage: document.querySelector("#authMessage"),
  newName: document.querySelector("#newName"),
  newRelation: document.querySelector("#newRelation"),
  newPin: document.querySelector("#newPin"),
  returnPin: document.querySelector("#returnPin"),
  helloText: document.querySelector("#helloText"),
  syncStatus: document.querySelector("#syncStatus"),
  interestText: document.querySelector("#interestText"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  filterSelect: document.querySelector("#filterSelect"),
  resultCount: document.querySelector("#resultCount"),
  giftList: document.querySelector("#giftList"),
  buyDialog: document.querySelector("#buyDialog"),
  buyDialogText: document.querySelector("#buyDialogText"),
  confirmBoughtButton: document.querySelector("#confirmBoughtButton"),
  signOutButton: document.querySelector("#signOutButton"),
  ownerButton: document.querySelector("#ownerButton"),
  ownerDialog: document.querySelector("#ownerDialog"),
  ownerUnlockForm: document.querySelector("#ownerUnlockForm"),
  ownerCloseButton: document.querySelector("#ownerCloseButton"),
  ownerDoneButton: document.querySelector("#ownerDoneButton"),
  ownerEmailInput: document.querySelector("#ownerEmailInput"),
  ownerPasswordInput: document.querySelector("#ownerPasswordInput"),
  ownerMessage: document.querySelector("#ownerMessage"),
  ownerPanel: document.querySelector("#ownerPanel"),
  ownerInterest: document.querySelector("#ownerInterest"),
  saveInterestButton: document.querySelector("#saveInterestButton"),
  ownerUsersList: document.querySelector("#ownerUsersList"),
  ownerGiftsList: document.querySelector("#ownerGiftsList"),
  giftForm: document.querySelector("#giftForm"),
  giftName: document.querySelector("#giftName"),
  giftPrice: document.querySelector("#giftPrice"),
  giftStore: document.querySelector("#giftStore"),
  giftUrl: document.querySelector("#giftUrl"),
  giftImage: document.querySelector("#giftImage"),
  giftNote: document.querySelector("#giftNote"),
  giftSubmitButton: document.querySelector("#giftSubmitButton"),
  cancelEditButton: document.querySelector("#cancelEditButton")
};

function cloneSampleData() {
  return structuredClone(sampleData);
}

function cleanState(value) {
  const fallback = cloneSampleData();
  return {
    interests: typeof value?.interests === "string" ? value.interests : fallback.interests,
    users: normalizeCollection(value?.users, fallback.users),
    gifts: normalizeCollection(value?.gifts, fallback.gifts)
  };
}

function normalizeCollection(value, fallback) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return fallback;
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return cloneSampleData();

  try {
    return cleanState(JSON.parse(saved));
  } catch {
    return cloneSampleData();
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function saveState() {
  saveLocalState();
  if (!firebaseReady || !rootRef || !ownerSignedIn) return;
  await rootRef.set(toRemoteState(state));
}

function hasFirebaseConfig() {
  const config = window.GIFT_LIST_FIREBASE_CONFIG;
  return Boolean(
    config &&
      config.apiKey &&
      config.projectId &&
      config.databaseURL &&
      !String(config.apiKey).includes("PASTE_")
  );
}

function setSyncStatus(text, mode) {
  els.syncStatus.textContent = text;
  els.syncStatus.dataset.mode = mode;
}

function startFirebase() {
  if (!hasFirebaseConfig() || !window.firebase) {
    setSyncStatus("Offline copy", "local");
    return;
  }

  try {
    firebase.initializeApp(window.GIFT_LIST_FIREBASE_CONFIG);
    auth = firebase.auth();
    database = firebase.database();
    rootRef = database.ref("giftList");
    legacyStateRef = database.ref("giftListSharedState");
    firebaseReady = true;
    setSyncStatus("Connecting", "connecting");

    rootRef.on(
      "value",
      async (snapshot) => {
        const remoteState = snapshot.val();

        if (!remoteState) {
          remoteNeedsOwnerSetup = true;

          if (auth?.currentUser) {
            const legacySnapshot = await legacyStateRef.get();
            const legacyState = legacySnapshot.val();
            if (legacyState) {
              state = cleanState(legacyState);
            }
            await rootRef.set(toRemoteState(state));
            return;
          }

          hasLoadedRemote = true;
          saveLocalState();
          setSyncStatus("Owner setup needed", "connecting");
          render();
          return;
        }

        remoteNeedsOwnerSetup = false;
        state = cleanState(remoteState);
        hasLoadedRemote = true;
        saveLocalState();
        setSyncStatus("Shared online", "online");

        if (currentUser()) {
          enterApp();
        } else if (!els.giftScreen.classList.contains("hidden")) {
          signOut();
        } else {
          renderOwnerLists();
        }
      },
      () => {
        firebaseReady = false;
        setSyncStatus("Offline copy", "local");
      }
    );

    auth.onAuthStateChanged((user) => {
      ownerSignedIn = Boolean(user);
      if (ownerSignedIn && remoteNeedsOwnerSetup) {
        saveState();
      }
      if (ownerSignedIn && els.ownerDialog.open) {
        showOwnerPanel();
      }
    });
  } catch {
    firebaseReady = false;
    setSyncStatus("Offline copy", "local");
  }
}

function toRemoteState(value) {
  return {
    interests: value.interests,
    users: Object.fromEntries(value.users.map((user) => [user.pinHash, user])),
    gifts: Object.fromEntries(value.gifts.map((gift) => [gift.id, gift]))
  };
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(`gift-list-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentUser() {
  return state.users.find((user) => user.pinHash === currentUserHash);
}

function showCreateMode() {
  els.createTab.classList.add("active");
  els.returnTab.classList.remove("active");
  els.createForm.classList.remove("hidden");
  els.returnForm.classList.add("hidden");
  els.authMessage.textContent = "";
}

function showReturnMode() {
  els.returnTab.classList.add("active");
  els.createTab.classList.remove("active");
  els.returnForm.classList.remove("hidden");
  els.createForm.classList.add("hidden");
  els.authMessage.textContent = "";
}

function enterApp() {
  const user = currentUser();
  if (!user) return;

  els.welcomeScreen.classList.add("hidden");
  els.giftScreen.classList.remove("hidden");
  els.helloText.textContent = `Hi, ${user.name}`;
  render();
}

function signOut() {
  currentUserHash = "";
  localStorage.removeItem(CURRENT_USER_KEY);
  els.giftScreen.classList.add("hidden");
  els.welcomeScreen.classList.remove("hidden");
  els.returnPin.value = "";
}

function giftMatchesSearch(gift, search) {
  const haystack = [
    gift.name,
    gift.store,
    gift.note,
    money(gift.price)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase().trim());
}

function sortedGifts() {
  const search = els.searchInput.value;
  const filter = els.filterSelect.value;
  const sort = els.sortSelect.value;

  return state.gifts
    .filter((gift) => {
      if (filter === "available" && gift.bought) return false;
      if (filter === "bought" && !gift.bought) return false;
      return giftMatchesSearch(gift, search);
    })
    .sort((a, b) => {
      if (sort === "priceLow") return a.price - b.price;
      if (sort === "priceHigh") return b.price - a.price;
      if (sort === "alpha") return a.name.localeCompare(b.name);
      return b.addedAt - a.addedAt;
    });
}

function render() {
  els.interestText.textContent = state.interests;
  const gifts = sortedGifts();
  els.resultCount.textContent = `${gifts.length} gift${gifts.length === 1 ? "" : "s"} shown`;
  els.giftList.innerHTML = "";

  if (!gifts.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No gifts match that search or filter.";
    els.giftList.append(empty);
    return;
  }

  gifts.forEach((gift) => {
    const card = document.createElement("article");
    card.className = `gift-card${gift.bought ? " bought" : ""}`;

    const preview = gift.image
      ? `<img src="${escapeHtml(gift.image)}" alt="${escapeHtml(gift.name)} preview" loading="lazy">`
      : `<div class="preview-fallback">No picture yet</div>`;

    const title = gift.bought
      ? `<span class="gift-title disabled">${escapeHtml(gift.name)}</span>`
      : `<span class="gift-title-wrap"><a class="gift-title" href="${escapeHtml(gift.url)}" target="_blank" rel="noopener">${escapeHtml(gift.name)}</a><span class="preview" aria-hidden="true">${preview}</span></span>`;

    card.innerHTML = `
      <div class="gift-main">
        <div>${title}</div>
        <div class="price">${money(gift.price)}</div>
      </div>
      <p class="meta">${escapeHtml(gift.store)}</p>
      <p class="note">${escapeHtml(gift.note || "No extra notes.")}</p>
      <div class="gift-actions">
        ${renderGiftAction(gift)}
      </div>
    `;

    els.giftList.append(card);
  });
}

function renderGiftAction(gift) {
  if (!gift.bought) {
    return `<button class="secondary-button bought-button" type="button" data-id="${escapeHtml(gift.id)}">I bought this</button>`;
  }

  const boughtByCurrentUser = gift.boughtByHash && gift.boughtByHash === currentUserHash;
  if (boughtByCurrentUser) {
    return `
      <span class="meta">Bought by you</span>
      <button class="secondary-button unbuy-button" type="button" data-id="${escapeHtml(gift.id)}">Undo bought</button>
    `;
  }

  return `<span class="meta">Bought by ${escapeHtml(gift.boughtBy || "someone")}</span>`;
}

function openBoughtDialog(giftId) {
  const gift = state.gifts.find((item) => item.id === giftId);
  if (!gift) return;

  activeGiftId = giftId;
  els.buyDialogText.textContent = `This will cross out "${gift.name}" and remove the buying link for everyone.`;
  els.buyDialog.showModal();
}

async function markBought() {
  const user = currentUser();
  const gift = state.gifts.find((item) => item.id === activeGiftId);
  if (!gift || !user) return;

  gift.bought = true;
  gift.boughtBy = `${user.name} (${user.relation})`;
  gift.boughtByHash = currentUserHash;
  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`gifts/${gift.id}`).update({
      bought: true,
      boughtBy: gift.boughtBy,
      boughtByHash: currentUserHash
    });
  }
  render();
}

async function undoBought(giftId) {
  const gift = state.gifts.find((item) => item.id === giftId);
  if (!gift || gift.boughtByHash !== currentUserHash) return;

  gift.bought = false;
  gift.boughtBy = "";
  gift.boughtByHash = "";
  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`gifts/${gift.id}`).update({
      bought: false,
      boughtBy: "",
      boughtByHash: ""
    });
  }
  render();
  renderOwnerLists();
}

function showOwnerPanel() {
  els.ownerUnlockForm.classList.add("hidden");
  els.ownerPanel.classList.remove("hidden");
  els.ownerInterest.value = state.interests;
  els.ownerMessage.textContent = "";
  renderOwnerLists();
}

function renderOwnerLists() {
  if (!els.ownerUsersList || !els.ownerGiftsList) return;

  els.ownerUsersList.innerHTML = "";
  if (!state.users.length) {
    const emptyUsers = document.createElement("p");
    emptyUsers.className = "meta";
    emptyUsers.textContent = "No visitor accounts yet.";
    els.ownerUsersList.append(emptyUsers);
  } else {
    state.users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((user) => {
        const row = document.createElement("div");
        row.className = "owner-list-row";
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <p>${escapeHtml(user.relation)} - ${boughtCountForUser(user)} bought</p>
          </div>
          <button class="danger-button delete-user-button" type="button" data-id="${escapeHtml(user.pinHash)}">Delete user</button>
        `;
        els.ownerUsersList.append(row);
      });
  }

  els.ownerGiftsList.innerHTML = "";
  if (!state.gifts.length) {
    const emptyGifts = document.createElement("p");
    emptyGifts.className = "meta";
    emptyGifts.textContent = "No gifts on the list yet.";
    els.ownerGiftsList.append(emptyGifts);
  } else {
    state.gifts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((gift) => {
        const row = document.createElement("div");
        row.className = "owner-list-row";
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(gift.name)}</strong>
            <p>${money(gift.price)} - ${escapeHtml(gift.store)}${gift.bought ? " - bought" : ""}</p>
          </div>
          <div class="owner-row-actions">
            <button class="secondary-button edit-gift-button" type="button" data-id="${escapeHtml(gift.id)}">Edit</button>
            <button class="danger-button delete-gift-button" type="button" data-id="${escapeHtml(gift.id)}">Delete gift</button>
          </div>
        `;
        els.ownerGiftsList.append(row);
      });
  }
}

function boughtCountForUser(user) {
  const oldBoughtBy = `${user.name} (${user.relation})`;
  return state.gifts.filter(
    (gift) => gift.bought && (gift.boughtByHash === user.pinHash || gift.boughtBy === oldBoughtBy)
  ).length;
}

function startGiftEdit(giftId) {
  const gift = state.gifts.find((item) => item.id === giftId);
  if (!gift) return;

  editingGiftId = giftId;
  els.giftName.value = gift.name;
  els.giftPrice.value = gift.price;
  els.giftStore.value = gift.store;
  els.giftUrl.value = gift.url;
  els.giftImage.value = gift.image || "";
  els.giftNote.value = gift.note || "";
  els.giftSubmitButton.textContent = "Save gift";
  els.cancelEditButton.classList.remove("hidden");
  els.giftName.focus();
}

function stopGiftEdit() {
  editingGiftId = "";
  els.giftForm.reset();
  els.giftSubmitButton.textContent = "Add gift";
  els.cancelEditButton.classList.add("hidden");
}

async function unlockOwner(event) {
  event.preventDefault();

  if (!auth) {
    els.ownerMessage.textContent = "Firebase is not ready yet. Try again in a moment.";
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(
      els.ownerEmailInput.value.trim(),
      els.ownerPasswordInput.value
    );
    ownerSignedIn = true;
    showOwnerPanel();
  } catch {
    els.ownerMessage.textContent = "That owner login did not work. Check the email and password.";
  }
}

function closeOwner() {
  els.ownerDialog.close();
  els.ownerUnlockForm.classList.remove("hidden");
  els.ownerPanel.classList.add("hidden");
  els.ownerPasswordInput.value = "";
  els.ownerMessage.textContent = "";
}

els.createTab.addEventListener("click", showCreateMode);
els.returnTab.addEventListener("click", showReturnMode);

els.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = els.newPin.value.trim();
  const pinHash = await hashPin(pin);

  if (state.users.some((user) => user.pinHash === pinHash)) {
    els.authMessage.textContent = "That PIN is already taken. Choose a different one.";
    return;
  }

  state.users.push({
    name: els.newName.value.trim(),
    relation: els.newRelation.value.trim(),
    pinHash
  });
  currentUserHash = pinHash;
  localStorage.setItem(CURRENT_USER_KEY, currentUserHash);
  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`users/${pinHash}`).set({
      name: els.newName.value.trim(),
      relation: els.newRelation.value.trim(),
      pinHash
    });
  }
  enterApp();
});

els.returnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = els.returnPin.value.trim();
  const pinHash = await hashPin(pin);

  if (!state.users.some((user) => user.pinHash === pinHash)) {
    els.authMessage.textContent = "I could not find that PIN. Try again or make a new account.";
    return;
  }

  currentUserHash = pinHash;
  localStorage.setItem(CURRENT_USER_KEY, currentUserHash);
  enterApp();
});

els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);
els.filterSelect.addEventListener("change", render);
els.signOutButton.addEventListener("click", signOut);
els.ownerButton.addEventListener("click", () => {
  els.ownerDialog.showModal();
  if (ownerSignedIn) {
    showOwnerPanel();
  }
});
els.ownerCloseButton.addEventListener("click", closeOwner);
els.ownerDoneButton.addEventListener("click", closeOwner);
els.ownerUnlockForm.addEventListener("submit", unlockOwner);

els.giftList.addEventListener("click", (event) => {
  const boughtButton = event.target.closest(".bought-button");
  if (boughtButton) {
    openBoughtDialog(boughtButton.dataset.id);
    return;
  }

  const unbuyButton = event.target.closest(".unbuy-button");
  if (unbuyButton) {
    undoBought(unbuyButton.dataset.id);
  }
});

els.confirmBoughtButton.addEventListener("click", markBought);

els.saveInterestButton.addEventListener("click", async () => {
  if (!ownerSignedIn) return;
  state.interests = els.ownerInterest.value.trim();
  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child("interests").set(state.interests);
  }
  render();
  renderOwnerLists();
});

els.ownerUsersList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-user-button");
  if (!button || !ownerSignedIn) return;

  const pinHash = button.dataset.id;
  state.users = state.users.filter((user) => user.pinHash !== pinHash);
  if (currentUserHash === pinHash) {
    currentUserHash = "";
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`users/${pinHash}`).remove();
  }
  renderOwnerLists();
});

els.ownerGiftsList.addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-gift-button");
  if (editButton && ownerSignedIn) {
    startGiftEdit(editButton.dataset.id);
    return;
  }

  const button = event.target.closest(".delete-gift-button");
  if (!button || !ownerSignedIn) return;

  const giftId = button.dataset.id;
  state.gifts = state.gifts.filter((gift) => gift.id !== giftId);
  if (editingGiftId === giftId) {
    stopGiftEdit();
  }

  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`gifts/${giftId}`).remove();
  }
  render();
  renderOwnerLists();
});

els.cancelEditButton.addEventListener("click", stopGiftEdit);

els.giftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ownerSignedIn) return;

  const existingGift = state.gifts.find((item) => item.id === editingGiftId);
  const gift = {
    id: existingGift?.id || crypto.randomUUID(),
    name: els.giftName.value.trim(),
    price: Number(els.giftPrice.value),
    store: els.giftStore.value.trim(),
    url: els.giftUrl.value.trim(),
    image: els.giftImage.value.trim(),
    note: els.giftNote.value.trim(),
    bought: existingGift?.bought || false,
    boughtBy: existingGift?.boughtBy || "",
    boughtByHash: existingGift?.boughtByHash || "",
    addedAt: existingGift?.addedAt || Date.now()
  };

  if (existingGift) {
    state.gifts = state.gifts.map((item) => (item.id === gift.id ? gift : item));
  } else {
    state.gifts.push(gift);
  }

  saveLocalState();
  if (firebaseReady && rootRef) {
    await rootRef.child(`gifts/${gift.id}`).set(gift);
  }
  stopGiftEdit();
  render();
  renderOwnerLists();
});

startFirebase();

if (currentUser()) {
  enterApp();
}

if (!hasLoadedRemote) {
  render();
}

// ── Dark mode toggle ──────────────────────────────────────
(function () {
  const html = document.documentElement;
  const btn  = document.getElementById('themeToggle');
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Apply saved preference on load, or follow OS
  const initial = saved || (prefersDark ? 'dark' : 'light');
  if (initial === 'dark') html.setAttribute('data-theme', 'dark');

  function update() {
    const isDark = html.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  btn.addEventListener('click', function () {
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
      html.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
    update();
  });

  update();
})();
