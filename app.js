import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDFwECdwELB_wPHR_9rkkY9MRcNBjQSUks",
    authDomain: "viaz-1e406.firebaseapp.com",
    databaseURL: "https://viaz-1e406-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "viaz-1e406",
    storageBucket: "viaz-1e406.firebasestorage.app"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ============================================
// 1. SPA NAVIGATION & TOUCH ENGINE
// ============================================
document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(target).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

// Update Hoje Clock
function updateHeader() {
    const d = new Date();
    document.getElementById('current-date').innerText = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
}
updateHeader();

// ============================================
// 2. CRITICAL ALERT SYSTEM (4h PERSISTENT)
// ============================================
let activeAlerts = JSON.parse(localStorage.getItem('activeWorkAlerts') || '[]');

function checkAlerts(events) {
    const now = new Date();
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

    events.forEach(ev => {
        if (!ev.date || !ev.time || !ev.alertEnabled) return;
        
        const eventDate = new Date(`${ev.date}T${ev.time}`);
        const timeToEvent = eventDate - now;

        // Se faltam exatamente (ou menos de) 4 horas e ainda não foi mostrado
        if (timeToEvent > 0 && timeToEvent <= FOUR_HOURS_MS) {
            const alertId = `alert_${ev.id}`;
            if (!activeAlerts.includes(alertId)) {
                triggerPersistentAlert(ev.title, alertId);
            }
        }
    });
}

function triggerPersistentAlert(title, id) {
    const banner = document.getElementById('sticky-alert');
    const msg = document.getElementById('alert-msg');
    msg.innerText = `Serviço em 4h: ${title}`;
    banner.style.display = 'block';

    if (!activeAlerts.includes(id)) {
        activeAlerts.push(id);
        localStorage.setItem('activeWorkAlerts', JSON.stringify(activeAlerts));
    }
}

// Dismiss Banner Manually
document.getElementById('dismiss-alert').addEventListener('click', () => {
    document.getElementById('sticky-alert').style.display = 'none';
    // Nota: O alerta é removido da vista imediata, mas o ID fica no localStorage 
    // para não repetir até expirar ou ser limpo.
});

// Restaurar banners no reload se carregados
window.addEventListener('DOMContentLoaded', () => {
    if (activeAlerts.length > 0) {
        // Mostra o último ou mais importante
        document.getElementById('sticky-alert').style.display = 'block';
    }
});

// ============================================
// 3. FIREBASE SYNC & RENDERING
// ============================================

// --- LISTA HOJE ---
onValue(ref(db, 'work_pro/services'), (snapshot) => {
    const data = snapshot.val();
    const list = document.getElementById('today-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data) return list.innerHTML = '<p style="color:var(--text-sec); padding:20px;">Sem serviços agendados.</p>';

    const services = Object.keys(data).map(id => ({ id, ...data[id] }));
    
    // Sort por hora
    services.sort((a,b) => (a.time || '').localeCompare(b.time || ''));

    services.forEach(s => {
        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">${s.title}</span>
                <span class="card-time">${s.time || '--:--'}</span>
            </div>
            ${s.notes ? `<p class="card-notes">${s.notes}</p>` : ''}
        `;
        list.appendChild(card);
    });

    // Run Alert check separately
    checkAlerts(services);
});

// --- LISTA TAREFAS ---
onValue(ref(db, 'work_pro/tasks'), (snapshot) => {
    const data = snapshot.val();
    const list = document.getElementById('tasks-list');
    if (!list) return;
    list.innerHTML = '';

    if (!data) return list.innerHTML = '<p style="color:var(--text-sec); padding:20px;">Trabalho em dia!</p>';

    Object.keys(data).forEach(id => {
        const t = data[id];
        const card = document.createElement('div');
        card.className = 'list-card';
        card.style.borderLeftColor = 'var(--accent-gold)';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">${t.title}</span>
                <button class="banner-btn" style="background:rgba(255,255,255,0.05); color:var(--accent-red);" id="del-${id}">CONCLUÍDO</button>
            </div>
        `;
        list.appendChild(card);
        document.getElementById(`del-${id}`).onclick = async () => {
            try { await remove(ref(db, `work_pro/tasks/${id}`)); navigator.vibrate(50); } catch(e){}
        };
    });
});

// ============================================
// 4. ADMIN / GESTÃO SAVE
// ============================================
document.getElementById('save-btn').addEventListener('click', async () => {
    const title = document.getElementById('adm-title').value;
    const date = document.getElementById('adm-date').value;
    const time = document.getElementById('adm-time').value;
    const notes = document.getElementById('adm-notes').value;
    const alert = document.getElementById('adm-alert').checked;

    if (!title) return alert('Insira um título para o serviço.');

    const btn = document.getElementById('save-btn');
    btn.innerText = 'ENVIANDO...';
    btn.disabled = true;

    try {
        if (date) {
            // É um serviço agendado
            await push(ref(db, 'work_pro/services'), {
                title, date, time, notes, alertEnabled: alert, createdAt: new Date().toISOString()
            });
        } else {
            // É uma tarefa genérica
            await push(ref(db, 'work_pro/tasks'), {
                title, createdAt: new Date().toISOString()
            });
        }

        // Limpar UI
        document.getElementById('adm-title').value = '';
        document.getElementById('adm-notes').value = '';
        btn.innerText = 'SUCESSO! ✔️';
        navigator.vibrate([100, 50, 100]);
        
        setTimeout(() => {
            btn.innerText = 'SALVAR NO FIREBASE';
            btn.disabled = false;
        }, 1500);

    } catch (e) {
        alert('Erro ao salvar. Tente novamente.');
        btn.disabled = false;
        btn.innerText = 'SALVAR NO FIREBASE';
    }
});
