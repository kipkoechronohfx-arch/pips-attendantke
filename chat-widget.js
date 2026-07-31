/**
 * WhatsApp Floating Action Button
 * Replaces the Zuri AI Chat widget.
 */
(function () {
  'use strict';

  // ── Inject CSS ────────────────────────────────────────────────────────────
  const styles = `
    /* ── WhatsApp Launcher Button ── */
    #wa-launcher {
      position: fixed;
      bottom: 28px;
      left: 28px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #25D366;
      box-shadow: 0 8px 32px rgba(37,211,102,0.45), 0 2px 8px rgba(0,0,0,0.25);
      border: none;
      cursor: pointer;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.25s ease;
      outline: none;
      text-decoration: none;
    }
    #wa-launcher:hover {
      transform: scale(1.12);
      box-shadow: 0 12px 40px rgba(37,211,102,0.55), 0 2px 8px rgba(0,0,0,0.25);
    }

    /* Pulse ring */
    #wa-launcher::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(37,211,102,0.35);
      animation: waPulse 2.5s ease-out infinite;
      z-index: -1;
    }
    @keyframes waPulse {
      0%   { transform: scale(1);   opacity: 0.7; }
      70%  { transform: scale(1.6); opacity: 0;   }
      100% { transform: scale(1.6); opacity: 0;   }
    }

    /* Notification badge */
    #wa-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      background: #FF4757;
      border-radius: 50%;
      border: 2px solid white;
      font-family: sans-serif;
      font-size: 10px;
      font-weight: 700;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: badgePop 0.3s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes badgePop {
      from { transform: scale(0); }
      to   { transform: scale(1); }
    }

    /* ── Mobile responsive ── */
    @media (max-width: 420px) {
      #wa-launcher { left: 16px; bottom: 20px; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const phone = '254107692553';
  const text = encodeURIComponent("Hello Pips Attendant, I'm interested in your services!");
  const waUrl = `https://wa.me/${phone}?text=${text}`;

  const widget = document.createElement('a');
  widget.id = 'wa-launcher';
  widget.href = waUrl;
  widget.target = '_blank';
  widget.rel = 'noopener noreferrer';
  widget.setAttribute('aria-label', 'Chat with us on WhatsApp');
  widget.title = 'Chat on WhatsApp';
  
  widget.innerHTML = `
    <span id="wa-badge" style="display:none">1</span>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
  `;

  document.body.appendChild(widget);

  // Show badge after 4s to grab attention
  setTimeout(() => {
    const badge = document.getElementById('wa-badge');
    if (badge) badge.style.display = 'flex';
  }, 4000);

})();
