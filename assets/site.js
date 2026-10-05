document.querySelectorAll('[data-search]').forEach(form=>{
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const q=form.querySelector('input').value.trim().toLowerCase();
    if(!q)return;
    const routes=[
      ['liferay gold','/logiciels/liferay-dxp-gold/'],['liferay','/logiciels/liferay-dxp/'],
      ['premiere','/logiciels/premiere-pro/'],['illustrator','/logiciels/illustrator/'],['photoshop','/logiciels/photoshop/'],['acrobat','/logiciels/adobe-acrobat-pro/'],['adobe','/logiciels/adobe-creative-cloud/'],
      ['revit','/logiciels/autodesk-revit/'],['civil 3d','/logiciels/civil-3d/'],['autocad','/logiciels/autocad/'],['autodesk','/logiciels/autocad/'],
      ['sql server','/logiciels/sql-server/'],['project','/logiciels/microsoft-project/'],['visio','/logiciels/microsoft-visio/'],['windows 11','/logiciels/windows-11-pro/'],['windows server','/logiciels/windows-server/'],['power bi','/logiciels/power-bi-pro/'],['microsoft','/logiciels/microsoft-365/'],['office','/logiciels/microsoft-365/'],
      ['jetbrains','/logiciels/intellij-idea-ultimate/'],['intellij','/logiciels/intellij-idea-ultimate/'],
      ['red hat','/logiciels/red-hat-enterprise-linux/'],['rhel','/logiciels/red-hat-enterprise-linux/'],
      ['veeam','/logiciels/veeam-backup/'],['bricscad','/logiciels/bricscad-pro/'],
      ['kaspersky','/logiciels/kaspersky-next/'],['tsplus','/logiciels/tsplus/'],
      ['google workspace','/logiciels/google-workspace/'],['zoom','/logiciels/zoom-workplace/'],
      ['freepik','/logiciels/freepik-premium/'],['artlist','/logiciels/artlist/'],['vesselfinder','/logiciels/vesselfinder/'],['canva','/logiciels/canva-teams/'],['prezi','/logiciels/prezi/']
    ];
    const hit=routes.find(([k])=>q.includes(k));
    location.href=hit?hit[1]:'/catalogue/';
  });
});

document.querySelectorAll('[data-contact-form]').forEach(form=>{
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const d=new FormData(form);
    const subject=encodeURIComponent('Demande de devis STRIVOR - '+(d.get('solution')||'Logiciel'));
    const body=encodeURIComponent('Nom : '+(d.get('nom')||'')+'\nEntreprise : '+(d.get('entreprise')||'')+'\nTéléphone : '+(d.get('telephone')||'')+'\nSolution : '+(d.get('solution')||'')+'\n\nBesoin :\n'+(d.get('message')||''));
    location.href='mailto:contact@strivor.ma?subject='+subject+'&body='+body;
  });
});

// Navigation mobile injectée sur toutes les pages.
document.querySelectorAll('nav .nav').forEach(nav=>{
  const links=nav.querySelector('.navlinks');
  if(!links || nav.querySelector('.menu-toggle')) return;
  const btn=document.createElement('button');
  btn.className='menu-toggle';
  btn.type='button';
  btn.setAttribute('aria-label','Ouvrir le menu');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<span></span><span></span><span></span>';
  nav.insertBefore(btn,links);
  btn.addEventListener('click',()=>{
    const open=links.classList.toggle('is-open');
    btn.classList.toggle('is-open',open);
    btn.setAttribute('aria-expanded',String(open));
  });
  links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
    links.classList.remove('is-open');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded','false');
  }));
});

// CTA mobile global pour réduire la friction de conversion.
if(!document.querySelector('.mobile-cta')){
  const bar=document.createElement('div');
  bar.className='mobile-cta';
  bar.innerHTML='<a href="tel:+212675690127">Appeler</a><a href="https://wa.me/212675690127">WhatsApp</a><a href="/#contact">Devis</a>';
  document.body.appendChild(bar);
}

// Lien confidentialité ajouté à tous les footers sans modifier chaque page.
document.querySelectorAll('footer .foot > div:last-child').forEach(el=>{
  if(!el.querySelector('a[href="/confidentialite/"]')){
    el.insertAdjacentHTML('beforeend',' · <a href="/confidentialite/">Confidentialité</a>');
  }
});
