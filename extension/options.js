const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(["appUrl", "token"]).then(({ appUrl, token }) => {
  $("appUrl").value = appUrl || "";
  $("token").value = token || "";
});

$("save").addEventListener("click", async () => {
  const appUrl = $("appUrl").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  await chrome.storage.sync.set({ appUrl, token });
  $("status").textContent = "Saved.";
  setTimeout(() => ($("status").textContent = ""), 2000);
});
