'use strict';
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];
const state = { user:null, csrf:null, listings:[], featured:[], accountTab:'my-listings', adminTab:'listings', toastTimer:null };
const money = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)).replace(/\u202f/g,' ')+' EGP' : '—';
const fmt = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const frequency = {monthly:'mensuelle',quarterly:'trimestrielle',semiannual:'semestrielle',annual:'annuelle'};
const statusText = {published:'Publiée',pending:'En attente',rejected:'Refusée',new:'Nouvelle',contacted:'Contacté',closed:'Terminée'};
const safeArtwork = (i) => `/static/property-${[1,2,3,4,5,6].includes(Number(i)) ? Number(i) : 1}.svg`;

function toast(msg, error=false) { let el=$('#toast'); el.textContent=msg; el.classList.toggle('error',error); el.classList.remove('hide'); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.add('hide'),3800); }
function getError(ex) { let detail=ex?.body?.detail; if(Array.isArray(detail)) return detail.map(x=>x.msg).join('; '); return typeof detail==='string'?detail:(ex?.message||'Une erreur est survenue.'); }
async function api(path,{method='GET',body}={}){
 const headers={'Accept':'application/json'};
 if(body!==undefined) headers['Content-Type']='application/json';
 if(!['GET','HEAD'].includes(method) && state.csrf) headers['X-CSRF-Token']=state.csrf;
 let res;
 try {res=await fetch('/api'+path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});}catch(e){throw new Error('Serveur inaccessible. Vérifiez que le projet Python est démarré.');}
 const data=await res.json().catch(()=>({}));
 if(!res.ok){let e=new Error(getError({body:data}));e.body=data;e.status=res.status;throw e;}return data;
}
function openModal(content){$('#modalBody').innerHTML=content;$('#modalOverlay').classList.remove('hide');document.body.style.overflow='hidden';$('#modalClose').focus();}
function closeModal(){$('#modalOverlay').classList.add('hide');document.body.style.overflow='';$('#modalBody').innerHTML='';}
$('#modalClose').addEventListener('click',closeModal);
$('#modalOverlay').addEventListener('click',e=>{if(e.target===$('#modalOverlay'))closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

function showAuth(mode='login') {
 const isReg=mode==='register';
 openModal(`<div class="auth-heading"><div class="logo-mark">A<span>•</span></div><h2>${isReg?'Créer mon compte':'Bienvenue !'}</h2></div><p class="help-text">${isReg?'Enregistrez-vous pour proposer un contrat, enregistrer des favoris et contacter les vendeurs.':'Connectez-vous pour retrouver vos annonces et vos demandes.'}</p><form id="authForm">
 ${isReg?'<label class="field">Nom complet<input name="name" required minlength="2" maxlength="100" autocomplete="name" /></label>':''}
 <label class="field">Adresse e-mail<input name="email" type="email" required autocomplete="email" /></label>
 <label class="field">Mot de passe<input name="password" type="password" minlength="${isReg?10:1}" required autocomplete="${isReg?'new-password':'current-password'}" /></label>
 <button class="btn btn-primary btn-full" type="submit">${isReg?'Créer le compte':'Se connecter'} →</button><div class="form-error hide" id="authError"></div></form>
 <p class="auth-toggle">${isReg?'Déjà un compte ?':'Vous n’avez pas de compte ?'} <button type="button" id="authSwitch">${isReg?'Se connecter':'S’inscrire'}</button></p>`);
 $('#authSwitch').addEventListener('click',()=>showAuth(isReg?'login':'register'));
 $('#authForm').addEventListener('submit',async e=>{
  e.preventDefault(); let data=Object.fromEntries(new FormData(e.target).entries());let submit=$('button[type="submit"]',e.target);submit.disabled=true;
  try {await api(isReg?'/auth/register':'/auth/login',{method:'POST',body:data});await refreshSession();closeModal();toast('Connexion réussie.');await showPage(location.hash.slice(1)||'accueil');}
  catch(err){$('#authError').textContent=getError(err);$('#authError').classList.remove('hide');}finally{submit.disabled=false;}
 });
}
async function refreshSession(){let d=await api('/auth/me');state.user=d.user;state.csrf=d.csrf;$('#authButton').textContent=d.user?'Déconnexion':'Connexion';$('#welcome').textContent=d.user?d.user.name:'';$('#welcome').classList.toggle('hide',!d.user);$('#adminNav').classList.toggle('hide',d.user?.role!=='admin');$('#adminMobile').classList.toggle('hide',d.user?.role!=='admin');}
$('#authButton').addEventListener('click',async()=>{
 if(!state.user){showAuth();return;}
 try{await api('/auth/logout',{method:'POST'});await refreshSession();toast('Vous êtes déconnecté.');await showPage(location.hash.slice(1)||'accueil');}
 catch(e){toast(getError(e),true);}
});

const pages=['accueil','annonces','calculateur','vendre','espace','admin'];
async function showPage(target){
 const page=pages.includes(target)?target:'accueil';
 pages.forEach(x=>$('#page-'+x).classList.toggle('hide',x!==page));
 $$('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===page));
 $('#mobileNav').classList.add('hide');
 if(page==='annonces')await loadListings();
 if(page==='espace')await loadAccount();
 if(page==='admin')await loadAdmin();
 if(page==='calculateur')calculate();
 window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1)));
$('#menuBtn').addEventListener('click',()=>$('#mobileNav').classList.toggle('hide'));
$$('#mobileNav a').forEach(el=>el.addEventListener('click',()=>$('#mobileNav').classList.add('hide')));

function propertyCard(r){
 const neg=r.market_difference_egp;
 return `<article class="property-card"><div class="property-art"><img loading="lazy" src="${safeArtwork(r.visual)}" alt="Illustration architecturale, ${esc(r.property_type)}" /><span class="art-tag">${esc(r.code)}</span><button type="button" class="favorite" data-fav="${r.id}" aria-label="Ajouter aux favoris">♡</button></div>
 <div class="card-body"><div class="card-area">⌖ ${esc(r.city)} · ${esc(r.area_sqm)} m²</div><h3>${esc(r.title)}</h3><div class="card-project">${esc(r.project)} · ${esc(r.developer)}</div><div class="card-sep"></div>
 <div class="card-finance"><div><small>Apport initial, frais inclus</small><strong>${fmt(r.upfront_egp)} <span>EGP</span></strong></div></div>
 <div class="card-meta"><span>Solde : ${fmt(r.remaining_egp)} EGP</span><span>${esc(r.rooms)} ch.</span><span>${esc(frequency[r.frequency]||r.frequency)}</span></div>
 <div class="card-bottom"><small>${neg===null?'Valeur de marché non déclarée':`Écart indicatif : ${neg>=0?'+':''}${fmt(neg)} EGP`}</small><button data-detail="${r.id}" type="button">Voir le bien ↗</button></div></div></article>`;
}
async function loadHomepage(){try{let [stats, data]=await Promise.all([api('/stats'),api('/listings?limit=3')]);$('#heroListingCount').textContent=stats.listings;$('#heroProjectCount').textContent=stats.projects;state.featured=data.items;$('#featuredGrid').innerHTML=data.items.map(propertyCard).join('')||'<div class="empty-compact">Aucun bien disponible.</div>';await markFavorites();}catch(e){toast(getError(e),true);}}
async function loadListings(){try{
 let q=new URLSearchParams({search:$('#filterSearch').value,city:$('#filterCity').value,sort:$('#filterSort').value});if($('#filterCash').value)q.set('max_cash',$('#filterCash').value);
 let data=await api('/listings?'+q);state.listings=data.items;$('#resultCount').textContent=data.total+' opportunité'+(data.total>1?'s':'');$('#listingsGrid').innerHTML=data.items.map(propertyCard).join('');$('#emptyMarket').classList.toggle('hide',data.items.length>0);await markFavorites();
 }catch(e){toast(getError(e),true);}}
for(let id of ['#filterSearch','#filterCity','#filterCash','#filterSort'])$(id).addEventListener('input',loadListings);
async function markFavorites(){if(!state.user)return;try{const favs=await api('/me/favorites');const ids=new Set(favs.map(x=>x.id));$$('[data-fav]').forEach(b=>{b.textContent=ids.has(Number(b.dataset.fav))?'♥':'♡';b.classList.toggle('saved',ids.has(Number(b.dataset.fav)));});}catch(_){}}

async function detailModal(id){try{let r=await api('/listings/'+id);openModal(`<div class="modal-art"><img src="${safeArtwork(r.visual)}" alt="Illustration du projet immobilier" /></div><span class="overline">${esc(r.code)} · ${esc(r.city)}</span><h2>${esc(r.title)}</h2><p class="help-text">${esc(r.project)} · ${esc(r.developer)} · ${esc(r.area_sqm)} m² · ${esc(r.rooms)} chambres</p>
  <div class="detail-stats"><div><small>Apport initial, commission incluse</small><b>${money(r.upfront_egp)}</b></div><div><small>Solde du promoteur</small><b>${money(r.remaining_egp)}</b></div><div><small>Échéance ${esc(frequency[r.frequency]||r.frequency)}</small><b>${money(r.installment_egp)}</b></div><div><small>Équivalent mensuel</small><b>${money(r.monthly_equivalent_egp)}</b></div><div><small>Prix contractuel initial</small><b>${money(r.contract_egp)}</b></div><div><small>Commission acheteur (1,25 %)</small><b>${money(r.buyer_fee_egp)}</b></div></div>
  <div class="info-box">${esc(r.description)} La valeur de marché est déclarative. Le transfert dépend des documents et de l'accord du promoteur.</div><p class="modal-note">Somme versée au vendeur : ${money(r.paid_egp)} · Écart indicatif : ${r.market_difference_egp===null?'Indisponible':money(r.market_difference_egp)}</p>
  <form id="inquiryForm"><label class="field">Votre message au gestionnaire<textarea name="message" required minlength="10" maxlength="1200" rows="3">Bonjour, je souhaite obtenir plus de détails sur ce contrat et ses modalités de cession.</textarea></label><button type="submit" class="btn btn-primary btn-full">Envoyer une demande de contact ↗</button><div id="inquiryError" class="form-error hide"></div></form>`);
  $('#inquiryForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.user){closeModal();showAuth();toast('Veuillez vous connecter pour contacter le vendeur.');return;}
   try{await api('/listings/'+id+'/inquiries',{method:'POST',body:{message:e.target.elements.namedItem('message').value}});closeModal();toast('Votre demande a été enregistrée.');}
   catch(err){$('#inquiryError').textContent=getError(err);$('#inquiryError').classList.remove('hide');}
  });
 }catch(e){toast(getError(e),true);}}

