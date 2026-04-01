import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "viaz-1e406",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let allServices = []; 
let currentServiceData = null; 

// ============================================
// 1. NAVEGAÇÃO & SPA
// ============================================
window.navigate = (targetId) => {
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active'));
    document.getElementById(targetId)?.classList.add('active');
    document.querySelector(`.tab-item[data-target="${targetId}"]`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-target')));
});

function updateHeader() {
    const d = new Date();
    document.getElementById('current-date').innerText = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
}
updateHeader();

// ============================================
// 2. EVENT DELEGATION (SOLUÇÃO DE CLIQUES)
// ============================================
// Delegar cliques para todos os cards de serviço dinâmicos
document.addEventListener('click', (e) => {
    const card = e.target.closest('.list-card');
    if (card && card.dataset.id) {
        const id = card.dataset.id;
        const service = allServices.find(s => s.id === id);
        if (service) openServiceModal(service);
    }
});

// ============================================
// 3. DATA SYNC & RENDERING
// ============================================
onValue(ref(db, 'work_pro/active/services'), (snapshot) => {
    const data = snapshot.val();
    allServices = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: false })) : [];
    
    renderToday();
    renderWeek();
    renderMonth();
    checkAlerts();
});

onValue(ref(db, 'work_pro/archived'), (snapshot) => {
    const data = snapshot.val();
    const archived = data ? Object.keys(data).map(id => ({ id, ...data[id], isArchived: true })) : [];
    renderArchive(archived);
    cleanupArchived(archived);
});

function renderToday() {
    const list = document.getElementById('today-list');
    if (!list) return; list.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];
    const items = allServices.filter(s => s.date === todayStr);
    
    if (items.length === 0) return list.innerHTML = '<p class="dtl-info" style="padding:20px;">Vazio para hoje.</p>';
    items.sort((a,b) => (a.time || '').localeCompare(b.time || '')).forEach(s => list.appendChild(createServiceCard(s)));
}

function renderWeek() {
    const container = document.getElementById('week-container');
    if (!container) return; container.innerHTML = '';
    const daysMap = { 1:'Segunda', 2:'Terça', 3:'Quarta', 4:'Quinta', 5:'Sexta', 6:'Sábado', 0:'Domingo' };
    const today = new Date();

    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(today.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const dayItems = allServices.filter(s => s.date === dStr);
        
        const header = document.createElement('div');
        header.className = 'week-day-title';
        header.innerText = i === 0 ? 'Hoje' : (i === 1 ? 'Amanhã' : daysMap[d.getDay()]);
        container.appendChild(header);

        if (dayItems.length > 3) {
             dayItems.slice(0, 2).forEach(s => container.appendChild(createServiceCard(s)));
             const more = document.createElement('div');
             more.className = 'secondary-btn';
             more.style.marginTop = '5px';
             more.innerText = `+${dayItems.length - 2} SERVIÇOS NESTE DIA...`;
             more.onclick = (e) => { e.stopPropagation(); openDaySelector(dStr, dayItems); };
             container.appendChild(more);
        } else {
             dayItems.forEach(s => container.appendChild(createServiceCard(s)));
        }
    }
}

function renderMonth() {
    const grid = document.getElementById('month-grid');
    if (!grid) return; grid.innerHTML = '';
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayItems = allServices.filter(s => s.date === dateStr);
        
        const dayEl = document.createElement('div');
        dayEl.className = 'month-day';
        dayEl.innerHTML = `<span>${day}</span>`;
        
        if (dayItems.length > 0) {
            dayEl.innerHTML += `<div class="day-dot" style="width:${Math.min(4+dayItems.length, 10)}px;"></div>`;
            if (dayItems.length === 1) {
                dayEl.onclick = () => openServiceModal(dayItems[0]);
            } else {
                dayEl.onclick = () => openDaySelector(dateStr, dayItems);
            }
        }
        grid.appendChild(dayEl);
    }
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

function createServiceCard(s) {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.dataset.id = s.id; // Chave para o Event Delegation
    card.innerHTML = `<div class="card-info"><span class="card-title">${s.title}</span><div class="card-meta"><span>🕒 ${s.time||'--:--'}</span></div></div><span style="opacity:0.2;">❯</span>`;
    return card;
}

// ============================================
// 4. MODAL ENGINE (UNIFICADO)
// ============================================
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

window.openDaySelector = (dateStr, items) => {
    document.getElementById('selector-date-display').innerText = `Serviços em ${dateStr}`;
    const list = document.getElementById('selector-list');
    list.innerHTML = '';
    items.forEach(s => list.appendChild(createServiceCard(s)));
    document.getElementById('day-selector-modal').style.display = 'flex';
};

window.closeModal = () => document.getElementById('details-modal').style.display = 'none';

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

window.saveChanges = async () => {
    const upd = {
        title: document.getElementById('edit-title').value,
        date: document.getElementById('edit-date').value,
        time: document.getElementById('edit-time').value,
        notes: document.getElementById('edit-notes').value,
        alertEnabled: document.getElementById('edit-alert').checked
    };
    await update(ref(db, `work_pro/active/services/${currentServiceData.id}`), upd);
    const btn = document.querySelector('.save-changes-btn');
    btn.innerText = 'GUARDADO! ✔️';
    navigator.vibrate(50);
    setTimeout(() => { closeModal(); btn.innerText = 'GUARDAR ALTERAÇÕES'; }, 1000);
};

window.confirmDelete = () => {
    if(confirm("Deseja ARQUIVAR este serviço? (60 dias de retenção)")) {
        archiveService();
    }
};

async function archiveService() {
    const id = currentServiceData.id;
    await push(ref(db, 'work_pro/archived'), { ...currentServiceData, deletedAt: Date.now() });
    await remove(ref(db, `work_pro/active/services/${id}`));
    navigator.vibrate([40, 40]);
    closeModal();
}

function cleanupArchived(archived) {
    const limit = Date.now() - (60 * 24 * 60 * 60 * 1000);
    archived.forEach(it => { if(it.deletedAt < limit) remove(ref(db, `work_pro/archived/${it.id}`)); });
}

// ============================================
// 5. ALERTAS & SALVAR ADMIN
// ============================================
let activeAlerts = JSON.parse(localStorage.getItem('activeWorkAlerts') || '[]');

function checkAlerts() {
    const now = Date.now();
    allServices.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        const diff = new Date(`${ev.date}T${ev.time}`) - now;
        if (diff > 0 && diff <= 4*60*60*1000) {
            const aId = `alert_${ev.id}_${ev.time}`;
            if (!activeAlerts.includes(aId)) {
                document.getElementById('alert-msg').innerText = `Serviço em 4h: ${ev.title}`;
                document.getElementById('sticky-alert').style.display = 'block';
                activeAlerts.push(aId);
                localStorage.setItem('activeWorkAlerts', JSON.stringify(activeAlerts));
            }
        }
    });
}

document.getElementById('dismiss-alert')?.addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
});

document.getElementById('save-btn')?.addEventListener('click', async () => {
    const d = document.getElementById('adm-date').value;
    const t = document.getElementById('adm-title').value;
    if(!d || !t) return alert("Preecha Título e Data.");

    const item = {
        title: t,
        date: d,
        time: document.getElementById('adm-time').value,
        notes: document.getElementById('adm-notes').value,
        alertEnabled: document.getElementById('adm-alert').checked,
        createdAt: new Date().toISOString()
    };
    await push(ref(db, 'work_pro/active/services'), item);
    document.getElementById('adm-title').value = '';
    document.getElementById('adm-notes').value = '';
    alert('Serviço agendado!');
    navigator.vibrate(60);
});
