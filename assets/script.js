const $$ = (s, c = document) => c.querySelector(s);
const WIDTH = () => $$("#tree").clientWidth;
const HEIGHT = () => $$("#tree").clientHeight;

// a and b reference the id (or name fallback) from family.json
const SPECIAL_LINKS = [
  // a: Father, b: Mother
  { a: "p5", b: "p6" },

  // Child → link to the other parent
  { a: "p7", b: "p6" },
  { a: "p8", b: "p6" },
];

// Adjust the tree container height based on the header height
function resizeTreeContainer() {
  const header = document.querySelector('header.topbar');
  const main = document.querySelector('main.onlytree');
  if (!header || !main) return;

  const headerH = header.getBoundingClientRect().height;
  const vh = window.innerHeight;

  const h = Math.max(vh - headerH, 380);

  main.style.height = h + "px";
}
window.addEventListener("resize", resizeTreeContainer);
window.addEventListener("orientationchange", resizeTreeContainer);

const NODE_W = 180;
const NODE_H = 54;
const SINGLE_ROW_H = NODE_H / 2; // collapse cards that only need one row
const ZOOM_EPSILON = 0.02;

function resetBrowserZoomToDefault() {
  const viewport = window.visualViewport;
  const html = document.documentElement;
  if (!viewport || !html) return;

  const scale = viewport.scale || 1;
  if (Math.abs(scale - 1) < ZOOM_EPSILON) {
    html.style.removeProperty("zoom");
    return;
  }

  const compensation = Number((1 / scale).toFixed(4));
  html.style.zoom = compensation;

  const handleViewportReset = () => {
    if (!window.visualViewport) return;
    const currentScale = window.visualViewport.scale || 1;
    if (Math.abs(currentScale - 1) < ZOOM_EPSILON) {
      html.style.removeProperty("zoom");
      window.visualViewport.removeEventListener("resize", handleViewportReset);
    }
  };
  window.visualViewport.addEventListener("resize", handleViewportReset);
}

resetBrowserZoomToDefault();

let tooltip, svg, g, root, treeLayout, zoom;

/* ---------------- Tooltip ---------------- */
function showTip(text, x, y) {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = text;
  tooltip.style.left = (x + 12) + 'px';
  tooltip.style.top = (y + 12) + 'px';
  tooltip.style.display = 'block';
}
function hideTip() { if (tooltip) tooltip.style.display = 'none'; }

/* ---------------- Helpers ---------------- */
function expandPathTo(node) {
  node.ancestors().forEach(a => {
    if (a._children) {
      a.children = a._children;
      a._children = null;
    }
  });
}
function centerOnNode(node, k = 1.05, ms = 450) {
  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  const t = d3.zoomIdentity.translate(w / 2 - node.y * k, h / 2 - node.x * k).scale(k);
  svg.transition().duration(ms).call(zoom.transform, t);
}

// Walk over every node (children + _children)
function traverseAll(node, fn) {
  fn(node);
  (node.children || []).forEach(c => traverseAll(c, fn));
  (node._children || []).forEach(c => traverseAll(c, fn));
}

function findById(id) {
  let found = null;
  traverseAll(root, n => {
    if (!found && (n.data.id || n.data.name) === id) found = n;
  });
  return found;
}

function focusNodeById(id) {
  d3.selectAll("g.node rect").classed("focused", false);
  d3.selectAll("g.node")
    .filter(n => (n.data.id || n.data.name) === id)
    .select("rect")
    .classed("focused", true);
}

