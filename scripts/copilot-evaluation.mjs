// État de départ et comparaison d'écoute locale, sans fournisseur d'IA.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'src/pedagogie/fixtures');
const cases = [
  ['session017', 'copilot-session017.json'],
  ['session016', 'copilot-session016.json'],
  ['development', 'copilot-development-take.json'],
  ['links', 'copilot-approved-links.json'],
  ['arpeggiated', 'copilot-arpeggiated-take.json'],
  ['melody010', 'copilot-session010.json'],
];
const message = 'Améliore mon jeu';
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();

function modules() {
  return Promise.all(['phrase-arrangement.js','phrase-variants.js','take-edit.js'].map(name => import(pathToFileURL(path.join(root,'src/pedagogie',name)))));
}

export async function freeze(directory) {
  // Le code et les entrées doivent être figés avant la première mutation musicale.
  if (git('diff','HEAD','--','src','package.json','package-lock.json')) throw Error('Le code de départ comporte des modifications non commitées.');
  fs.mkdirSync(directory, {recursive:true});
  const [arranger, variants] = await modules();
  const records = [];
  for (const [id, file] of cases) {
    const bytes = fs.readFileSync(path.join(fixtures,file));
    const data = JSON.parse(bytes), take = data.take || data;
    const before = JSON.stringify(take);
    const start = performance.now();
    const selected = variants.buildPhraseVariants(take, {message});
    const open = arranger.buildPhraseArrangement(take, {message});
    const linked = arranger.buildPhraseArrangement(take, {message,voicingMode:'linked'});
    if (JSON.stringify(take) !== before) throw Error('Source modifiée : '+id);
    records.push({id, fixture:file, fixtureSha256:digest(bytes), sourceSha256:digest(take), take,
      exposure:'development-already-used', message, selected, open, linked,
      selectedSha256:digest(selected), openSha256:digest(open), linkedSha256:digest(linked),
      elapsedMs:performance.now()-start});
  }
  // Seulement du code suivi et des fixtures suivies : ni secrets, ni dépendances,
  // ni données personnelles de configuration. L'archive garde la structure du dépôt.
  const tracked = execFileSync('git',['ls-files','-z','--','src','package.json','package-lock.json'],{cwd:root,encoding:'utf8'})
    .split('\0').filter(p=>p && /\.(?:js|mjs|json|css|html)$/.test(p));
  const archive = path.join(directory,'source-baseline.tar');
  if (fs.existsSync(archive)) throw Error('Une archive existe déjà ; choisir un nouveau dossier.');
  execFileSync('git',['archive','--format=tar','--output='+archive,'HEAD','--',...tracked],{cwd:root});
  const manifest = {schema:1, createdAt:new Date().toISOString(), appCommit:git('rev-parse','HEAD'),
    node:process.version, lockSha256:digest(fs.readFileSync(path.join(root,'package-lock.json'))),
    inferenceCalls:0, evaluationScope:'baseline locale sur des prises déjà utilisées, pas un test de généralisation',
    archive:{file:path.basename(archive),sha256:digest(fs.readFileSync(archive)),files:tracked}, records};
  write(path.join(directory,'baseline.json'),manifest);
  console.log(`État figé : ${manifest.appCommit}, ${records.length} prises, zéro appel d’IA.`);
  return manifest;
}

