import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
let allUserProfiles = {};

// ============================================
// 1. AUTENTICAÇÃO & PERFIL
// ============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        document.getElementById('user-display').innerText = user.email;
        initAppData(user.uid);
        fetchGlobalProfiles();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/users`), (snap) => {
        const users = snap.val();
        if(users) {
            allUserProfiles = {};
            Object.keys(users).forEach(uid => { if(users[uid].profile) allUserProfiles[uid] = users[uid].profile; });
        }
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
            if(!name) return alert("Insira o nome.");
            const cr = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(db, `work_pro/users/${cr.user.uid}/profile`), { name, email });
        }
    } catch(e) { alert("Erro Auth: " + e.message); }
};
window.logout = () => signOut(auth);

// ============================================
// 2. NAVEGAÇÃO E ISOLAMENTO (INSTR. 1)
// ============================================
window.switchTab = (tabId) => {
    // Esconder todas as secções
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none'; // Forçar ocultação (display: none)
    });
    
    // Mostrar apenas a selecionada
    const target = document.getElementById(tabId);
    if(target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // Atualizar botões do menu
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.tab-item')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if(activeBtn) activeBtn.classList.add('active');

    window.scrollTo({ top: 0 });
};

// ============================================
// 3. SINCRONIZAÇÃO E FILTRAGEM ESTRITA
// ============================================
function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snap) => {
        const data = snap.val();
        allServices = data ? Object.keys(data).map(id => ({ id, ...data[id] })) : [];
        refreshUI();
    });

    onValue(ref(db, `work_pro/users/${uid}/inbox`), (snap) => {
        const data = snap.val();
        renderInbox(data ? Object.keys(data).map(id => ({ id, ...data[id] })) : []);
    });
}

function refreshUI() {
    filterToday();
    filterWeek();
    renderTasks();
    renderMonth();
    checkAlerts();
}

// INSTR 2: TAB HOJE (Data == Hoje)
function filterToday() {
    const list = document.getElementById('today-list');
    if(!list) return;
    list.innerHTML = ''; // Limpeza Estrita (INSTR. 1)

    const todayStr = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    const items = allServices.filter(s => s.date === todayStr);

    if(!items.length) {
        list.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Sem serviços para hoje.</p>';
        return;
    }
    items.sort((a,b) => (a.time||'').localeCompare(b.time||'')).forEach(s => list.appendChild(createServiceCard(s)));
}

// INSTR 2: TAB SEMANA (Hoje + 1 até Hoje + 7)
function filterWeek() {
    const container = document.getElementById('week-container');
    if(!container) return;
    container.innerHTML = ''; // Limpeza Estrita (INSTR. 1)

    const today = new Date();
    const tStr = today.toISOString().split('T')[0];
    const endWeek = new Date(); endWeek.setDate(today.getDate() + 7);
    const ewStr = endWeek.toISOString().split('T')[0];

    const weekItems = allServices.filter(s => s.date > tStr && s.date <= ewStr);
    
    if(!weekItems.length) {
        container.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Nada agendado para a semana.</p>';
        return;
    }

    const groups = {};
    weekItems.forEach(s => { if(!groups[s.date]) groups[s.date] = []; groups[s.date].push(s); });
    Object.keys(groups).sort().forEach(date => {
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' });
        container.appendChild(h);
        groups[date].forEach(s => container.appendChild(createServiceCard(s)));
    });
}

// INSTR 2: TAB TAREFAS (Sem Data/Hora)
function renderTasks() {
    const list = document.getElementById('tasks-list');
    if(!list) return;
    list.innerHTML = ''; // Limpeza (INSTR. 1)

    const tasks = allServices.filter(s => !s.date || s.date === "");
    if(!tasks.length) {
        list.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Lista de tarefas vazia.</p>';
        return;
    }
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if(!grid) return; grid.innerHTML = '';
    const tgt = new Date(); tgt.setMonth(tgt.getMonth() + monthOffset);
    const m = tgt.getMonth(), y = tgt.getFullYear();
    const days = new Date(y, m+1, 0).getDate();
    document.getElementById('month-label').innerText = tgt.toLocaleDateString('pt-PT', { month: 'long' });
    for(let i=1; i<=days; i++){
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const items = allServices.filter(s => s.date === ds);
        const el = document.createElement('div'); el.className = 'month-day'; el.innerHTML = `<span>${i}</span>`;
        if(items.length) { el.innerHTML += `<div class="day-dot"></div>`; el.onclick = () => (items.length===1)?openServiceModal(items[0]):openDaySelector(ds, items); }
        grid.appendChild(el);
    }
}

function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    items.forEach(it => {
        const d = document.createElement('div'); d.className = 'list-card';
        d.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span><span class="card-meta">De: ${it.senderName}</span></div><button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(d);
    });
}

// INSTR 4: ALERTA 4H FIXO (Persistence)
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let hasAlert = false;
    allServices.forEach(s => {
        if(!s.date || !s.time || !s.alertEnabled || s.status === 'transferred') return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if(diff > 0 && diff <= 4*60*60*1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${s.title} em breve!`;
            hasAlert = true;
        }
    });
    banner.style.display = hasAlert ? 'block' : 'none';
}

