
import "./style.css";

import {
  auth, db, storage, authReady,
  ref, get, set, push, update, remove, onValue,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "./firebase.js";

const app = document.querySelector("#app");

let user = null;
let items = {};
let currentFolder = "root";
let currentPath = [];
let unsubscribe = null;
let display = "0";
let expression = "";
let pinMode = "";
let firstPin = "";
let pinBuffer = "";
let changingPin = false;

const userPath = () => `users/${user.uid}`;
const itemPath = () => ref(db, `${userPath()}/items`);
const settingsPath = () => ref(db, `${userPath()}/settings`);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  })[c]);
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");
}

function validPin(pin) {
  return /^\d{6}$/.test(pin);
}

async function getPinHash() {
  const snapshot = await get(ref(db, `${userPath()}/settings/pinHash`));
  return snapshot.val();
}

function authScreen() {
  app.innerHTML = `
    <main class="auth-screen">
      <div class="auth-card">
        <div class="vault-logo">✦</div>
        <h1>Calculator</h1>
        <p>Sign in to access your account</p>

        <form id="authForm">
          <input id="email" type="email"
            placeholder="Email address" required>
          <input id="password" type="password"
            placeholder="Password" required minlength="6">

          <button class="auth-submit">Sign in</button>
        </form>

        <button id="switchAuth" class="text-button">
          Create a new account
        </button>

        <p id="authError" class="error"></p>
      </div>
    </main>
  `;

  let signup = false;

  const form = document.getElementById("authForm");
  const switchBtn = document.getElementById("switchAuth");

  switchBtn.onclick = () => {
    signup = !signup;
    form.querySelector("button").textContent =
      signup ? "Create account" : "Sign in";
    switchBtn.textContent =
      signup ? "Already have an account? Sign in" :
      "Create a new account";
  };

  form.onsubmit = async e => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      if (signup) {
        await createUserWithEmailAndPassword(auth,email,password);
      } else {
        await signInWithEmailAndPassword(auth,email,password);
      }
    } catch(error) {
      document.getElementById("authError").textContent =
        error.message;
    }
  };
}

async function pinSetup() {
  pinMode = "first";
  firstPin = "";
  pinBuffer = "";

  app.innerHTML = `
    <main class="pin-screen">
      <div class="pin-card">
        <div class="vault-logo">✦</div>
        <h2 id="pinTitle">Create your PIN</h2>
        <p id="pinMessage">Enter a new 6-digit PIN</p>
        <input id="pinInput" type="password"
          inputmode="numeric" maxlength="6"
          autocomplete="new-password"
          placeholder="••••••">
        <button id="pinContinue" class="auth-submit">
          Continue
        </button>
        <p id="pinError" class="error"></p>
      </div>
    </main>
  `;

  const input = document.getElementById("pinInput");

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g,"").slice(0,6);
  });

  document.getElementById("pinContinue").onclick = async () => {
    const pin = input.value;

    if (!validPin(pin)) {
      document.getElementById("pinError").textContent =
        "Enter exactly 6 digits.";
      return;
    }

    if (pinMode === "first") {
      firstPin = pin;
      pinMode = "confirm";
      input.value = "";
      input.focus();

      document.getElementById("pinTitle").textContent =
        "Confirm your PIN";

      document.getElementById("pinMessage").textContent =
        "Enter the same PIN again";

      return;
    }

    if (pin !== firstPin) {
      firstPin = "";
      pinMode = "first";
      input.value = "";

      document.getElementById("pinTitle").textContent =
        "Create your PIN";

      document.getElementById("pinMessage").textContent =
        "PINs did not match. Start again.";

      return;
    }

    await set(
      ref(db, `${userPath()}/settings/pinHash`),
      await hashPin(pin)
    );

    await set(
      ref(db, `${userPath()}/settings/createdAt`),
      Date.now()
    );

    calculatorScreen();
  };
}

