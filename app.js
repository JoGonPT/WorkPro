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
// 1. AUTENTICAÇÃO & NOMES ÚNICOS (INSTR 3)
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        
        // Verifica se o utilizador já tem um nome regitrado no diretório central
        const myName = (await get(ref(db, `work_pro/directory/${user.uid}/name`))).val();
        
        if(!myName) {
            const fallback = user.displayName || user.email.split('@')[0];
            const isUnique = await checkUniqueName(fallback, user.uid);
            if(isUnique) { await saveIdentity(user, fallback); }
            else {
                const asked = prompt("O seu nome padrão já está em uso. Escolha um nome único (Ex: Nome + Sobrenome):", fallback);
                if(asked && await checkUniqueName(asked, user.uid)) await saveIdentity(user, asked);
                else alert("Atenção: Nome não é único. As funções de rede podem falhar.");
            }
        }

        const nameLabel = (await get(ref(db, `work_pro/directory/${user.uid}/name`))).val() || user.email.split('@')[0];
        document.getElementById('user-display').innerText = nameLabel;

        initAppData(user.uid);
        fetchGlobalProfiles();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

async function checkUniqueName(name, myUid) {
    const snap = await get(ref(db, `work_pro/directory`));
    const all = snap.val();
    if(!all) return true;
    return !Object.keys(all).some(uid => uid !== myUid && all[uid].name?.toLowerCase() === name.toLowerCase());
}

async function saveIdentity(user, name) {
    if(!(await checkUniqueName(name, user.uid))) return alert("Nome já em uso!");
    await updateProfile(user, { displayName: name });
    const payload = { name: name, email: user.email, updatedAt: Date.now() };
    await update(ref(db, `work_pro/users/${user.uid}/profile`), payload);
    await update(ref(db, `work_pro/directory/${user.uid}`), payload);
}

function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/directory`), (snap) => { allUserProfiles = snap.val() || {}; });
}

window.handleAuth = async (type) => {
    const e = document.getElementById('auth-email').value, p = document.getElementById('auth-pass').value, n = document.getElementById('auth-name').value;
    if(!e || !p) return alert("Preecha campos.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, e, p);
        else {
            if(!n) return alert("Nome obrigatório.");
            if(!(await checkUniqueName(n, ""))) return alert("Nome já em uso. Escolha outro.");
            const cr = await createUserWithEmailAndPassword(auth, e, p);
            await saveIdentity(cr.user, n);
        }
    } catch(err) { alert(err.message); }
};
window.logout = () => signOut(auth);

// ============================================
// 2. NAVEGAÇÃO SPA (ISOLAMENTO TOTAL)
// ============================================
window.switchTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    const target = document.getElementById(id);
    if(target) { target.style.display = 'block'; target.classList.add('active'); }
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.tab-item')).find(x => x.getAttribute('onclick')?.includes(id));
    if(btn) btn.classList.add('active');
    window.scrollTo({ top: 0 });
};

// ============================================
// 3. DATA RENDERING (STRICT FILTERS)
// ============================================
function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snap) => {
        allServices = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })) : [];
        refreshUI();
    });
    onValue(ref(db, `work_pro/users/${uid}/inbox`), (snap) => {
        const inboxItems = snap.exists() ? Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k], isInbox: true })) : [];
        renderInbox(inboxItems);
    });
}

function refreshUI() { filterToday(); filterWeek(); renderTasks(); renderMonth(); checkAlerts(); }

function filterToday() {
    const list = document.getElementById('today-list'); if(!list) return; list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === today);
    if(!items.length) { list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Livre hoje (Ok).</p>'; return; }
    items.sort((a,b)=>(a.time||'').localeCompare(b.time||'')).forEach(s => list.appendChild(createServiceCard(s)));
}

function filterWeek() {
    const cont = document.getElementById('week-container'); if(!cont) return; cont.innerHTML = '';
    const today = new Date(); const tStr = today.toISOString().split('T')[0];
    const next7 = new Date(); next7.setDate(today.getDate()+7); const n7Str = next7.toISOString().split('T')[0];
    const items = allServices.filter(s => s.date > tStr && s.date <= n7Str);
    if(!items.length) { cont.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Sem serviços agendados para a semana.</p>'; return; }
    const grps = {}; items.forEach(s => { if(!grps[s.date]) grps[s.date] = []; grps[s.date].push(s); });
    Object.keys(grps).sort().forEach(d => {
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', {weekday:'long', day:'numeric', month:'short'});
        cont.appendChild(h); grps[d].forEach(s => cont.appendChild(createServiceCard(s)));
    });
}

function renderTasks() {
    const list = document.getElementById('tasks-list'); if(!list) return; list.innerHTML = '';
    const tasks = allServices.filter(s => !s.date || s.date === "");
    if(!tasks.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Backlog Vazio.</p>';
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderMonth() {
    const grid = document.getElementById('month-grid'); if(!grid) return; grid.innerHTML = '';
    const tgt = new Date(); tgt.setMonth(tgt.getMonth() + monthOffset);
    const m = tgt.getMonth(), y = tgt.getFullYear();
    const ds = new Date(y, m+1, 0).getDate();
    document.getElementById('month-label').innerText = tgt.toLocaleDateString('pt-PT', {month:'long'});
    for(let i=1; i<=ds; i++){
        const dsStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const items = allServices.filter(s => s.date === dsStr);
        const el = document.createElement('div'); el.className = 'month-day'; el.innerHTML = `<span>${i}</span>`;
        if(items.length) { el.innerHTML += `<div class="day-dot"></div>`; el.onclick = () => (items.length===1)?openServiceModal(items[0]):openDaySelector(dsStr, items); }
        grid.appendChild(el);
    }
}

// INSTR 2: ABRIR DETALHES NA INBOX
function renderInbox(items) {
    const list = document.getElementById('inbox-list'); if(!list) return; list.innerHTML = '';
    if(!items.length) return list.innerHTML = '<p class="dtl-info" style="opacity:0.3;text-align:center;padding:20px;">Caixa de Entrada Vazia.</p>';
    items.forEach(it => {
        const card = document.createElement('div'); card.className = 'list-card';
        card.innerHTML = `<div class="card-info" style="cursor:pointer" id="inbox-card-${it.id}"><span class="card-title">${it.title}</span><span class="card-meta">De: ${it.senderName}</span><span style="font-size:0.7rem; color:var(--accent); font-weight:600;">Ver Detalhes do Convite</span></div><button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(card);
        document.getElementById(`inbox-card-${it.id}`).onclick = () => openServiceModal(it); // Instrução 2
    });
}

