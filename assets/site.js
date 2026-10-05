document.querySelectorAll('[data-search]').forEach(form=>{
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const q=form.querySelector('input').value.trim().toLowerCase();
    if(!q)return;
    const routes=[
      ['liferay gold','/logiciels/liferay-dxp-gold/'],['liferay','/logiciels/liferay-dxp/'],
      ['acrobat','/logiciels/adobe-acrobat-pro/'],['adobe','/logiciels/adobe-creative-cloud/'],
      ['revit','/logiciels/autodesk-revit/'],['civil 3d','/logiciels/civil-3d/'],['autocad','/logiciels/autocad/'],['autodesk','/logiciels/autocad/'],
      ['windows server','/logiciels/windows-server/'],['power bi','/logiciels/power-bi-pro/'],['microsoft','/logiciels/microsoft-365/'],['office','/logiciels/microsoft-365/'],
      ['jetbrains','/logiciels/intellij-idea-ultimate/'],['intellij','/logiciels/intellij-idea-ultimate/'],
      ['red hat','/logiciels/red-hat-enterprise-linux/'],['rhel','/logiciels/red-hat-enterprise-linux/'],
      ['veeam','/logiciels/veeam-backup/'],['bricscad','/logiciels/bricscad-pro/'],
      ['kaspersky','/logiciels/kaspersky-next/'],['tsplus','/logiciels/tsplus/'],
      ['google workspace','/logiciels/google-workspace/'],['zoom','/logiciels/zoom-workplace/'],
      ['canva','/logiciels/canva-teams/'],['prezi','/logiciels/prezi/']
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