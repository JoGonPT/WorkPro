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
// 1. AUTH & SETUP (INSTR. 4)
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

// Login/Signup
window.handleAuth = async (type) => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    const name = document.getElementById('auth-name').value;
    if(!email || !pass) return alert("Email/Senha vazios.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else {
            if(!name) return alert("Insira o seu nome.");
            const cr = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(db, `work_pro/users/${cr.user.uid}/profile`), { name, email });
        }
    } catch(e) { alert("Erro: " + e.message); }
};
window.logout = () => signOut(auth);

// ============================================
// 2. DATA SYNC (INSTR. 1 & 2)
// ============================================
function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snap) => {
        const data = snap.val();
        allServices = data ? Object.keys(data).map(id => ({ id, ...data[id] })) : [];
        refreshUI();
    });

    onValue(ref(db, `work_pro/inbox/${uid}`), (snap) => {
        const data = snap.val();
        renderInbox(data ? Object.keys(data).map(id => ({ id, ...data[id] })) : []);
    });
}

function refreshUI() {
    // Rendereização segmentada estrita
    filterToday();
    filterWeek();
    renderMonth();
    renderTasks();
    checkAlerts();
}

// Filter Hoje (INSTR. 2)
function filterToday() {
    const list = document.getElementById('today-list');
    if(!list) return; 
    list.innerHTML = ''; // Limpeza de contentor (INSTR. 1)

    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);

    if(!items.length) {
        list.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Livre hoje.</p>';
        return;
    }
    items.sort((a,b) => (a.time||'').localeCompare(b.time||'')).forEach(s => list.appendChild(createServiceCard(s)));
}

// Filter Semana (Hoje + 1 até Hoje + 7) (INSTR. 2)
function filterWeek() {
    const container = document.getElementById('week-container');
    if(!container) return;
    container.innerHTML = ''; // Limpeza (INSTR. 1)

    const today = new Date();
    const tStr = today.toISOString().split('T')[0];
    const next7 = new Date(); next7.setDate(today.getDate() + 7);
    const n7Str = next7.toISOString().split('T')[0];

    // Filtrar estritamente entre amanhã e daqui a 7 dias
    const weekItems = allServices.filter(s => s.date > tStr && s.date <= n7Str);
    
    if(!weekItems.length) {
        container.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Sem serviços nos próximos 7 dias.</p>';
        return;
    }

    // Renderizar por dia agrupado
    const days = {};
    weekItems.forEach(s => { if(!days[s.date]) days[s.date] = []; days[s.date].push(s); });
    
    Object.keys(days).sort().forEach(date => {
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = new Date(date + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' });
        container.appendChild(h);
        days[date].forEach(s => container.appendChild(createServiceCard(s)));
    });
}

// Filter Tarefas (!date && !time) (INSTR. 2)
function renderTasks() {
    const list = document.getElementById('tasks-list');
    if(!list) return;
    list.innerHTML = ''; // Limpeza (INSTR. 1)

    const tasks = allServices.filter(s => !s.date || s.date === "");
    if(!tasks.length) {
        list.innerHTML = '<p class="dtl-info" style="opacity:0.3; text-align:center; padding:20px;">Nenhuma tarefa pendente.</p>';
        return;
    }
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if(!grid) return; grid.innerHTML = '';
    const target = new Date(); target.setMonth(target.getMonth() + monthOffset);
    const m = target.getMonth(), y = target.getFullYear();
    const daysArr = new Date(y, m+1, 0).getDate();
    document.getElementById('month-label').innerText = target.toLocaleDateString('pt-PT', { month: 'long' });
    
    for(let i=1; i<=daysArr; i++) {
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
        const card = document.createElement('div'); card.className = 'list-card';
        card.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span><span class="card-meta">Enviado por: ${it.senderName}</span></div><button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(card);
    });
}

// Alert 4h Sticky (INSTR. 4)
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let activeAlert = false;
    allServices.forEach(s => {
        if(!s.date || !s.time || !s.alertEnabled || s.status === 'transferred') return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if(diff > 0 && diff <= 4*60*60*1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${s.title} às ${s.time}`;
            activeAlert = true;
        }
    });
    banner.style.display = activeAlert ? 'block' : 'none';
}

// Confirm Presence (INSTR. 4)
document.getElementById('confirm-presence')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
    alert("Presença confirmada!");
});

// ============================================
// 3. TRANSFER LOGIC (90 MIN BUFFER) (INSTR. 3)
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.3;">A validar margem de 90min...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';

    const proposedTime = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const buffer = 90 * 60 * 1000;
    const safeGap = 150 * 60 * 1000; // 60m duração + 90m buffer

    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';

    for(const uid of uids) {
        const uCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const activities = uCal.val() ? Object.values(uCal.val()) : [];
        const isOccupied = activities.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            if(a.date !== currentServiceData.date) return false;
            const actStart = new Date(`${a.date}T${a.time}`).getTime();
            return Math.abs(proposedTime - actStart) < safeGap;
        });

        const card = document.createElement('div');
        card.className = 'list-card';
        card.style.opacity = isOccupied ? '0.4' : '1';
        card.innerHTML = `
            <div class="card-info">
                <span class="card-title"><span class="status-dot ${isOccupied?'status-busy':'status-free'}"></span>${allUserProfiles[uid].name}</span>
                <span class="card-meta">${isOccupied?'Ocupado (Buffer 90m)':'Disponível'}</span>
            </div>
            ${!isOccupied ? `<button class="primary-btn" style="width:auto; margin:0;" onclick="sendTransferInvitation('${uid}')">ENVIAR</button>` : ''}
        `;
        list.appendChild(card);
    }
};

window.sendTransferInvitation = async (targetUid) => {
    const inv = { ...currentServiceData, senderUid: currentUser.uid, senderName: allUserProfiles[currentUser.uid].name, originalId: currentServiceData.id, sentAt: Date.now() };
    await push(ref(db, `work_pro/inbox/${targetUid}`), inv);
    alert("Transferência solicitada!");
    document.getElementById('transfer-modal').style.display = 'none';
};

window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const snap = await get(ref(db, `work_pro/inbox/${uid}/${inboxId}`));
    const item = snap.val();
    if(!item) return;

    await push(ref(db, `work_pro/users/${uid}/active`), { ...item, id: null, status: 'active' });
    await update(ref(db, `work_pro/users/${item.senderUid}/active/${item.originalId}`), {
        status: 'transferred', transferredToName: allUserProfiles[uid].name
    });
    await remove(ref(db, `work_pro/inbox/${uid}/${inboxId}`));
    alert("Serviço aceite!"); closeModal();
};

// ============================================
// 4. UI HELPERS & VISUALS (INSTR. 5)
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    const isTransferred = s.status === 'transferred';
    card.className = 'list-card' + (isTransferred ? ' transferred' : '');
    card.dataset.id = s.id;
    
    // Aplicar opacidade 0.5 via style ou classe (INSTR. 5)
    if (isTransferred) card.style.opacity = '0.5';

    let label = isTransferred ? `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>` : '';
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'S/H'}</span></div>${label}</div><span style="opacity:0.2;">❯</span>`;
    return card;
}

window.showSection = (id) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-item[onclick*="${id}"]`)?.classList.add('active');
    window.scrollTo({ top: 0 });
};

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
        title: t, 
        date: d, 
        time: document.getElementById('adm-time').value, 
        notes: document.getElementById('adm-notes').value,
        alertEnabled: document.getElementById('adm-alert').checked,
        status: 'active', createdAt: Date.now() 
    };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Salvo!'); d ? showSection('view-today') : showSection('view-tasks');
});
