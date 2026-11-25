
/* ==========================================
   CALCULATOR VAULT
   Supabase Authentication + Cloud PIN
   Private File Vault
========================================== */

const SUPABASE_URL = "https://rtvdmtsdzybqrlwtowrx.supabase.co";
const SUPABASE_KEY = "sb_publishable_OGre_FJbbrbXyaE5w9YvNw_BO1ZZ7w8";
const BUCKET = "vault-files";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

let user = null;
let currentFolder = null;
let folderStack = [];

let calculatorValue = "";
let pinMode = "setup";
let firstPin = "";
let currentPinForChange = "";
let previewUrl = null;

const screens = [
  "authScreen",
  "pinScreen",
  "calculatorScreen",
  "vaultScreen"
];

/* ==========================================
   SCREEN MANAGEMENT
========================================== */

function showScreen(id) {
  screens.forEach(screen => {
    $(screen).classList.add("hidden");
  });

  $(id).classList.remove("hidden");
}

function showMessage(id, message) {
  $(id).textContent = message || "";
}

/* ==========================================
   CLOUD PIN FUNCTIONS
   PIN is never saved on the device.
========================================== */

async function callPinFunction(payload) {
  const { data, error } = await db.functions.invoke(
    "vault-pin",
    { body: payload }
  );

  if (error) {
    throw new Error(
      data?.error ||
      error.message ||
      "Unable to contact the PIN server."
    );
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function checkCloudPin() {
  const result = await callPinFunction({
    action: "status"
  });

  return result.hasPin;
}

async function createCloudPin(pin) {
  return await callPinFunction({
    action: "setup",
    pin: String(pin)
  });
}

async function verifyCloudPin(pin) {
  return await callPinFunction({
    action: "verify",
    pin: String(pin)
  });
}

async function changeCloudPin(oldPin, newPin) {
  return await callPinFunction({
    action: "change",
    pin: String(oldPin),
    newPin: String(newPin)
  });
}

/* ==========================================
   PIN SCREEN
========================================== */

function showPinSetup(mode = "setup") {
  pinMode = mode;
  firstPin = "";

  $("pinInput").value = "";
  $("pinContinue").disabled = false;
  $("pinContinue").textContent = "Continue";

  if (mode === "verifyCurrent") {
    $("pinTitle").textContent = "Verify current PIN";
    $("pinDescription").textContent =
      "Enter your existing calculator PIN";
  } else if (mode === "change") {
    $("pinTitle").textContent = "Create new PIN";
    $("pinDescription").textContent =
      "Choose your new 4–8 digit PIN";
  } else {
    $("pinTitle").textContent = "Create your PIN";
    $("pinDescription").textContent =
      "Choose your private calculator PIN";
  }

  showMessage("pinMessage", "");
  showScreen("pinScreen");
}

function showCalculator() {
  calculatorValue = "";

  $("display").textContent = "0";
  $("expression").textContent = "";

  showScreen("calculatorScreen");
}

/* ==========================================
   AUTHENTICATION
========================================== */

$("signupBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || password.length < 8) {
    return showMessage(
      "authMessage",
      "Enter a valid email and password of at least 8 characters."
    );
  }

  showMessage("authMessage", "Creating account...");

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  if (error) {
    return showMessage("authMessage", error.message);
  }

  if (data.session) {
    user = data.user;
    await afterLogin();
  } else {
    showMessage(
      "authMessage",
      "Account created. Verify your email, then sign in."
    );
  }
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("accountPassword").value;

  if (!email || !password) {
    return showMessage(
      "authMessage",
      "Enter your email and password."
    );
  }

  showMessage("authMessage", "Signing in...");

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return showMessage("authMessage", error.message);
  }

  user = data.user;
  await afterLogin();
});

async function afterLogin() {
  try {
    showMessage("authMessage", "Checking your secure PIN...");

    const hasPin = await checkCloudPin();

    if (hasPin) {
      showCalculator();
    } else {
      showPinSetup("setup");
    }
  } catch (error) {
    showScreen("authScreen");
    showMessage("authMessage", error.message);
  }
}

/* ==========================================
   PIN CREATION, CONFIRMATION AND CHANGE
========================================== */

$("pinInput").addEventListener("input", () => {
  $("pinInput").value =
    $("pinInput").value.replace(/\D/g, "").slice(0, 8);
});

