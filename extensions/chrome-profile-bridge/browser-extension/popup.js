const $ = (id) => document.getElementById(id);

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(response || { ok: false, error: "No response from service worker" });
    });
  });
}

function setMessage(text, ok = null) {
  const el = $("message");
  el.textContent = text || "";
  el.className = ok === true ? "ok" : ok === false ? "err" : "muted";
}

async function refreshStatus() {
  const response = await send({ type: "auth.status" });
  if (!response.ok) {
    $("status").textContent = "Unable to read status";
    setMessage(response.error, false);
    return;
  }
  $("extensionId").textContent = response.extensionId;
  $("bridgeUrl").textContent = response.bridgeUrl;
  $("status").textContent = response.paired ? "Paired" : response.hasKey ? "Key ready, not paired" : "Not paired";
}

$("pair").addEventListener("click", async () => {
  const code = $("code").value.trim();
  if (!code) {
    setMessage("Enter the code shown by /chrome pair.", false);
    return;
  }
  $("pair").disabled = true;
  setMessage("Pairing…");
  const response = await send({ type: "auth.pair", code });
  $("pair").disabled = false;
  if (!response.ok) {
    setMessage(`Pairing failed: ${response.error}`, false);
    await refreshStatus();
    return;
  }
  $("code").value = "";
  setMessage("Paired. You can close this popup and use /chrome authorize in Pi.", true);
  await refreshStatus();
});

$("start").addEventListener("click", async () => {
  const response = await send({ type: "poll.start" });
  setMessage(response.ok ? "Polling resumed." : `Could not resume polling: ${response.error}`, response.ok);
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Reset the local private key? You will need to run /chrome unpair in Pi and pair again.")) return;
  const response = await send({ type: "auth.reset" });
  setMessage(response.ok ? "Local key reset." : `Reset failed: ${response.error}`, response.ok);
  await refreshStatus();
});

refreshStatus();
