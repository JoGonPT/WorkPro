import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "viaz-1e406",
    storageBucket: "viaz-1e406.firebasestorage.app",
    messagingSenderId: "73407200033",
    appId: "1:73407200033:web:0fd45cbe87500fb4645c60",
    measurementId: "G-26YTWXHSTY"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let allServices = []; 
let currentServiceData = null; 
let monthOffset = 0;
let allUserProfiles = {}; // Map of UID -> { name, email }

// ============================================
// 1. AUTENTICAÇÃO & PERFIL (NOME ÚNICO - INSTR 1)
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        
        // Verifica se o utilizador já tem nome no diretório
        const dir = await get(ref(db, `work_pro/directory/${user.uid}`));
        if(!dir.exists() || !dir.val().name) {
             const fallbackName = user.displayName || user.email.split('@')[0];
             // Tenta gravar se for único, senão solicita
             const isUnique = await checkNameUniqueness(fallbackName, user.uid);
             if(isUnique) {
                 await ensureUserProfile(user, fallbackName);
             } else {
                 const newName = prompt("O seu nome padrão já está em uso. Por favor, introduza um nome único (Ex: Nome + Apelido):", fallbackName);
                 if(newName) {
                     const isNewUnique = await checkNameUniqueness(newName, user.uid);
                     if(isNewUnique) await ensureUserProfile(user, newName);
                     else alert("Como o nome não é único, as funções de transferência podem ficar limitadas.");
                 }
             }
        }

        const nameDisplay = (await get(ref(db, `work_pro/directory/${user.uid}/name`))).val() || user.email.split('@')[0];
        document.getElementById('user-display').innerText = nameDisplay;

        initAppData(user.uid);
        fetchGlobalProfiles();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

async function checkNameUniqueness(name, myUid) {
    const snap = await get(ref(db, `work_pro/directory`));
    const all = snap.val();
    if(!all) return true;
    return !Object.keys(all).some(uid => uid !== myUid && all[uid].name?.toLowerCase() === name.toLowerCase());
}

async function ensureUserProfile(user, name) {
    const isUnique = await checkNameUniqueness(name, user.uid);
    if(!isUnique) {
        alert("Este nome já está em uso por outro utilizador. Por favor, adiciona um sobrenome.");
        return false;
    }
    await updateProfile(user, { displayName: name });
    await update(ref(db, `work_pro/users/${user.uid}/profile`), { name, email: user.email });
    await update(ref(db, `work_pro/directory/${user.uid}`), { name, email: user.email });
    return true;
}