$("pinContinue").addEventListener("click", async () => {
  const pin = $("pinInput").value;

  if (!/^\d{4,8}$/.test(pin)) {
    return showMessage(
      "pinMessage",
      "PIN must contain 4 to 8 digits."
    );
  }

  $("pinContinue").disabled = true;
  showMessage("pinMessage", "Please wait...");

  try {
    // Verify the existing PIN before changing it.
    if (pinMode === "verifyCurrent") {
      await verifyCloudPin(pin);

      currentPinForChange = pin;

      showPinSetup("change");
      return;
    }

    // First entry: remember the PIN temporarily in memory.
    if (pinMode === "setup" || pinMode === "change") {
      firstPin = pin;
      pinMode = "confirm";

      $("pinInput").value = "";
      $("pinTitle").textContent = "Confirm your PIN";
      $("pinDescription").textContent =
        "Enter the same PIN again";

      showMessage("pinMessage", "");
      return;
    }

    // Confirm the new PIN.
    if (pinMode === "confirm") {
      if (pin !== firstPin) {
        firstPin = "";
        $("pinInput").value = "";

        const wasChanging = Boolean(currentPinForChange);

        pinMode = wasChanging ? "change" : "setup";

        $("pinTitle").textContent = wasChanging
          ? "Create new PIN"
          : "Create your PIN";

        $("pinDescription").textContent =
          "The PINs did not match. Try again.";

        return showMessage(
          "pinMessage",
          "The PINs do not match."
        );
      }

      if (currentPinForChange) {
        await changeCloudPin(currentPinForChange, pin);
        currentPinForChange = "";
      } else {
        await createCloudPin(pin);
      }

      firstPin = "";
      showCalculator();

      alert("PIN saved securely to your Supabase account.");
    }

  } catch (error) {
    showMessage("pinMessage", error.message);
  } finally {
    $("pinContinue").disabled = false;
  }
});

/* ==========================================
   CALCULATOR
========================================== */

function updateDisplay() {
  $("display").textContent = calculatorValue || "0";
}

document.querySelectorAll(".key").forEach(button => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    const value = button.dataset.value;

    if (action === "clear") {
      calculatorValue = "";
      $("expression").textContent = "";
      updateDisplay();
      return;
    }

    if (action === "delete") {
      calculatorValue = calculatorValue.slice(0, -1);
      updateDisplay();
      return;
    }

    if (action === "equals") {
      // A standalone 4–8 digit number is treated as a PIN.
      if (/^\d{4,8}$/.test(calculatorValue)) {
        const enteredPin = calculatorValue;

        calculatorValue = "";
        updateDisplay();

        await unlockVault(enteredPin);
        return;
      }

      calculate();
      return;
    }

    if (value !== undefined) {
      calculatorValue += value;
      updateDisplay();
    }
  });
});

function calculate() {
  if (!calculatorValue) return;

  try {
    if (!/^[0-9+\-*/().% ]+$/.test(calculatorValue)) {
      throw new Error("Invalid calculation");
    }

    const result = math.evaluate(calculatorValue);

    if (
      typeof result !== "number" ||
      !Number.isFinite(result)
    ) {
      throw new Error("Invalid result");
    }

    $("expression").textContent = calculatorValue;

    calculatorValue = String(
      Number(result.toPrecision(12))
    );

    updateDisplay();

  } catch {
    $("expression").textContent = "Error";
    calculatorValue = "";
    updateDisplay();
  }
}

/* ==========================================
   VAULT UNLOCK
========================================== */

async function unlockVault(pin) {
  $("expression").textContent = "Checking PIN...";

  try {
    await verifyCloudPin(pin);
    await openVault();
  } catch (error) {
    $("expression").textContent =
      error.message || "Incorrect PIN";

    calculatorValue = "";
    updateDisplay();
  }
}

async function openVault() {
  currentFolder = null;
  folderStack = [];

  showScreen("vaultScreen");

  await loadVault();
}

/* ==========================================
   FOLDER NAVIGATION
========================================== */

$("backBtn").addEventListener("click", async () => {
  if (folderStack.length > 0) {
    currentFolder = folderStack.pop();
    await loadVault();
  } else {
    showCalculator();
  }
});

$("addFolderBtn").addEventListener("click", async () => {
  const name = prompt("Enter folder name:");

  if (!name || !name.trim()) return;

  const { error } = await db
    .from("vault_folders")
    .insert({
      user_id: user.id,
      name: name.trim(),
      parent_id: currentFolder
    });

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
});

/* ==========================================
   LOAD FOLDERS AND FILES
========================================== */

async function loadVault() {
  showMessage("vaultMessage", "Loading...");

  const { data: folders, error: folderError } = await db
    .from("vault_folders")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (folderError) {
    return showMessage("vaultMessage", folderError.message);
  }

  const { data: files, error: fileError } = await db
    .from("vault_files")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fileError) {
    return showMessage("vaultMessage", fileError.message);
  }

  $("folderPath").textContent =
    folderStack.length > 0 ? "Inside folder" : "My files";

  const folderItems = folders.filter(
    folder => folder.parent_id === currentFolder
  );

  const fileItems = files.filter(
    file => file.folder_id === currentFolder
  );

  const list = $("fileList");
  list.replaceChildren();

  folderItems.forEach(folder => {
    const item = document.createElement("div");
    item.className = "file-item";

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "📁";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = folder.name;

    const open = document.createElement("button");
    open.textContent = "Open";

    open.addEventListener("click", async () => {
      folderStack.push(currentFolder);
      currentFolder = folder.id;
      await loadVault();
    });

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener("click", () => renameFolder(folder));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteFolder(folder));

    item.append(icon, info, open, rename, remove);
    list.append(item);
  });

  fileItems.forEach(file => {
    const item = document.createElement("div");
    item.className = "file-item";

    const icon = document.createElement("span");
    icon.className = "file-icon";

    icon.textContent =
      file.mime_type?.startsWith("video/") ? "🎬" : "🖼️";

    const info = document.createElement("div");
    info.className = "file-info";
    info.textContent = file.file_name;

    const preview = document.createElement("button");
    preview.textContent = "View";
    preview.addEventListener("click", () => previewFile(file));

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener("click", () => renameFile(file));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteFile(file));

    item.append(icon, info, preview, rename, remove);
    list.append(item);
  });

  showMessage(
    "vaultMessage",
    folderItems.length || fileItems.length
      ? ""
      : "This folder is empty."
  );
}

