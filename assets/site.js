document.querySelectorAll('[data-search]').forEach(form=>{
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const q=form.querySelector('input').value.trim().toLowerCase();
    if(!q)return;
    const routes=[
      ['liferay','/logiciels/liferay-dxp/'],['adobe','/logiciels/adobe-creative-cloud/'],
      ['autocad','/logiciels/autocad/'],['autodesk','/logiciels/autocad/'],
      ['microsoft','/logiciels/microsoft-365/'],['office','/logiciels/microsoft-365/'],
      ['jetbrains','/logiciels/intellij-idea-ultimate/'],['intellij','/logiciels/intellij-idea-ultimate/'],
      ['red hat','/logiciels/red-hat-enterprise-linux/'],['rhel','/logiciels/red-hat-enterprise-linux/'],
      ['veeam','/logiciels/veeam-backup/'],['bricscad','/logiciels/bricscad-pro/']
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
    const body=encodeURIComponent(
      'Nom : '+(d.get('nom')||'')+'\nEntreprise : '+(d.get('entreprise')||'')+
      '\nTéléphone : '+(d.get('telephone')||'')+'\nSolution : '+(d.get('solution')||'')+
      '\n\nBesoin :\n'+(d.get('message')||'')
    );
    location.href='mailto:contact@strivor.ma?subject='+subject+'&body='+body;
  });
});