document.getElementById('dismiss-alert')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
});

// ============================================
// 4. TRANSFER & BUFFER 90MIN (INSTR. 3)
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.3;">Calculando buffer 90min...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';

    if(!currentServiceData.date || !currentServiceData.time) return list.innerHTML = '<p class="dtl-info">Data/Hora necessárias.</p>';

    const pStart = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const buffer = 150 * 60 * 1000; // Formula: 60m (serviço) + 90m (folga) = 150m total

    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';

    for(const uid of uids) {
        const uCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const acts = uCal.val() ? Object.values(uCal.val()) : [];
        const isOccupied = acts.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            if(a.date !== currentServiceData.date) return false;
            const actStart = new Date(`${a.date}T${a.time}`).getTime();
            return Math.abs(pStart - actStart) < buffer;
        });

        const card = document.createElement('div');
        card.className = 'list-card';
        card.style.opacity = isOccupied ? '0.4' : '1';
        card.innerHTML = `
            <div class="card-info">
                <span class="card-title"><span class="status-dot ${isOccupied?'status-busy':'status-free'}"></span>${allUserProfiles[uid].name}</span>
                <span class="card-meta">${isOccupied?'Ocupado (Buffer 90m)':'Disponível'}</span>
            </div>
            ${!isOccupied ? `<button class="primary-btn" style="width:auto; margin:0;" onclick="sendTransferInvitation('${uid}', this)">ENVIAR</button>` : ''}
        `;
        list.appendChild(card);
    }
};

window.sendTransferInvitation = async (targetUid, btn) => {
    const orig = btn.innerText; btn.innerText = 'Enviando...'; btn.disabled = true;
    try {
        const inv = { ...currentServiceData, senderUid: currentUser.uid, senderName: allUserProfiles[currentUser.uid].name, originalId: currentServiceData.id, sentAt: Date.now() };
        await push(ref(db, `work_pro/users/${targetUid}/inbox`), inv);
        
        btn.innerText = '✅ Enviado!';
        await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), { status: 'pending_acceptance' });
        
        setTimeout(() => { document.getElementById('transfer-modal').style.display = 'none'; closeModal(); }, 1500);
    } catch(e) {
        btn.innerText = orig; btn.disabled = false;
        alert("Erro no Firebase: " + e.message);
    }
};

window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const snap = await get(ref(db, `work_pro/users/${uid}/inbox/${inboxId}`));
    const item = snap.val();
    if(!item) return;
    try {
        await push(ref(db, `work_pro/users/${uid}/active`), { ...item, id: null, status: 'active' });
        await update(ref(db, `work_pro/users/${item.senderUid}/active/${item.originalId}`), {
            status: 'transferred', transferredToName: allUserProfiles[uid].name
        });
        await remove(ref(db, `work_pro/users/${uid}/inbox/${inboxId}`));
        alert("Serviço Aceite!"); closeModal();
    } catch(e) { alert("Erro: " + e.message); }
};

// ============================================
// 5. VISUAL & HELPERS (INSTR. 5)
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    const isTransferred = s.status === 'transferred';
    const isPending = s.status === 'pending_acceptance';
    
    card.className = 'list-card' + (isTransferred ? ' transferred' : '') + (isPending ? ' pending' : '');
    card.dataset.id = s.id;
    
    // INSTR 5: OPACITY 0.5 PARA TRANSFERIDOS
    if(isTransferred || isPending) card.style.opacity = '0.5';

    let label = '';
    if(isTransferred) label = `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>`;
    if(isPending) label = `<span class="card-transfer-label" style="color:var(--accent-gold)">⏳ Pendente de Aceitação</span>`;

    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'S/H'}</span></div>${label}</div><span style="opacity:0.2;">❯</span>`;
    return card;
}

document.addEventListener('click', (e) => {
    const c = e.target.closest('.list-card');
    if(c && c.dataset.id && !e.target.closest('button')) {
        const s = allServices.find(it => it.id === c.dataset.id);
        if(s) openServiceModal(s);
    }
});

window.openServiceModal = (s) => {
    currentServiceData = s; toggleEditMode(false);
    document.getElementById('dtl-title-display').innerText = s.title;
    document.getElementById('dtl-date').innerText = s.date || '--';
    document.getElementById('dtl-time').innerText = s.time || '--:--';
    document.getElementById('details-modal').style.display = 'flex';
};

window.closeModal = () => document.getElementById('details-modal').style.display = 'none';
window.toggleEditMode = (e) => {
    document.getElementById('dtl-view-mode').style.display = e?'none':'block';
    document.getElementById('dtl-edit-mode').style.display = e?'block':'none';
};
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };

document.getElementById('save-btn')?.addEventListener('click', async () => {
    const t = document.getElementById('adm-title').value;
    const d = document.getElementById('adm-date').value;
    if(!t) return alert("Título obrigatório.");
    const item = { 
        title: t, date: d, 
        time: document.getElementById('adm-time').value, 
        notes: document.getElementById('adm-notes').value,
        alertEnabled: document.getElementById('adm-alert').checked,
        status: 'active', createdAt: Date.now() 
    };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Salvo!'); 
    d ? switchTab('view-today') : switchTab('view-tasks');
});