/* ==========================================
   FILE UPLOAD
========================================== */

$("uploadBtn").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", async event => {
  const files = [...event.target.files];

  if (!files.length) return;

  showMessage("vaultMessage", "Uploading files...");

  for (const file of files) {
    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      continue;
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const objectPath =
      `${user.id}/${crypto.randomUUID()}_${safeName}`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      showMessage("vaultMessage", uploadError.message);
      continue;
    }

    const { error: databaseError } = await db
      .from("vault_files")
      .insert({
        user_id: user.id,
        folder_id: currentFolder,
        file_name: file.name,
        object_path: objectPath,
        mime_type: file.type,
        size_bytes: file.size
      });

    if (databaseError) {
      await db.storage.from(BUCKET).remove([objectPath]);
      showMessage("vaultMessage", databaseError.message);
    }
  }

  event.target.value = "";
  await loadVault();
});

/* ==========================================
   FILE PREVIEW
========================================== */

async function previewFile(file) {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(file.object_path, 300);

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  $("previewName").textContent = file.file_name;

  const content = $("previewContent");
  content.replaceChildren();

  const media = document.createElement(
    file.mime_type?.startsWith("video/") ? "video" : "img"
  );

  media.src = data.signedUrl;

  if (media.tagName === "VIDEO") {
    media.controls = true;
    media.playsInline = true;
  } else {
    media.alt = file.file_name;
  }

  content.append(media);
  $("previewDialog").showModal();
}

$("closePreviewBtn").addEventListener("click", () => {
  $("previewDialog").close();
  $("previewContent").replaceChildren();
});

/* ==========================================
   RENAME FILE
========================================== */

async function renameFile(file) {
  const newName = prompt("Enter new file name:", file.file_name);

  if (!newName || !newName.trim()) return;

  const { error } = await db
    .from("vault_files")
    .update({ file_name: newName.trim() })
    .eq("id", file.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
}

/* ==========================================
   DELETE FILE
========================================== */

async function deleteFile(file) {
  if (!confirm(`Delete ${file.file_name}?`)) return;

  const { error: storageError } = await db.storage
    .from(BUCKET)
    .remove([file.object_path]);

  if (storageError) {
    return showMessage("vaultMessage", storageError.message);
  }

  const { error } = await db
    .from("vault_files")
    .delete()
    .eq("id", file.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
}

/* ==========================================
   RENAME FOLDER
========================================== */

async function renameFolder(folder) {
  const name = prompt("Enter new folder name:", folder.name);

  if (!name || !name.trim()) return;

  const { error } = await db
    .from("vault_folders")
    .update({ name: name.trim() })
    .eq("id", folder.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
}

/* ==========================================
   DELETE EMPTY FOLDER
========================================== */

async function deleteFolder(folder) {
  const { count: folderCount, error: folderError } = await db
    .from("vault_folders")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", folder.id);

  if (folderError) {
    return showMessage("vaultMessage", folderError.message);
  }

  const { count: fileCount, error: fileError } = await db
    .from("vault_files")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folder.id);

  if (fileError) {
    return showMessage("vaultMessage", fileError.message);
  }

  if (folderCount || fileCount) {
    return showMessage(
      "vaultMessage",
      "This folder is not empty. Delete or move its contents first."
    );
  }

  if (!confirm(`Delete folder ${folder.name}?`)) return;

  const { error } = await db
    .from("vault_folders")
    .delete()
    .eq("id", folder.id)
    .eq("user_id", user.id);

  if (error) {
    return showMessage("vaultMessage", error.message);
  }

  await loadVault();
}

/* ==========================================
   SETTINGS
========================================== */

$("settingsBtn").addEventListener("click", () => {
  $("settingsDialog").showModal();
});

$("closeSettingsBtn").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("changePinBtn").addEventListener("click", () => {
  $("settingsDialog").close();
  currentPinForChange = "";
  showPinSetup("verifyCurrent");
});

$("signOutBtn").addEventListener("click", async () => {
  if (!confirm("Sign out of your account?")) return;

  const { error } = await db.auth.signOut();

  if (error) {
    return showMessage("authMessage", error.message);
  }

  user = null;
  currentPinForChange = "";
  firstPin = "";

  $("settingsDialog").close();
  showScreen("authScreen");
});

/* ==========================================
   APP STARTUP
========================================== */

async function startApp() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showScreen("authScreen");
    return showMessage("authMessage", error.message);
  }

  user = data.session?.user || null;

  if (!user) {
    showScreen("authScreen");
    return;
  }

  await afterLogin();
}

db.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null;
});

startApp();
