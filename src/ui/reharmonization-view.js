// [OpenCode] — 2026-08-07 — Incrément 9, Lot 1 : rendu UI du modèle de vue
// produit par reharmonization-orchestrator.js.
//
// Toutes les données affichées proviennent du viewModel de l'orchestrateur, lui-même
// issu du HarmonizationPlan canonique. Aucune logique musicale ici.
//
// Sécurité : les textes (symboles, libellés, notes) sont insérés via textContent /
// createElement. Le seul usage d'innerHTML concerne le SVG retourné par
// miniKeyboardForNotes, qui est construit par l'application à partir de notes MIDI
// numériques (aucune chaîne utilisateur interpolée).

import { miniKeyboardForNotes } from './mini-keyboard.js';

// --- Helpers DOM -----------------------------------------------------------

function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.title) node.setAttribute('title', opts.title);
  if (opts.role) node.setAttribute('role', opts.role);
  return node;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatMidiNotes(midiNotes) {
  return midiNotes.slice().sort((a, b) => a - b).join(', ');
}

// --- États -----------------------------------------------------------------

export function renderReharmonizationEmpty(container) {
  if (!container) return;
  clearChildren(container);
  const notice = el('div', { className: 'reharm-empty' });
  notice.appendChild(el('p', {
    className: 'reharm-empty-title',
    text: 'Aucune proposition générée.',
  }));
  notice.appendChild(el('p', {
    className: 'reharm-empty-text',
    text:
      'Cliquez sur « Lancer la démonstration » pour exécuter le moteur et obtenir ' +
      'trois propositions de réharmonisation.',
  }));
  container.appendChild(notice);
}

export function renderReharmonizationLoading(container) {
  if (!container) return;
  clearChildren(container);
  container.appendChild(el('div', {
    className: 'reharm-loading',
    role: 'status',
    text: 'Construction du plan de réharmonisation…',
  }));
}

export function renderReharmonizationError(container, message, errorKind) {
  if (!container) return;
  clearChildren(container);
  const box = el('div', { className: 'reharm-error', role: 'alert' });
  box.appendChild(el('p', {
    className: 'reharm-error-title',
    text: 'Impossible de construire la réharmonisation.',
  }));
  box.appendChild(el('p', { className: 'reharm-error-kind', text: `Type d’erreur : ${errorKind || 'Error'}` }));
  box.appendChild(el('p', { className: 'reharm-error-message', text: message || '' }));
  container.appendChild(box);
}

// --- Succès ----------------------------------------------------------------

function renderTotals(totals) {
  const section = el('div', { className: 'reharm-totals' });
  section.appendChild(el('div', { className: 'reharm-totals-title', text: 'Totaux du chemin' }));

  const rows = [
    ['Score harmonique total', totals.harmonicPathTotal != null ? Number(totals.harmonicPathTotal).toFixed(2) : '—'],
    ['  • compatibilité mélodique', totals.harmonicCompatibilityScore != null ? Number(totals.harmonicCompatibilityScore).toFixed(2) : '—'],
    ['  • transition', totals.harmonicTransitionScore != null ? Number(totals.harmonicTransitionScore).toFixed(2) : '—'],
    ['Poids (compatibilité / transition)', `${totals.harmonicWeights.compatibility} / ${totals.harmonicWeights.transition}`],
    ['Coût total voicing', totals.voicingTotalCost != null ? Number(totals.voicingTotalCost).toFixed(2) : '—'],
    ['Mouvement total voicing (demi-tons)', totals.voicingTotalMovement != null ? Number(totals.voicingTotalMovement).toFixed(2) : '—'],
    ['Déviation de registre', totals.voicingRegisterDeviation != null ? Number(totals.voicingRegisterDeviation).toFixed(2) : '—'],
    ['Quintes parallèles', String(totals.voicingParallelFifths)],
    ['Octaves parallèles', String(totals.voicingParallelOctaves)],
  ];

  for (const [label, value] of rows) {
    const row = el('div', { className: 'reharm-totals-row' });
    row.appendChild(el('span', { className: 'reharm-totals-label', text: label }));
    row.appendChild(el('span', { className: 'reharm-totals-value', text: value }));
    section.appendChild(row);
  }
  return section;
}

