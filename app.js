import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app",
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

// ============================================
// 1. AUTENTICAÇÃO
// ============================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        document.getElementById('user-display').innerText = user.email;
        initAppData(user.uid);
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

window.handleAuth = async (type) => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    if(!email || !pass) return alert("Preencha os dados.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { alert("Erro de autenticação: " + e.message); }
};

window.logout = () => signOut(auth);

// ============================================
// 2. DATA SYNC (PER-USER)
// ============================================
function initAppData(uid) {
    // Escutar serviços ativos do utilizador
    onValue(ref(db, `work_pro/users/${uid}/active`), (snapshot) => {
        const data = snapshot.val();
        allServices = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: false })) : [];
        refreshUI();
    });

    // Escutar Arquivo
    onValue(ref(db, `work_pro/users/${uid}/archived`), (snapshot) => {
        const data = snapshot.val();
        const archived = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: true })) : [];
        renderArchive(archived);
        cleanupArchived(uid, archived);
    });

    // Escutar Inbox (Convites Recebidos)
    onValue(ref(db, `work_pro/inbox/${uid}`), (snapshot) => {
        const data = snapshot.val();
        renderInbox(data ? Object.keys(data).map(id => ({ id, ...data[id] })) : []);
    });
}

function refreshUI() {
    renderToday();
    renderWeek();
    renderMonth();
    checkAlerts();
}

// ============================================
// 3. RENDERING ENGINE
// ============================================
function renderToday() {
    const list = document.getElementById('today-list');
    if (!list) return; list.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);
    if (items.length === 0) return list.innerHTML = '<p class="dtl-info" style="padding:20px;">Sem serviços para hoje.</p>';
    items.sort((a,b) => (a.time || '').localeCompare(b.time || '')).forEach(s => list.appendChild(createServiceCard(s)));
}

function renderWeek() {
    const container = document.getElementById('week-container');
    if (!container) return; container.innerHTML = '';
    const labels = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };
    const today = new Date();
    document.getElementById('week-month-label').innerText = today.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(today.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const dayItems = allServices.filter(s => s.date === dStr);
        const header = document.createElement('div');
        header.className = 'week-day-title';
        header.innerText = i === 0 ? 'Hoje' : (i === 1 ? 'Amanhã' : labels[d.getDay()]);
        container.appendChild(header);
        dayItems.forEach(s => container.appendChild(createServiceCard(s)));
    }
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if (!grid) return; grid.innerHTML = '';
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    const month = targetDate.getMonth(), year = targetDate.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    document.getElementById('month-label').innerText = targetDate.toLocaleDateString('pt-PT', { month: 'long' });
    document.getElementById('year-label').innerText = year;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayItems = allServices.filter(s => s.date === dateStr);
        const dayEl = document.createElement('div');
        dayEl.className = 'month-day';
        dayEl.innerHTML = `<span>${day}</span>`;
        if (dayItems.length > 0) {
            dayEl.innerHTML += `<div class="day-dot" style="width:${Math.min(4+dayItems.length, 10)}px;"></div>`;
            dayEl.onclick = () => (dayItems.length === 1) ? openServiceModal(dayItems[0]) : openDaySelector(dateStr, dayItems);
        }
        grid.appendChild(dayEl);
    }
}

function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    if(items.length === 0) return list.innerHTML = '<p class="dtl-info" style="padding:20px;">Inbox vazia.</p>';
    items.forEach(it => {
        const div = document.createElement('div');
        div.className = 'list-card';
        div.style.borderLeftColor = 'var(--accent-gold)';
        div.innerHTML = `
            <div class="card-info">
                <span class="card-title">${it.title}</span>
                <span class="card-meta">Enviado por: ${it.senderEmail || 'Desconhecido'}</span>
            </div>
            <button class="banner-btn" style="background:var(--accent); color:#fff;" onclick="acceptService('${it.id}')">ACEITAR</button>
        `;
        list.appendChild(div);
    });
}

