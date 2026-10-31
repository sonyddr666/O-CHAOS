const MAILHUB_BASE = new URL('./', document.currentScript.src).pathname;
const $ = id => document.getElementById(id);
const state = {config:null,boxes:[],messages:[],folder:'inbox',box:'',selected:null,offset:0,query:'',reply:null,requestId:null,busy:false};
const folderNames={inbox:'Caixa de entrada',sent:'Enviados',starred:'Favoritos',trash:'Lixeira'};
const statusNames={received:'Recebido',accepted:'Aceito pelo provedor',sending:'Envio em andamento',failed:'Envio recusado',uncertain:'Envio sem confirmação'};
let loadGeneration=0,searchTimer,toastTimer,pollTimer;
let removingBox=null,editingExpiry=null;
function node(tag,className,value) {const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=value;return el;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
async function api(path,options={}) {
  const response=await fetch(MAILHUB_BASE+'api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-MailHub-Request':'1',...(options.headers||{})}});
  let data;try{data=await response.json();}catch{throw new Error('Resposta inválida. Confira a conexão.');}
  if(!response.ok){if(response.status===401 && data.loginUrl?.startsWith('/admin-login')){location.assign(data.loginUrl);}else if(response.status===401 && path!=='/login')showLogin();const error=new Error(data.error||'Não foi possível concluir.');error.data=data;throw error;}return data;
}
const mutate=(path,value,method='POST')=>api(path,{method,body:JSON.stringify(value)});
const isActive=b=>!!b.active && !b.deleted_at && (!b.expires_at || b.expires_at>Date.now());
function remainingTime(expiresAt){
  if(!expiresAt)return 'Sem expiração';
  const seconds=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));if(!seconds)return 'Expirado';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
  return (days?days+'d ':'')+String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(rest).padStart(2,'0')+' restantes';
}
function countdown(box){const el=node('small','expiry-countdown',remainingTime(box.expires_at));if(box.expires_at){el.dataset.expiresAt=box.expires_at;el.title='Expira em '+fullDate(box.expires_at);}return el;}
function updateCountdowns(){for(const el of document.querySelectorAll('[data-expires-at]')){const expiresAt=Number(el.dataset.expiresAt);el.textContent=remainingTime(expiresAt);el.classList.toggle('expired',expiresAt<=Date.now());}}
function shortDate(time){const date=new Date(time);return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(date);}
function fullDate(time){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(time));}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Endereço copiado.');}catch{toast('Não foi possível copiar automaticamente. Selecione o endereço para copiar.');}}
function showLogin() {
  $('boot-screen').hidden=true;$('app').hidden=true;$('login-screen').hidden=false;clearInterval(pollTimer);pollTimer=null;
  for(const dialog of document.querySelectorAll('dialog'))dialog.close();
  state.messages=[];state.boxes=[];state.selected=null;state.config=null;
  $('messages').replaceChildren();$('reader').replaceChildren();$('mailbox-list').replaceChildren();
  $('compose-form').reset();$('created-list').textContent='';$('manage-list').replaceChildren();
}
function emptyReader(){
  const wrap=node('div','empty-reader');wrap.append(node('div','empty-illustration','@'),node('h2','', 'Um espaço para suas conversas.'),node('p','', 'Escolha uma mensagem ao lado para ler e responder. Tudo fica organizado por endereço.'));
  $('reader').replaceChildren(wrap);document.querySelector('.mail-area').classList.remove('reading');
}
function option(value,label){const el=node('option','',label);el.value=value;return el;}
function renderBoxes(){
  $('mailbox-count').textContent=state.boxes.length;
  $('unread-count').textContent=state.boxes.reduce((sum,b)=>sum+b.unread,0);
  $('all-mailboxes').classList.toggle('chosen',!state.box);
  const list=$('mailbox-list');list.replaceChildren();
  for(const box of state.boxes){
    const button=node('button','mailbox-button'+(state.box===box.id?' chosen':''));button.title=box.address+(state.config.domains.includes(box.address.split('@')[1])?'':' — recebimento pendente na Cloudflare');
    const dot=node('i','box-dot'+(!isActive(box)||!state.config.domains.includes(box.address.split('@')[1])?' paused':''));const label=node('span','',box.address);const count=node('span','count',box.unread?box.unread:'');
    const identity=node('span','mailbox-identity');identity.append(label,countdown(box));button.append(dot,identity,count);button.addEventListener('click',()=>selectBox(box.id));list.append(button);
  }
  const selectedDomain=$('box-domain').value;
  $('box-domain').replaceChildren(...(state.config.domainStatus||state.config.domains.map(domain=>({domain,receivingReady:true}))).map(d=>{const o=option(d.domain,d.domain+(d.receivingReady?'':' — recebimento pendente'));o.disabled=!d.receivingReady;return o;}));
  $('box-domain').value=state.config.domains.includes(selectedDomain)?selectedDomain:(state.config.domains[0]||'');
  if(state.config.domains.includes(selectedDomain))$('box-domain').value=selectedDomain;
}
async function refreshBoxes(){state.boxes=(await api('/mailboxes')).mailboxes;renderBoxes();}
async function selectBox(id){state.folder='inbox';state.box=id;state.selected=null;state.offset=0;renderBoxes();emptyReader();await loadMessages();}
function messageRow(message){
  const button=node('button','message-row'+(!message.read_at && message.direction==='inbound'?' unread':'')+(state.selected?.id===message.id?' selected':''));
  const meta=node('div','message-meta');meta.append(node('span','message-sender',message.direction==='inbound'?message.sender:message.recipient),node('time','message-time',shortDate(message.created_at)));
  button.append(meta,node('span','message-subject',(message.starred?'☆ ':'')+message.subject),node('span','message-preview',message.preview),node('span','address-pill',message.mailbox_address));
  button.addEventListener('click',()=>openMessage(message.id).catch(e=>toast(e.message)));return button;
}
function renderMessages(){
  $('folder-title').replaceChildren(document.createTextNode(folderNames[state.folder]),node('span','title-dot','.'));
  $('folder-breadcrumb').textContent=folderNames[state.folder];
  $('folder-subtitle').textContent=state.box?state.boxes.find(b=>b.id===state.box)?.address||'Suas conversas.':'Suas conversas, em todos os seus domínios.';
  for(const button of document.querySelectorAll('[data-folder]'))button.classList.toggle('selected',button.dataset.folder===state.folder);
  $('message-count').textContent=state.messages.length;$('messages').replaceChildren();
  if(state.messages.length){$('messages').append(...state.messages.map(messageRow));return;}
  const empty=node('div','empty-list');empty.append(node('strong','',state.query?'Nenhuma mensagem encontrada.':'Silêncio suspeito na caixa.'),node('span','',state.boxes.length?'Quando o caos escrever, a mensagem aparece aqui.':'Comece criando seu primeiro endereço.'));
  if(!state.boxes.length){const button=node('button','secondary','＋ Criar endereço');button.onclick=openMailboxDialog;empty.append(button);}
  $('messages').append(empty);
}
async function loadMessages(append=false){
  const generation=++loadGeneration;
  const params=new URLSearchParams({folder:state.folder,q:state.query,offset:append?state.messages.length:0});if(state.box)params.set('mailbox',state.box);
  const result=await api('/messages?'+params);if(generation!==loadGeneration || !state.config)return;
  state.messages=append?[...state.messages,...result.messages]:result.messages;$('load-more').hidden=!result.hasMore;renderMessages();
  $('last-updated').textContent='Atualizado às '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
}
async function refresh(){try{await refreshBoxes();await loadMessages();}catch(e){toast(e.message);}}
function tool(label,symbol,action){const button=node('button','icon-button',symbol);button.setAttribute('aria-label',label);button.title=label;button.onclick=()=>Promise.resolve(action()).catch(e=>toast(e.message));return button;}
async function updateMessage(changes){
  const id=state.selected.id;await mutate('/messages/'+id,changes,'PATCH');
  if('deleted' in changes){state.selected=null;emptyReader();await refresh();return;}
  await openMessage(id);await refresh();
}
async function openMessage(id){
  const message=(await api('/messages/'+id)).message;state.selected=message;
  if(message.direction==='inbound' && !message.read_at){await mutate('/messages/'+id,{read:true},'PATCH');message.read_at=Date.now();const listed=state.messages.find(m=>m.id===id);if(listed)listed.read_at=message.read_at;await refreshBoxes();}
  renderMessages();
  const tools=node('div','reader-tools');const back=tool('Voltar à lista','← Voltar',()=>{state.selected=null;emptyReader();});back.classList.add('back-button');
  tools.append(back,tool(message.starred?'Remover favorito':'Favoritar',message.starred?'★':'☆',()=>updateMessage({starred:!message.starred})),tool(message.deleted_at?'Restaurar mensagem':'Mover para lixeira',message.deleted_at?'↶':'♧',()=>updateMessage({deleted:!message.deleted_at})));
  const content=node('div','reader-content');content.append(node('h2','',message.subject));
  const sender=node('div','sender-card');const details=node('div','sender-detail');details.append(node('strong','',message.sender),node('small','', 'Para: '+message.recipient));
  sender.append(node('div','sender-avatar',message.sender.slice(0,2).toUpperCase()),details,node('time','reader-date',fullDate(message.created_at)));content.append(sender);
  if(message.direction==='outbound')content.append(node('p','status-chip',statusNames[message.status]||message.status));
  content.append(node('pre','message-body',message.body));
  if(message.attachments?.length){const files=node('div','attachment-list');for(const file of message.attachments){const link=node('a','attachment-download',`↓ ${file.filename} (${Math.ceil(file.size/1024)} KB)`);link.href=MAILHUB_BASE+'api/attachments/'+file.id;link.download=file.filename;files.append(link);}content.append(files);}
  if(message.missingAttachmentCount)content.append(node('p','reader-note',`${message.missingAttachmentCount} anexo(s) desta mensagem antiga não foram armazenados pela versão anterior. Peça o reenvio para receber os arquivos.`));
  if(message.direction==='inbound' && !message.deleted_at){const button=node('button','secondary reader-reply','↩ Responder');button.disabled=!state.config.sendingEnabled || !isActive(state.boxes.find(b=>b.id===message.mailbox_id)||{});button.title=state.config.sendingEnabled?'Responder usando este endereço':'Configure SMTP para responder';button.onclick=()=>openCompose(message);content.append(button);}
  $('reader').replaceChildren(tools,content);document.querySelector('.mail-area').classList.add('reading');
}
function openMailboxDialog(){
  $('mailbox-form').reset();$('mailbox-error').textContent='';$('created-addresses').hidden=true;
  if(!state.config.domains.length){toast('Configure pelo menos um domínio antes de criar endereços.');return;}
  $('mailbox-dialog').showModal();
}
function openCompose(reply=null){
  if(!state.config.sendingEnabled){toast('Configure um provedor SMTP para enviar e responder.');return;}
  const available=state.boxes.filter(isActive);if(!available.length){toast('Crie um endereço ativo para enviar.');openMailboxDialog();return;}
  state.reply=reply;state.requestId=crypto.randomUUID();$('compose-form').reset();$('compose-error').textContent='';$('send-button').disabled=false;
  $('compose-from').replaceChildren(...available.map(b=>option(b.id,b.address)));
  if(reply){$('compose-from').value=reply.mailbox_id;$('compose-to').value=reply.reply_to||reply.sender;$('compose-subject').value=/^re:/i.test(reply.subject)?reply.subject:('Re: '+reply.subject).slice(0,300);$('compose-body').value='\n\nEm '+fullDate(reply.created_at)+', '+reply.sender+' escreveu:\n'+reply.body.split('\n').map(line=>'> '+line).join('\n');}
  else if(state.box && available.some(b=>b.id===state.box))$('compose-from').value=state.box;
  $('compose-title').textContent=reply?'Responder e-mail':'Escrever e-mail';$('compose-dialog').showModal();
}
function renderManage(){
  const list=$('manage-list');list.replaceChildren();
  if(!state.boxes.length){list.append(node('p','manage-empty','Você ainda não criou endereços. Use o botão “Criar endereço” para começar.'));return;}
  for(const box of state.boxes){
    const row=node('div','manage-row');const details=node('div');details.append(node('strong','',box.address),node('small','',(box.label?box.label+' · ':'')+(!box.active?'Pausado':!isActive(box)?'Expirado':'Ativo')+(box.expires_at?' · Validade: '+fullDate(box.expires_at):'')),countdown(box));
    const actions=node('div','manage-actions');const copyButton=node('button','secondary','Copiar');copyButton.onclick=()=>copy(box.address);const pause=node('button','secondary',box.active?'Pausar':'Reativar');pause.disabled=!!box.expires_at && box.expires_at<=Date.now();pause.onclick=async()=>{pause.disabled=true;try{await mutate('/mailboxes/'+box.id,{active:!box.active},'PATCH');await refreshBoxes();renderManage();toast(box.active?'Endereço pausado.':'Endereço reativado.');}catch(e){toast(e.message);pause.disabled=false;}};
    const expiry=node('button','secondary','◷ Gerenciar prazo');expiry.onclick=()=>openExpiry(box);
    const remove=node('button','secondary danger','Excluir');remove.onclick=()=>{removingBox=box;$('remove-address').textContent=box.address;$('remove-error').textContent='';$('remove-confirm').disabled=false;$('remove-dialog').showModal();};
    actions.append(copyButton,pause,expiry,remove);row.append(details,actions);list.append(row);
  }
}
function openExpiry(box){
  editingExpiry=box;$('expiry-address').textContent=box.address;$('expiry-counter').replaceChildren(countdown(box));$('expiry-error').textContent='';$('expiry-form').reset();$('expiry-value').value=box.expires_at?'168':'0';
  for(const button of document.querySelectorAll('[data-extend-hours]'))button.disabled=!box.expires_at;
  $('extend-days').disabled=!box.expires_at;$('extend-custom').disabled=!box.expires_at;
  $('expiry-dialog').showModal();
}
async function saveExpiry(changes){
  const id=editingExpiry?.id;if(!id)return;
  const controls=[...$('expiry-dialog').querySelectorAll('button,input,select')];for(const control of controls)control.disabled=true;
  $('expiry-error').textContent='';
  try{await mutate('/mailboxes/'+id,changes,'PATCH');await refresh();renderManage();$('expiry-dialog').close();toast('Validade atualizada. O relógio do caos foi ajustado.');}
  catch(e){$('expiry-error').textContent=e.message;}
  finally{for(const control of controls)control.disabled=false;if(editingExpiry && !editingExpiry.expires_at){for(const button of document.querySelectorAll('[data-extend-hours]'))button.disabled=true;$('extend-days').disabled=true;$('extend-custom').disabled=true;}}
}
async function start(){
  state.config=await api('/session');await refreshBoxes();
  if(state.config.authMode==='pico'){$('logout').title='Voltar ao painel do Pico5';$('logout').setAttribute('aria-label','Voltar ao painel do Pico5');}
  $('boot-screen').hidden=true;$('login-screen').hidden=true;$('app').hidden=false;$('password').value='';$('sending-notice').hidden=state.config.sendingEnabled;
  if(state.config.localPreview){const badge=document.querySelector('.cloud-badge');badge.replaceChildren(node('span','live-dot'),document.createTextNode('Prévia local'));$('sending-notice').hidden=false;$('sending-notice').replaceChildren(node('span','','ⓘ'),node('span','','Prévia local. Recebimento externo e envio ainda não estão conectados à sua conta Cloudflare.'));}
  $('compose-button').title=state.config.sendingEnabled?'Escrever e-mail':'Envio aguardando configuração';
  if(state.config.sendProvider==='cloudflare'){$('sending-notice').hidden=false;$('sending-notice').replaceChildren(node('span','','ⓘ'),node('span','','Envio gratuito Cloudflare para destinos verificados: '+state.config.sendRecipients.join(', ')+'. Para outros destinatários, use um provedor SMTP autorizado.'));}
  emptyReader();await loadMessages();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden && !document.querySelector('dialog[open]'))refresh();},3000);
}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('login-error').textContent='';try{await mutate('/login',{password:$('password').value});await start();}catch(e){$('login-error').textContent=e.message;}finally{button.disabled=false;}});
$('logout').onclick=async()=>{if(state.config?.authMode==='pico'){location.assign('/__pico');return;}try{await mutate('/logout',{});showLogin();toast('Você saiu do painel.');}catch(e){toast(e.message);}};
for(const button of document.querySelectorAll('[data-folder]'))button.onclick=async()=>{state.folder=button.dataset.folder;state.selected=null;emptyReader();try{await loadMessages();}catch(e){toast(e.message);}};
$('all-mailboxes').onclick=()=>selectBox('').catch(e=>toast(e.message));
$('new-mailbox').onclick=openMailboxDialog;$('create-top').onclick=openMailboxDialog;
$('compose-button').onclick=()=>openCompose();$('refresh').onclick=refresh;
$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=$('search').value;loadMessages().catch(e=>toast(e.message));},300);};
$('load-more').onclick=()=>loadMessages(true).catch(e=>toast(e.message));
for(const button of document.querySelectorAll('.close-dialog'))button.onclick=()=>button.closest('dialog').close();
$('mailbox-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$('mailbox-error').textContent='';try{const result=await mutate('/mailboxes',{domain:$('box-domain').value,name:$('box-name').value,count:Number($('box-count').value),label:$('box-label').value,expiresHours:Number($('box-expiry').value)});$('created-list').textContent=result.mailboxes.map(b=>b.address).join('\n');$('created-addresses').hidden=false;await refreshBoxes();await selectBox(result.mailboxes[0].id);toast(result.mailboxes.length===1?'Endereço criado.':result.mailboxes.length+' endereços criados.');}catch(e){$('mailbox-error').textContent=e.message;}finally{button.disabled=false;}};
$('copy-created').onclick=()=>copy($('created-list').textContent);
$('manage-button').onclick=()=>{renderManage();$('manage-dialog').showModal();};
$('remove-form').onsubmit=async event=>{event.preventDefault();if(!removingBox)return;const box=removingBox;$('remove-confirm').disabled=true;$('remove-error').textContent='';try{await mutate('/mailboxes/'+box.id,{confirmAddress:box.address},'DELETE');if(state.box===box.id)state.box='';state.selected=null;emptyReader();await refresh();renderManage();$('remove-dialog').close();removingBox=null;toast('Endereço excluído. As mensagens e os anexos foram preservados.');}catch(e){$('remove-error').textContent=e.message;$('remove-confirm').disabled=false;}};
$('expiry-form').onsubmit=event=>{event.preventDefault();saveExpiry({expiresHours:Number($('expiry-value').value)});};
for(const button of document.querySelectorAll('[data-extend-hours]'))button.onclick=()=>saveExpiry({extendHours:Number(button.dataset.extendHours)});
$('extend-custom').onclick=()=>{const days=Number($('extend-days').value);if(!Number.isInteger(days)||days<1||days>365){$('expiry-error').textContent='Escolha de 1 a 365 dias.';return;}saveExpiry({extendHours:days*24});};
$('compose-form').onsubmit=async event=>{
  event.preventDefault();if(state.busy)return;state.busy=true;$('send-button').disabled=true;$('compose-error').textContent='';
  try{const attachments=[];let total=0;for(const file of $('compose-attachments').files){total+=file.size;if(total>1048576)throw new Error('Os anexos devem somar até 1 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));attachments.push({filename:file.name,data:btoa(binary)});}const result=await mutate('/send',{attachments,mailboxId:$('compose-from').value,to:$('compose-to').value,subject:$('compose-subject').value,text:$('compose-body').value,requestId:state.requestId,replyToId:state.reply?.id});
    if(result.status!=='accepted'){state.busy=false;$('compose-error').textContent='Esta tentativa já está registrada: '+(statusNames[result.status]||result.status)+'. Confira a pasta Enviados.';return;}
    $('compose-dialog').close();state.folder='sent';state.box='';state.selected=null;emptyReader();await refresh();toast('Mensagem aceita pelo provedor para envio.');
  }catch(e){$('compose-error').textContent=e.message;if(e.data?.status){$('send-button').disabled=true;}else $('send-button').disabled=false;}
  finally{state.busy=false;}
};
start().catch(e=>{showLogin();if(e.message!=='Entre para acessar suas mensagens.')$('login-error').textContent=e.message;});

window.addEventListener('focus',()=>{if(state.config)refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.config)refresh();});
setInterval(()=>{if(!document.hidden)updateCountdowns();},1000);
