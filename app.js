import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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
let isFirstLoad = true;

console.log("[App] Inicializando Work Pro...");

// ============================================
// 1. AUTH & INITIALIZATION
// ============================================
onAuthStateChanged(auth, async (user) => {
    console.log("[Auth] Estado alterado:", user ? "Logado" : "Deslogado");
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        document.getElementById('user-display').innerText = user.email;
        
        // Garantir estrutura base para novos utilizadores
        await ensureBaseStructure(user);
        initAppData(user.uid);
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

async function ensureBaseStructure(user) {
    console.log("[Firebase] Verificando estrutura base...");
    const userRef = ref(db, `work_pro/users/${user.uid}`);
    // Usamos update para não apagar dados existentes
    await update(userRef, { 
        profile: { email: user.email, lastLogin: new Date().toISOString() }
    });
}

window.handleAuth = async (type) => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    if(!email || !pass) return alert("Preencha email e pass.");
    try {
        console.log(`[Auth] Tentando ${type}...`);
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { 
        console.error("[Auth] Erro:", e.code);
        alert("Erro: " + e.message); 
    }
};

window.logout = () => {
    console.log("[Auth] Saindo...");
    signOut(auth);
};

// ============================================
// 2. DATA SYNC (RECOVERY & RENDERING)
// ============================================
function initAppData(uid) {
    console.log("[Firebase] Iniciando Sync para UID:", uid);

    // Sync Serviços Ativos
    onValue(ref(db, `work_pro/users/${uid}/active`), (snapshot) => {
        console.log("[Firebase] Dados recebidos node: ACTIVE");
        const data = snapshot.val();
        allServices = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: false })) : [];
        
        if (isFirstLoad) {
            console.log("[App] Primeiro carregamento concluído.");
            isFirstLoad = false;
        }
        refreshUI();
    }, (error) => {
        console.error("[Firebase] Erro na leitura ACTIVE:", error);
    });

    // Sync Arquivo (Lixo)
    onValue(ref(db, `work_pro/users/${uid}/archived`), (snapshot) => {
        console.log("[Firebase] Dados recebidos node: ARCHIVED");
        const data = snapshot.val();
        const archived = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: true })) : [];
        renderArchive(archived);
        cleanupArchived(uid, archived);
    });

    // Sync Inbox
    onValue(ref(db, `work_pro/inbox/${uid}`), (snapshot) => {
        console.log("[Firebase] Dados recebidos node: INBOX");
        const data = snapshot.val();
        renderInbox(data ? Object.keys(data).map(id => ({ id, ...data[id] })) : []);
    });
}

function refreshUI() {
    console.log("[UI] Atualizando vistas...");
    renderToday();
    renderWeek();
    renderMonth();
    checkAlerts();
}

// ============================================
// 3. NAVIGATION SPA
// ============================================
window.navigate = (targetId) => {
    console.log("[Navigation] Indo para:", targetId);
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active'));
    
    const target = document.getElementById(targetId);
    if(target) target.classList.add('active');
    
    const tab = document.querySelector(`.tab-item[data-target="${targetId}"]`);
    if(tab) tab.classList.add('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Garantir que botões de tab funcionam sempre
document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        navigate(target);
    });
});

// ============================================
// 4. RENDERING LOGIC (TODAY, WEEK, MONTH)
// ============================================
function renderToday() {
    const list = document.getElementById('today-list');
    const dateLabel = document.getElementById('current-date');
    if (!list) return;

    dateLabel.innerText = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    list.innerHTML = '';
    
    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);
    
    if (items.length === 0) {
        list.innerHTML = '<p class="dtl-info" style="padding:20px; text-align:center; opacity:0.5;">Sem serviços agendados para hoje.</p>';
        return;
    }
    
    items.sort((a,b) => (a.time || '').localeCompare(b.time || '')).forEach(s => list.appendChild(createServiceCard(s)));
}

function renderWeek() {
    const container = document.getElementById('week-container');
    const label = document.getElementById('week-month-label');
    if (!container) return;
    
    container.innerHTML = '';
    const today = new Date();
    label.innerText = today.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

    const labels = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };

    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(today.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const dayItems = allServices.filter(s => s.date === dStr);
        
        const header = document.createElement('div');
        header.className = 'week-day-title';
        header.innerText = i === 0 ? 'Hoje' : (i === 1 ? 'Amanhã' : labels[d.getDay()]);
        container.appendChild(header);

        if (dayItems.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = "font-size:0.8rem; opacity:0.3; padding:10px;";
            empty.innerText = "Livre";
            container.appendChild(empty);
        } else {
            dayItems.forEach(s => container.appendChild(createServiceCard(s)));
        }
    }
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const target = new Date();
    target.setMonth(target.getMonth() + monthOffset);
    const month = target.getMonth(), year = target.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    document.getElementById('month-label').innerText = target.toLocaleDateString('pt-PT', { month: 'long' });
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

function createServiceCard(s) {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.dataset.id = s.id;
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'--:--'}</span></div></div><span style="opacity:0.2;">❯</span>`;
    return card;
}

// ============================================
// 5. MODAL & ALERTS
// ============================================
document.addEventListener('click', (e) => {
    const card = e.target.closest('.list-card');
    if (card && card.dataset.id && !e.target.closest('button')) {
        const s = allServices.find(it => it.id === card.dataset.id) || 
                  JSON.parse(card.dataset.fullData || 'null'); // Fallback para itens fora do Array sync
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
    const id = currentServiceData.id;
    await push(ref(db, `work_pro/users/${currentUser.uid}/archived`), { ...currentServiceData, deletedAt: Date.now() });
    await remove(ref(db, `work_pro/users/${currentUser.uid}/active/${id}`));
    closeModal();
}

// 4h Alert
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let hasAlert = false;
    allServices.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        const diff = new Date(`${ev.date}T${ev.time}`) - now;
        if (diff > 0 && diff <= 4*60*60*1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${ev.title} em breve!`;
            banner.style.display = 'block';
            hasAlert = true;
        }
    });
    if(!hasAlert) banner.style.display = 'none';
}

document.getElementById('confirm-presence')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
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
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };
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
function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    if(items.length === 0) {
        list.innerHTML = '<p class="dtl-info" style="padding:20px; opacity:0.3; text-align:center;">Sem convites.</p>';
        return;
    }
    items.forEach(it => {
        const div = document.createElement('div');
        div.className = 'list-card';
        div.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span></div><button class="banner-btn" style="background:var(--accent); color:#fff; width:auto;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(div);
    });
}
window.acceptService = async (id) => {
    const uid = currentUser.uid;
    const inboxRef = ref(db, `work_pro/inbox/${uid}/${id}`);
    onValue(inboxRef, async (snap) => {
        const item = snap.val();
        if(item) {
            await push(ref(db, `work_pro/users/${uid}/active`), item);
            await remove(inboxRef);
            alert("Aceite com sucesso!");
        }
    }, { onlyOnce: true });
};
