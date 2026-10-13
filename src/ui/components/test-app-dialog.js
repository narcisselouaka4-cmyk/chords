// Tests Node de app-dialog.js : hors navigateur, la fenêtre répond comme « Annuler » (ou le
// premier bouton), et les appels ne lancent jamais de confirm() / alert() du système.
import { appDialog, appConfirm, appAlert } from './app-dialog.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

globalThis.confirm = () => { throw new Error('confirm() du système appelé'); };
globalThis.alert = () => { throw new Error('alert() du système appelé'); };

check('appConfirm sans navigateur → false (Annuler)', (await appConfirm({ title: 'Supprimer ?', danger: true })) === false);
check('appAlert sans navigateur → se termine', (await appAlert({ title: 'Info' })) === undefined);
check('appDialog → cancelId', (await appDialog({ title: 'Fermer ?', cancelId: 'cancel', buttons: [{ id: 'save', label: 'Enregistrer' }, { id: 'cancel', label: 'Annuler' }] })) === 'cancel');
check('appDialog sans cancelId → premier bouton', (await appDialog({ title: 'x', buttons: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })) === 'a');

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
