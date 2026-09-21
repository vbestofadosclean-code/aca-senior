/* Cami-Sênior — camada online: API + PostgreSQL + autenticação administrativa. */
(function(){
  const API='/api';
  const json=async r=>{try{return await r.json();}catch{return {};}};
  const $=id=>document.getElementById(id);
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  window.getRegistrations=async function(){const r=await fetch(API+'/admin/registrations');if(!r.ok)throw new Error('auth');return (await r.json()).registrations;};

  window.validateRegistration=async function(event){
    event.preventDefault();const form=$('registrationForm');if(!form.checkValidity()){form.reportValidity();return;}
    const data=Object.fromEntries(new FormData(form).entries());const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='A GUARDAR...';
    try{const r=await fetch(API+'/registrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Erro');
      const d={...data,numero:j.registrationNumber,registrationNumber:j.registrationNumber,paymentStatus:j.registration?.paymentStatus||'pending',paymentValue:j.fee||6000,dataInscricao:j.registration?.createdAt||new Date().toISOString(),createdAt:j.registration?.createdAt||new Date().toISOString(),paymentConfirmedAt:j.registration?.paymentConfirmedAt||null};sessionStorage.setItem('camiSeniorCandidatura',JSON.stringify(d));populateConfirmation(d);$('registrationPage').classList.remove('active');$('confirmationPage').classList.add('active');updateVacancies();
    }catch(e){alert(e.message||'Não foi possível concluir a inscrição.');}finally{btn.disabled=false;btn.innerHTML='✓ &nbsp; VALIDAR INSCRIÇÃO';}
  };
  window.updateVacancies=async function(){try{const r=await fetch(API+'/registrations/count');const j=await r.json();if($('spots'))$('spots').textContent=j.remaining;if($('adminVagas'))$('adminVagas').textContent=j.remaining;if($('adminTotal'))$('adminTotal').textContent=j.total;}catch{}};

  window.consultRegistration=async function(event){
    event.preventDefault();const nome=$('consultNome').value.trim(),agrupamento=$('consultAgrupamento').value.trim(),err=$('consultError'),result=$('consultResult');
    try{const r=await fetch(API+'/registrations/consult?nome='+encodeURIComponent(nome)+'&agrupamento='+encodeURIComponent(agrupamento));const j=await r.json();if(!r.ok)throw new Error(j.error);const x=j.registration;
      err.style.display='none';result.classList.add('show');$('consultNumero').textContent=x.registrationNumber||'—';$('consultRNome').textContent=x.nome||'—';$('consultRAgrupamento').textContent=x.agrupamento||'—';$('consultRCategoria').textContent=x.categoria||'—';
      const consultFields={Contacto:x.contacto,Email:x.email,Nascimento:x.nascimento?String(x.nascimento).slice(0,10):'',Sexo:x.sexo,Naturalidade:x.naturalidade,Bilhete:x.bilhete,Residencia:x.residencia,Patrulha:x.patrulha,Deficiencia:x.deficiencia,Obs:x.obs};
      Object.entries(consultFields).forEach(([k,v])=>{const el=$('consultR'+k);if(el)el.textContent=k==='Nascimento'&&v?formatDatePT(v):(v||'Não informado');});
      sessionStorage.setItem('camiSeniorConsulta',JSON.stringify(x));
    }catch{err.textContent='INSCRIÇÃO NÃO ENCONTRADA';err.style.display='block';result.classList.remove('show');sessionStorage.removeItem('camiSeniorConsulta');}
  };

  window.sendGroupingMessage=async function(event){
    event.preventDefault();const name=$('groupContactName').value.trim(),phone=$('groupContactPhone').value.trim(),message=$('groupContactMessage').value.trim(),status=$('groupContactStatus');
    try{const r=await fetch(API+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:name,contacto:phone,mensagem:message})});const j=await r.json();if(!r.ok)throw new Error(j.error);status.textContent='Mensagem enviada com sucesso.';$('groupContactMessage').value='';}
    catch(e){status.textContent=e.message||'Erro ao enviar mensagem.';}
  };

  function ensureLoginUI(){
    if($('adminLoginModal'))return;
    const wrap=document.createElement('div');wrap.id='adminLoginModal';wrap.innerHTML=`<div class="secure-card admin-login-card"><button class="secure-btn secondary" id="adminLoginCancel">Cancelar</button><h1>Acesso Administrativo</h1><p>Introduza um dos e-mails autorizados e as duas palavras-passe.</p><div class="pass-grid"><label>E-mail<input id="adminEmailInput" type="email" autocomplete="username" placeholder="E-mail autorizado"></label><label>Palavra-passe 1<input id="adminPass1Input" type="password" autocomplete="current-password" placeholder="Palavra-passe 1"></label><label>Palavra-passe 2<input id="adminPass2Input" type="password" autocomplete="current-password" placeholder="Palavra-passe 2"></label></div><p id="adminLoginError" style="color:#ff8f8f;display:none"></p><div class="secure-actions"><button class="secure-btn" id="adminLoginSubmit">Entrar na Área Administrativa</button></div></div>`;
    document.body.appendChild(wrap);$('adminLoginCancel').onclick=()=>wrap.classList.remove('active');$('adminLoginSubmit').onclick=doAdminLogin;
    ['adminEmailInput','adminPass1Input','adminPass2Input'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter')doAdminLogin();}));
  }
  async function doAdminLogin(){
    const email=$('adminEmailInput').value.trim(),p1=$('adminPass1Input').value,p2=$('adminPass2Input').value,err=$('adminLoginError'),btn=$('adminLoginSubmit');
    if(!email||!p1||!p2){err.textContent='Preencha o e-mail e as duas palavras-passe.';err.style.display='block';return;}
    btn.disabled=true;btn.textContent='A verificar...';err.style.display='none';
    try{const r=await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password1:p1,password2:p2})});const j=await json(r);if(!r.ok)throw new Error(j.error||'Acesso recusado.');
      $('adminLoginModal').classList.remove('active');hideOldAdmin();$('adminHub').classList.add('active');await updateAdminUnread();renderAdminHubBadge();
    }catch(e){err.textContent=e.message;err.style.display='block';}
    finally{btn.disabled=false;btn.textContent='Entrar na Área Administrativa';}
  }
  window.openRestrictedArea=function(){$('otherPage')?.classList.remove('active');ensureLoginUI();$('adminLoginModal').classList.add('active');$('adminEmailInput').focus();};
  window.verifyThreePasses=function(){ensureLoginUI();$('adminLoginModal').classList.add('active');};
  window.openAdminDatabase=window.openRestrictedArea;
  window.closeAllAdmin=async function(){try{await fetch(API+'/admin/logout',{method:'POST'});}catch{}['restrictedWarning','threePassPage','adminHub','newDatabasePage','messagesPage','statusPage'].forEach(id=>$(id)?.classList.remove('active'));$('adminLoginModal')?.classList.remove('active');$('otherPage')?.classList.add('active');};
  async function isAdmin(){const r=await fetch(API+'/admin/me');if(!r.ok){window.openRestrictedArea();return false;}return true;}

  async function updateAdminUnread(){try{const r=await fetch(API+'/admin/messages/unread-count');if(r.ok){const j=await r.json();window.__adminUnread=j.total;}}catch{}}
  function renderAdminHubBadge(){const btn=document.querySelector('#adminHub .hub-option:nth-child(2)');if(btn){let b=btn.querySelector('.msg-badge');if(!b){b=document.createElement('b');b.className='msg-badge';btn.appendChild(b);}b.textContent=(window.__adminUnread||0)>0?` ${window.__adminUnread} nova(s)`:'';}}

  window.openNewDatabase=async function(){if(!(await isAdmin()))return;$('adminHub').classList.remove('active');$('newDatabasePage').classList.add('active');await renderDB();};
  window.openStatusAdmin=async function(){if(!(await isAdmin()))return;$('adminHub').classList.remove('active');$('statusPage').classList.add('active');await renderStatus();};
  window.openMessagesAdmin=async function(){if(!(await isAdmin()))return;$('adminHub').classList.remove('active');$('messagesPage').classList.add('active');await renderMessages();};
  async function renderDB(includeHidden=false){
    const c=$('databaseContent'),d=$('databaseDetail');
    const r=await fetch(API+'/admin/registrations?includeHidden='+(includeHidden?'1':'0'));
    if(!r.ok){alert('Sessão expirada.');return;}
    const regs=(await r.json()).registrations;
    window.__dbIncludeHidden=includeHidden;window.__regs=regs;d.style.display='none';
    const tools='<div class="admin-tools"><input id="dbSearch" placeholder="Pesquisar por nome, agrupamento, categoria ou número"><button class="secure-btn" onclick="searchDB()">Pesquisar</button><button class="secure-btn secondary" onclick="renderDB('+(!includeHidden)+')">'+(includeHidden?'Ocultar antigas':'Mostrar ocultas')+'</button></div>';
    const rows=regs.map((x,i)=>`<tr class="${x.hidden?'aca-hidden-row ':''}clickable" onclick="showNewDetail(${i})"><td>${escHtml(x.registrationNumber)}</td><td>${escHtml(x.nome)}</td><td>${escHtml(x.agrupamento)}</td><td>${escHtml(x.categoria)}</td><td class="${x.paymentStatus==='paid'?'badge-paid':'badge-pending'}">${x.paymentStatus==='paid'?'Pago':'Pendente'}</td><td onclick="event.stopPropagation()"><div class="aca-db-actions"><button class="aca-${x.hidden?'show':'hide'}-btn" onclick="toggleRegistrationHidden(${x.id},${!x.hidden},${includeHidden})">${x.hidden?'Mostrar':'Ocultar'}</button><button class="aca-delete-btn" onclick="deleteRegistration(${x.id})">Excluir</button></div></td></tr>`).join('');
    c.innerHTML=regs.length?tools+'<table class="new-table"><thead><tr><th>Nº</th><th>Nome</th><th>Agrupamento</th><th>Categoria</th><th>Pagamento</th><th>Acções</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div>'+tools+'</div><div class="empty-admin">'+(includeHidden?'Não existem inscrições ocultadas.':'Ainda não existem inscritos.')+'</div>';
  }
  window.searchDB=async function(){
    const q=$('dbSearch')?.value.trim()||'',includeHidden=Boolean(window.__dbIncludeHidden);
    const r=await fetch(API+'/admin/registrations?q='+encodeURIComponent(q)+'&includeHidden='+(includeHidden?'1':'0'));if(!r.ok)return;
    const regs=(await r.json()).registrations;window.__regs=regs;const c=$('databaseContent');
    const tools='<div class="admin-tools"><input id="dbSearch" value="'+escHtml(q)+'" placeholder="Pesquisar"><button class="secure-btn" onclick="searchDB()">Pesquisar</button><button class="secure-btn secondary" onclick="renderDB('+(!includeHidden)+')">'+(includeHidden?'Ocultar antigas':'Mostrar ocultas')+'</button></div>';
    const rows=regs.map((x,i)=>`<tr class="${x.hidden?'aca-hidden-row ':''}clickable" onclick="showNewDetail(${i})"><td>${escHtml(x.registrationNumber)}</td><td>${escHtml(x.nome)}</td><td>${escHtml(x.agrupamento)}</td><td>${escHtml(x.categoria)}</td><td class="${x.paymentStatus==='paid'?'badge-paid':'badge-pending'}">${x.paymentStatus==='paid'?'Pago':'Pendente'}</td><td onclick="event.stopPropagation()"><div class="aca-db-actions"><button class="aca-${x.hidden?'show':'hide'}-btn" onclick="toggleRegistrationHidden(${x.id},${!x.hidden},${includeHidden})">${x.hidden?'Mostrar':'Ocultar'}</button><button class="aca-delete-btn" onclick="deleteRegistration(${x.id})">Excluir</button></div></td></tr>`).join('');
    c.innerHTML=regs.length?tools+'<table class="new-table"><thead><tr><th>Nº</th><th>Nome</th><th>Agrupamento</th><th>Categoria</th><th>Pagamento</th><th>Acções</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div>'+tools+'</div><div class="empty-admin">Nenhum resultado.</div>';
  };
  window.toggleRegistrationHidden=async function(id,hidden,includeHidden){
    const r=await fetch(API+'/admin/registrations/'+id+'/hidden',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden})});
    if(!r.ok){alert('Não foi possível actualizar a inscrição.');return;}
    await renderDB(Boolean(includeHidden));
  };
  window.deleteRegistration=async function(id){
    if(!confirm('Excluir definitivamente esta inscrição? Esta acção não pode ser anulada.'))return;
    const r=await fetch(API+'/admin/registrations/'+id,{method:'DELETE'});
    if(!r.ok){const j=await json(r);alert(j.error||'Não foi possível excluir a inscrição.');return;}
    $('databaseDetail').style.display='none';await renderDB(Boolean(window.__dbIncludeHidden));updateVacancies();
  };
  window.showNewDetail=function(i){const r=window.__regs?.[i];if(!r)return;const d=$('databaseDetail');const dt=r.createdAt?new Date(r.createdAt):null;const createdDate=dt&&!Number.isNaN(dt.getTime())?dt.toLocaleDateString('pt-AO'):'—';const createdTime=dt&&!Number.isNaN(dt.getTime())?dt.toLocaleTimeString('pt-AO',{hour:'2-digit',minute:'2-digit'}):'—';const paidDate=r.paymentConfirmedAt?new Date(r.paymentConfirmedAt).toLocaleDateString('pt-AO'):'—';const fields=[['Número',r.registrationNumber],['Nome completo',r.nome],['Data da inscrição',createdDate],['Hora da inscrição',createdTime],['Nascimento',formatDatePT(r.nascimento)],['Sexo',r.sexo],['Naturalidade',r.naturalidade],['Bilhete',r.bilhete],['Residência',r.residencia],['Contacto',r.contacto],['Email',r.email],['Agrupamento',r.agrupamento],['Núcleo',r.nucleo],['Patrulha',r.patrulha],['Categoria',r.categoria],['Deficiência',r.deficiencia],['Observações',r.obs||'—'],['Estado',r.paymentStatus==='paid'?'Pago':'Pendente'],['Data do pagamento',paidDate]];d.innerHTML='<h2>Informações completas da inscrição</h2><div class="detail-grid">'+fields.map(x=>`<div><small>${escHtml(x[0])}</small><strong>${escHtml(x[1])}</strong></div>`).join('')+'</div>';d.style.display='block';d.scrollIntoView({behavior:'smooth'});};
  async function renderStatus(){const c=$('statusContent');const r=await fetch(API+'/admin/registrations?includeHidden=1');if(!r.ok)return;const regs=(await r.json()).registrations;window.__regs=regs;c.innerHTML=regs.length?'<table class="new-table"><thead><tr><th>Nome</th><th>Número</th><th>Pagamento</th></tr></thead><tbody>'+regs.map(x=>`<tr><td>${escHtml(x.nome)}</td><td>${escHtml(x.registrationNumber)}</td><td><button class="pay-btn ${x.paymentStatus==='paid'?'undo':''}" onclick="togglePayment(${x.id},${x.paymentStatus!=='paid'})">${x.paymentStatus==='paid'?'✓ Pago':'Marcar como Pago'}</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty-admin">Ainda não existem inscritos.</div>';}
  window.togglePayment=async function(id,paid){const r=await fetch(API+'/admin/registrations/'+id+'/payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paid})});if(!r.ok){alert('Não foi possível actualizar o pagamento.');return;}await renderStatus();};

  async function renderMessages(){
    const c=$('messagesContent');const r=await fetch(API+'/admin/messages');if(!r.ok)return;const ms=(await r.json()).messages;window.__messages=ms;
    c.innerHTML=`<div class="admin-tools"><input id="msgSearch" placeholder="Pesquisar mensagens"><button class="secure-btn" onclick="searchMessages()">Pesquisar</button><button class="secure-btn secondary" onclick="markAllMessagesRead()">Marcar todas como lidas</button></div><div id="messageList"></div>`;drawMessages(ms);await updateAdminUnread();renderAdminHubBadge();
  }
  function drawMessages(ms){const c=$('messageList');if(!c)return;c.innerHTML=ms.length?ms.map(m=>`<div class="msg-card ${m.readAt?'read':'unread'}"><div class="msg-head"><strong>${escHtml(m.nome)}</strong><span>${m.type==='system'?'🔐 Sistema':m.type==='review'?'⭐ Avaliação do site':'💬 Mensagem'}</span></div>${m.type==='review'?`<div class="review-admin-stars" aria-label="${Number(m.rating)||0} de 5 estrelas">${'★★★★★'.split('').map((_,i)=>`<span class="${i<(Number(m.rating)||0)?'on':''}">★</span>`).join('')}</div>`:`<div>Contacto: ${escHtml(m.contacto)}</div>`}<p>${escHtml(m.mensagem)}</p><small>${new Date(m.createdAt).toLocaleString('pt-AO')}</small><div class="msg-actions">${!m.readAt?`<button class="secure-btn small" onclick="markMessageRead(${m.id})">Marcar como lida</button>`:''}${m.type==='contact'?`<button class="secure-btn small" onclick="replyWhatsApp('${encodeURIComponent(m.contacto)}','${encodeURIComponent(m.mensagem)}')">WhatsApp</button>`:''}<button class="secure-btn small danger" onclick="deleteMessage(${m.id})">Eliminar</button></div></div>`).join(''):'<div class="empty-admin">Ainda não existem mensagens.</div>';}
  window.searchMessages=async function(){const q=$('msgSearch')?.value.trim()||'';const r=await fetch(API+'/admin/messages?q='+encodeURIComponent(q));if(!r.ok)return;const ms=(await r.json()).messages;window.__messages=ms;drawMessages(ms);};
  window.markMessageRead=async function(id){const r=await fetch(API+'/admin/messages/'+id+'/read',{method:'POST'});if(r.ok){const m=(await r.json()).message;window.__messages=window.__messages.map(x=>x.id===m.id?m:x);drawMessages(window.__messages);await updateAdminUnread();renderAdminHubBadge();}};
  window.markAllMessagesRead=async function(){const r=await fetch(API+'/admin/messages/read-all',{method:'POST'});if(r.ok){window.__messages=window.__messages.map(x=>({...x,readAt:x.readAt||new Date().toISOString()}));drawMessages(window.__messages);await updateAdminUnread();renderAdminHubBadge();}};
  window.deleteMessage=async function(id){if(!confirm('Eliminar esta mensagem?'))return;const r=await fetch(API+'/admin/messages/'+id,{method:'DELETE'});if(r.ok){window.__messages=window.__messages.filter(x=>x.id!==id);drawMessages(window.__messages);await updateAdminUnread();renderAdminHubBadge();}};
  window.replyWhatsApp=function(contact,message){let phone=decodeURIComponent(contact).replace(/[^0-9+]/g,'');if(phone.startsWith('+'))phone=phone.slice(1);if(!phone){alert('Contacto sem número válido.');return;}window.open('https://wa.me/'+phone+'?text='+encodeURIComponent('Olá. Recebemos a sua mensagem no Cami-Sênior.\n\n'+decodeURIComponent(message)),'_blank');};

  window.backToHub=function(id){$(id).classList.remove('active');$('adminHub').classList.add('active');updateAdminUnread().then(renderAdminHubBadge);};
  window.hideOldAdmin=window.hideOldAdmin||function(){};
  window.addEventListener('load',()=>{updateVacancies();ensureLoginUI();});
  setInterval(async()=>{if(document.getElementById('adminHub')?.classList.contains('active')||document.getElementById('messagesPage')?.classList.contains('active')){await updateAdminUnread();renderAdminHubBadge();if(document.getElementById('messagesPage')?.classList.contains('active'))renderMessages();}},30000);
})();
