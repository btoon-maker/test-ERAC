document.addEventListener("DOMContentLoaded", () => {

  // NEW: namespace so old test text doesn't appear in boxes
  const STORAGE_PREFIX = "ERAF_V2__";

  const SAVE_KEYS = [
    "added_setting",
    "added_call",

    "choice_start",          // "noaa" | "field"
    "choice_confirmed",      // "yes" after Continue

    "added_noaa",
    "added_field",

    // writing
    "noaa_prediction",
    "noaa_mission_challenge",
    "field_observations",
    "optional_challenge",
    "field_mission_challenge",
  ];

  function k(key) { return STORAGE_PREFIX + key; }
  function getLS(key) { return localStorage.getItem(k(key)) || ""; }
  function setLS(key, val) { localStorage.setItem(k(key), val); }
  function delLS(key) { localStorage.removeItem(k(key)); }

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
      const keyName = ta.dataset.save;
      ta.value = getLS(keyName);
      ta.addEventListener("input", () => setLS(keyName, ta.value));
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

  function showContinueButton() {
    const btn = document.getElementById("continueAfterChoiceBtn");
    if (btn) btn.style.display = "inline-block";
  }

  function rebuildFromStorage() {
    const story = document.getElementById("story");
    if (!story) return;

    story.innerHTML = "";

    // Always start with Setting visible
    addTemplate("tpl-setting");
    setLS("added_setting", "yes");

    // If they already began mission, show The Call
    if (getLS("added_call") === "yes") {
      addTemplate("tpl-call");
    }

    // If they already selected a choice, show feedback + Continue
    const choice = getLS("choice_start");
    if (choice === "noaa" || choice === "field") {
      // ensure call exists
      if (getLS("added_call") !== "yes") {
        addTemplate("tpl-call");
        setLS("added_call", "yes");
      }

      renderChoiceFeedback(choice);
      disableChoiceButtons();
      showContinueButton();

      // Only show the branch AFTER they confirmed Continue
      if (getLS("choice_confirmed") === "yes") {
        if (choice === "noaa" && getLS("added_noaa") === "yes") addTemplate("tpl-noaa");
        if (choice === "field" && getLS("added_field") === "yes") addTemplate("tpl-field");
      }
    }

    wireAutosaveWithin(story);
    wireStoryButtons();
  }

  // Resume code
  function collectState() {
    const state = {};
    SAVE_KEYS.forEach(keyName => state[keyName] = getLS(keyName));
    return state;
  }

  function encodeResumeCode(stateObj) {
    const json = JSON.stringify(stateObj);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return `R2.${compressed}`; // version bump
  }

  function decodeResumeCode(code) {
    const trimmed = (code || "").trim();
    if (!trimmed.startsWith("R2.")) throw new Error("That doesn't look like a valid Resume Code.");
    const compressed = trimmed.slice(3);
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) throw new Error("That code couldn't be read. Check for missing characters.");
    return JSON.parse(json);
  }

  function applyState(state) {
    SAVE_KEYS.forEach(keyName => {
      if (typeof state[keyName] === "string") setLS(keyName, state[keyName]);
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

  // Story button wiring
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

    // CHOICE click: feedback only (no auto-advance)
    const noaaBtn = document.getElementById("choiceNoaaBtn");
    if (noaaBtn && !noaaBtn.dataset.wired) {
      noaaBtn.dataset.wired = "yes";
      noaaBtn.addEventListener("click", () => {
        setLS("choice_start", "noaa");
        setLS("choice_confirmed", ""); // not confirmed yet
        renderChoiceFeedback("noaa");
        showContinueButton();
        setTopStatus("Choice saved. Click Continue to proceed.");
      });
    }

    const fieldBtn = document.getElementById("choiceFieldBtn");
    if (fieldBtn && !fieldBtn.dataset.wired) {
      fieldBtn.dataset.wired = "yes";
      fieldBtn.addEventListener("click", () => {
        setLS("choice_start", "field");
        setLS("choice_confirmed", "");
        renderChoiceFeedback("field");
        showContinueButton();
        setTopStatus("Choice saved. Click Continue to proceed.");
      });
    }

    // CONTINUE click: now add the branch
    const contBtn = document.getElementById("continueAfterChoiceBtn");
    if (contBtn && !contBtn.dataset.wired) {
      contBtn.dataset.wired = "yes";
      contBtn.addEventListener("click", () => {
        const choice = getLS("choice_start");
        if (choice !== "noaa" && choice !== "field") {
          setTopStatus("Please pick NOAA or Field first.");
          return;
        }

        setLS("choice_confirmed", "yes");
        disableChoiceButtons();

        // add the chosen section ONLY now
        if (choice === "noaa") {
          setLS("added_noaa", "yes");
          setLS("added_field", "");
          const section = addTemplate("tpl-noaa");
          setTopStatus("NOAA section appeared.");
          scrollToEl(section);
        } else {
          setLS("added_field", "yes");
          setLS("added_noaa", "");
          const section = addTemplate("tpl-field");
          setTopStatus("Field section appeared.");
          scrollToEl(section);
        }
      });
    }
  }

  // PDF export with boxed student responses
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

      function ensureSpace(heightNeeded) {
        if (y + heightNeeded > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function addLine(text, fontSize = 11, bold = false) {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(String(text), maxWidth);
        const lineHeight = fontSize + 6;
        ensureSpace(lines.length * lineHeight);
        for (const line of lines) {
          doc.text(line, margin, y);
          y += lineHeight;
        }
      }

      function addSpacer(px = 10) {
        y += px;
        ensureSpace(0);
      }

      function addResponseBox(label, responseText) {
        addLine(label, 11, true);
        addSpacer(4);

        const text = responseText && responseText.trim() ? responseText.trim() : "(blank)";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);

        const padding = 10;
        const lines = doc.splitTextToSize(text, maxWidth - padding * 2);
        const lineHeight = 17;
        const boxHeight = padding * 2 + lines.length * lineHeight;

        ensureSpace(boxHeight + 6);

        // box
        doc.rect(margin, y, maxWidth, boxHeight);

        // text inside
        let ty = y + padding + 12;
        for (const line of lines) {
          doc.text(line, margin + padding, ty);
          ty += lineHeight;
        }

        y += boxHeight + 10;
      }

      const choice = getLS("choice_start") || "(not chosen)";

      addLine("Eco-Responders: After the Fire — Export My Journal", 16, true);
      addSpacer(6);
      addLine(`Choice: ${choice}`, 11, false);
      addSpacer(14);

      // NOAA (include if chosen/confirmed or if any text exists)
      const hasNoaa = getLS("added_noaa") === "yes" || getLS("noaa_prediction") || getLS("noaa_mission_challenge");
      if (hasNoaa) {
        addLine("NOAA Data Path", 13, true);
        addLine("Prompt: Predict what might happen to the forest next year if rainfall stays low and temperatures stay high. Use data to support your prediction.", 11, false);
        addResponseBox("Student Response:", getLS("noaa_prediction"));
        addLine("⚡ Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Add one more prediction OR one question you want to investigate next.", 11, false);
        addResponseBox("Student Response:", getLS("noaa_mission_challenge"));
        addSpacer(6);
      }

      // Field
      const hasField = getLS("added_field") === "yes" || getLS("field_observations") || getLS("optional_challenge") || getLS("field_mission_challenge");
      if (hasField) {
        addLine("Field Observation Path", 13, true);
        addLine("Prompt: Record two observations showing how the fire affected people or wildlife.", 11, false);
        addResponseBox("Student Response:", getLS("field_observations"));

        addLine("🌱 Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Research a local fire-adapted plant. How does it help stabilize soil or promote regrowth?", 11, false);
        addResponseBox("Student Response:", getLS("optional_challenge"));

        addLine("⚡ Mission Challenge (Optional)", 12, true);
        addLine("Prompt: Add one more observation you think matters most, and explain why.", 11, false);
        addResponseBox("Student Response:", getLS("field_mission_challenge"));
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
      const ok = confirm("Reset clears saved work on this device for this lesson version. Continue?");
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

  // Build story immediately
  rebuildFromStorage();
  wireStoryButtons();

  // Optional QR resume
  maybeResumeFromUrl();

  setTopStatus("Ready.");
  setModalStatus("");
});
