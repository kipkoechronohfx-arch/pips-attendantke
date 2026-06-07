// Initialize Feather Icons
feather.replace();

// Secret Keyboard Shortcut to Access Admin Broadcaster Console (Ctrl + Shift + A)
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    window.location.href = 'admin.html';
  }
});

// --- THEME TOGGLE (Gold Dubai vs Clean Dark Navy) ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  // Default is 'gold' (the Dubai theme). If they saved 'dark-navy', apply it.
  if (savedTheme === 'dark-navy') {
    document.body.classList.add('dark-navy-mode');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.setAttribute('data-feather', 'moon');
  }
  feather.replace();
}

function toggleTheme() {
  const isDarkNavy = document.body.classList.toggle('dark-navy-mode');
  localStorage.setItem('theme', isDarkNavy ? 'dark-navy' : 'gold');
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-feather', isDarkNavy ? 'moon' : 'sun');
    feather.replace();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchPerformanceStats();
  initPushNotifications();
});

// --- PERFORMANCE DASHBOARD ---
async function fetchPerformanceStats() {
  try {
    const res = await fetch('/api/performance/stats');
    const data = await res.json();
    if (data.ok) {
      const wrEl = document.getElementById('publicWinRate');
      const tpEl = document.getElementById('publicTotalPips');
      const ttEl = document.getElementById('publicTotalTrades');
      
      if(wrEl) wrEl.innerText = data.winRate;
      if(tpEl) tpEl.innerText = data.totalPips;
      if(ttEl) ttEl.innerText = data.totalTrades;
    }
  } catch (err) {
    console.error('Error fetching performance stats:', err);
  }
}

// --- PUSH NOTIFICATIONS ---
const publicVapidKey = 'BJcACSzRQjsW5ZnDnrmvcVAs5lGnM_j5aoDGdsXnx6bDulEYWZJ0W5aC52Z5mB71tJ74KDbIwwhyrzxMIQIh60k';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function initPushNotifications() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const register = await navigator.serviceWorker.register('/sw.js');
      const subscription = await register.pushManager.getSubscription();
      if (!subscription) {
        const container = document.getElementById('pushOptInContainer');
        if (container) container.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Service Worker Error', err);
    }
  }
}

async function subscribeToPush() {
  if ('serviceWorker' in navigator) {
    try {
      const register = await navigator.serviceWorker.ready;
      const subscription = await register.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      alert('Successfully subscribed to VIP Push Alerts!');
      const container = document.getElementById('pushOptInContainer');
      if (container) container.classList.add('hidden');
    } catch (err) {
      console.error('Push Subscription Error:', err);
      alert('Failed to enable push notifications. Check browser permissions.');
    }
  }
}

// --- TESTIMONIALS CAROUSEL ---
let testimonialIndex = 0;
const totalTestimonials = 5;

function slideTestimonial(direction) {
  testimonialIndex = (testimonialIndex + direction + totalTestimonials) % totalTestimonials;
  applySlide();
}

function applySlide() {
  const slider = document.getElementById('testimonialSlider');
  if (!slider) return;
  const cardWidth = 288 + 16; // w-72 + gap-4
  slider.style.transform = `translateX(-${testimonialIndex * cardWidth}px)`;
  const dots = document.querySelectorAll('.dot-indicator');
  dots.forEach((dot, i) => {
    dot.style.backgroundColor = i === testimonialIndex ? '#00f0ff' : 'rgba(255,255,255,0.2)';
  });
}

// Auto-scroll every 4 seconds
setInterval(() => slideTestimonial(1), 4000);

// --- WHATSAPP BROADCAST ---
async function subscribeWhatsApp(e) {
  e.preventDefault();
  const phoneInput = document.getElementById('waPhone');
  const btn = document.getElementById('waBtn');
  const status = document.getElementById('waStatus');
  const phone = phoneInput.value.trim();

  if (!phone) return;

  btn.disabled = true;
  btn.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin inline"></i> Processing...';
  feather.replace();

  try {
    const res = await fetch('/api/whatsapp-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.ok) {
      status.className = 'text-emerald-400 text-xs mt-2';
      status.innerText = '✅ ' + data.message;
      phoneInput.value = '';
    } else {
      status.className = 'text-rose-400 text-xs mt-2';
      status.innerText = '❌ ' + data.error;
    }
  } catch (err) {
    status.className = 'text-rose-400 text-xs mt-2';
    status.innerText = '❌ Connection error.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Join Broadcast';
  }
}