function calculatorScreen() {
  display = "0";
  expression = "";

  app.innerHTML = `
    <main class="calculator">

      <div class="calc-toolbar">
        <button id="expandBtn">↙↗</button>
        <button id="scientificBtn">√ π<br>e =</button>
        <button id="layoutBtn">▦</button>
        <button id="moreBtn">⋮</button>
      </div>

      <section class="calc-display">
        <div id="expression"></div>
        <div id="result">0</div>
      </section>

      <section class="keypad">
        ${[
          ["AC","%","⌫","÷"],
          ["7","8","9","×"],
          ["4","5","6","−"],
          ["1","2","3","+"],
          ["00","0",".","="]
        ].map(row => row.map(key =>
          `<button class="key ${key === "=" ? "equals" : ""}"
            data-key="${key}">${key}</button>`
        ).join("")).join("")}
      </section>

      <div class="calc-footer"> </div>
    </main>
  `;

  document.querySelectorAll("[data-key]").forEach(button => {
    button.onclick = () => calculatorKey(button.dataset.key);
  });

  document.getElementById("scientificBtn").onclick = () => {
    alert("Scientific functions can be added to this keypad.");
  };

  document.getElementById("layoutBtn").onclick = () => {
    document.querySelector(".calculator").classList.toggle("compact");
  };

  document.getElementById("moreBtn").onclick = () => {
    showSettings();
  };

  document.getElementById("expandBtn").onclick = () => {
    document.fullscreenElement
      ? document.exitFullscreen?.()
      : document.documentElement.requestFullscreen?.();
  };
}

function updateDisplay() {
  const result = document.getElementById("result");
  if (result) result.textContent = display;

  const exp = document.getElementById("expression");
  if (exp) exp.textContent = expression;
}

function calculate(expressionText) {
  let safe = expressionText
    .replace(/×/g,"*")
    .replace(/÷/g,"/")
    .replace(/−/g,"-")
    .replace(/%/g,"/100");

  if (!/^[0-9+\-*/().\s]+$/.test(safe)) {
    throw new Error("Invalid calculation");
  }

  const result = Function(
    `"use strict"; return (${safe})`
  )();

  if (!Number.isFinite(result)) {
    throw new Error("Invalid result");
  }

  return String(Number(result.toPrecision(12)));
}

async function calculatorKey(key) {
  if (key === "AC") {
    display = "0";
    expression = "";
  } else if (key === "⌫") {
    display = display.length > 1
      ? display.slice(0,-1)
      : "0";
  } else if (key === "=") {
    const entered = display.trim();

    // PIN verification takes priority over calculator evaluation.
    if (/^\d{6}$/.test(entered)) {
      const savedHash = await getPinHash();

      if (savedHash && await hashPin(entered) === savedHash) {
        openVault();
        return;
      }
    }

    try {
      expression = display;
      display = calculate(display);
    } catch {
      display = "Error";
    }
  } else {
    if (display === "0" || display === "Error") {
      display = "";
    }

    display += key;
  }

  updateDisplay();
}