function renderStep(step) {
  const card = el('div', { className: 'reharm-step' });

  // En-tête : ancre + top note.
  const head = el('div', { className: 'reharm-step-head' });
  head.appendChild(el('span', {
    className: 'reharm-step-index',
    text: `Ancre ${step.index + 1} — ${step.anchorLabel}`,
  }));
  head.appendChild(el('span', {
    className: 'reharm-step-topnote',
    text: `Top note : ${step.topNoteName || '—'} (MIDI ${step.topNoteMidi != null ? step.topNoteMidi : '—'})`,
  }));
  card.appendChild(head);

  // Accord choisi.
  card.appendChild(el('div', {
    className: 'reharm-step-chord',
    text: `Accord retenu : ${step.chordSymbol} (qualité ${step.chordQualityId || '—'})`,
  }));

  // Compatibilité mélodique réelle.
  const melComp = step.melodyCompatibility;
  card.appendChild(el('div', {
    className: 'reharm-step-melcomp',
    text: melComp
      ? `Compatibilité mélodique : ${melComp.category} (intervalle ${melComp.matchingInterval}, pc ${melComp.melodyPitchClass})`
      : 'Compatibilité mélodique : —',
  }));

  // Voicing : mini-clavier + notes + répartition mains.
  const voicingBox = el('div', { className: 'reharm-step-voicing' });
  voicingBox.appendChild(el('div', { className: 'reharm-step-voicing-label', text: 'Voicing :' }));
  if (Array.isArray(step.voicingMidiNotes) && step.voicingMidiNotes.length > 0) {
    const kb = miniKeyboardForNotes(step.voicingMidiNotes.slice());
    const svgHolder = el('div', { className: 'reharm-mini-keyboard' });
    // SVG contrôlé par l'application (notes MIDI numériques uniquement).
    svgHolder.innerHTML = kb.svg;
    voicingBox.appendChild(svgHolder);
    voicingBox.appendChild(el('div', {
      className: 'reharm-step-voicing-notes',
      text: `Notes : ${formatMidiNotes(step.voicingMidiNotes)}`,
    }));
    voicingBox.appendChild(el('div', {
      className: 'reharm-step-voicing-hands',
      text:
        `Main gauche : ${step.voicingLeftHand.length ? formatMidiNotes(step.voicingLeftHand) : '—'} · ` +
        `Main droite : ${step.voicingRightHand.length ? formatMidiNotes(step.voicingRightHand) : '—'} · ` +
        `Basse : ${step.voicingBassMidiNote != null ? step.voicingBassMidiNote : '—'} · ` +
        `Position : ${step.voicingIsRootPosition ? 'fondamentale' : 'renversée'}`,
    }));
  } else {
    voicingBox.appendChild(el('div', { className: 'reharm-step-voicing-notes', text: 'Aucune note de voicing.' }));
  }
  card.appendChild(voicingBox);

  // Transitions réelles.
  card.appendChild(el('div', {
    className: 'reharm-step-transitions',
    text:
      `Transition harmonique : ${step.harmonicTransitionTotal != null ? Number(step.harmonicTransitionTotal).toFixed(2) : '—'} · ` +
      `Coût voicing : ${step.voicingTransitionCost != null ? Number(step.voicingTransitionCost).toFixed(2) : '—'} · ` +
      `Mouvement voicing : ${step.voicingTransitionTotalMovement != null ? Number(step.voicingTransitionTotalMovement).toFixed(2) : '—'}`,
  }));

  // Alternatives (consultation seule, non sélectionnables).
  const altBox = el('div', { className: 'reharm-step-alternatives' });
  altBox.appendChild(el('div', {
    className: 'reharm-step-alternatives-label',
    text: `Alternatives (${step.alternatives.length}, consultation seule) :`,
  }));
  const altList = el('div', { className: 'reharm-step-alternatives-list' });
  for (const alt of step.alternatives) {
    altList.appendChild(el('span', {
      className: 'reharm-alt-chip',
      title: `id ${alt.id} · source ${alt.source || '—'}${alt.locked ? ' · verrouillé' : ''}`,
      text: alt.symbol,
    }));
  }
  altBox.appendChild(altList);
  card.appendChild(altBox);

  return card;
}