function checkAlerts() {
    const now = Date.now(); const banner = document.getElementById('sticky-alert');
    let has = false;
    allServices.forEach(s => {
        if(!s.date || !s.time || !s.alertEnabled || s.status === 'transferred') return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if(diff > 0 && diff <= 4*60*60*1000) { document.getElementById('alert-msg').innerText = `🚨 ${s.title} em breve!`; has = true; }
    });
    banner.style.display = has ? 'block' : 'none';
}

// ============================================
// 4. ACEITAR SERVIÇO (CLONE + ATOMIC) (INSTR 1, 4, 5)
// ============================================
window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const inboxRef = ref(db, `work_pro/users/${uid}/inbox/${inboxId}`);
    const snap = await get(inboxRef);
    const it = snap.val();
    
    // Fix: Erro 'Já Expirou' (Instrução 1)
    if(!snap.exists() || !it) return alert("Este serviço já expirou ou foi aceite por outro colega.");

    // INSTR 5: MARGEM 90 MIN DE SEGURANÇA (VERIFICAR DONO NOVO)
    const pStart = new Date(`${it.date}T${it.time}`).getTime();
    const safetyGap = 150 * 60 * 1000; // 60m duração + 90m buffer
    const conflict = allServices.some(s => {
        if(!s.date || !s.time || s.status === 'transferred') return false;
        if(s.date !== it.date) return false;
        return Math.abs(pStart - new Date(`${s.date}T${s.time}`).getTime()) < safetyGap;
    });

    if(conflict) return alert("Não podes aceitar este serviço devido a conflito de horário (Margem < 90min).");

    try {
        // INSTR 1 & 4: CLONE PERFEITO + ATOMIC UPDATE
        const myName = (await get(ref(db, `work_pro/directory/${uid}/name`))).val() || "Colega";
        
        // Objeto de Novos Dados
        const updates = {};
        const newRef = push(ref(db, `work_pro/users/${uid}/active`));
        
        // 1. Gravar novo dono (Instrução 4: Clone Integral)
        updates[`work_pro/users/${uid}/active/${newRef.key}`] = { 
            title: it.title, date: it.date, time: it.time, notes: it.notes || "", 
            alertEnabled: it.alertEnabled || false, status: 'active', createdAt: Date.now() 
        };
        
        // 2. Atualizar remetente (Instrução 4: Status Transferido)
        updates[`work_pro/users/${it.senderUid}/active/${it.originalId}`] = {
            status: 'transferred', transferredToName: myName 
        };
        
        // 3. Limpar Inbox
        updates[`work_pro/users/${uid}/inbox/${inboxId}`] = null;

        // Executar Transação Atómica (Instrução 1)
        await update(ref(db), updates);
        
        alert("Serviço Aceite e Clonado com Sucesso!"); switchTab('view-today'); closeModal();
    } catch(err) { alert("Erro Crítico ao Aceitar: " + err.message); }
};

// ============================================
// 5. TRANSFER & AVAIABILITY
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="opacity:0.3;text-align:center;padding:20px;">Lendo diretório de colegas...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';
    const pStart = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const gap = 150 * 60 * 1000;
    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';
    for(const uid of uids) {
        const profil = allUserProfiles[uid];
        const uCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const acts = uCal.val() ? Object.values(uCal.val()) : [];
        const isBusy = acts.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            if(a.date !== currentServiceData.date) return false;
            return Math.abs(pStart - new Date(`${a.date}T${a.time}`).getTime()) < gap;
        });
        const d = document.createElement('div'); d.className = 'list-card'; d.style.opacity = isBusy ? '0.4' : '1';
        d.innerHTML = `<div class="card-info"><span class="card-title">${profil.name}</span><span class="card-meta">${isBusy?'Ocupado (Margem < 90m)':'Disponível'}</span></div>${!isBusy ? `<button class="primary-btn" style="width:auto; margin:0;" onclick="sendTransferInvitation('${uid}', this)">ENVIAR</button>` : ''}`;
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
    } catch(err) { btn.disabled = false; btn.innerText = 'Erro'; alert(err.message); }
};

// ============================================
// 6. VISUALS & DETALHES
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
        const s = (allServices).find(it => it.id === c.dataset.id);
        if(s) openServiceModal(s);
    }
});

window.openServiceModal = (s) => {
    currentServiceData = s; toggleEditMode(false);
    document.getElementById('dtl-title-display').innerText = s.title;
    document.getElementById('dtl-date').innerText = s.date || '--';
    document.getElementById('dtl-time').innerText = s.time || '--:--';
    document.getElementById('dtl-notes').innerText = s.notes || 'Sem notas registradas.';
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
    alert('Salvo!'); switchTab('view-today');
});