function normalizeText(value) {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nodeMatchesQuery(d, q) {
  if (!q) return false;
  const nm = normalizeText(d.data.name || "");
  if (nm.includes(q)) return true;
  const spouses = (d.data.spouses || []).map(s => normalizeText(s.name || ""));
  return spouses.some(snm => snm.includes(q));
}

function normalizeFamilyTree(data) {
  (function norm(node) {
    if (!node || typeof node !== "object") return;
    if (node.spouse) {
      const extra = Array.isArray(node.spouse) ? node.spouse : [node.spouse];
      const current = Array.isArray(node.spouses) ? node.spouses : [];
      node.spouses = [...current, ...extra].filter(Boolean);
      delete node.spouse;
    }
    (node.children || []).forEach(norm);
  })(data);
  return data;
}

/* -------- Split Mehmet Muluk into two marriage nodes -------- */
// NOTE: We rely on names instead of IDs to keep it simple.
// We assume family.json contains a record similar to:
//   "name": "Mehmet Muluk",
//   "spouses": [ { "name": "Ayşe Muluk" }, { "name": "Gücce Ana" } ]
function splitMehmetForSpouses(data) {
  const personName = "Mehmet Muluk";
  const ayseIdentifiers = ["Ayşe Muluk", "p2"];
  const gucceIdentifiers = ["Gücce Ana", "p300"];

  const matchesSpouse = (spouse, targets) => {
    if (!spouse || !Array.isArray(targets)) return false;
    return targets.some(t => (spouse.name && spouse.name === t) || (spouse.id && spouse.id === t));
  };

  const childBelongsToSpouse = (child, spouse) => {
    if (!child || !spouse) return false;
    const tagId = child.parentSpouseId || (child.parentSpouse && child.parentSpouse.id);
    const tagName = child.parentSpouseName || (child.parentSpouse && child.parentSpouse.name);
    if (tagId && spouse.id && tagId === spouse.id) return true;
    if (tagName && spouse.name && tagName === spouse.name) return true;
    return false;
  };

  function dfs(node, parent) {
    if (!node) return;

    if (node.name === personName && Array.isArray(node.spouses) && node.spouses.length >= 2) {
      const ayseSp = node.spouses.find(s => matchesSpouse(s, ayseIdentifiers));
      const gucceSp = node.spouses.find(s => matchesSpouse(s, gucceIdentifiers));
      if (!ayseSp && !gucceSp) return;

      const children = Array.isArray(node.children) ? node.children : [];
      const ayseChildren = [];
      const gucceChildren = [];
      const unknownChildren = [];

      children.forEach(child => {
        if (childBelongsToSpouse(child, ayseSp)) ayseChildren.push(child);
        else if (childBelongsToSpouse(child, gucceSp)) gucceChildren.push(child);
        else unknownChildren.push(child);
      });

      // Assign children without metadata to Ayşe by default
      if (unknownChildren.length) {
        const fallback = ayseSp ? ayseChildren : gucceSp ? gucceChildren : ayseChildren;
        fallback.push(...unknownChildren);
      }

      const baseId = node.id || node.name;
      const replacements = [];

      if (ayseSp) {
        replacements.push({
          ...node,
          id: baseId + "_ayse",
          spouses: [ayseSp],
          children: ayseChildren
        });
      }

      if (gucceSp) {
        replacements.push({
          ...node,
          id: baseId + "_gucce",
          spouses: [gucceSp],
          children: gucceChildren
        });
      }

      if (parent && Array.isArray(parent.children)) {
        parent.children = parent.children.flatMap(ch => (ch === node ? replacements : [ch]));
      }

      return;
    }

    (node.children || []).forEach(ch => dfs(ch, node));
  }

  dfs(data, null);
  return data;
}

// --- Fit to view (considers node sizes; ONLY zoom-out, never enlarges) ---
function fitToView(pad = 60, ms = 300, { onlyZoomOut = true, padX = 60, padY = 60 } = {}) {
  const nodes = [];
  root.each(n => nodes.push(n));
  if (!nodes.length) return;

  const halfH = NODE_H / 2, halfW = NODE_W / 2;
  let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (n.x != null) {
      minX = Math.min(minX, n.x - halfH);
      maxX = Math.max(maxX, n.x + halfH);
    }
    if (n.y != null) {
      minY = Math.min(minY, n.y - halfW);
      maxY = Math.max(maxY, n.y + halfW);
    }
  });

  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);

  const boxW = Math.max(1, (maxY - minY) + padX * 2);
  const boxH = Math.max(1, (maxX - minX) + padY * 2);

  let kCandidate = Math.min(w / boxW, h / boxH);
  const currentK = d3.zoomTransform(svg.node()).k || 1;
  if (onlyZoomOut) kCandidate = Math.min(currentK, 1, kCandidate);
  else kCandidate = Math.min(1, kCandidate);

  const k = Math.max(0.35, Math.min(2.5, kCandidate));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  const tx = w / 2 - cy * k, ty = h / 2 - cx * k;
  svg.transition().duration(ms).call(
    zoom.transform,
    d3.zoomIdentity.translate(tx, ty).scale(k)
  );
}

