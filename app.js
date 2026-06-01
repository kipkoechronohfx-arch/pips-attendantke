// Initialize Feather Icons
feather.replace();

// Secret Keyboard Shortcut to Access Admin Broadcaster Console (Ctrl + Shift + A)
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    window.location.href = 'admin.html';
  }
});

// --- THEME LOGIC ---
function initTheme() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.setAttribute('data-feather', 'moon');
  }
  // Re-replace feather icons since we might have changed the DOM
  feather.replace();
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-feather', isLight ? 'moon' : 'sun');
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
