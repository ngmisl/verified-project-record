// Verified Project Record demo UI. No framework, no build step.
let role = "buyer";
let projectData = null;
let docs = [];
let currentDoc = "SPR-014";
let verifyState = null;

const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortHash(h) {
  return h ? h.slice(0, 12) + "…" : "—";
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

async function load() {
  const [proj, verify, mode] = await Promise.all([
    api(`/api/project?role=${role}`),
    api(`/api/verify?role=${role}`),
    api("/api/mode"),
  ]);
  projectData = proj;
  verifyState = verify;
  docs = proj.docs;
  renderHero(proj);
  renderPills(verify, mode);
  renderEntries(verify.entries);
  renderAnchor(proj);
  renderPubkey(proj.publicKey);
  renderDocTabs();
  showDoc(currentDoc, null);
  $("#btn-tamper").disabled = proj.tampered;
  renderBanner(verify, proj);
}

function renderHero(proj) {
  const p = proj.project;
  $("#project-name").textContent = p.name;
  $("#project-meta").textContent = `${p.developer} · ${p.location} · ${p.units} units · ${p.structure} · handover ${p.handover}`;
  const latest = [...proj.entries].reverse().find((e) => e.type === "progress");
  const pctField = latest?.fields.find((f) => f.label === "Structural progress");
  const pct = pctField ? parseInt(pctField.value, 10) : 0;
  $("#progress-pct").textContent = pct ? pct + "%" : "—";
  $("#progress-fill").style.width = pct + "%";
  $("#progress-note").textContent = latest ? `Latest: ${latest.title} (${latest.date})` : "";
}

function renderPills(verify, mode) {
  const pill = $("#chain-pill");
  if (verify.valid && verify.anchorMatch) {
    pill.textContent = `Record valid · ${verify.entries.length} entries · anchor matches`;
    pill.className = "pill ok";
  } else {
    const broken = verify.entries.filter((e) => !(e.hashOk && e.sigOk && e.linkOk)).map((e) => e.seq);
    pill.textContent = `Record BROKEN at entr${broken.length > 1 ? "ies" : "y"} ${broken.join(", ")}${verify.anchorMatch ? "" : " · anchor mismatch"}`;
    pill.className = "pill bad";
  }
  const engine = $("#engine-pill");
  engine.textContent = mode.enabled ? `Engine: Muse Spark live (${mode.model} via ${mode.provider})` : "Engine: offline demo (no model API key)";
}

function renderBanner(verify, proj) {
  const banner = $("#tamper-banner");
  if (verify.valid) {
    banner.classList.add("hidden");
    return;
  }
  const broken = verify.entries.filter((e) => !(e.hashOk && e.sigOk && e.linkOk));
  banner.innerHTML =
    `<b>Tamper detected.</b> Entry ${broken.map((e) => e.seq).join(", ")} no longer matches its stored hash and signature` +
    (verify.anchorMatch
      ? `.`
      : `, and the recomputed head hash <span class="mono">${shortHash(verify.headHash)}</span> no longer matches the anchored head hash.`) +
    ` That is the whole point: a forged edit is caught, and named, instead of trusted. Press Reset demo to restore the seed.`;
  banner.classList.remove("hidden");
}

function renderEntries(entries) {
  $("#entry-count").textContent = `· ${entries.length} entries`;
  $("#entries").innerHTML = entries.map((e) => {
    const ok = e.hashOk && e.sigOk && e.linkOk;
    const fields = e.fields.map((f) =>
      `<tr><td>${esc(f.label)}</td><td><b>${esc(f.value)}</b> <span class="cite" data-doc="${esc(f.doc)}" data-line="${f.line}">${esc(f.doc)} line ${f.line}</span></td></tr>`
    ).join("");
    return `<article class="entry${ok ? "" : " broken"}" id="entry-${e.seq}">
      <div class="entry-head">
        <span class="seq">ENTRY-${e.seq}</span>
        <span class="type">${esc(e.type)}</span>
        <h3>${esc(e.title)}</h3>
        <span class="date">${esc(e.date)}</span>
        <span class="dot ${ok ? "ok" : "bad"}">${ok ? "✓ verified" : "✗ broken"}</span>
      </div>
      <table class="fields">${fields}</table>
      <div class="hashline">hash ${shortHash(e.hash)} · prev ${shortHash(e.prevHash)} · sig ${esc(e.signature.slice(0, 16))}…</div>
    </article>`;
  }).join("");
  document.querySelectorAll(".cite").forEach((el) => {
    el.addEventListener("click", () => showDoc(el.dataset.doc, Number(el.dataset.line)));
  });
}

function renderAnchor(proj) {
  $("#anchor-box").innerHTML =
    `<b>Anchor.</b> Head hash <span class="mono">${shortHash(proj.anchor.headHash)}</span> recorded ${esc(proj.anchor.anchoredAt)}. ` +
    `${esc(proj.anchor.method)}`;
}

function renderPubkey(jwk) {
  $("#pubkey").textContent = JSON.stringify(jwk, null, 2);
}

function renderDocTabs() {
  $("#doc-tabs").innerHTML = docs.map((d) =>
    `<button data-doc="${esc(d.id)}" class="${d.id === currentDoc ? "active" : ""}">${esc(d.id)}</button>`
  ).join("");
  document.querySelectorAll("#doc-tabs button").forEach((b) => {
    b.addEventListener("click", () => { currentDoc = b.dataset.doc; renderDocTabs(); showDoc(currentDoc, null); $("#extract-out").innerHTML = ""; });
  });
}

function showDoc(docId, line) {
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return;
  currentDoc = docId;
  $("#doc-lines").innerHTML = doc.lines.map((l, i) =>
    `<li data-line="${i + 1}" class="${line === i + 1 ? "flash" : ""}">${esc(l)}</li>`
  ).join("");
  if (line) {
    const el = document.querySelector(`#doc-lines li[data-line="${line}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function linkifyCitations(text) {
  return esc(text).replace(/ENTRY-(\d+)/g, '<span class="cite" data-entry="$1">ENTRY-$1</span>');
}

async function ask() {
  const input = $("#ask-input");
  const q = input.value.trim();
  if (!q) return;
  const box = $("#answer");
  box.classList.remove("hidden");
  box.innerHTML = "Asking…";
  const ans = await api("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q, role }),
  });
  box.innerHTML = `<div>${linkifyCitations(ans.text)}</div>
    <div class="meta">Engine: ${esc(ans.engine)} · Role: ${esc(ans.role)}${ans.citations.length ? " · Cited: " + ans.citations.map(esc).join(", ") : " · No citations: refused rather than guessed"}</div>`;
  box.querySelectorAll(".cite").forEach((el) => {
    el.addEventListener("click", () => {
      const target = document.getElementById(`entry-${el.dataset.entry}`);
      if (target) target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}

async function extract() {
  const out = $("#extract-out");
  out.innerHTML = "Extracting…";
  const res = await api(`/api/extract/${encodeURIComponent(currentDoc)}?role=${role}`, { method: "POST" });
  const STATUS = {
    match: ["match", "✓ matches signed record"],
    differs: ["nomatch", "✗ differs from record"],
    extra: ["extra", "· not in record"],
    ungrounded: ["nomatch", "✗ not on cited line"],
  };
  const rows = res.fields.map((f) => {
    const [cls, label] = STATUS[f.status] ?? STATUS.ungrounded;
    return `<tr><td>${esc(f.label)}</td><td><b>${esc(f.value)}</b></td><td>line ${Number(f.line)}</td><td class="${cls}">${label}</td></tr>`;
  }).join("");
  out.innerHTML = `<table class="extract-table">${rows}</table><p class="extract-note">${esc(res.note || "")}</p>`;
}

document.querySelectorAll(".roles button").forEach((b) => {
  b.addEventListener("click", () => {
    role = b.dataset.role;
    document.querySelectorAll(".roles button").forEach((x) => x.classList.toggle("active", x === b));
    load();
  });
});
document.querySelectorAll(".chips button").forEach((b) => {
  b.addEventListener("click", () => { $("#ask-input").value = b.dataset.q; ask(); });
});
$("#btn-ask").addEventListener("click", ask);
$("#ask-input").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
$("#btn-verify").addEventListener("click", load);
$("#btn-extract").addEventListener("click", extract);
$("#btn-tamper").addEventListener("click", async () => {
  const res = await api("/api/tamper", { method: "POST" });
  if (res.error) { alert(res.error); return; }
  await load();
});
$("#btn-reset").addEventListener("click", async () => {
  await api("/api/reset", { method: "POST" });
  await load();
});

load();