function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/directory`), (snap) => {
        allUserProfiles = snap.val() || {};
    });
}

window.handleAuth = async (type) => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    const name = document.getElementById('auth-name').value;
    if(!email || !pass) return alert("Preencha email e pass.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else {
            if(!name) return alert("O Nome é Obrigatório.");
            const isUnique = await checkNameUniqueness(name, "");
            if(!isUnique) return alert("Este nome já está em uso. Adicione um apelido.");
            const cr = await createUserWithEmailAndPassword(auth, email, pass);
            await ensureUserProfile(cr.user, name);
        }
    } catch(e) { alert("Erro Auth: " + e.message); }
};
window.logout = () => signOut(auth);

// ============================================
// 2. NAVEGAÇÃO E ISOLAMENTO (INSTR 5)
// ============================================
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none'; el.classList.remove('active');
    });
    const target = document.getElementById(tabId);
    if(target) { target.style.display = 'block'; target.classList.add('active'); }
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.tab-item')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if(activeBtn) activeBtn.classList.add('active');
    window.scrollTo({ top: 0 });
};

// ============================================
// 3. SINCRONIZAÇÃO E FILTRAGEM
// ============================================
function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snap) => {
        const data = snap.val();
        allServices = data ? Object.keys(data).map(id => ({ id, ...data[id], isFromInbox: false })) : [];
        refreshUI();
    });
    onValue(ref(db, `work_pro/users/${uid}/inbox`), (snap) => {
        const data = snap.val();
        renderInbox(data ? Object.keys(data).map(id => ({ id, ...data[id], isFromInbox: true })) : []);
    });
}

function refreshUI() { filterToday(); filterWeek(); renderTasks(); renderMonth(); checkAlerts(); }

function filterToday() {
    const list = document.getElementById('today-list'); if(!list) return; list.innerHTML = ''; 
    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);
    if(!items.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Livre hoje.</p>';
    items.sort((a,b)=>(a.time||'').localeCompare(b.time||'')).forEach(s => list.appendChild(createServiceCard(s)));
}

function filterWeek() {
    const cont = document.getElementById('week-container'); if(!cont) return; cont.innerHTML = '';
    const today = new Date(); const tStr = today.toISOString().split('T')[0];
    const endWeek = new Date(); endWeek.setDate(today.getDate() + 7);
    const ewStr = endWeek.toISOString().split('T')[0];
    const weekItems = allServices.filter(s => s.date > tStr && s.date <= ewStr);
    if(!weekItems.length) return cont.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Nada para a semana.</p>';
    const groups = {};
    weekItems.forEach(s => { if(!groups[s.date]) groups[s.date] = []; groups[s.date].push(s); });
    Object.keys(groups).sort().forEach(date => {
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' });
        cont.appendChild(h); groups[date].forEach(s => cont.appendChild(createServiceCard(s)));
    });
}

function renderTasks() {
    const list = document.getElementById('tasks-list'); if(!list) return; list.innerHTML = '';
    const tasks = allServices.filter(s => !s.date || s.date === "");
    if(!tasks.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Sem tarefas.</p>';
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderMonth() {
    const grid = document.getElementById('month-grid'); if(!grid) return; grid.innerHTML = '';
    const tgt = new Date(); tgt.setMonth(tgt.getMonth() + monthOffset);
    const m = tgt.getMonth(), y = tgt.getFullYear();
    const ds = new Date(y, m+1, 0).getDate();
    document.getElementById('month-label').innerText = tgt.toLocaleDateString('pt-PT', { month: 'long' });
    for(let i=1; i<=ds; i++){
        const dStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const items = allServices.filter(s => s.date === dStr);
        const el = document.createElement('div'); el.className = 'month-day'; el.innerHTML = `<span>${i}</span>`;
        if(items.length) { el.innerHTML += `<div class="day-dot"></div>`; el.onclick = () => (items.length===1)?openServiceModal(items[0]):openDaySelector(dStr, items); }
        grid.appendChild(el);
    }
}

// INBOX COM DETALHES COMPLETOS (INSTR 2)
function renderInbox(items) {
    const list = document.getElementById('inbox-list'); if(!list) return; list.innerHTML = '';
    if(!items.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Inbox Vazia.</p>';
    items.forEach(it => {
        const d = document.createElement('div'); d.className = 'list-card';
        d.innerHTML = `<div class="card-info" onclick="openServiceModal(JSON.parse('${JSON.stringify(it).replace(/'/g, "\\'")}'))"><span class="card-title">${it.title}</span><span class="card-meta">De: ${it.senderName}</span><span style="font-size:0.7rem; color:var(--accent);">Ver Detalhes do Convite</span></div><button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(d);
    });
}

function checkAlerts() {
    const now = Date.now(); const banner = document.getElementById('sticky-alert');
    let hasAlert = false;
    allServices.forEach(s => {
        if(!s.date || !s.time || !s.alertEnabled || s.status === 'transferred') return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if(diff > 0 && diff <= 4*60*60*1000) { document.getElementById('alert-msg').innerText = `🚨 ${s.title}!`; hasAlert = true; }
    });
    banner.style.display = hasAlert ? 'block' : 'none';
}

// ============================================
// 4. ACEITAÇÃO "CLONE PERFEITO" & BUFFER (INSTR 3 & 4)
// ============================================
window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const snap = await get(ref(db, `work_pro/users/${uid}/inbox/${inboxId}`));
    const item = snap.val();
    if(!item) return alert("Convite expirado.");

    try {
        // Validação de Buffer para o NOVO DONO (Instrução 4)
        const myCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const myActs = myCal.val() ? Object.values(myCal.val()) : [];
        const pStart = new Date(`${item.date}T${item.time}`).getTime();
        const buffer = 150 * 60 * 1000;
        
        const hasConflict = myActs.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            if(a.date !== item.date) return false;
            return Math.abs(pStart - new Date(`${a.date}T${a.time}`).getTime()) < buffer;
        });

        if(hasConflict) return alert("Não podes aceitar este serviço: Gera um conflito com a tua agenda (Buffer 90min).");

        // Clone Perfeito (Instrução 3)
        const newItem = { 
            title: item.title, date: item.date, time: item.time, notes: item.notes || "", 
            alertEnabled: item.alertEnabled || false, status: 'active', createdAt: Date.now() 
        };
        await push(ref(db, `work_pro/users/${uid}/active`), newItem);

        // Atualizar Remetente e Limpar Inbox
        const me = (await get(ref(db, `work_pro/directory/${uid}/name`))).val() || "Colega";
        await update(ref(db, `work_pro/users/${item.senderUid}/active/${item.originalId}`), {
            status: 'transferred', transferredToName: me 
        });
        await remove(ref(db, `work_pro/users/${uid}/inbox/${inboxId}`));
        
        alert("Serviço Aceite e Clonado com Sucesso!"); switchTab('view-today'); closeModal();
    } catch(e) { alert(e.message); }
};