function showSettings() {
  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-card">
      <h2>Settings</h2>
      <button id="changePin">Change PIN</button>
      <button id="logout">Sign out</button>
      <button id="closeSettings">Close</button>
    </div>
  `;

  document.body.append(modal);

  document.getElementById("closeSettings").onclick =
    () => modal.remove();

  document.getElementById("changePin").onclick = () => {
    modal.remove();
    changePinScreen();
  };

  document.getElementById("logout").onclick = async () => {
    if (unsubscribe) unsubscribe();
    await signOut(auth);
  };
}

async function changePinScreen() {
  const newPin = prompt("Enter your new 6-digit PIN");

  if (!validPin(newPin || "")) {
    alert("Invalid PIN. Enter 6 digits.");
    return;
  }

  const confirmation = prompt("Confirm your new PIN");

  if (newPin !== confirmation) {
    alert("PIN confirmation does not match.");
    return;
  }

  await set(
    ref(db, `${userPath()}/settings/pinHash`),
    await hashPin(newPin)
  );

  alert("PIN updated successfully.");
}

function openVault() {
  currentFolder = "root";
  currentPath = [];
  vaultScreen();
}

function vaultScreen() {
  app.innerHTML = `
    <main class="vault">

      <header class="vault-header">
        <button id="backBtn">←</button>
        <div>
          <h2>Files</h2>
          <p>Private storage</p>
        </div>
        <button id="settingsBtn">⚙</button>
      </header>

      <div class="breadcrumb" id="breadcrumb">
        Internal storage
      </div>

      <div class="vault-actions">
        <button id="newFolder">＋ Folder</button>
        <button id="uploadFile">↑ Upload</button>
        <input id="fileInput" type="file"
          accept="image/*,video/*" multiple hidden>
      </div>

      <div id="fileGrid" class="file-grid">
        <p>Loading files...</p>
      </div>

      <p class="storage-info">
        Files are stored in your Firebase account.
      </p>
    </main>
  `;

  document.getElementById("backBtn").onclick = () => {
    if (currentPath.length) {
      currentPath.pop();
      currentFolder = currentPath.length
        ? currentPath[currentPath.length - 1].id
        : "root";
      vaultScreen();
    } else {
      calculatorScreen();
    }
  };

  document.getElementById("settingsBtn").onclick =
    showSettings;

  document.getElementById("newFolder").onclick =
    createFolder;

  document.getElementById("uploadFile").onclick =
    () => document.getElementById("fileInput").click();

  document.getElementById("fileInput").onchange =
    async event => {
      await uploadFiles([...event.target.files]);
      event.target.value = "";
    };

  listenToFiles();
}

function listenToFiles() {
  if (unsubscribe) unsubscribe();

  unsubscribe = onValue(itemPath(), snapshot => {
    items = snapshot.val() || {};
    renderFiles();
  }, error => {
    console.error(error);
    alert("Unable to load files: " + error.message);
  });
}

function renderFiles() {
  const grid = document.getElementById("fileGrid");
  if (!grid) return;

  const children = Object.entries(items)
    .filter(([id,item]) =>
      item.parentId === currentFolder
    );

  document.getElementById("breadcrumb").textContent =
    "Internal storage" +
    currentPath.map(p => " / " + p.name).join("");

  if (!children.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div>📁</div>
        <p>This folder is empty</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = children.map(([id,item]) => `
    <article class="file-card">
      <button class="file-open" data-open="${escapeHTML(id)}">
        <span class="file-icon">
          ${item.type === "folder" ? "📁" :
            item.mime?.startsWith("video/") ? "🎬" : "🖼️"}
        </span>
        <span class="file-name">${escapeHTML(item.name)}</span>
      </button>
      <button class="file-menu" data-menu="${escapeHTML(id)}">⋮</button>
    </article>
  `).join("");

  grid.querySelectorAll("[data-open]").forEach(button => {
    button.onclick = () => openItem(button.dataset.open);
  });

  grid.querySelectorAll("[data-menu]").forEach(button => {
    button.onclick = () => itemMenu(button.dataset.menu);
  });
}

async function createFolder() {
  const name = prompt("Enter folder name:");

  if (!name?.trim()) return;

  const newRef = push(itemPath());

  await set(newRef,{
    name:name.trim(),
    type:"folder",
    parentId:currentFolder,
    createdAt:Date.now()
  });
}

async function uploadFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/") &&
        !file.type.startsWith("video/")) {
      alert("Only photos and videos are allowed.");
      continue;
    }

    const id = push(itemPath()).key;
    const path = `${userPath()}/files/${id}`;

    const objectRef = storageRef(storage,path);

    try {
      await uploadBytes(objectRef,file,{
        contentType:file.type
      });

      await set(ref(db,`${userPath()}/items/${id}`),{
        name:file.name,
        type:"file",
        mime:file.type,
        size:file.size,
        storagePath:path,
        parentId:currentFolder,
        createdAt:Date.now()
      });
    } catch(error) {
      alert("Upload failed: " + error.message);
    }
  }
}

async function openItem(id) {
  const item = items[id];
  if (!item) return;

  if (item.type === "folder") {
    currentFolder = id;
    currentPath.push({id,name:item.name});
    vaultScreen();
    return;
  }

  try {
    const url = await getDownloadURL(
      storageRef(storage,item.storagePath)
    );

    window.open(url,"_blank","noopener");
  } catch(error) {
    alert("Unable to open file: " + error.message);
  }
}

async function itemMenu(id) {
  const item = items[id];
  if (!item) return;

  const choice = prompt(
    `${item.name}\n\n1 = Rename\n2 = Delete\n\nEnter option:`
  );

  if (choice === "1") {
    const name = prompt("New name:",item.name);

    if (name?.trim()) {
      await update(
        ref(db,`${userPath()}/items/${id}`),
        {name:name.trim()}
      );
    }
  }

  if (choice === "2") {
    if (!confirm(`Delete ${item.name}?`)) return;

    if (item.type === "file" && item.storagePath) {
      try {
        await deleteObject(
          storageRef(storage,item.storagePath)
        );
      } catch(error) {
        console.warn("Storage deletion:",error);
      }
    }

    await remove(ref(db,`${userPath()}/items/${id}`));
  }
}

async function startApplication() {
  await authReady;

  onAuthStateChanged(auth, async currentUser => {
    user = currentUser;

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (!user) {
      authScreen();
      return;
    }

    try {
      const savedPin = await getPinHash();

      if (!savedPin) {
        await pinSetup();
      } else {
        calculatorScreen();
      }
    } catch(error) {
      app.innerHTML = `
        <div class="auth-card">
          <h2>Connection problem</h2>
          <p>${escapeHTML(error.message)}</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  });
}

startApplication();

if ("serviceWorker" in navigator) {
  window.addEventListener("load",() => {
    navigator.serviceWorker.register("./sw.js")
      .catch(console.error);
  });
}
