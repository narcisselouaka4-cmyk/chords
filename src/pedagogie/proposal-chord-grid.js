import {reviewTake} from '../recorder/take-review.js';

const ROOT = /^(?:(Sol|Do|Ré|Re|Mi|Fa|La|Si)([♯♭#b]?)(?=\s|$|maj|m(?:\d|$)|add|sus|dim|alt|\d)|([A-G])([♯♭#b]?))/u;
const LETTERS = {Do:'C',Ré:'D',Re:'D',Mi:'E',Fa:'F',Sol:'G',La:'A',Si:'B'};
const LATIN = {C:'Do',D:'Ré',E:'Mi',F:'Fa',G:'Sol',A:'La',B:'Si'};
const openGrids = new Set();

/** Une même notation pour le jeu détecté et les noms du plan harmonique. */
export function gridChordName(name, notation = 'english') {
  const root = token => token.replace(ROOT, (_,fr,frAlter,en,enAlter) => {
    const n=fr || en, alteration=fr ? frAlter : enAlter;
    return `${notation === 'latin' ? LATIN[n] || n : LETTERS[n] || n}${alteration}`;
  });
  return root(String(name || '').trim())
    .replace(/\/\s*(Sol|Do|Ré|Re|Mi|Fa|La|Si|[A-G])([♯♭#b]?)/gu, (_,n,a) => `/${root(n+a)}`)
    .replace(/majeur\s*/g,'maj').replace(/mineur\s*/g,'m')
    .replace(/diminué\s*/g,'dim').replace(/altéré/g,'alt')
    .replace(/sans fondamentale/g,'(sans fond.)')
    .replace(/\s*\/\s*/g,'/').replace(/\s+(?=(?:maj|m|dim|sus|add|alt|\d))/g,'')
    .replace(/(maj|m|dim)\s+(?=\d)/g,'$1');
}

function plannedTimeline(variant, original) {
  const changes = variant.advice?.changes || variant.playingAdvice?.changes || [];
  const planned = changes.filter(c => Number.isFinite(c.at) && c.at >= 0 && typeof c.chord === 'string' && c.chord.trim() && c.notes?.length)
    .map(c => ({at:c.at, name:c.chord.trim(), uncertain:false}));
  if (!planned.length) return [];
  // Les accords source qui n'ont pas été retravaillés restent dans la grille.
  // Le plan utilise les attaques du bloc, parfois légèrement après sa détection.
  const untouched = original.filter(c => !planned.some(p => Math.abs(p.at-c.at) <= .4));
  return [...untouched,...planned].sort((a,b) => a.at-b.at);
}

/** Grille harmonique (pas une partition rythmique), tirée du plan effectivement joué. */
export function proposalChordGrid(result, {notation = 'english'} = {}) {
  if (!result?.originalTake?.events?.length || !result.variants?.length) return null;
  const original = (reviewTake(result.originalTake.events)?.chords || []).map(c => ({at:c.at,name:c.name,uncertain:!c.matched}));
  const rows = [{title:'Ton jeu', original:true, timeline:original}];
  for (const v of result.variants.filter(v => v.advice?.version !== 6)) {
    const timeline = plannedTimeline(v, original);
    if (timeline.length) rows.push({title:v.title || v.example?.title || 'Proposition',timeline});
  }
  if (rows.length < 2) return null;
  // Même colonne pour les attaques d'un même bloc ; jamais deux changements
  // d'une proposition dans la même case, même pour un passage très court.
  const anchors = rows.flatMap((r,row) => r.timeline.map(c => ({...c,row}))).sort((a,b) => a.at-b.at);
  const columns = [];
  for (const c of anchors) {
    const last = columns.at(-1);
    if (last && c.at-last.at <= .18 && !last.changes.has(c.row)) last.changes.set(c.row,c);
    else columns.push({at:c.at,changes:new Map([[c.row,c]])});
  }
  const held = rows.map(() => null);
  return {rows:rows.map(({title,original}) => ({title,original:Boolean(original)})),columns:columns.map(col => {
    for (const [row,chord] of col.changes) held[row]=chord;
    return {at:col.at,cells:held.map(c => c ? {name:gridChordName(c.name,notation),fullName:c.name,uncertain:c.uncertain} : null)};
  })};
}

function node(tag, className, text) {
  const n=document.createElement(tag);
  if (className) n.className=className;
  if (text != null) n.textContent=text;
  return n;
}

export function gridMoment(at, precise = false) {
  const time=`${Math.floor(at/60)}:${String(Math.floor(at%60)).padStart(2,'0')}`;
  return precise ? `${time},${Math.floor((at%1)*10+1e-6)}` : time;
}

export function renderProposalChordGrid(result, options = {}) {
  const grid=proposalChordGrid(result,options);
  if (!grid) return null;
  const details=node('details','copilot-chord-comparison');
  details.open=Boolean(options.id && openGrids.has(options.id));
  details.addEventListener('toggle',() => {
    if(options.id) details.open ? openGrids.add(options.id) : openGrids.delete(options.id);
  });
  details.append(node('summary','','Grilles d’accords'));
  const region=node('div','copilot-chord-scroll');
  region.setAttribute('role','region');region.setAttribute('aria-label','Comparaison des grilles d’accords');region.tabIndex=0;
  const table=node('table','copilot-chord-table');
  table.setAttribute('aria-label','Grilles d’accords');
  const head=node('thead'),tr=node('tr'),corner=node('th','','Moment');corner.scope='col';tr.append(corner);
  for (const c of grid.columns) {
    const precise=grid.columns.filter(x=>Math.floor(x.at)===Math.floor(c.at)).length>1;
    const th=node('th','',gridMoment(c.at,precise));
    th.scope='col';tr.append(th);
  }
  head.append(tr);table.append(head);
  const body=node('tbody');
  grid.rows.forEach((r,i) => {
    const row=node('tr',r.original?'is-original':'');
    const label=node('th');label.scope='row';
    label.append(node('span','',r.original?'Ton jeu':grid.rows.length===2?'Proposition':`Proposition ${i}`));
    if (!r.original) { label.title=r.title;label.setAttribute('aria-label',`${label.textContent} : ${r.title}`); }
    row.append(label);
    for (const c of grid.columns) {
      const cell=node('td'),chord=c.cells[i];
      cell.append(node('span','copilot-grid-chord',chord?`${chord.name}${chord.uncertain?' ?':''}`:'—'));
      cell.title=chord?`${chord.fullName}${chord.uncertain?' — accord à confirmer':''}`:'Pas d’accord identifié';
      row.append(cell);
    }
    body.append(row);
  });
  table.append(body);region.append(table);details.append(region);return details;
}