// ============================================
// 5. TRANSFER & SELETOR
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="opacity:0.3;text-align:center;">Lendo diretório...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';
    const pStart = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const buffer = 150 * 60 * 1000;
    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';
    for(const uid of uids) {
        const profil = allUserProfiles[uid];
        const uCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const acts = uCal.val() ? Object.values(uCal.val()) : [];
        const isBusy = acts.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            if(a.date !== currentServiceData.date) return false;
            return Math.abs(pStart - new Date(`${a.date}T${a.time}`).getTime()) < buffer;
        });
        const d = document.createElement('div'); d.className = 'list-card'; d.style.opacity = isBusy ? '0.4' : '1';
        d.innerHTML = `<div class="card-info"><span class="card-title">${profil.name}</span><span class="card-meta">${isBusy?'Ocupado (Margem 90m)':'Disponível'}</span></div>${!isBusy ? `<button class="primary-btn" style="width:auto; margin:0;" onclick="sendTransferInvitation('${uid}', this)">ENVIAR</button>` : ''}`;
        list.appendChild(d);
    }
};

window.sendTransferInvitation = async (targetUid, btn) => {
    const me = (await get(ref(db, `work_pro/directory/${currentUser.uid}/name`))).val() || "Colega";
    btn.innerText = 'Enviando...'; btn.disabled = true;
    try {
        const inv = { ...currentServiceData, senderUid: currentUser.uid, senderName: me, originalId: currentServiceData.id, sentAt: Date.now() };
        await push(ref(db, `work_pro/users/${targetUid}/inbox`), inv);
        btn.innerText = '✅ Enviado!';
        await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), { status: 'pending_acceptance' });
        setTimeout(() => { document.getElementById('transfer-modal').style.display = 'none'; closeModal(); }, 1500);
    } catch(e) { btn.innerText = 'Erro'; btn.disabled = false; alert(e.message); }
};

// ============================================
// 6. VISUAL HELPERS
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    const isT = s.status === 'transferred'; const isP = s.status === 'pending_acceptance';
    card.className = 'list-card' + (isT ? ' transferred' : '') + (isP ? ' pending' : '');
    card.dataset.id = s.id; if(isT || isP) card.style.opacity = '0.5';
    let label = '';
    if(isT) label = `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>`;
    if(isP) label = `<span class="card-transfer-label" style="color:var(--accent-gold)">⏳ Pendente</span>`;
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'S/H'}</span></div>${label}</div><span style="opacity:0.2;">❯</span>`;
    return card;
}

document.addEventListener('click', (e) => {
    const c = e.target.closest('.list-card');
    if(c && c.dataset.id && !e.target.closest('button')) {
        const s = (allServices.concat(currentServiceData||[])).find(it => it && it.id === c.dataset.id);
        if(s) openServiceModal(s);
    }
});

window.openServiceModal = (s) => {
    currentServiceData = s; toggleEditMode(false);
    document.getElementById('dtl-title-display').innerText = s.title;
    document.getElementById('dtl-date').innerText = s.date || '--';
    document.getElementById('dtl-time').innerText = s.time || '--:--';
    document.getElementById('dtl-notes').innerText = s.notes || 'Sem notas.';
    document.getElementById('details-modal').style.display = 'flex';
};

window.closeModal = () => document.getElementById('details-modal').style.display = 'none';
window.toggleEditMode = (e) => {
    document.getElementById('dtl-view-mode').style.display = e?'none':'block';
    document.getElementById('dtl-edit-mode').style.display = e?'block':'none';
};
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };

document.getElementById('save-btn')?.addEventListener('click', async () => {
    const t = document.getElementById('adm-title').value; if(!t) return alert("Título necessário.");
    const item = { title: t, date: document.getElementById('adm-date').value, time: document.getElementById('adm-time').value, notes: document.getElementById('adm-notes').value, alertEnabled: document.getElementById('adm-alert').checked, status: 'active', createdAt: Date.now() };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Salvo!'); document.getElementById('adm-date').value ? switchTab('view-today') : switchTab('view-tasks');
});