export function renderReharmonizationSuccess(container, viewModel, meta) {
  if (!container) return;
  clearChildren(container);

  // Mention démonstrative honnête.
  const banner = el('div', { className: 'reharm-demo-banner', role: 'status' });
  banner.appendChild(el('p', {
    className: 'reharm-demo-title',
    text: (meta && meta.label) || 'Démonstration du moteur de réharmonisation',
  }));
  if (meta && meta.description) {
    banner.appendChild(el('p', { className: 'reharm-demo-desc', text: meta.description }));
  }
  container.appendChild(banner);

  // Totaux.
  if (viewModel.totals) {
    container.appendChild(renderTotals(viewModel.totals));
  }

  // [OpenCode] — 2026-08-24 — Tâche 3 : score de validité 4 critères.
  if (viewModel.validationReport) {
    container.appendChild(renderValidationReport(viewModel.validationReport));
  }

  // [OpenCode] — 2026-08-24 — Tâche 2 : rapport des techniques Gospel utilisées.
  if (viewModel.techniqueReport) {
    container.appendChild(renderTechniqueReport(viewModel.techniqueReport));
  }

  // Progression : un carte par step.
  const progression = el('div', { className: 'reharm-progression' });
  progression.appendChild(el('div', { className: 'reharm-progression-title', text: 'Progression retenue' }));
  for (const step of viewModel.steps) {
    progression.appendChild(renderStep(step));
  }
  container.appendChild(progression);
}

