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
});

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