document.addEventListener('click',async e=>{
 let detail=e.target.closest('[data-detail]');if(detail){await detailModal(detail.dataset.detail);return;}
 let fav=e.target.closest('[data-fav]');if(fav){if(!state.user){showAuth();return;}try{await api(`/listings/${fav.dataset.fav}/favorite`,{method:'POST'});await markFavorites();toast('Favoris mis à jour.');}catch(err){toast(getError(err),true);}return;}
 if(e.target.closest('[data-login]'))showAuth();
});

function calculate(){
 const c=Number($('#calcContract').value),p=Number($('#calcPaid').value),m=Number($('#calcMarket').value),x=Number($('#calcPenalty').value);
 const valid=[c,p,m,x].every(Number.isFinite)&&c>0&&p>=0&&p<=c&&m>=0&&x>=0&&x<=100;
 $('#calcError').classList.toggle('hide',valid);
 if(!valid){$('#calcError').textContent='Vérifiez les valeurs : contrat positif, somme payée entre 0 et le contrat, marché positif et pénalité entre 0 et 100 %.';return;}
 const fee=Math.round(c*0.0125),remaining=c-p;
 $('#calcUpfront').textContent=money(p+fee);$('#calcRemaining').textContent=money(remaining);$('#calcFee').textContent=money(fee);$('#calcTotal').textContent=money(c+fee);
 $('#calcSpread').textContent=money(m-c-fee);$('#calcRefund').textContent=money(Math.max(0,p-c*x/100));
}
$('#calcForm').addEventListener('submit',e=>{e.preventDefault();calculate();});$$('#calcForm input').forEach(el=>el.addEventListener('input',calculate));