/* ---------------- Search state ---------------- */
let searchHits = [];   // array of IDs
let searchIndex = -1;
let pendingFocusTimer = null;

function cancelPendingFocus() {
  if (pendingFocusTimer) {
    clearTimeout(pendingFocusTimer);
    pendingFocusTimer = null;
  }
}

function collectMatches(q) {
  q = normalizeText((q || '').trim());
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

  // Wait for the D3 transition (300ms) plus a small buffer before moving the camera
  cancelPendingFocus();
  pendingFocusTimer = setTimeout(() => {
    pendingFocusTimer = null;
    const n2 = findById(targetId);
    if (!n2) return;
    focusNodeById(targetId);
    centerOnNode(n2, 1.05, 350);
  }, 350);
}

/* ---------------- D3 init/update ---------------- */
function initTree(data) {
  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  svg = d3.select("#tree").append("svg").attr("width", w).attr("height", h);
  g = svg.append("g");

  zoom = d3.zoom()
    .scaleExtent([0.35, 2.5])
    .on("zoom", (ev) => { hideTip(); g.attr("transform", ev.transform); });
  svg.call(zoom).on("click", hideTip);

  treeLayout = d3.tree().nodeSize([NODE_H * 1.4, NODE_W + 60]);

  root = d3.hierarchy(data);
  root.x0 = 0;
  root.y0 = 0;
  (root.children || []).forEach(collapseDeep);
  update(root);
  fitToView(60, 350, { onlyZoomOut: true, padX: 120, padY: 70 });
}

function collapseDeep(n) {
  if (n.children) {
    n._children = n.children;
    n._children.forEach(collapseDeep);
    n.children = null;
  }
}
function expandAll(n) {
  if (n._children) {
    n.children = n._children;
    n._children = null;
  }
  (n.children || []).forEach(expandAll);
}
function collapseAll(n) {
  (n.children || []).forEach(collapseAll);
  if (n.children) {
    n._children = n.children;
    n.children = null;
  }
}

function elbow(s, t) {
  const mx = (s.y + t.y) / 2;
  return `M${s.y},${s.x}C${mx},${s.x} ${mx},${t.x} ${t.y},${t.x}`;
}

