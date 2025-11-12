// === script.js — D3 Family Tree (search + focus + ONLY zoom-out fit) ===
const $$ = (s, c = document) => c.querySelector(s);
const WIDTH = () => $$("#tree").clientWidth;
const HEIGHT = () => $$("#tree").clientHeight;

const NODE_W = 210, NODE_H = 76;

let tooltip, svg, g, root, treeLayout, zoom;

/* ---------------- Tooltip ---------------- */
function showTip(html, x, y) {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.innerHTML = html;
  tooltip.style.left = (x + 12) + 'px';
  tooltip.style.top = (y + 12) + 'px';
  tooltip.style.display = 'block';
}
function hideTip() { if (tooltip) tooltip.style.display = 'none'; }

/* ---------------- Helpers ---------------- */
function expandPathTo(node) {
  node.ancestors().forEach(a => { if (a._children) { a.children = a._children; a._children = null; } });
}
function centerOnNode(node, k = 1.05, ms = 450) {
  const w = WIDTH() || window.innerWidth, h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  const t = d3.zoomIdentity.translate(w / 2 - node.y * k, h / 2 - node.x * k).scale(k);
  svg.transition().duration(ms).call(zoom.transform, t);
}
// Tüm düğümleri (children + _children) dolaş
function traverseAll(node, fn) {
  fn(node);
  (node.children || []).forEach(c => traverseAll(c, fn));
  (node._children || []).forEach(c => traverseAll(c, fn));
}
function findById(id) {
  let found = null;
  traverseAll(root, n => { if (!found && (n.data.id || n.data.name) === id) found = n; });
  return found;
}
function focusNodeById(id) {
  d3.selectAll("g.node rect").classed("focused", false);
  d3.selectAll("g.node").filter(n => (n.data.id || n.data.name) === id)
    .select("rect").classed("focused", true);
}
function nodeMatchesQuery(d, q) {
  if (!q) return false;
  const nm = (d.data.name || '').toLowerCase();
  if (nm.includes(q)) return true;
  const spouses = (d.data.spouses || []).map(s => (s.name || '').toLowerCase());
  return spouses.some(snm => snm.includes(q));
}

/* --- Fit to view (kutu boylarını hesaba katar; YALNIZ zoom-out) --- */
/* opts: { onlyZoomOut=true, padX=120, padY=70 } */
function fitToView(_pad = 60, ms = 300, opts = {}) {
  const { onlyZoomOut = true, padX = 120, padY = 70 } = opts;

  const nodesSel = d3.selectAll("g.node");
  if (nodesSel.empty()) return;

  let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;

  nodesSel.each(function (d) {
    const r = d3.select(this).select("rect");
    const w = +r.attr("width") || NODE_W;
    const h = +r.attr("height") || NODE_H;
    const halfW = w / 2, halfH = h / 2;

    if (d.x != null) { minX = Math.min(minX, d.x - halfH); maxX = Math.max(maxX, d.x + halfH); }
    if (d.y != null) { minY = Math.min(minY, d.y - halfW); maxY = Math.max(maxY, d.y + halfW); }
  });

  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);

  const boxW = Math.max(1, (maxY - minY) + padX * 2);
  const boxH = Math.max(1, (maxX - minX) + padY * 2);

  let kCandidate = Math.min(w / boxW, h / boxH);
  const currentK = d3.zoomTransform(svg.node()).k || 1;
  kCandidate = onlyZoomOut ? Math.min(currentK, 1, kCandidate) : Math.min(1, kCandidate);

  const k = Math.max(0.35, Math.min(2.5, kCandidate));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  const tx = w / 2 - cy * k;
  const ty = h / 2 - cx * k;

  svg.transition().duration(ms)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

/* ---------------- Search state ---------------- */
let searchHits = [];   // array of IDs
let searchIndex = -1;