function createServiceCard(s) {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.dataset.id = s.id;
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'--:--'}</span></div></div><span style="opacity:0.2;">❯</span>`;
    return card;
}

// ============================================
// 4. LOGICA DE CONVITES (FIRST-COME-FIRST-SERVED)
// ============================================
window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const inboxRef = ref(db, `work_pro/inbox/${uid}/${inboxId}`);
    
    onValue(inboxRef, async (snap) => {
        const item = snap.val();
        if(!item) return; // Alguém já aceitou e foi removido ou erro
        
        try {
            // Transactional move: se falhar aqui é porque o item sumiu
            await remove(inboxRef);
            await push(ref(db, `work_pro/users/${uid}/active`), { ...item, acceptedAt: Date.now() });
            navigator.vibrate([100, 50, 100]);
            alert("Serviço aceite e adicionado à sua agenda!");
        } catch(e) { alert("Este serviço já não está disponível."); }
    }, { onlyOnce: true });
};

// ============================================
// 5. MODAL ENGINE & ALERTS
// ============================================
document.addEventListener('click', (e) => {
    const card = e.target.closest('.list-card');
    if (card && card.dataset.id && !e.target.closest('button')) {
        const s = allServices.find(it => it.id === card.dataset.id);
        if (s) openServiceModal(s);
    }
});

window.openServiceModal = (item) => {
    currentServiceData = item;
    toggleEditMode(false);
    document.getElementById('day-selector-modal').style.display = 'none'; 
    document.getElementById('dtl-title-display').innerText = item.title;
    document.getElementById('dtl-date').innerText = item.date || '--';
    document.getElementById('dtl-time').innerText = item.time || '--:--';
    document.getElementById('dtl-notes').innerText = item.notes || 'Sem notas.';
    document.getElementById('dtl-alert-status').style.display = item.alertEnabled ? 'inline-block' : 'none';
    document.querySelector('.modal-footer-actions').style.display = item.isArchived ? 'none' : 'flex';
    document.getElementById('details-modal').style.display = 'flex';
};

window.saveChanges = async () => {
    const upd = {
        title: document.getElementById('edit-title').value,
        date: document.getElementById('edit-date').value,
        time: document.getElementById('edit-time').value,
        notes: document.getElementById('edit-notes').value,
        alertEnabled: document.getElementById('edit-alert').checked
    };
    await update(ref(db, `work_pro/users/${currentUser.uid}/active/${currentServiceData.id}`), upd);
    closeModal();
};

window.confirmDelete = () => {
    if(confirm("Deseja ARQUIVAR?")) archiveService();
};

async function archiveService() {
    const uid = currentUser.uid;
    const id = currentServiceData.id;
    await push(ref(db, `work_pro/users/${uid}/archived`), { ...currentServiceData, deletedAt: Date.now() });
    await remove(ref(db, `work_pro/users/${uid}/active/${id}`));
    closeModal();
}

// 4h Alert Persistence
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let hasCritical = false;

    allServices.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        const diff = new Date(`${ev.date}T${ev.time}`) - now;
        if (diff > 0 && diff <= 4*60*60*1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${ev.title} em ${Math.round(diff/60000)} min!`;
            banner.style.display = 'block';
            hasCritical = true;
        }
    });

    if(!hasCritical) banner.style.display = 'none';
}

document.getElementById('confirm-presence')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
    navigator.vibrate(100);
});

// Admin Save
document.getElementById('save-btn')?.addEventListener('click', async () => {
    const d = document.getElementById('adm-date').value;
    const t = document.getElementById('adm-title').value;
    if(!d || !t) return alert("Preecha Título e Data.");
    const item = { title: t, date: d, time: document.getElementById('adm-time').value, notes: document.getElementById('adm-notes').value, alertEnabled: document.getElementById('adm-alert').checked, createdAt: new Date().toISOString() };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Serviço agendado!');
});

// Utils
window.closeModal = () => document.getElementById('details-modal').style.display = 'none';
window.openDaySelector = (dateStr, items) => {
    document.getElementById('selector-date-display').innerText = `Serviços em ${dateStr}`;
    const list = document.getElementById('selector-list');
    list.innerHTML = '';
    items.forEach(s => list.appendChild(createServiceCard(s)));
    document.getElementById('day-selector-modal').style.display = 'flex';
};
window.toggleEditMode = (isE) => {
    document.getElementById('dtl-view-mode').style.display = isE ? 'none' : 'block';
    document.getElementById('dtl-edit-mode').style.display = isE ? 'block' : 'none';
    if(isE){
        document.getElementById('edit-title').value = currentServiceData.title;
        document.getElementById('edit-date').value = currentServiceData.date;
        document.getElementById('edit-time').value = currentServiceData.time;
        document.getElementById('edit-notes').value = currentServiceData.notes || '';
        document.getElementById('edit-alert').checked = currentServiceData.alertEnabled;
    }
};
function cleanupArchived(uid, archived) {
    const limit = Date.now() - (60 * 24 * 60 * 60 * 1000);
    archived.forEach(it => { if(it.deletedAt < limit) remove(ref(db, `work_pro/users/${uid}/archived/${it.id}`)); });
}
function renderArchive(items) {
    const list = document.getElementById('archive-list');
    if(!list) return; list.innerHTML = '';
    items.sort((a,b) => b.deletedAt - a.deletedAt).forEach(it => {
        const card = createServiceCard(it);
        card.classList.add('archived-item');
        list.appendChild(card);
    });
}
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };
window.navigate = (targetId) => {
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active'));
    document.getElementById(targetId)?.classList.add('active');
    document.querySelector(`.tab-item[data-target="${targetId}"]`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