function renderValidationReport(report) {
  const section = el('div', { className: 'reharm-validation' });
  section.appendChild(el('div', {
    className: 'reharm-validation-title',
    text: `Score de validité : ${report.score}/${report.maxScore}`,
  }));
  section.appendChild(el('div', { className: 'reharm-validation-summary', text: report.summary }));
  const list = el('div', { className: 'reharm-validation-list' });
  for (const c of report.criteria) {
    const row = el('div', { className: 'reharm-validation-row' });
    row.appendChild(el('span', {
      className: c.satisfied ? 'reharm-validation-ok' : 'reharm-validation-ko',
      text: c.satisfied ? 'OK' : 'KO',
    }));
    row.appendChild(el('span', { className: 'reharm-validation-name', text: c.criterionName }));
    row.appendChild(el('span', { className: 'reharm-validation-details', text: c.details }));
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}

function renderTechniqueReport(report) {
  const section = el('div', { className: 'reharm-techniques' });
  section.appendChild(el('div', { className: 'reharm-techniques-title', text: 'Techniques Gospel' }));
  if (report.used && report.used.length > 0) {
    const used = el('div', { className: 'reharm-techniques-used' });
    used.appendChild(el('span', { className: 'reharm-techniques-label', text: 'Utilisées : ' }));
    used.appendChild(el('span', {
      className: 'reharm-techniques-list',
      text: report.used.map((t) => `${t.name} (step ${t.stepIndex + 1})`).join(', '),
    }));
    section.appendChild(used);
  } else {
    section.appendChild(el('div', { className: 'reharm-techniques-none', text: 'Aucune technique Gospel utilisée (harmonie diatonique pure).' }));
  }
  if (report.unused && report.unused.length > 0) {
    const unused = el('div', { className: 'reharm-techniques-unused' });
    unused.appendChild(el('span', { className: 'reharm-techniques-label', text: 'Disponibles non utilisées : ' }));
    unused.appendChild(el('span', {
      className: 'reharm-techniques-list',
      text: report.unused.map((t) => t.name).join(', '),
    }));
    section.appendChild(unused);
  }
  return section;
}

const CRITERION_LABELS = {
  'melody-audible': 'Mélodie',
  'passage-resolution': 'Tensions',
  'no-parallel-motion': 'Parallèles',
  'traceability': 'Règle',
};

function renderCriterionBadge(criterion) {
  const node = el('span', {
    className: criterion.satisfied
      ? 'reharm-criterion-badge ok'
      : 'reharm-criterion-badge ko',
    title: criterion.details,
  });
  node.appendChild(el('span', { className: 'reharm-criterion-dot' }));
  node.appendChild(el('span', {
    className: 'reharm-criterion-name',
    text: CRITERION_LABELS[criterion.criterionId] || criterion.criterionName,
  }));
  return node;
}

// [Refonte visuelle 2026-09-02] — Trois cartes Fidèle / Équilibrée / Audacieuse.
// Le conteneur est piloté par analyzer-tab.js via data-reharm-apply / data-reharm-switch.
export function renderReharmonizationVariants(container, variantsVm, meta, appliedVariantId = null) {
  if (!container) return;
  clearChildren(container);

  const cards = el('div', { className: 'reharm-cards' });
  for (const v of variantsVm.variants) {
    const isApplied = appliedVariantId === v.id;
    const isRecommended = v.recommended;

    const card = el('div', {
      className:
        `reharm-card ${isRecommended ? 'reharm-card-recommended' : ''} ${isApplied ? 'reharm-card-applied' : ''}`,
    });

    const header = el('div', { className: 'reharm-card-header' });
    const titleWrap = el('div', { className: 'reharm-card-title-wrap' });
    titleWrap.appendChild(el('div', { className: 'reharm-card-label', text: v.label }));
    if (isRecommended) {
      titleWrap.appendChild(el('span', { className: 'reharm-card-badge', text: 'Recommandée' }));
    }
    header.appendChild(titleWrap);

    const scoreClass = v.validationReport.score === 4
      ? 'reharm-card-score full'
      : 'reharm-card-score';
    header.appendChild(el('div', { className: scoreClass, text: `${v.validationReport.score}/4` }));
    card.appendChild(header);

    card.appendChild(el('div', { className: 'reharm-card-desc', text: v.description }));

    // Critères vérifiés (4 pastilles).
    const criteria = el('div', { className: 'reharm-card-criteria' });
    for (const c of v.validationReport.criteria) {
      criteria.appendChild(renderCriterionBadge(c));
    }
    card.appendChild(criteria);

    // Progression compacte.
    const prog = el('div', { className: 'reharm-card-progression' });
    for (const step of v.steps) {
      prog.appendChild(el('span', { className: 'reharm-card-chord', text: step.chordSymbol }));
    }
    card.appendChild(prog);

    // Action principale de la carte.
    const action = el('button', {
      type: 'button',
      className: isRecommended ? 'btn-primary reharm-card-apply' : 'btn-secondary reharm-card-apply',
    });
    if (isApplied) {
      action.textContent = '✓ Appliquée';
      action.disabled = true;
    } else if (appliedVariantId && !isApplied) {
      action.textContent = 'Basculer dessus';
      action.dataset.reharmSwitch = v.id;
    } else if (isRecommended) {
      action.textContent = 'Appliquer la version recommandée';
      action.dataset.reharmApply = v.id;
    } else {
      action.textContent = 'Appliquer';
      action.dataset.reharmApply = v.id;
    }
    card.appendChild(action);

    cards.appendChild(card);
  }
  container.appendChild(cards);
}
