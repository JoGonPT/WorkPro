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
// 1. AUTH & PROFILE SETUP
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
    if(!email || !pass) return alert("Preecha Email e Pass.");
    
    try {
        if(type === 'login') {
            await signInWithEmailAndPassword(auth, email, pass);
        } else {
            if(!name) return alert("Insira o seu nome para o perfil.");
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await set(ref(db, `work_pro/users/${cred.user.uid}/profile`), { name, email });
        }
    } catch(e) { alert("Erro de Autenticação: " + e.message); }
};

window.logout = () => signOut(auth);

// ============================================
// 2. DATA LISTENERS & PROFILES
// ============================================
function fetchGlobalProfiles() {
    onValue(ref(db, `work_pro/users`), (snapshot) => {
        const users = snapshot.val();
        if(users) {
            allUserProfiles = {};
            Object.keys(users).forEach(uid => {
                if(users[uid].profile) allUserProfiles[uid] = users[uid].profile;
            });
        }
    });
}

function initAppData(uid) {
    onValue(ref(db, `work_pro/users/${uid}/active`), (snapshot) => {
        if (!snapshot.exists()) {
            allServices = [];
        } else {
            const data = snapshot.val();
            allServices = Object.keys(data).map(id => ({ id, ...data[id], isArchived: false }));
        }
        refreshUI();
    });

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
// 3. TRANSFER LOGIC (FREE/BUSY)
// ============================================
window.openTransferSelector = async () => {
    const list = document.getElementById('users-availability-list');
    list.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.5;">Verificando disponibilidade...</p>';
    document.getElementById('transfer-modal').style.display = 'flex';

    const uids = Object.keys(allUserProfiles).filter(uid => uid !== currentUser.uid);
    list.innerHTML = '';

    for(const uid of uids) {
        const profile = allUserProfiles[uid];
        // Check if busy on this date/time
        const userCalendar = await get(ref(db, `work_pro/users/${uid}/active`));
        const activities = userCalendar.val() ? Object.values(userCalendar.val()) : [];
        const isBusy = activities.some(a => a.date === currentServiceData.date && a.time === currentServiceData.time);

        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <div class="card-info">
                <span class="card-title"><span class="status-dot ${isBusy?'status-busy':'status-free'}"></span>${profile.name}</span>
                <span class="card-meta">${isBusy?'Ocupado':'Disponível'}</span>
            </div>
            <button class="primary-btn" style="padding:10px 15px; margin:0;" onclick="sendTransferInvitation('${uid}')">ENVIAR</button>
        `;
        list.appendChild(card);
    }
};

window.sendTransferInvitation = async (targetUid) => {
    const senderProfile = allUserProfiles[currentUser.uid];
    const invitation = {
        ...currentServiceData,
        senderUid: currentUser.uid,
        senderName: senderProfile.name,
        originalServiceId: currentServiceData.id,
        sentAt: Date.now()
    };
    await push(ref(db, `work_pro/inbox/${targetUid}`), invitation);
    alert("Convite enviado com sucesso!");
    document.getElementById('transfer-modal').style.display = 'none';
};

window.acceptService = async (inboxId) => {
    const uid = currentUser.uid;
    const inboxRef = ref(db, `work_pro/inbox/${uid}/${inboxId}`);
    const snap = await get(inboxRef);
    const item = snap.val();

    if(!item) return alert("Este serviço já não está disponível.");

    try {
        // 1. Add to receiver's calendar
        await push(ref(db, `work_pro/users/${uid}/active`), { ...item, id: null, status: 'active' });
        
        // 2. Mark as transferred in sender's calendar
        const receiverProfile = allUserProfiles[uid];
        await update(ref(db, `work_pro/users/${item.senderUid}/active/${item.originalServiceId}`), {
            status: 'transferred',
            transferredToName: receiverProfile.name,
            transferredToUid: uid
        });

        // 3. Cleanup inbox
        await remove(inboxRef);
        alert(`Serviço aceite! Foi transferido de ${item.senderName}.`);
        closeModal();
    } catch(e) { alert("Falha na aceitação: " + e.message); }
};

// ============================================
// 4. RENDERING & UI (MODAL-FIRST)
// ============================================
function createServiceCard(s) {
    const card = document.createElement('div');
    card.className = 'list-card' + (s.status === 'transferred' ? ' transferred' : '');
    card.dataset.id = s.id;
    
    let footer = '';
    if(s.status === 'transferred') {
        footer = `<span class="card-transfer-label">📤 Transferido para: ${s.transferredToName}</span>`;
    }

    card.innerHTML = `
        <div class="card-info">
            <span class="card-title">${s.title}</span>
            <div class="card-meta"><span>🕒 ${s.time||'--:--'}</span></div>
            ${footer}
        </div>
        <span style="opacity:0.2;">❯</span>
    `;
    return card;
}

function renderToday() {
    const list = document.getElementById('today-list');
    if (!list) return;
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
    const labels = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(today.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const dayItems = allServices.filter(s => s.date === dStr);
        const header = document.createElement('div'); header.className = 'week-day-title';
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

function renderInbox(items) {
    const list = document.getElementById('inbox-list');
    if(!list) return; list.innerHTML = '';
    if(items.length === 0) return list.innerHTML = '<p class="dtl-info">Caixa de entrada limpa.</p>';
    items.forEach(it => {
        const div = document.createElement('div'); div.className = 'list-card';
        div.innerHTML = `<div class="card-info"><span class="card-title">${it.title}</span><span class="card-meta">De: ${it.senderName}</span></div><button class="primary-btn" style="background:var(--accent); color:#fff; width:auto; padding:10px;" onclick="acceptService('${it.id}')">ACEITAR</button>`;
        list.appendChild(div);
    });
}

// 4h Alert Persistence
function checkAlerts() {
    const now = Date.now();
    const banner = document.getElementById('sticky-alert');
    let hasAlert = false;
    allServices.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled || ev.status === 'transferred') return;
        const diff = new Date(`${ev.date}T${ev.time}`) - now;
        if (diff > 0 && diff <= 4*60*60*1000) {
            document.getElementById('alert-msg').innerText = `🚨 ${ev.title} em breve!`;
            banner.style.display = 'block';
            hasAlert = true;
        }
    });
    if(!hasAlert) banner.style.display = 'none';
}

// ============================================
// 5. NAVIGATION & UTILS
// ============================================
window.showSection = (sectionId) => {
    document.querySelectorAll('.tab-content').forEach(div => div.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
    const activeTab = Array.from(document.querySelectorAll('.tab-item')).find(btn => btn.getAttribute('onclick')?.includes(sectionId));
    if(activeTab) activeTab.classList.add('active');
    window.scrollTo({ top: 0 });
};

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
    document.getElementById('dtl-title-display').innerText = item.title;
    document.getElementById('dtl-date').innerText = item.date || '--';
    document.getElementById('dtl-time').innerText = item.time || '--:--';
    document.getElementById('details-modal').style.display = 'flex';
};

window.closeModal = () => document.getElementById('details-modal').style.display = 'none';
window.toggleEditMode = (isE) => {
    document.getElementById('dtl-view-mode').style.display = isE ? 'none' : 'block';
    document.getElementById('dtl-edit-mode').style.display = isE ? 'block' : 'none';
};
window.changeMonth = (dir) => { monthOffset += dir; renderMonth(); };

document.getElementById('save-btn')?.addEventListener('click', async () => {
    const d = document.getElementById('adm-date').value;
    const t = document.getElementById('adm-title').value;
    if(!d || !t) return alert("Preecha Título e Data.");
    const item = { title: t, date: d, time: document.getElementById('adm-time').value, status: 'active', alertEnabled: document.getElementById('adm-alert').checked, createdAt: new Date().toISOString() };
    await push(ref(db, `work_pro/users/${currentUser.uid}/active`), item);
    alert('Serviço agendado!');
});
