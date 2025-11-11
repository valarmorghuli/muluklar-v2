const $$ = (s, c = document) => c.querySelector(s); const WIDTH = () => $$("#tree").clientWidth; const HEIGHT = () => $$("#tree").clientHeight;
const NODE_W = 210, NODE_H = 76; let tooltip;
function showTip(h, x, y) { if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'tooltip'; document.body.appendChild(tooltip) }; tooltip.innerHTML = h; tooltip.style.left = (x + 12) + 'px'; tooltip.style.top = (y + 12) + 'px'; tooltip.style.display = 'block' }
function hideTip() { if (tooltip) tooltip.style.display = 'none' }
let svg, g, root, treeLayout, zoom;
function initTree(data) {
    const w = WIDTH(), h = HEIGHT(); svg = d3.select("#tree").append("svg").attr("width", w).attr("height", h); g = svg.append("g");
    zoom = d3.zoom().scaleExtent([0.35, 2.5]).on("zoom", (ev) => { g.attr("transform", ev.transform) }); svg.call(zoom);
    treeLayout = d3.tree().nodeSize([NODE_H * 1.4, NODE_W + 60]);
    (function norm(n) { if (n.spouse && !n.spouses) { n.spouses = [n.spouse]; delete n.spouse } (n.children || []).forEach(norm) })(data);
    root = d3.hierarchy(data); root.x0 = 0; root.y0 = 0; (root.children || []).forEach(collapseDeep); update(root); centerInitial()
}
function collapseDeep(n) { if (n.children) { n._children = n.children; n._children.forEach(collapseDeep); n.children = null } }
function expandAll(n) { if (n._children) { n.children = n._children; n._children = null } (n.children || []).forEach(expandAll) }
function collapseAll(n) { (n.children || []).forEach(collapseAll); if (n.children) { n._children = n.children; n.children = null } }
function centerInitial() { const w = WIDTH(), h = HEIGHT(); const t = d3.zoomIdentity.translate(80, h * 0.2).scale(0.9); svg.transition().duration(450).call(zoom.transform, t) }
function elbow(s, t) { const mx = (s.y + t.y) / 2; return `M${s.y},${s.x}C${mx},${s.x} ${mx},${t.x} ${t.y},${t.x}` }
function update(source) {
    const dur = 300, treed = treeLayout(root);
    const links = g.selectAll("path.link").data(treed.links(), d => d.target.data.id || d.target.data.name);
    links.enter().append("path").attr("class", "link").attr("d", d => elbow(source, source)).merge(links).transition().duration(dur).attr("d", d => elbow(d.source, d.target));
    links.exit().transition().duration(dur).attr("d", d => elbow(source, source)).remove();
    const nodes = g.selectAll("g.node").data(treed.descendants(), d => d.data.id || d.data.name);
    const en = nodes.enter().append("g").attr("class", "node").attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`).on("click", (ev, d) => toggle(d));
    en.append("rect").attr("x", -NODE_W / 2).attr("y", -NODE_H / 2).attr("width", NODE_W).attr("height", NODE_H);
    en.append("text").attr("class", "title").attr("x", -NODE_W / 2 + 12).attr("y", -6).text(d => d.data.name);
    en.append("rect").attr("class", "spouse-badge").attr("x", -NODE_W / 2 + 10).attr("y", 14).attr("width", NODE_W - 20).attr("height", 20).style("display", d => (d.data.spouses && d.data.spouses.length) ? 'block' : 'none');
    en.append("text").attr("class", "spouse-text").attr("x", -NODE_W / 2 + 16).attr("y", 29).text(d => (d.data.spouses && d.data.spouses.length) ? (d.data.spouses.map(s => s.name).join(', ')) : '').style("display", d => (d.data.spouses && d.data.spouses.length) ? 'block' : 'none');
    en.on("mousemove", (ev, d) => { showTip(`<strong>${d.data.name}</strong>`, ev.pageX, ev.pageY) }).on("mouseleave", hideTip);
    en.merge(nodes).transition().duration(dur).attr("transform", d => `translate(${d.y},${d.x})`);
    nodes.exit().transition().duration(dur).attr("transform", d => `translate(${source.y},${source.x})`).remove();
    treed.each(d => { d.x0 = d.x; d.y0 = d.y })
}
function toggle(d) { if (d.children) { d._children = d.children; d.children = null } else { d.children = d._children; d._children = null } update(d) }
function attachUI() {
    const s = $$("#search"), r = $$("#resetFilter"), e = $$("#expandAll"), c = $$("#collapseAll");
    s.addEventListener("input", () => {
        const q = s.value.trim().toLowerCase(); if (!q) { update(root); return } const m = []; root.each(d => { if ((d.data.name || '').toLowerCase().includes(q)) m.push(d) }); expandAll(root); update(root);
        d3.selectAll(".node rect").style("stroke-width", nd => m.includes(nd) ? 2.4 : 1.25).style("stroke", nd => m.includes(nd) ? "#4cc9f0" : "var(--nodeStroke)")
    });
    r.addEventListener("click", () => { s.value = ''; d3.selectAll('.node rect').style('stroke-width', 1.25).style('stroke', 'var(--nodeStroke)'); update(root) });
    e.addEventListener("click", () => { expandAll(root); update(root) });
    c.addEventListener("click", () => { (root.children || []).forEach(collapseAll); update(root) })
}
async function main() { const data = await fetch('assets/family.json').then(r => r.json()); initTree(data); attachUI() } main();
