(function () {
  if (document.getElementById("finpilot-agent-launcher")) return;
  const button = document.createElement("button");
  button.id = "finpilot-agent-launcher";
  button.type = "button";
  button.title = "FinPilot Agent panelini aç";
  button.textContent = "✦ AI";
  Object.assign(button.style, {
    position: "fixed",
    right: "14px",
    bottom: "76px",
    zIndex: "2147483646",
    width: "48px",
    height: "48px",
    border: "1px solid #49c980",
    borderRadius: "14px",
    background: "linear-gradient(145deg,#183c2a,#0a1912)",
    color: "#62eba0",
    boxShadow: "0 14px 38px rgba(0,0,0,.42)",
    font: "800 12px Inter,Segoe UI,sans-serif",
    cursor: "pointer",
  });
  button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_FINPILOT_PANEL" }));
  document.documentElement.appendChild(button);
})();