export async function compare(directory) {
  const baseline = read(path.join(directory,'baseline.json'));
  if (digest(fs.readFileSync(path.join(directory,baseline.archive.file))) !== baseline.archive.sha256) throw Error('Archive de départ altérée.');
  const [arranger, variants, edits] = await modules();
  const media = [], entries = [], key = [];
  for (const record of baseline.records) {
    const take = structuredClone(record.take), before = JSON.stringify(take);
    // Une modification du parcours habituel invalide la mesure, même si les
    // noms des cartes et les assertions de qualité restent identiques.
    const selected = variants.buildPhraseVariants(take,{message:record.message});
    const open = arranger.buildPhraseArrangement(take,{message:record.message});
    const linked = arranger.buildPhraseArrangement(take,{message:record.message,voicingMode:'linked'});
    for (const [name, actual] of [['selected',selected],['open',open],['linked',linked]]) {
      if (digest(actual)!==record[name+'Sha256']) throw Error(`Le comportement habituel a changé : ${record.id}/${name}`);
    }
    const independent = arranger.buildPhraseArrangement(take,{message:record.message,useReferenceVoicings:false});
    if (JSON.stringify(take)!==before) throw Error('Source modifiée : '+record.id);
    const id = 'p'+String(entries.length+1).padStart(2,'0');
    media.push({id:id+'-original',take});
    const original = `audio/${id}-original.wav`;
    const states = [{mode:'baseline-reference',proposal:record.open},{mode:'without-reference',proposal:independent}];
    if (crypto.randomInt(2)) states.reverse();
    const candidates = states.map((item,i)=>{
      const label = ['A','B'][i], mediaId=id+'-'+label;
      const changed=item.proposal && edits.applyTakeEdit(take,item.proposal.advice.edit);
      if (item.proposal && !changed) throw Error('Édition invalide : '+record.id);
      if (changed) media.push({id:mediaId,take:changed});
      return {label,available:Boolean(changed),audio:changed?`audio/${mediaId}.wav`:null,mode:item.mode,
        proposalSha256:digest(item.proposal),proposal:item.proposal};
    });
    // Une mélodie seule n'emprunte pas le chemin étudié : ne pas fabriquer
    // une paire vide, ni présenter une autre méthode comme le même test.
    const paired = candidates.some(c=>c.available);
    entries.push({id,title:`Prise ${entries.length+1}`,original,duration:take.duration,paired,
      note:paired?'': 'Cette prise suit un autre parcours ; elle reste dans le contrôle technique.',
      candidates:paired?candidates.map(({label,available,audio})=>({label,available,audio})):[]});
    key.push({id,fixture:record.fixture,exposure:record.exposure,sourceSha256:record.sourceSha256,
      currentSelectedIds:selected.map(v=>v.id),ordinaryUnchanged:true,
      identical:Boolean(states[0].proposal && states[1].proposal && digest(states[0].proposal.example.events)===digest(states[1].proposal.example.events)),
      candidates});
  }
  const packId=crypto.randomUUID();
  const manifest={schema:1,packId,baselineCommit:baseline.appCommit,createdAt:new Date().toISOString(),inferenceCalls:0,
    comparison:'same-open-arranger-reference-on-vs-off',media,key};
  write(path.join(directory,'comparison-private.json'),manifest);
  write(path.join(directory,'listening.json'),{schema:1,packId,cases:entries});
  const listening=JSON.stringify({schema:1,packId,cases:entries}).replace(/</g,'\\u003c');
  const html=fs.readFileSync(path.join(root,'scripts/copilot-listening.html'),'utf8')
    .replace('<!--LISTENING_DATA-->',`<script id="listening-data" type="application/json">${listening}</script>`);
  fs.writeFileSync(path.join(directory,'index.html'),html,{flag:'wx'});
  console.log(`Comparaison préparée : ${entries.filter(e=>e.paired).length} paires, ${media.length} rendus ; parcours habituel inchangé.`);
  return manifest;
}

export function score(directory, answersFile) {
  const manifest=read(path.join(directory,'comparison-private.json')),answers=read(answersFile);
  if(answers.packId!==manifest.packId)throw Error('Ces avis concernent une autre série d’écoutes.');
  const valid=['A','B','equivalent','neither','undecided'];
  const counts={'baseline-reference':0,'without-reference':0,equivalent:0,neither:0,undecided:0,unanswered:0};
  const rows=[];
  if(!answers.opinions || Array.isArray(answers.opinions) || typeof answers.opinions!=='object')throw Error('Avis invalides.');
  for(const id of Object.keys(answers.opinions))if(!manifest.key.some(c=>c.id===id))throw Error('Prise inconnue : '+id);
  for(const item of manifest.key.filter(c=>c.candidates.some(v=>v.available))){
    const opinion=answers.opinions[item.id]||{},preference=opinion.preference;
    if(preference!=null&&!valid.includes(preference))throw Error('Préférence inconnue : '+item.id);
    const candidate=item.candidates.find(c=>c.label===preference);
    if(candidate&&!candidate.available)throw Error('Une version indisponible ne peut pas être préférée.');
    const result=candidate?.mode||preference||'unanswered';counts[result]++;
    rows.push({id:item.id,fixture:item.fixture,result,comment:String(opinion.comment||'')});
  }
  return {schema:1,packId:manifest.packId,counts,rows,
    limitation:'Préférences sur des prises de développement déjà utilisées ; aucune validation générale ni conclusion avant écoute.'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, output, answers] = process.argv.slice(2);
  if (!['freeze','compare','score'].includes(action) || !output || action==='score'&&!answers) throw Error('Usage : node scripts/copilot-evaluation.mjs freeze|compare DOSSIER ; score DOSSIER AVIS.json');
  if(action==='score')console.log(JSON.stringify(score(path.resolve(output),path.resolve(answers)),null,2));
  else await ({freeze,compare}[action])(path.resolve(output));
}