$('#sellForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.user){showAuth();toast('Veuillez créer un compte pour déposer votre annonce.');return;}
 const data=Object.fromEntries(new FormData(e.target).entries());
 for(let k of ['area_sqm','rooms','paid_egp','remaining_egp','market_egp','installment_egp'])data[k]=data[k]===''?null:Number(data[k]);
 try{let out=await api('/listings',{method:'POST',body:data});$('#sellFeedback').textContent='Annonce '+out.id+' enregistrée. Elle restera en attente jusqu’à sa validation.';$('#sellFeedback').classList.remove('hide');toast('Votre annonce a été soumise.');}
 catch(err){$('#sellFeedback').textContent=getError(err);$('#sellFeedback').classList.remove('hide');toast(getError(err),true);}
});

function metric(n,label){return `<div class="metric"><b>${fmt(n)}</b><span>${esc(label)}</span></div>`;}
async function loadAccount(){
 const active=!!state.user;$('#loginRequired').classList.toggle('hide',active);$('#accountArea').classList.toggle('hide',!active);if(!active)return;
 try{const [listed,inquiries,favorites]=await Promise.all([api('/me/listings'),api('/me/inquiries'),api('/me/favorites')]);$('#accountStats').innerHTML=metric(listed.length,'Mes annonces')+metric(inquiries.length,'Demandes envoyées')+metric(favorites.length,'Favoris')+metric(listed.filter(x=>x.status==='pending').length,'En attente');await loadAccountTab();}catch(e){toast(getError(e),true);}
}
async function loadAccountTab(){
 const target=$('#accountContent');const tab=state.accountTab;
 $$('[data-accounttab]').forEach(x=>x.classList.toggle('active',x.dataset.accounttab===tab));
 try{
 if(tab==='my-listings'){
  let rows=await api('/me/listings');target.innerHTML='<h2 class="small-title">Mes annonces déposées</h2>'+(rows.length?`<div class="rows-list">${rows.map(r=>`<div class="data-row"><div><h3>${esc(r.title)}</h3><small>${esc(r.code)} · ${esc(r.project)} · ${money(r.upfront_egp)}</small></div><span class="pill ${esc(r.status)}">${esc(statusText[r.status]||r.status)}</span></div>`).join('')}</div>`:'<p class="empty-compact">Vous n’avez pas encore déposé de bien. <a href="#vendre" class="text-link">Déposer un bien →</a></p>');
 }else if(tab==='my-inquiries'){
  let rows=await api('/me/inquiries');target.innerHTML='<h2 class="small-title">Demandes de contact envoyées</h2>'+(rows.length?`<div class="rows-list">${rows.map(r=>`<div class="data-row"><div><h3>${esc(r.title)}</h3><small>${esc(r.project)} · ${esc(r.message)}</small></div><span class="pill ${esc(r.status)}">${esc(statusText[r.status]||r.status)}</span></div>`).join('')}</div>`:'<p class="empty-compact">Vous n’avez envoyé aucune demande.</p>');
 }else if(tab==='my-favorites'){
  let rows=await api('/me/favorites');target.innerHTML='<h2 class="small-title">Mes biens enregistrés</h2>'+(rows.length?`<div class="rows-list">${rows.map(r=>`<div class="data-row"><div><h3>${esc(r.title)}</h3><small>${esc(r.project)} · ${money(r.upfront_egp)}</small></div><button class="tiny-button" data-detail="${r.id}">Consulter ↗</button></div>`).join('')}</div>`:'<p class="empty-compact">Pas encore de favoris.</p>');
 }else{
  const b=await api('/me/buyer-profile')||{};
  target.innerHTML=`<h2 class="small-title">Mes critères financiers</h2><p class="help-text">Sauvegardez votre budget pour rechercher les contrats adaptés.</p><form id="budgetForm" class="inline-form"><div class="form-grid"><label class="field">Apport maximal disponible<input name="cash_egp" type="number" min="0" required value="${Number(b.cash_egp||5000000)}" /></label><label class="field">Mensualité équivalente maximale<input name="max_monthly_egp" type="number" min="0" required value="${Number(b.max_monthly_egp||200000)}" /></label><label class="field">Contrat initial maximal<input name="max_contract_egp" type="number" min="0" required value="${Number(b.max_contract_egp||20000000)}" /></label></div><button class="btn btn-primary" type="submit">Enregistrer et afficher les correspondances</button></form><div id="budgetMatches"></div>`;
  $('#budgetForm').addEventListener('submit',async e=>{e.preventDefault();let v=Object.fromEntries(new FormData(e.target));Object.keys(v).forEach(k=>v[k]=Number(v[k]));try{await api('/me/buyer-profile',{method:'PUT',body:v});toast('Budget enregistré.');let data=await api('/listings');let matches=data.items.filter(r=>r.upfront_egp<=v.cash_egp&&r.monthly_equivalent_egp<=v.max_monthly_egp&&r.contract_egp<=v.max_contract_egp);$('#budgetMatches').innerHTML=`<h3 style="margin-top:25px">${matches.length} correspondance(s)</h3>`+(matches.length?'<div class="rows-list">'+matches.map(r=>`<div class="data-row"><div><h3>${esc(r.title)}</h3><small>Apport ${money(r.upfront_egp)} · mensualité ${money(r.monthly_equivalent_egp)}</small></div><button type="button" class="tiny-button" data-detail="${r.id}">Voir ↗</button></div>`).join('')+'</div>':'<p class="empty-compact">Aucun bien ne satisfait vos trois limites.</p>');}catch(err){toast(getError(err),true);}});
 }
 }catch(e){toast(getError(e),true);}
}
$$('[data-accounttab]').forEach(b=>b.addEventListener('click',()=>{state.accountTab=b.dataset.accounttab;loadAccountTab();}));

