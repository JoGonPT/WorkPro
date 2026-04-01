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
// 1. AUTH & PROFILES
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

window.handleAuth = async (type) => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    const name = document.getElementById('auth-name').value;
    if(!email || !pass) return alert("Email/Pass vazios.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else {
            if(!name) return alert("Insira o seu nome.");
            const cr = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(db, `work_pro/users/${cr.user.uid}/profile`), { name, email });
        }
    } catch(e) { alert("Erro Auth: " + e.message); }
};

window.logout = () => signOut(auth);

function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/users`), (snap) => {
        const users = snap.val();
        if(users) {
            allUserProfiles = {};
            Object.keys(users).forEach(uid => { if(users[uid].profile) allUserProfiles[uid] = users[uid].profile; });
        }
    });
}

// ============================================
// 2. DATA SYNC
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
    renderToday();
    renderWeek();
    renderMonth();
    renderTasks();
    checkAlerts();
}

// ============================================
// 3. TRANSFER INTELLIGENCE (90 MIN BUFFER)
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.3;">A calcular buffer de 90min...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';

    if(!currentServiceData.date || !currentServiceData.time) return list.innerHTML = '<p class="dtl-info">Não é possível transferir itens sem data/hora.</p>';

    const proposedBase = new Date(`${currentServiceData.date}T${currentServiceData.time}`).getTime();
    const buffer = 90 * 60 * 1000;
    const rangeStart = proposedBase - buffer;
    const rangeEnd = proposedBase + buffer;

    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';

    for(const uid of uids) {
        const profile = allUserProfiles[uid];
        const userCal = await get(ref(db, `work_pro/users/${uid}/active`));
        const activities = userCal.val() ? Object.values(userCal.val()) : [];
        
        // Regra de Segurança: 90min buffer
        const isBusy = activities.some(a => {
            if(!a.date || !a.time || a.status === 'transferred') return false;
            const actTime = new Date(`${a.date}T${a.time}`).getTime();
            // Se intersecta o intervalo de 180min (90 antes, 90 depois)
            return (actTime >= rangeStart && actTime <= rangeEnd);
        });

        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <div class="card-info">
                <span class="card-title"><span class="status-dot ${isBusy?'status-busy':'status-free'}"></span>${profile.name}</span>
                <span class="card-meta">${isBusy?'Ocupado (Buffer 90m)':'Livre / Disponível'}</span>
            </div>
            <button class="primary-btn" style="padding:10px 15px; margin:0;" onclick="sendTransferInvitation('${uid}')" ${isBusy?'disabled opacity="0.3"':''}>ENVIAR</button>
        `;
        list.appendChild(card);
    }
};

window.sendTransferInvitation = async (targetUid) => {
    const inv = { ...currentServiceData, senderUid: currentUser.uid, senderName: allUserProfiles[currentUser.uid].name, originalId: currentServiceData.id, sentAt: Date.now() };
    await push(ref(db, `work_pro/inbox/${targetUid}`), inv);
    alert("Enviado!"); document.getElementById('transfer-modal').style.display = 'none';
};

window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const snap = await get(ref(db, `work_pro/inbox/${uid}/${inboxId}`));
    const item = snap.val();
    if(!item) return alert("Indisponível.");

    await push(ref(db, `work_pro/users/${uid}/active`), { ...item, id: null, status: 'active' });
    await update(ref(db, `work_pro/users/${item.senderUid}/active/${item.originalId}`), {
        status: 'transferred', transferredToName: allUserProfiles[uid].name
    });
    await remove(ref(db, `work_pro/inbox/${uid}/${inboxId}`));
    alert("Aceite!"); closeModal();
};

// ============================================
// 4. RENDERING SPA
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    card.className = 'list-card' + (s.status === 'transferred' ? ' transferred' : '');
    card.dataset.id = s.id;
    let label = s.status === 'transferred' ? `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>` : '';
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'S/H'}</span></div>${label}</div><span style="opacity:0.2;">❯</span>`;
    return card;
}

function renderToday() {
    const list = document.getElementById('today-list');
    if(!list) return; list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === today);
    if(!items.length) list.innerHTML = '<p class="dtl-info">Livre hoje.</p>';
    items.sort((a,b) => (a.time||'').localeCompare(b.time||'')).forEach(s => list.appendChild(createServiceCard(s)));
}

function renderWeek() {
    const container = document.getElementById('week-container');
    if(!container) return; container.innerHTML = '';
    const today = new Date();
    document.getElementById('week-month-label').innerText = today.toLocaleDateString('pt-PT', { month:'long', year:'numeric' });
    for(let i=0; i<7; i++) {
        const d = new Date(); d.setDate(today.getDate()+i);
        const dStr = d.toISOString().split('T')[0];
        const dayItems = allServices.filter(s => s.date === dStr);
        const h = document.createElement('div'); h.className = 'week-day-title';
        h.innerText = i===0?'Hoje':(i===1?'Amanhã':d.toLocaleDateString('pt-PT',{weekday:'long'}));
        container.appendChild(h);
        dayItems.forEach(s => container.appendChild(createServiceCard(s)));
    }
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if(!grid) return; grid.innerHTML = '';
    const target = new Date(); target.setMonth(target.getMonth() + monthOffset);
    const m = target.getMonth(), y = target.getFullYear();
    const days = new Date(y, m+1, 0).getDate();
    document.getElementById('month-label').innerText = target.toLocaleDateString('pt-PT', { month:'long' });
    for(let i=1; i<=days; i++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const items = allServices.filter(s => s.date === ds);
        const el = document.createElement('div'); el.className = 'month-day'; el.innerHTML = `<span>${i}</span>`;
        if(items.length) { el.innerHTML += `<div class="day-dot"></div>`; el.onclick = () => (items.length===1)?openServiceModal(items[0]):openDaySelector(ds, items); }
        grid.appendChild(el);
    }
}

function renderTasks() {
    const list = document.getElementById('tasks-list');
    if(!list) return; list.innerHTML = '';
    const tasks = allServices.filter(s => !s.date);
    if(!tasks.length) list.innerHTML = '<p class="dtl-info">Sem tarefas pendentes.</p>';
    tasks.forEach(t => list.appendChild(createServiceCard(t)));
}

function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    if(!items.length) return list.innerHTML = '<p class="dtl-info">Nada por aqui.</p>';
    items.forEach(it => {
        const d = document.createElement('div'); d.className = 'list-card';
        d.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span><span class="card-meta">De: ${it.senderName}</span></div><button class="primary-btn" style="width:auto; margin:0;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(d);
    });
}

function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let has = false;
    allServices.forEach(s => {
        if(!s.date || !s.time || !s.alertEnabled || s.status === 'transferred') return;
        const diff = new Date(`${s.date}T${s.time}`).getTime() - now;
        if(diff > 0 && diff <= 4*60*60*1000) has = true;
    });
    banner.style.display = has ? 'block' : 'none';
}

// ============================================
// 5. UTILS
// ============================================
window.showSection = (id) => {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-item[onclick*="${id}"]`)?.classList.add('active');
    window.scrollTo({ top:0 });
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
    document.getElementById('dtl-date').innerText = s.date || 'S/D';
    document.getElementById('dtl-time').innerText = s.time || 'S/H';
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
    if(!t) return alert("Título obrigatório.");
    const item = { 
        title: t, 
        date: document.getElementById('adm-date').value, 
        time: document.getElementById('adm-time').value, 
        notes: document.getElementById('adm-notes').value, 
        alertEnabled: document.getElementById('adm-alert').checked,
        status: 'active', createdAt: Date.now() 
    };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Salvo!'); showSection('view-today');
});
