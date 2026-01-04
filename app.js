// Wrap everything so it runs AFTER the page + templates load
document.addEventListener("DOMContentLoaded", () => {

  const SAVE_KEYS = [
    "added_setting",
    "added_call",
    "choice_start",          // "noaa" | "field"
    "added_noaa",
    "added_field",

    "noaa_prediction",
    "noaa_mission_challenge",
    "field_observations",
    "optional_challenge",
    "field_mission_challenge",
  ];

  function getLS(key) { return localStorage.getItem(key) || ""; }
  function setLS(key, val) { localStorage.setItem(key, val); }
  function delLS(key) { localStorage.removeItem(key); }

  function setTopStatus(msg) {
    const el = document.getElementById("saveStatus");
    if (el) el.textContent = msg;
  }
  function setModalStatus(msg) {
    const el = document.getElementById("modalStatus");
    if (el) el.textContent = msg;
  }

  function scrollToEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function wireAutosaveWithin(root) {
    root.querySelectorAll("textarea[data-save]").forEach((ta) => {
      const key = ta.dataset.save;
      ta.value = getLS(key);
      ta.addEventListener("input", () => setLS(key, ta.value));
    });
  }

  function addTemplate(templateId) {
    const tpl = document.getElementById(templateId);
    const story = document.getElementById("story");
    if (!tpl || !story) return null;

    const node = tpl.content.cloneNode(true);
    story.appendChild(node);

    wireAutosaveWithin(story);

    const sections = story.querySelectorAll("section");
    return sections[sections.length - 1] || null;
  }

  function renderChoiceFeedback(which) {
    const box = document.getElementById("choiceFeedback");
    if (!box) return;
    box.style.display = "block";

    if (which === "noaa") {
      box.innerHTML = `
        <h3 style="margin-top:0;">You chose to start with regional data.</h3>
        <p style="margin:0;">
          This path will help you spot patterns over time—like rainfall, heat, and fuel moisture—that influence fire risk
          before flames ever appear. 🔍 Scientists often begin here when they want to predict what might happen next.
        </p>
      `;
    } else {
      box.innerHTML = `
        <h3 style="margin-top:0;">You chose to begin in the field.</h3>
        <p style="margin:0;">
          This path focuses on direct evidence—what you can see, touch, and observe right now.
          🧭 Scientists take this approach when they want to understand impacts on people, plants, and animals.
        </p>
      `;
    }
  }

  function disableChoiceButtons() {
    const b1 = document.getElementById("choiceNoaaBtn");
    const b2 = document.getElementById("choiceFieldBtn");
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = true;
  }

  function rebuildFromStorage() {
    const story = document.getElementById("story");
    if (!story) return;

    story.innerHTML = "";

    // Always show Setting first
    addTemplate("tpl-setting");
    setLS("added_setting", "yes");

    // If call happened, show it
    if (getLS("added_call") === "yes") {
      addTemplate("tpl-call");
    }

    // If choice happened, show chosen branch only
    const choice = getLS("choice_start");
    if (choice === "noaa") {
      if (getLS("added_call") !== "yes") { addTemplate("tpl-call"); setLS("added_call","yes"); }
      renderChoiceFeedback("noaa");
      disableChoiceButtons();
      if (getLS("added_noaa") === "yes") addTemplate("tpl-noaa");
    }
    if (choice === "field") {
      if (getLS("added_call") !== "yes") { addTemplate("tpl-call"); setLS("added_call","yes"); }
      renderChoiceFeedback("field");
      disableChoiceButtons();
      if (getLS("added_field") === "yes") addTemplate("tpl-field");
    }

    wireStoryButtons();
    wireAutosaveWithin(story);
  }

  // Resume code (compressed state)
  function collectState() {
    const state = {};
    SAVE_KEYS.forEach(k => state[k] = getLS(k));
    return state;
  }

  function encodeResumeCode(stateObj) {
    const json = JSON.stringify(stateObj);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return `R1.${compressed}`;
  }

  function decodeResumeCode(code) {
    const trimmed = (code || "").trim();
    if (!trimmed.startsWith("R1.")) throw new Error("That doesn't look like a valid Resume Code.");
    const compressed = trimmed.slice(3);
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) throw new Error("That code couldn't be read. Check for missing characters.");
    return JSON.parse(json);
  }

  function applyState(state) {
    SAVE_KEYS.forEach(k => {
      if (typeof state[k] === "string") setLS(k, state[k]);
    });
    rebuildFromStorage();
    setTopStatus("Resumed!");
  }

  function buildResumeUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set("resume", code);
    return url.toString();
  }

  function renderQrInto(el, text) {
    if (!el) return;
    el.innerHTML = "";
    new QRCode(el, { text, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }

  function openModalWithCurrentState() {
    const overlay = document.getElementById("overlay");
    const resumeBox = document.getElementById("resumeCodeBox");
    const qrEl = document.getElementById("qrCodeModal");

    const code = encodeResumeCode(collectState());
    const url = buildResumeUrl(code);

    if (resumeBox) resumeBox.textContent = code;
    renderQrInto(qrEl, url);

    setModalStatus("Resume Code created. Copy it or scan the QR.");

    copyToClipboard(code).then(ok => {
      setTopStatus(ok ? "Paused. Resume Code copied." : "Paused. Copy blocked—use Copy Code.");
      setModalStatus(ok ? "✅ Resume Code copied automatically." : "⚠️ Auto-copy blocked. Use Copy Code.");
    });

    overlay?.classList.add("show");
    overlay?.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const overlay = document.getElementById("overlay");
    overlay?.classList.remove("show");
    overlay?.setAttribute("aria-hidden", "true");
  }

  function resumeFromTopBox() {
    const input = document.getElementById("resumeInputTop");
    const code = (input?.value || "").trim();
    try {
      const state = decodeResumeCode(code);
      applyState(state);
    } catch (e) {
      setTopStatus(`Resume failed: ${e.message}`);
    }
  }

  // Buttons inside story are created dynamically, so wire after rebuild
  function wireStoryButtons() {
    const beginBtn = document.getElementById("beginMissionBtn");
    if (beginBtn && !beginBtn.dataset.wired) {
      beginBtn.dataset.wired = "yes";
      beginBtn.addEventListener("click", () => {
        if (getLS("added_call") !== "yes") {
          const callSection = addTemplate("tpl-call");
          setLS("added_call", "yes");
          wireStoryButtons();
          setTopStatus("The Call appeared.");
          scrollToEl(callSection);
        } else {
          scrollToEl(document.getElementById("call"));
        }
      });
    }

    const noaaBtn = document.getElementById("choiceNoaaBtn");
    if (noaaBtn && !noaaBtn.dataset.wired) {
      noaaBtn.dataset.wired = "yes";
      noaaBtn.addEventListener("click", () => {
        setLS("choice_start", "noaa");
        setLS("added_noaa", "yes");
        setLS("added_field", "");
        renderChoiceFeedback("noaa");
        disableChoiceButtons();

        const noaaSection = addTemplate("tpl-noaa");
        wireStoryButtons();
        setTopStatus("NOAA section appeared.");
        scrollToEl(noaaSection);
      });
    }

    const fieldBtn = document.getElementById("choiceFieldBtn");
    if (fieldBtn && !fieldBtn.dataset.wired) {
      fieldBtn.dataset.wired = "yes";
      fieldBtn.addEventListener("click", () => {
        setLS("choice_start", "field");
        setLS("added_field", "yes");
        setLS("added_noaa", "");
        renderChoiceFeedback("field");
        disableChoiceButtons();

        const fieldSection = addTemplate("tpl-field");
        wireStoryButtons();
        setTopStatus("Field section appeared.");
        scrollToEl(fieldSection);
      });
    }
  }

  // PDF export
  function exportJournalToPDF() {
    const exportMsg = document.getElementById("exportMsg");
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      const margin = 48;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - margin * 2;

      let y = margin;

      function addLine(text, fontSize = 11, isBold = false) {
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setFontSize(fontSize);

        const lines = doc.splitTextToSize(String(text), maxWidth);
        for (const line of lines) {
          if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          doc.text(line, margin, y);
          y += fontSize + 6;
        }
      }
      function addSpacer(px = 10) {
        y += px;
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      }

      const choice = getLS("choice_start") || "(not chosen)";

      addLine("Eco-Responders: After the Fire — Export My Journal", 16, true);
      addSpacer(6);
      addLine(`Choice: ${choice}`, 11, false);
      addSpacer(14);

      if (getLS("added_noaa") === "yes") {
        addLine("NOAA Data Path", 13, true);
        addLine("Prompt: Predict what might happen to the forest next year if rainfall stays low and temperatures stay high. Use data to support your prediction.", 11, false);
        addLine("Student Response:", 11, true);
        addLine(getLS("noaa_prediction") || "(blank)", 11, false);
        addSpacer(10);
        addLine("⚡ Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Add one more prediction OR one question you want to investigate next.", 11, false);
        addLine("Student Response:", 11, true);
        addLine(getLS("noaa_mission_challenge") || "(blank)", 11, false);
        addSpacer(16);
      }

      if (getLS("added_field") === "yes") {
        addLine("Field Observation Path", 13, true);
        addLine("Prompt: Record two observations showing how the fire affected people or wildlife.", 11, false);
        addLine("Student Response:", 11, true);
        addLine(getLS("field_observations") || "(blank)", 11, false);
        addSpacer(12);

        addLine("🌱 Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Research a local fire-adapted plant. How does it help stabilize soil or promote regrowth?", 11, false);
        addLine("Student Response:", 11, true);
        addLine(getLS("optional_challenge") || "(blank)", 11, false);
        addSpacer(10);

        addLine("⚡ Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Add one more observation you think matters most, and explain why.", 11, false);
        addLine("Student Response:", 11, true);
        addLine(getLS("field_mission_challenge") || "(blank)", 11, false);
      }

      doc.save("Eco-Responders_Journal.pdf");
      if (exportMsg) exportMsg.textContent = "✅ PDF downloaded (check your downloads folder).";
    } catch (e) {
      if (exportMsg) exportMsg.textContent = "⚠️ PDF export failed. Try Chrome/Edge, or check if downloads are blocked.";
    }
  }

  function maybeResumeFromUrl() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("resume");
    if (!code) return false;

    try {
      const state = decodeResumeCode(code);
      applyState(state);

      url.searchParams.delete("resume");
      window.history.replaceState({}, "", url.toString());

      setTopStatus("Resumed from QR!");
      return true;
    } catch (e) {
      setTopStatus(`QR resume failed: ${e.message}`);
      return false;
    }
  }

  function wireGlobalButtons() {
    document.getElementById("pauseResumeBtn")?.addEventListener("click", openModalWithCurrentState);
    document.getElementById("closeModalBtn")?.addEventListener("click", closeModal);
    document.getElementById("overlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "overlay") closeModal();
    });

    document.getElementById("copyCodeBtn")?.addEventListener("click", async () => {
      const code = document.getElementById("resumeCodeBox")?.textContent || "";
      const ok = await copyToClipboard(code);
      setModalStatus(ok ? "✅ Copied!" : "⚠️ Copy blocked—select the code and copy.");
    });

    document.getElementById("resetBtn")?.addEventListener("click", () => {
      const ok = confirm("Reset clears saved work on this device. Continue?");
      if (!ok) return;

      SAVE_KEYS.forEach(delLS);

      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState({}, "", url.toString());

      location.reload();
    });

    document.getElementById("resumeTopBtn")?.addEventListener("click", resumeFromTopBox);
    document.getElementById("clearTopBtn")?.addEventListener("click", () => {
      const input = document.getElementById("resumeInputTop");
      if (input) input.value = "";
      setTopStatus("Cleared.");
    });

    document.getElementById("exportPdfBtn")?.addEventListener("click", exportJournalToPDF);
  }

  // Boot
  wireGlobalButtons();

  // IMPORTANT: build the story immediately
  rebuildFromStorage();
  wireStoryButtons();

  // QR resume (optional)
  maybeResumeFromUrl();

  setTopStatus("Ready.");
  setModalStatus("");
});