async function loadAdmin(){let isAdmin=state.user?.role==='admin';$('#adminArea').classList.toggle('hide',!isAdmin);$('#adminNotice').classList.toggle('hide',isAdmin);if(!isAdmin)return;
 try{let s=await api('/admin/stats');$('#adminStats').innerHTML=metric(s.pending,'À modérer')+metric(s.published,'Publiées')+metric(s.inquiries,'Nouvelles demandes')+metric(s.users,'Comptes');await loadAdminTab();}catch(e){toast(getError(e),true);}
}
async function loadAdminTab(){
 $$('[data-admintab]').forEach(x=>x.classList.toggle('active',x.dataset.admintab===state.adminTab));
 try{if(state.adminTab==='listings'){
 let rows=await api('/admin/listings');$('#adminContent').innerHTML='<h2 class="small-title">Validation des annonces</h2><p class="help-text">Publier ne signifie pas que les titres de propriété ou accords promoteur ont été vérifiés.</p><div class="table-scroll"><table class="admin-table"><thead><tr><th>Annonce</th><th>Projet / Ville</th><th>Montant initial</th><th>État</th><th>Action</th></tr></thead><tbody>'+rows.map(r=>`<tr><td><b>${esc(r.title)}</b><br><small>${esc(r.code)}</small></td><td>${esc(r.project)}<br><small>${esc(r.city)}</small></td><td>${money(r.upfront_egp)}</td><td><span class="pill ${esc(r.status)}">${esc(statusText[r.status]||r.status)}</span></td><td><div class="row-tools">${r.status!=='published'?`<button class="tiny-button" data-adminlist="${r.id}" data-next="published">Publier</button>`:''}${r.status!=='rejected'?`<button class="tiny-button danger" data-adminlist="${r.id}" data-next="rejected">Refuser</button>`:''}</div></td></tr>`).join('')+'</tbody></table></div>';
 }else{
 let rows=await api('/admin/inquiries');$('#adminContent').innerHTML='<h2 class="small-title">Demandes d’acheteurs</h2><div class="table-scroll"><table class="admin-table"><thead><tr><th>Annonce</th><th>Acheteur</th><th>Message</th><th>Suivi</th></tr></thead><tbody>'+rows.map(r=>`<tr><td><b>${esc(r.title)}</b><br><small>${esc(r.code)}</small></td><td>${esc(r.buyer_name)}<br><small>${esc(r.buyer_email)}</small></td><td>${esc(r.message)}</td><td><select data-admininquiry="${r.id}" aria-label="Statut demande"><option value="new" ${r.status==='new'?'selected':''}>Nouvelle</option><option value="contacted" ${r.status==='contacted'?'selected':''}>Contacté</option><option value="closed" ${r.status==='closed'?'selected':''}>Terminée</option></select></td></tr>`).join('')+'</tbody></table></div>';
 }}catch(e){toast(getError(e),true);}
}
$$('[data-admintab]').forEach(b=>b.addEventListener('click',()=>{state.adminTab=b.dataset.admintab;loadAdminTab();}));
$('#adminContent').addEventListener('click',async e=>{let el=e.target.closest('[data-adminlist]');if(!el)return;try{await api('/admin/listings/'+el.dataset.adminlist,{method:'PATCH',body:{status:el.dataset.next}});toast('Statut de l’annonce modifié.');await loadAdmin();await loadHomepage();}catch(err){toast(getError(err),true);}});
$('#adminContent').addEventListener('change',async e=>{let el=e.target.closest('[data-admininquiry]');if(!el)return;try{await api('/admin/inquiries/'+el.dataset.admininquiry,{method:'PATCH',body:{status:el.value}});toast('Demande mise à jour.');await loadAdmin();}catch(err){toast(getError(err),true);}});

(async function init(){try{await refreshSession();await loadHomepage();calculate();await showPage(location.hash.slice(1)||'accueil');}catch(e){toast(getError(e),true);}})();