function update(source) {
  const dur = 300;
  const treed = treeLayout(root);

  // ---- LINKS ----
  const links = g.selectAll("path.link")
    .data(treed.links(), d => d.target.data.id || d.target.data.name);

  links.enter()
    .append("path")
    .attr("class", "link")
    .attr("d", d => elbow(source, source))
    .merge(links)
    .transition().duration(dur)
    .attr("d", d => elbow(d.source, d.target));

  links.exit()
    .transition().duration(dur)
    .attr("d", d => elbow(source, source))
    .remove();

  // ========= NEW FROM HERE: cross-link paths =========
  // 1) build id → node map
  const nodeIndex = {};
  treed.each(d => {
    const key = d.data.id || d.data.name;
    nodeIndex[key] = d;
  });

  // 2) keep links that have both end points rendered
  const activeCrossLinks = SPECIAL_LINKS.filter(cl =>
    nodeIndex[cl.a] && nodeIndex[cl.b]
  );

  // 3) draw path.crosslink
  const cross = g.selectAll("path.crosslink")
    .data(activeCrossLinks, d => d.a + "→" + d.b);

  cross.enter()
    .append("path")
    .attr("class", "crosslink")
    .attr("d", d => {
      const a = nodeIndex[d.a];
      const b = nodeIndex[d.b];
      if (!a || !b) return null;
      // quick straight line for the initial draw
      return `M${a.y},${a.x}L${b.y},${b.x}`;
    })

    .merge(cross)
    .transition().duration(dur)
    .attr("d", d => {
      const a = nodeIndex[d.a];
      const b = nodeIndex[d.b];
      if (!a || !b) return null;

      // offset so the line leaves from the card edges
      const ax = a.x;
      const ay = a.y + NODE_W / 2;
      const bx = b.x;
      const by = b.y + NODE_W / 2;

      return `M${ay},${ax}L${by},${bx}`;
    });

  cross.exit().remove();
  // ========= end of cross-link drawing =========

  // ---- NODES ----
  const nodes = g.selectAll("g.node")
    .data(treed.descendants(), d => d.data.id || d.data.name);

  const en = nodes.enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
    .on("click", (ev, d) => { hideTip(); toggle(d); })
    .on("mouseenter", (ev, d) => {
      showTip(d.data.name, ev.pageX, ev.pageY);
    })
    .on("mouseleave", hideTip);

  // Base card rectangle (height adjusted later)
  en.append("rect")
    .attr("x", -NODE_W / 2)
    .attr("y", -NODE_H / 2)
    .attr("width", NODE_W)
    .attr("height", NODE_H)
    .attr("rx", 10);

  // Name line – initial placement
  en.append("text")
    .attr("class", "title")
    .attr("x", -NODE_W / 2 + 12)
    .attr("y", -6) // roughly the top row
    .text(d => d.data.name);

  // Spouse line – initial placement
  en.append("text")
    .attr("class", "spouse-text")
    .attr("x", -NODE_W / 2 + 12)
    .attr("y", 14) // second row
    .text(d => {
      const sps = d.data.spouses;
      if (!sps || !sps.length) return "";
      return sps.map(s => s.name).join(", ");
    });

  // ---- VERTICALLY CENTER THE TEXT BLOCK ----
  en.each(function (d) {
    const gnode = d3.select(this);
    const texts = gnode.selectAll("text");
    if (texts.empty()) return;

    // Shared bounding box of all text lines
    let minY = Infinity, maxY = -Infinity;
    let textLines = 0;
    texts.each(function () {
      const content = (this.textContent || "").trim();
      if (content) textLines += 1;
      const b = this.getBBox();
      if (b.y < minY) minY = b.y;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    });

    const center = (minY + maxY) / 2; // center of the text block
    const delta = -center;            // shift needed to move center to 0

    // Apply the same delta to every text line
    texts.attr("y", function () {
      const oldY = parseFloat(d3.select(this).attr("y")) || 0;
      return oldY + delta;
    });

    if (!textLines) return;
    const cardHeight = textLines === 1 ? SINGLE_ROW_H : NODE_H;
    gnode.select("rect")
      .attr("height", cardHeight)
      .attr("y", -cardHeight / 2);
  });

  // ---- TRANSITION ----
  en.merge(nodes)
    .transition().duration(dur)
    .attr("transform", d => `translate(${d.y},${d.x})`);

  nodes.exit()
    .transition().duration(dur)
    .attr("transform", d => `translate(${source.y},${source.x})`)
    .remove();

  treed.each(d => { d.x0 = d.x; d.y0 = d.y; });
}

function toggle(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  } else {
    d.children = d._children;
    d._children = null;
  }
  update(d);
}

