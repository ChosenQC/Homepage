const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {fetchCloud} from './cloud-api.mjs?v=20261028-network-3';
const API='/api/insight/';
const key=()=>new URLSearchParams(location.hash.slice(1)).get('calendar'),draftKey=()=>`daybook-insight-drafts:${key()}`;
let folders=[],notes=[],folderRevision=null,loaded=false,loading=false,active=false,selected=null,folder='all',editingFolder=null,preview=false,folderSaving=false;
const dirty=new Set(),conflicts=new Set(),blocked=new Set(),inflight=new Set(),timers=new Map(),collapsed=new Set();
let drafts={};
function readDrafts(){try{drafts=JSON.parse(localStorage.getItem(draftKey())||'{}');}catch{drafts={};}}
function storeDrafts(){try{localStorage.setItem(draftKey(),JSON.stringify(drafts));}catch{$('insightStatus').textContent='本机草稿存储已满，请保持页面打开并联网保存。';}}
function fields(note){return {id:note.id,title:note.title.trim()||'无标题',content:note.content,folderId:note.folderId??null,deletedAt:note.deletedAt||null};}
async function api(route,data={}){const response=await fetchCloud(API+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key(),...data})});let result;try{result=await response.json();}catch{throw Error('笔记同步未完成，本机草稿已保留');}if(!response.ok){const e=Error(result.error||'笔记同步失败');e.conflict=response.status===409;e.permanent=response.status===400||response.status===413;throw e;}return result;}
function pathOf(id,seen=new Set()){const f=folders.find(x=>x.id===id);if(!f||seen.has(id))return '';seen.add(id);const parent=f.parentId?pathOf(f.parentId,seen):'';return (parent?parent+' / ':'')+f.name;}
function descendants(id,seen=new Set()){if(!id||seen.has(id))return seen;seen.add(id);for(const f of folders.filter(x=>x.parentId===id))descendants(f.id,seen);return seen;}
function folderOptions(exclude=null){const skip=exclude?descendants(exclude):new Set();return '<option value="">未分类 / 顶层</option>'+folders.filter(f=>!skip.has(f.id)).map(f=>`<option value="${escape(f.id)}">${escape(pathOf(f.id))}</option>`).join('');}
function currentNotes(){const search=$('insightSearch').value.trim().toLowerCase(),scope=folder==='all'||folder==='trash'?null:descendants(folder);return notes.filter(n=>(folder==='trash'?!!n.deletedAt:!n.deletedAt)&&(!scope||scope.has(n.folderId))&&(!search||(n.title+'\n'+n.content).toLowerCase().includes(search))).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
function renderSidebar(){
  const tree=$('insightFolders');tree.replaceChildren();
  const choose=(id)=>{folder=id;renderSidebar();};
  for(const [id,label] of [['all','全部笔记'],['trash','最近删除']]){const b=document.createElement('button');b.type='button';b.className='folder-root'+(folder===id?' selected':'');b.textContent=label;b.onclick=()=>choose(id);tree.append(b);}
  function level(parent,depth){for(const f of folders.filter(x=>x.parentId===parent)){
    const row=document.createElement('div');row.className='folder-row'+(folder===f.id?' selected':'');row.style.paddingLeft=`${depth*13}px`;
    const children=folders.some(x=>x.parentId===f.id),toggle=document.createElement('button');toggle.type='button';toggle.className='folder-toggle';toggle.textContent=children?(collapsed.has(f.id)?'›':'⌄'):'·';toggle.setAttribute('aria-label',`${collapsed.has(f.id)?'展开':'折叠'}分类组：${f.name}`);toggle.disabled=!children;toggle.onclick=()=>{collapsed.has(f.id)?collapsed.delete(f.id):collapsed.add(f.id);renderSidebar();};
    const name=document.createElement('button');name.type='button';name.className='folder-name';name.textContent=f.name;name.onclick=()=>choose(f.id);
    const edit=document.createElement('button');edit.type='button';edit.className='folder-edit';edit.textContent='⋯';edit.setAttribute('aria-label','编辑分类组：'+f.name);edit.onclick=()=>openFolder(f.id);row.append(toggle,name,edit);tree.append(row);if(!collapsed.has(f.id)&&depth<16)level(f.id,depth+1);
  }}level(null,0);
  const list=$('insightNoteList');list.replaceChildren();for(const note of currentNotes()){
    const button=document.createElement('button');button.className='insight-note-item'+(selected===note.id?' selected':'');button.type='button';button.innerHTML=`<strong>${escape(note.title||'无标题')}${dirty.has(note.id)?'<i> · 草稿</i>':''}</strong><span>${escape(note.content.replace(/[#*\[\]]/g,'').slice(0,65)||'空白笔记')}</span><small>${escape(pathOf(note.folderId)||'未分类')}</small>`;button.onclick=()=>selectNote(note.id);list.append(button);
  }
  if(!list.children.length)list.innerHTML='<p class="insight-list-empty">'+(folder==='trash'?'暂无删除的笔记':'这个分类下还没有笔记')+'</p>';
}
function markdown(text){return text.split('\n').map(line=>{
  const safe=escape(line).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  if(/^### /.test(line))return '<h3>'+safe.slice(4)+'</h3>';if(/^## /.test(line))return '<h2>'+safe.slice(3)+'</h2>';if(/^# /.test(line))return '<h1>'+safe.slice(2)+'</h1>';
  if(/^- \[[ xX]\] /.test(line))return `<div class="note-checkbox"><input type="checkbox" disabled${/^- \[[xX]\]/.test(line)?' checked':''}>${safe.slice(6)}</div>`;
  if(/^- /.test(line))return '<div class="note-bullet">• '+safe.slice(2)+'</div>';return '<p>'+(safe||'<br>')+'</p>';
}).join('');}
function renderEditor(){
  const note=notes.find(n=>n.id===selected),editor=$('insightEditor');if(!note){editor.innerHTML='<div class="insight-empty">把想法留在这里。<span>创建分类组，或写下第一篇笔记。</span></div>';return;}
  editor.innerHTML=`<div class="note-editor-top"><select id="noteFolder" aria-label="笔记分类组"${note.deletedAt?' disabled':''}>${folderOptions()}</select><span id="noteSaveStatus"></span><button id="notePreview" type="button">${preview?'编辑':'预览'}</button><button id="noteDelete" type="button">${note.deletedAt?'恢复':'移到最近删除'}</button></div><input id="noteTitle" class="note-title" aria-label="笔记标题" placeholder="无标题" maxlength="160"${note.deletedAt?' readonly':''}><div class="note-format-toolbar${note.deletedAt?' hidden':''}"><button type="button" data-format="# ">H1</button><button type="button" data-format="## ">H2</button><button type="button" data-format="bold">加粗</button><button type="button" data-format="- ">列表</button><button type="button" data-format="- [ ] ">待办</button><button type="button" id="copyConflictedNote" class="${conflicts.has(note.id)?'':'hidden'}">将草稿另存为新笔记</button></div><textarea id="noteContent" class="note-content${preview?' hidden':''}" aria-label="笔记正文" placeholder="从这里开始写… 支持标题、加粗、列表和待办。"${note.deletedAt?' readonly':''}></textarea><div id="noteRendered" class="note-rendered${preview?'':' hidden'}"></div>`;
  $('noteTitle').value=note.title==='无标题'?'':note.title;$('noteContent').value=note.content;$('noteFolder').value=note.folderId||'';$('noteRendered').innerHTML=markdown(note.content);showSaveStatus(note);
  const edit=()=>{note.title=$('noteTitle').value||'无标题';note.content=$('noteContent').value;note.updatedAt=new Date().toISOString();remember(note);renderSidebar();};$('noteTitle').oninput=edit;$('noteContent').oninput=edit;
  $('noteFolder').onchange=()=>{note.folderId=$('noteFolder').value||null;remember(note);renderSidebar();};
  $('notePreview').onclick=()=>{preview=!preview;renderEditor();};
  $('noteDelete').onclick=()=>{note.deletedAt=note.deletedAt?null:new Date().toISOString();if(note.folderId&&!folders.some(f=>f.id===note.folderId))note.folderId=null;remember(note);if(note.deletedAt){selected=null;folder='trash';renderSidebar();renderEditor();}else{folder=note.folderId||'all';renderSidebar();renderEditor();}};
  for(const button of editor.querySelectorAll('[data-format]'))button.onclick=()=>{preview=false;const area=$('noteContent'),start=area.selectionStart,end=area.selectionEnd,value=area.value,format=button.dataset.format;if(format==='bold'){area.value=value.slice(0,start)+'**'+(value.slice(start,end)||'文字')+'**'+value.slice(end);}else{const line=value.lastIndexOf('\n',start-1)+1;area.value=value.slice(0,line)+format+value.slice(line);}edit();area.classList.remove('hidden');$('noteRendered').classList.add('hidden');area.focus();};
  $('copyConflictedNote').onclick=async()=>{const copy=makeNote(note);selectNote(copy.id);await saveNote(copy.id);if(!dirty.has(copy.id)){delete drafts[note.id];dirty.delete(note.id);conflicts.delete(note.id);storeDrafts();await loadNotebook();}};
}
function selectNote(id){selected=id;preview=false;renderSidebar();renderEditor();document.querySelector('.insight-layout').classList.add('editing');}
function showSaveStatus(note){if($('noteSaveStatus'))$('noteSaveStatus').textContent=conflicts.has(note.id)?'存在冲突 · 草稿保留':dirty.has(note.id)?'草稿已在本机保留':'已同步';}
function remember(note){blocked.delete(note.id);dirty.add(note.id);drafts[note.id]={baseRevision:note.revision??null,note:fields(note),updatedAt:note.updatedAt};storeDrafts();showSaveStatus(note);clearTimeout(timers.get(note.id));timers.set(note.id,setTimeout(()=>saveNote(note.id),1400));}
async function saveNote(id){
  if(inflight.has(id)||!dirty.has(id)||conflicts.has(id)||blocked.has(id))return;const note=notes.find(n=>n.id===id);if(!note)return;inflight.add(id);
  let retryMs=1400;const snapshot=fields(note),signature=JSON.stringify(snapshot);$('insightStatus').textContent='正在保存笔记…';
  try{const result=await api('note',{note:snapshot,revision:note.revision??null});note.revision=result.revision;
    if(JSON.stringify(fields(note))===signature){note.updatedAt=result.note.updatedAt;note.deletedAt=result.note.deletedAt;dirty.delete(id);delete drafts[id];}else{drafts[id]={baseRevision:result.revision,note:fields(note),updatedAt:note.updatedAt};}
    storeDrafts();$('insightStatus').textContent=dirty.has(id)?'更改已暂存在本机，继续同步…':'已保存到云端';renderSidebar();if(selected===id)showSaveStatus(note);
  }catch(error){retryMs=15000;if(error.conflict)conflicts.add(id);if(error.permanent)blocked.add(id);$('insightStatus').textContent=error.message+(error.conflict?'；可将草稿另存为新笔记。':error.permanent?'':' · 草稿已保留，将在联网后重试');if(selected===id){showSaveStatus(note);$('copyConflictedNote')?.classList.toggle('hidden',!conflicts.has(id));}}
  finally{inflight.delete(id);if(dirty.has(id)&&!conflicts.has(id)&&!blocked.has(id))timers.set(id,setTimeout(()=>saveNote(id),retryMs));}
}
function makeNote(source=null){const note={id:crypto.randomUUID(),title:source?.title||'无标题',content:source?.content||'',folderId:source?.folderId??(folders.some(f=>f.id===folder)?folder:null),deletedAt:null,updatedAt:new Date().toISOString(),revision:null};notes.unshift(note);remember(note);return note;}
async function loadNotebook(){
  if(loading)return;loading=true;$('insightStatus').textContent='正在同步笔记…';
  try{const result=await api('get');if(loaded&&(dirty.size||inflight.size)){$('insightStatus').textContent='正在保存本机修改…';return;}folders=result.folders||[];folderRevision=result.folderRevision;notes=result.notes||[];readDrafts();
    for(const [id,draft] of Object.entries(drafts)){if(!draft?.note)continue;const remote=notes.find(n=>n.id===id);if(remote&&(remote.revision??null)!==(draft.baseRevision??null))conflicts.add(id);const merged={...draft.note,updatedAt:draft.updatedAt,revision:remote?.revision??draft.baseRevision??null};if(remote)Object.assign(remote,merged);else notes.push(merged);dirty.add(id);}
    loaded=true;if(!notes.some(n=>n.id===selected))selected=notes.find(n=>!n.deletedAt)?.id||null;renderSidebar();renderEditor();$('insightStatus').textContent=dirty.size?'已恢复本机草稿':'已从云端同步';for(const id of dirty)saveNote(id);
  }catch(error){$('insightStatus').textContent=error.message;}
  finally{loading=false;}
}
function openFolder(id=null){editingFolder=id;const f=folders.find(x=>x.id===id);$('insightFolderTitle').textContent=id?'编辑分类组':'新建分类组';$('insightFolderName').value=f?.name||'';$('insightFolderParent').innerHTML=folderOptions(id);$('insightFolderParent').value=f?(f.parentId||''):(folders.some(x=>x.id===folder)?folder:'');$('deleteInsightFolder').classList.toggle('hidden',!id);$('insightFolderStatus').textContent='';$('insightFolderDialog').showModal();}
$('newInsightFolder').onclick=()=>{if(!loaded){$('insightStatus').textContent='请先完成云端同步';return;}openFolder();};$('closeInsightFolder').onclick=()=>$('insightFolderDialog').close();
$('insightFolderForm').onsubmit=async event=>{event.preventDefault();if(folderSaving)return;const name=$('insightFolderName').value.trim(),parentId=$('insightFolderParent').value||null;if(!name)return;const updated=folders.map(f=>({...f}));if(editingFolder)Object.assign(updated.find(f=>f.id===editingFolder),{name,parentId});else updated.push({id:crypto.randomUUID(),name,parentId});
  folderSaving=true;const submit=$('insightFolderForm').querySelector('[type="submit"]');submit.disabled=true;try{const result=await api('folders',{folders:updated,revision:folderRevision});folders=updated;folderRevision=result.revision;$('insightFolderDialog').close();renderSidebar();renderEditor();}catch(error){$('insightFolderStatus').textContent=error.message;}finally{folderSaving=false;submit.disabled=false;}
};
$('deleteInsightFolder').onclick=async()=>{if(folders.some(f=>f.parentId===editingFolder)||notes.some(n=>!n.deletedAt&&n.folderId===editingFolder)){$('insightFolderStatus').textContent='请先移动笔记和子分类组';return;}try{const updated=folders.filter(f=>f.id!==editingFolder),result=await api('folders',{folders:updated,revision:folderRevision});folders=updated;folderRevision=result.revision;if(folder===editingFolder)folder='all';$('insightFolderDialog').close();renderSidebar();renderEditor();}catch(error){$('insightFolderStatus').textContent=error.message;}};
$('newInsightNote').onclick=()=>{if(!loaded){$('insightStatus').textContent='正在同步，请稍后新建笔记';return;}folder=folder==='trash'?'all':folder;selectNote(makeNote().id);$('noteTitle')?.focus();};
$('insightSearch').oninput=renderSidebar;
$('toggleInsightDirectory').onclick=()=>document.querySelector('.insight-layout').classList.toggle('editing');
window.addEventListener('daybook-tab',event=>{active=event.detail==='insight';if(active&&!dirty.size&&!inflight.size)loadNotebook();});
window.addEventListener('online',()=>{for(const id of dirty)saveNote(id);if(active&&!loaded)loadNotebook();});
window.addEventListener('daybook-sync',async event=>{if(event.detail!=='insight')return;for(const id of [...dirty])await saveNote(id);if(!dirty.size&&!inflight.size)loadNotebook();});
window.addEventListener('focus',()=>{if(active&&!dirty.size&&!inflight.size)loadNotebook();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')for(const id of dirty)saveNote(id);});
setInterval(()=>{for(const id of dirty)saveNote(id);},30000);
if(new URLSearchParams(location.hash.slice(1)).get('tab')==='insight'){active=true;loadNotebook();}
