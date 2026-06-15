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
let testimonialInterval;

function startTestimonialInterval() {
  if (testimonialInterval) clearInterval(testimonialInterval);
  testimonialInterval = setInterval(() => slideTestimonial(1), 4000);
}

function slideTestimonial(direction) {
  testimonialIndex = (testimonialIndex + direction + totalTestimonials) % totalTestimonials;
  applySlide();
  startTestimonialInterval();
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
startTestimonialInterval();

// Add touch support for swiping
window.addEventListener('DOMContentLoaded', () => {
  const sliderContainer = document.getElementById('testimonialTrack');
  if (sliderContainer) {
    let touchStartX = 0;
    let touchEndX = 0;
    
    sliderContainer.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    sliderContainer.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) slideTestimonial(1);
      else if (touchEndX - touchStartX > 50) slideTestimonial(-1);
    }, { passive: true });
  }
});

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

// --- RISK CALCULATOR ---
function calculateRisk() {
  const assetType = parseFloat(document.getElementById('calcAsset').value);
  const balance = parseFloat(document.getElementById('calcBalance').value);
  const riskPercent = parseFloat(document.getElementById('calcRisk').value);
  const stopLossPips = parseFloat(document.getElementById('calcStopLoss').value);

  if (!balance || !riskPercent || !stopLossPips || balance <= 0 || riskPercent <= 0 || stopLossPips <= 0) {
    alert("Please enter valid numbers for Balance, Risk %, and Stop Loss.");
    return;
  }

  // Calculate Risk Amount ($)
  const riskAmount = balance * (riskPercent / 100);
  
  // Calculate Lot Size
  // Lot Size = Risk Amount / (Stop Loss Pips * Pip Value)
  const pipValue = assetType; // from select (10 or 1)
  let lotSize = riskAmount / (stopLossPips * pipValue);
  
  // Round to 2 decimal places (standard micro lot minimum is 0.01)
  lotSize = Math.max(0.01, Math.round(lotSize * 100) / 100);

  // Display Results
  document.getElementById('resRiskAmount').innerText = '$' + riskAmount.toFixed(2);
  document.getElementById('resLotSize').innerText = lotSize.toFixed(2) + ' Lots';
  
  // Show the results container
  document.getElementById('calcResults').classList.remove('hidden');
  document.getElementById('calcResults').classList.add('flex');
}

// --- FAQ CHAT WIDGET ---
function toggleChat() {
  const chatWindow = document.getElementById('chatWindow');
  const toggleBtn = document.getElementById('chatToggleBtn');
  
  if (chatWindow.classList.contains('hidden')) {
    chatWindow.classList.remove('hidden');
    chatWindow.classList.add('flex');
    toggleBtn.classList.add('hidden');
    // scroll to bottom
    const messages = document.getElementById('chatMessages');
    messages.scrollTop = messages.scrollHeight;
  } else {
    chatWindow.classList.add('hidden');
    chatWindow.classList.remove('flex');
    toggleBtn.classList.remove('hidden');
  }
}

function handleChatOption(id, questionText) {
  const messagesArea = document.getElementById('chatMessages');
  const optionsArea = document.getElementById('chatOptions');
  
  // Hide options temporarily
  optionsArea.style.opacity = '0.5';
  optionsArea.style.pointerEvents = 'none';

  // Add User Message
  const userMsgHTML = `
    <div class="flex flex-col gap-1 items-end transition-all">
      <div class="bg-gradient-to-r from-amber-500 to-yellow-400 text-dark-navy font-semibold text-xs px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
        ${questionText}
      </div>
    </div>
  `;
  messagesArea.insertAdjacentHTML('beforeend', userMsgHTML);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  // Add Typing Indicator
  const typingId = 'typing-' + Date.now();
  const typingHTML = `
    <div id="${typingId}" class="flex flex-col gap-1 items-start transition-all">
      <div class="bg-white/10 text-white text-xs px-4 py-3 rounded-2xl rounded-tl-sm border border-white/5 flex gap-1 items-center h-9">
        <span class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></span>
      </div>
    </div>
  `;
  messagesArea.insertAdjacentHTML('beforeend', typingHTML);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  // Answers Map
  const answers = {
    1: "To join VIP, simply click the 'VIP Premium Resources' card on the main page, or send me a direct message on Telegram!",
    2: "I personally trade with and highly recommend JustMarkets or XM. You can find my partner links right on the landing page to get the best trading conditions.",
    3: "Lot sizes depend entirely on your account balance and risk tolerance. I recommend using the Free Risk Calculator just above! A solid rule of thumb is risking 1% per trade.",
    4: "You can reach me directly on my personal Telegram account: @pipsattendant. I try to reply to all messages within 24 hours!"
  };

  // Simulate thinking delay
  setTimeout(() => {
    // Remove typing indicator
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    // Add Bot Response
    const botMsgHTML = `
      <div class="flex flex-col gap-1 items-start transition-all">
        <div class="bg-white/10 text-gray-200 text-xs px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-[85%] leading-relaxed border border-white/5">
          ${answers[id]}
        </div>
      </div>
    `;
    messagesArea.insertAdjacentHTML('beforeend', botMsgHTML);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Restore options
    optionsArea.style.opacity = '1';
    optionsArea.style.pointerEvents = 'auto';
  }, 1200);
}