/* ---------------- UI wiring ---------------- */
function attachUI() {
  const s = $$("#search"),
    r = $$("#resetFilter"),
    e = $$("#expandAll"),
    c = $$("#collapseAll"),
    pB = $$("#prevHit"),
    nB = $$("#nextHit");

  const h = document.getElementById('homeBtn');     // Center view
  const zi = document.getElementById('zoomInFab');   // right-side +
  const zo = document.getElementById('zoomOutFab');  // right-side −

  // --- Live highlight while typing ---
  s.addEventListener("input", () => {
    const rawQuery = s.value.trim();
    const normalizedQuery = normalizeText(rawQuery);
    searchHits = collectMatches(rawQuery);
    searchIndex = -1;

    if (!normalizedQuery) {
      // Search empty: only clear highlights, leave tree/zoom state
      searchHits = [];
      searchIndex = -1;
      cancelPendingFocus();

      d3.selectAll("g.node rect")
        .classed("focused", false)
        .classed("matched", false)
        .style("stroke-width", 1.25)
        .style("stroke", "var(--nodeStroke)");

      return;
    }

    if (searchHits.length) {
      focusAt(0); // highlight + center on the top search result automatically
    } else {
      d3.selectAll("g.node rect").classed("focused", false);
      cancelPendingFocus();
    }

    // Apply highlight to the nodes on screen
    requestAnimationFrame(() => {
      d3.selectAll("g.node").each(function (nd) {
        const isHit = nodeMatchesQuery(nd, normalizedQuery);
        d3.select(this).select("rect")
          .classed("matched", isHit)
          .style("stroke-width", isHit ? 2.6 : 1.25)
          .style("stroke", isHit ? "#4cc9f0" : "var(--nodeStroke)");
      });
    });
  });

  // --- Focus via Enter ---
  s.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (!searchHits.length) return;

    ev.preventDefault();

    // Mobile: close keyboard and focus the first match
    if (window.innerWidth <= 768) {
      s.blur();          // dismiss the virtual keyboard
      focusAt(0);        // go to the first hit
      return;            // use ▲ / ▼ for others
    }

    // Desktop: Enter → next, Shift+Enter → previous
    if (ev.shiftKey) focusAt(searchIndex - 1);
    else focusAt(searchIndex + 1);
  });

  // --- Reset: clear only the search state ---
  r.addEventListener("click", () => {
    s.value = '';
    searchHits = [];
    searchIndex = -1;
    cancelPendingFocus();

    d3.selectAll('g.node rect')
      .classed('focused', false)
      .classed('matched', false)
      .style('stroke-width', 1.25)
      .style('stroke', 'var(--nodeStroke)');
  });

  // --- Expand All ---
  e.addEventListener("click", () => {
    expandAll(root);
    update(root);
    // fit the full tree into view
    fitToView(60, 300, { onlyZoomOut: false, padX: 120, padY: 70 });
  });

  // --- Collapse All ---
  c.addEventListener("click", () => {
    (root.children || []).forEach(collapseAll);
    update(root);
    fitToView(60, 300, { onlyZoomOut: false, padX: 120, padY: 70 });
  });

  // --- Zoom In (+) – floating button ---
  if (zi) {
    zi.addEventListener('click', () => {
      if (!svg) return;
      svg.transition().duration(200).call(zoom.scaleBy, 1.2); // ~20% zoom-in
    });
  }

  // --- Zoom Out (−) – floating button ---
  if (zo) {
    zo.addEventListener('click', () => {
      if (!svg) return;
      svg.transition().duration(200).call(zoom.scaleBy, 0.8); // ~20% zoom-out
    });
  }

  // --- Center ---
  if (h) {
    h.addEventListener('click', () => {
      fitToView(60, 300, { onlyZoomOut: false, padX: 120, padY: 70 });
    });
  }

  // --- Previous / Next match buttons ---
  if (nB) {
    nB.addEventListener("click", () => {
      if (!searchHits.length) return;
      focusAt(searchIndex + 1);
    });
  }

  if (pB) {
    pB.addEventListener("click", () => {
      if (!searchHits.length) return;
      focusAt(searchIndex - 1);
    });
  }
}


/* ---------------- Boot ---------------- */
async function main() {
  // adjust the container height first
  resizeTreeContainer();

  try {
    let data = await fetch('assets/family.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      return r.json();
    });

    data = normalizeFamilyTree(data);
    // Split Mehmet Muluk's multiple marriages into separate nodes
    data = splitMehmetForSpouses(data);

    initTree(data);
    attachUI();
  } catch (err) {
    console.error('Bir Hata Oldu:', err);
    document.querySelector('main.onlytree').innerHTML =
      '<div style="padding: 40px; text-align: center; color: #e7eaf3;">' +
      'Aile ağacı yüklenemedi. Lütfen sayfayı yenileyin.' +
      '</div>';
  }
}
main();

// resize: refresh SVG dimensions
function updateSVGDimensions() {
  if (!svg) return;
  const w = WIDTH() || window.innerWidth;
  const h = HEIGHT() || Math.round(window.innerHeight * 0.8);
  svg.attr("width", w).attr("height", h);
}
window.addEventListener("resize", updateSVGDimensions);
