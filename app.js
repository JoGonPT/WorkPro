import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

console.log("[App] Início Work Pro...");

// ============================================
// 1. AUTH & ORDER (INSTR. 4)
// ============================================
onAuthStateChanged(auth, async (user) => {
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
    if(!email || !pass) return alert("Email/Senha vazios.");
    try {
        if(type === 'login') await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { alert("Auth Error: " + e.message); }
};

window.logout = () => signOut(auth);

// ============================================
// 2. DATA LISTENER & ERROR HANDLING (INSTR. 3)
// ============================================
function initAppData(uid) {
    console.log("[Firebase] Sync UID:", uid);

    // Sync Active Services
    onValue(ref(db, `work_pro/users/${uid}/active`), (snapshot) => {
        if (!snapshot.exists()) {
            console.warn("[Firebase] No data found for active services.");
            allServices = [];
        } else {
            const data = snapshot.val();
            allServices = Object.keys(data).map(id => ({ id, ...data[id], isArchived: false }));
        }
        refreshUI();
    }, (error) => {
        if(error.code === 'PERMISSION_DENIED') alert("Erro de Permissão: Verifica as Rules no Firebase.");
        console.error("[Firebase] Error:", error);
    });

    // Archive & Inbox Sync
    onValue(ref(db, `work_pro/users/${uid}/archived`), (snap) => {
        const data = snap.val();
        renderArchive(data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: true })) : []);
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
    checkAlerts();
}

// ============================================
// 3. SPA NAVIGATION (INSTR. 2)
// ============================================
window.showSection = (sectionId) => {
    console.log("[Navigation] Showing:", sectionId);
    
    // 1. Esconde todas as divs .tab-content
    document.querySelectorAll('.tab-content').forEach(div => div.classList.remove('active'));
    
    // 2. Mostra apenas a clicada
    const target = document.getElementById(sectionId);
    if(target) target.classList.add('active');

    // 3. Update tab active state
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
    // Encontrar o botão que tem o onclick apontando para este sectionId
    const activeTab = Array.from(document.querySelectorAll('.tab-item')).find(btn => btn.getAttribute('onclick')?.includes(sectionId));
    if(activeTab) activeTab.classList.add('active');

    window.scrollTo({ top: 0 });
};

// ============================================
// 4. RENDERING LOGIC
// ============================================
function renderToday() {
    const list = document.getElementById('today-list');
    const label = document.getElementById('current-date');
    if (!list) return;
    label.innerText = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    list.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);
    if (items.length === 0) return list.innerHTML = '<p class="dtl-info">Sem serviços para hoje.</p>';
    items.sort((a,b) => (a.time || '').localeCompare(b.time || '')).forEach(s => list.appendChild(createServiceCard(s)));
}

function renderWeek() {
    const container = document.getElementById('week-container');
    if (!container) return; container.innerHTML = '';
    const today = new Date();
    document.getElementById('week-month-label').innerText = today.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    const labels = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };

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
    const target = new Date(); target.setMonth(target.getMonth() + monthOffset);
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
        const s = allServices.find(it => it.id === card.dataset.id);
        if (s) openServiceModal(s);
    }
});

window.openServiceModal = (item) => {
    currentServiceData = item;
    toggleEditMode(false);
    document.getElementById('details-modal').style.display = 'flex';
    document.getElementById('dtl-title-display').innerText = item.title;
    document.getElementById('dtl-date').innerText = item.date || '--';
    document.getElementById('dtl-time').innerText = item.time || '--:--';
};

window.closeModal = () => document.getElementById('details-modal').style.display = 'none';
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };
window.toggleEditMode = (isE) => {
    document.getElementById('dtl-view-mode').style.display = isE ? 'none' : 'block';
    document.getElementById('dtl-edit-mode').style.display = isE ? 'block' : 'none';
};

function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    items.forEach(it => {
        const div = document.createElement('div');
        div.className = 'list-card';
        div.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span></div><button class="banner-btn" style="background:var(--accent); color:#fff; width:auto;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(div);
    });
}
function renderArchive(items) {
    const list = document.getElementById('archive-list');
    if(!list) return; list.innerHTML = '';
    items.forEach(it => list.appendChild(createServiceCard(it)));
}
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let has = false;
    allServices.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        const diff = new Date(`${ev.date}T${ev.time}`) - now;
        if (diff > 0 && diff <= 4*60*60*1000) has = true;
    });
    banner.style.display = has ? 'block' : 'none';
}