function collectMatches(q) {
  q = (q || '').trim().toLowerCase();
  const hits = [];
  if (!q) return hits;
  traverseAll(root, d => {
    if (nodeMatchesQuery(d, q)) {
      hits.push({ id: (d.data.id || d.data.name), y: d.y ?? 0, x: d.x ?? 0 });
    }
  });
  hits.sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.id).localeCompare(String(b.id)));
  return hits.map(h => h.id);
}
function focusAt(index) {
  if (!searchHits.length) return;
  if (index < 0) index = searchHits.length - 1;
  if (index >= searchHits.length) index = 0;
  searchIndex = index;

  const targetId = searchHits[searchIndex];
  const targetNode = findById(targetId);
  if (!targetNode) return;
  expandPathTo(targetNode);
  update(targetNode);

  setTimeout(() => {
    const n2 = findById(targetId);
    if (!n2) return;
    focusNodeById(targetId);
    centerOnNode(n2, 1.05, 350);
  }, 0);
}

/* ---------------- D3 init/update ---------------- */
function initTree(data) {
  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  svg = d3.select("#tree").append("svg").attr("width", w).attr("height", h);
  g = svg.append("g");

  zoom = d3.zoom().scaleExtent([0.35, 2.5]).on("zoom", (ev) => { hideTip(); g.attr("transform", ev.transform); });
  svg.call(zoom).on("click", hideTip);

  treeLayout = d3.tree().nodeSize([NODE_H * 1.4, NODE_W + 60]);

  // spouse -> spouses normalize
  (function norm(n) { if (n.spouse && !n.spouses) { n.spouses = [n.spouse]; delete n.spouse; } (n.children || []).forEach(norm); })(data);

  root = d3.hierarchy(data); root.x0 = 0; root.y0 = 0;
  (root.children || []).forEach(collapseDeep);
  update(root);
  fitToView(60, 350, { onlyZoomOut: true, padX: 120, padY: 70 });
}

function collapseDeep(n) { if (n.children) { n._children = n.children; n._children.forEach(collapseDeep); n.children = null; } }
function expandAll(n) { if (n._children) { n.children = n._children; n._children = null; } (n.children || []).forEach(expandAll); }
function collapseAll(n) { (n.children || []).forEach(collapseAll); if (n.children) { n._children = n.children; n.children = null; } }
function elbow(s, t) { const mx = (s.y + t.y) / 2; return `M${s.y},${s.x}C${mx},${s.x} ${mx},${t.x} ${t.y},${t.x}`; }

function update(source) {
  const dur = 300, treed = treeLayout(root);

  const links = g.selectAll("path.link").data(treed.links(), d => d.target.data.id || d.target.data.name);
  links.enter().append("path").attr("class", "link").attr("d", d => elbow(source, source))
    .merge(links).transition().duration(dur).attr("d", d => elbow(d.source, d.target));
  links.exit().transition().duration(dur).attr("d", d => elbow(source, source)).remove();

  const nodes = g.selectAll("g.node").data(treed.descendants(), d => d.data.id || d.data.name);
  const en = nodes.enter().append("g").attr("class", "node")
    .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
    .on("click", (ev, d) => { hideTip(); toggle(d); })
    .on("mouseenter", (ev, d) => { showTip(`<strong>${d.data.name}</strong>`, ev.pageX, ev.pageY); })
    .on("mouseleave", hideTip);

  en.append("text").attr("class", "title").attr("x", -NODE_W / 2 + 12).attr("y", -6).text(d => d.data.name);
  en.append("text").attr("class", "spouse-text").attr("x", -NODE_W / 2 + 12).attr("y", 14)
    .text(d => (d.data.spouses && d.data.spouses.length) ? (d.data.spouses.map(s => s.name).join(', ')) : '');

  // otomatik kutu yüksekliği
  en.each(function (d) {
    const gnode = d3.select(this);
    const nb = gnode.select("text.title").node().getBBox();
    const sbNode = gnode.select("text.spouse-text").node();
    const sb = sbNode ? sbNode.getBBox() : { height: 0 };
    const lines = (d.data.spouses && d.data.spouses.length) ? (nb.height + 6 + sb.height) : nb.height;
    const boxH = Math.max(40, 20 + lines);
    gnode.insert("rect", "text.title")
      .attr("x", -NODE_W / 2).attr("y", -boxH / 2).attr("width", NODE_W).attr("height", boxH).attr("rx", 10);
    gnode.select("text.title").attr("y", -boxH / 2 + 16);
    if (d.data.spouses && d.data.spouses.length)
      gnode.select("text.spouse-text").attr("y", -boxH / 2 + 16 + nb.height + 6);
    else
      gnode.select("text.spouse-text").text("");
  });

  en.merge(nodes).transition().duration(dur).attr("transform", d => `translate(${d.y},${d.x})`);
  nodes.exit().transition().duration(dur).attr("transform", d => `translate(${source.y},${source.x})`).remove();

  treed.each(d => { d.x0 = d.x; d.y0 = d.y; });
}

function toggle(d) {
  if (d.children) { d._children = d.children; d.children = null; }
  else { d.children = d._children; d._children = null; }
  update(d);
}

/* ---------------- UI wiring ---------------- */
function attachUI() {
  const s = $$("#search"), r = $$("#resetFilter"), e = $$("#expandAll"), c = $$("#collapseAll");
  const h = document.getElementById('homeBtn'); // Merkezle

  // yazarken canlı highlight — sadece ilk eşleşmenin yolu açılır
  s.addEventListener("input", () => {
    const q = s.value.trim().toLowerCase();
    searchHits = collectMatches(q);
    searchIndex = -1;

    if (!q) {
      (root.children || []).forEach(collapseDeep);
      update(root);
      d3.selectAll("g.node rect").classed("matched", false).style("stroke-width", 1.25).style("stroke", "var(--nodeStroke)");
      fitToView(60, 250, { onlyZoomOut: true, padX: 120, padY: 70 });
      return;
    }

    if (searchHits.length) {
      const first = findById(searchHits[0]);
      if (first) { expandPathTo(first); update(first); }
    }

    requestAnimationFrame(() => {
      d3.selectAll("g.node").each(function (nd) {
        const isHit = nodeMatchesQuery(nd, q);
        d3.select(this).select("rect")
          .classed("matched", isHit)
          .style("stroke-width", isHit ? 2.6 : 1.25)
          .style("stroke", isHit ? "#4cc9f0" : "var(--nodeStroke)");
      });
    });
  });

  // Enter/Shift+Enter ile gezin
  s.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (!searchHits.length) return;
    if (ev.shiftKey) focusAt(searchIndex - 1);
    else focusAt(searchIndex + 1);
  });

  // Sıfırla
  r.addEventListener("click", () => {
    s.value = ''; searchHits = []; searchIndex = -1;
    (root.children || []).forEach(collapseDeep);
    update(root);
    d3.selectAll('g.node rect').classed('focused', false).classed('matched', false)
      .style('stroke-width', 1.25).style('stroke', 'var(--nodeStroke)');
    fitToView(60, 300, { onlyZoomOut: true, padX: 120, padY: 70 });
  });

  // Tümünü Aç/Kapat
  e.addEventListener("click", () => { expandAll(root); update(root); fitToView(60, 300, { onlyZoomOut: true, padX: 120, padY: 70 }); });
  c.addEventListener("click", () => { (root.children || []).forEach(collapseAll); update(root); fitToView(60, 300, { onlyZoomOut: true, padX: 120, padY: 70 }); });

  // Merkezle
  if (h) {
    h.addEventListener('click', () => {
      fitToView(60, 300, { onlyZoomOut: true, padX: 120, padY: 70 });
    });
  }
}

/* ---------------- Boot ---------------- */
async function main() { const data = await fetch('assets/family.json').then(r => r.json()); initTree(data); attachUI(); }
main();

// resize: SVG boyutlarını güncelle
window.addEventListener("resize", () => {
  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  d3.select("#tree svg").attr("width", w).attr("height", h);
});
