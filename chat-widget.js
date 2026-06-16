/**
 * Zuri — Pips Attendant AI Support Chat Widget
 * Self-contained: injects its own styles and DOM.
 * Drop this script tag before </body> on any page.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  const CONFIG = {
    botName: 'Pips Assistant',
    botTitle: 'Pips Attendant Support',
    avatarLetter: 'P',
    apiEndpoint: '/api/chat',
    welcomeMessage: "Hi there! 👋 I'm **Pips Assistant**, your Pips Attendant AI support bot.\n\nI can help with:\n• Subscription & payments\n• Signals & trading guidance\n• Account & login issues\n• Prop firm support\n\nHow can I help you today?",
    suggestedQuestions: [
      'How do I subscribe?',
      'What plans are available?',
      'How do I pay with M-Pesa?',
      'My payment isn\'t going through',
      'How do signals work?',
    ]
  };

  // ── Inject CSS ────────────────────────────────────────────────────────────
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    #zuri-widget * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
    }

    /* ── Launcher Button ── */
    #zuri-launcher {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6C63FF 0%, #4F46E5 60%, #7C3AED 100%);
      box-shadow: 0 8px 32px rgba(99,89,255,0.45), 0 2px 8px rgba(0,0,0,0.25);
      border: none;
      cursor: pointer;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.25s ease;
      outline: none;
    }
    #zuri-launcher:hover {
      transform: scale(1.12);
      box-shadow: 0 12px 40px rgba(99,89,255,0.55), 0 2px 8px rgba(0,0,0,0.25);
    }
    #zuri-launcher svg { transition: opacity 0.2s, transform 0.2s; }
    #zuri-launcher.open svg.icon-chat { opacity: 0; transform: scale(0.6) rotate(-30deg); position: absolute; }
    #zuri-launcher.open svg.icon-close { opacity: 1; transform: scale(1) rotate(0deg); }
    #zuri-launcher svg.icon-close { opacity: 0; transform: scale(0.6) rotate(30deg); position: absolute; }

    /* Pulse ring */
    #zuri-launcher::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(99,89,255,0.35);
      animation: zuriPulse 2.5s ease-out infinite;
    }
    @keyframes zuriPulse {
      0%   { transform: scale(1);   opacity: 0.7; }
      70%  { transform: scale(1.6); opacity: 0;   }
      100% { transform: scale(1.6); opacity: 0;   }
    }

    /* Notification badge */
    #zuri-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      background: #FF4757;
      border-radius: 50%;
      border: 2px solid white;
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

    /* ── Chat Panel ── */
    #zuri-panel {
      position: fixed;
      bottom: 104px;
      right: 28px;
      width: 370px;
      max-width: calc(100vw - 40px);
      height: 560px;
      max-height: calc(100vh - 130px);
      background: #0F0F1A;
      border-radius: 20px;
      border: 1px solid rgba(108,99,255,0.25);
      box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 9997;
      transform: scale(0.85) translateY(20px);
      transform-origin: bottom right;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.3s ease;
    }
    #zuri-panel.visible {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Header ── */
    #zuri-header {
      background: linear-gradient(135deg, #1a1535 0%, #12102a 100%);
      border-bottom: 1px solid rgba(108,99,255,0.2);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    #zuri-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6C63FF, #7C3AED);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      position: relative;
    }
    #zuri-avatar::after {
      content: '';
      position: absolute;
      bottom: 1px;
      right: 1px;
      width: 10px;
      height: 10px;
      background: #2ECC71;
      border-radius: 50%;
      border: 2px solid #1a1535;
    }
    #zuri-header-info { flex: 1; min-width: 0; }
    #zuri-header-name {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      line-height: 1.2;
    }
    #zuri-header-status {
      font-size: 11px;
      color: #2ECC71;
      margin-top: 1px;
    }
    #zuri-close-btn {
      background: rgba(255,255,255,0.08);
      border: none;
      border-radius: 8px;
      width: 30px;
      height: 30px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.6);
      transition: background 0.15s, color 0.15s;
    }
    #zuri-close-btn:hover { background: rgba(255,255,255,0.15); color: white; }

    /* ── Messages ── */
    #zuri-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: rgba(108,99,255,0.3) transparent;
    }
    #zuri-messages::-webkit-scrollbar { width: 4px; }
    #zuri-messages::-webkit-scrollbar-track { background: transparent; }
    #zuri-messages::-webkit-scrollbar-thumb { background: rgba(108,99,255,0.35); border-radius: 4px; }

    .zuri-msg {
      display: flex;
      gap: 8px;
      max-width: 88%;
      animation: msgSlide 0.25s ease;
    }
    @keyframes msgSlide {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .zuri-msg.user { align-self: flex-end; flex-direction: row-reverse; }
    .zuri-msg.bot  { align-self: flex-start; }

    .zuri-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      margin-top: 2px;
    }
    .zuri-msg.bot .zuri-msg-avatar {
      background: linear-gradient(135deg, #6C63FF, #7C3AED);
      color: white;
    }
    .zuri-msg.user .zuri-msg-avatar {
      background: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.7);
      font-size: 14px;
    }

    .zuri-bubble {
      padding: 10px 13px;
      border-radius: 16px;
      font-size: 13.5px;
      line-height: 1.55;
      word-break: break-word;
    }
    .zuri-msg.bot .zuri-bubble {
      background: rgba(108,99,255,0.12);
      border: 1px solid rgba(108,99,255,0.2);
      color: #E8E8F8;
      border-bottom-left-radius: 4px;
    }
    .zuri-msg.user .zuri-bubble {
      background: linear-gradient(135deg, #6C63FF, #5048E5);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .zuri-bubble strong { font-weight: 600; }
    .zuri-bubble ul { padding-left: 18px; margin: 4px 0; }
    .zuri-bubble li { margin: 2px 0; }

    /* Typing indicator */
    #zuri-typing {
      display: none;
      align-self: flex-start;
      align-items: center;
      gap: 8px;
    }
    #zuri-typing.active { display: flex; animation: msgSlide 0.2s ease; }
    .zuri-typing-bubble {
      background: rgba(108,99,255,0.12);
      border: 1px solid rgba(108,99,255,0.2);
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      padding: 10px 14px;
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .zuri-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(108,99,255,0.8);
      animation: dotBounce 1.2s ease-in-out infinite;
    }
    .zuri-dot:nth-child(2) { animation-delay: 0.2s; }
    .zuri-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30%            { transform: translateY(-6px); opacity: 1; }
    }

    /* Suggested questions */
    #zuri-suggestions {
      padding: 0 14px 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      flex-shrink: 0;
    }
    .zuri-suggestion {
      background: rgba(108,99,255,0.1);
      border: 1px solid rgba(108,99,255,0.25);
      border-radius: 20px;
      padding: 5px 11px;
      font-size: 12px;
      color: #a99dff;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      white-space: nowrap;
    }
    .zuri-suggestion:hover {
      background: rgba(108,99,255,0.25);
      color: #d0cbff;
      border-color: rgba(108,99,255,0.45);
    }

    /* ── Input Area ── */
    #zuri-input-area {
      padding: 12px 14px 16px;
      border-top: 1px solid rgba(108,99,255,0.15);
      background: rgba(15,15,26,0.95);
      flex-shrink: 0;
    }
    #zuri-input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(108,99,255,0.2);
      border-radius: 14px;
      padding: 8px 8px 8px 13px;
      transition: border-color 0.2s;
    }
    #zuri-input-row:focus-within {
      border-color: rgba(108,99,255,0.55);
      background: rgba(108,99,255,0.06);
    }
    #zuri-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #E8E8F8;
      font-size: 13.5px;
      line-height: 1.5;
      resize: none;
      max-height: 90px;
      overflow-y: auto;
      scrollbar-width: none;
    }
    #zuri-input::placeholder { color: rgba(255,255,255,0.28); }
    #zuri-send {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #6C63FF, #5048E5);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }
    #zuri-send:hover { opacity: 0.88; transform: scale(1.05); }
    #zuri-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    #zuri-powered {
      text-align: center;
      font-size: 10.5px;
      color: rgba(255,255,255,0.22);
      margin-top: 7px;
    }
    #zuri-powered a { color: rgba(108,99,255,0.6); text-decoration: none; }

    /* ── Mobile responsive ── */
    @media (max-width: 420px) {
      #zuri-panel { right: 12px; bottom: 94px; width: calc(100vw - 24px); }
      #zuri-launcher { right: 16px; bottom: 20px; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const widget = document.createElement('div');
  widget.id = 'zuri-widget';
  widget.innerHTML = `
    <!-- Launcher button -->
    <button id="zuri-launcher" aria-label="Open support chat" title="Chat with Zuri">
      <span id="zuri-badge" style="display:none">1</span>
      <svg class="icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="white"/>
        <circle cx="8" cy="11" r="1.2" fill="#6C63FF"/>
        <circle cx="12" cy="11" r="1.2" fill="#6C63FF"/>
        <circle cx="16" cy="11" r="1.2" fill="#6C63FF"/>
      </svg>
      <svg class="icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    </button>

    <!-- Chat panel -->
    <div id="zuri-panel" role="dialog" aria-label="Pips Assistant Support Chat">
      <div id="zuri-header">
        <div id="zuri-avatar">P</div>
        <div id="zuri-header-info">
          <div id="zuri-header-name">Pips Assistant · AI Support</div>
          <div id="zuri-header-status">● Online · Typically replies instantly</div>
        </div>
        <button id="zuri-close-btn" aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div id="zuri-messages" aria-live="polite">
        <!-- Messages inserted here -->
        <div id="zuri-typing">
          <div class="zuri-msg-avatar" style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6C63FF,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;margin-top:2px;">P</div>
          <div class="zuri-typing-bubble">
            <div class="zuri-dot"></div>
            <div class="zuri-dot"></div>
            <div class="zuri-dot"></div>
          </div>
        </div>
      </div>

      <div id="zuri-suggestions"></div>

      <div id="zuri-input-area">
        <div id="zuri-input-row">
          <textarea
            id="zuri-input"
            placeholder="Ask me anything…"
            rows="1"
            aria-label="Type your message"
            maxlength="2000"
          ></textarea>
          <button id="zuri-send" aria-label="Send message" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div id="zuri-powered">Powered by Gemini AI · <a href="https://pipsattendant.top" target="_blank">pipsattendant.top</a></div>
      </div>
    </div>
  `;

  document.body.appendChild(widget);

  // ── State ──────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isTyping = false;
  let firstOpen = true;
  const conversationHistory = []; // [{ role: 'user'|'model', parts: [{text}] }]

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const launcher   = document.getElementById('zuri-launcher');
  const panel      = document.getElementById('zuri-panel');
  const closeBtn   = document.getElementById('zuri-close-btn');
  const messagesEl = document.getElementById('zuri-messages');
  const typingEl   = document.getElementById('zuri-typing');
  const inputEl    = document.getElementById('zuri-input');
  const sendBtn    = document.getElementById('zuri-send');
  const suggestEl  = document.getElementById('zuri-suggestions');
  const badgeEl    = document.getElementById('zuri-badge');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function renderMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^• (.+)$/gm, '<li>$1</li>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/\n/g, '<br>');
  }

  function addMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `zuri-msg ${role === 'user' ? 'user' : 'bot'}`;

    const avatarIcon = role === 'user' ? '👤' : 'P';
    msgDiv.innerHTML = `
      <div class="zuri-msg-avatar">${avatarIcon}</div>
      <div class="zuri-bubble">${renderMarkdown(text)}</div>
    `;

    // Insert before the typing indicator
    messagesEl.insertBefore(msgDiv, typingEl);
    scrollBottom();
  }

  function scrollBottom() {
    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 30);
  }

  function showTyping(show) {
    isTyping = show;
    typingEl.classList.toggle('active', show);
    sendBtn.disabled = show;
    if (show) scrollBottom();
  }

  function showBadge(show) {
    badgeEl.style.display = show ? 'flex' : 'none';
  }

  function hideSuggestions() {
    suggestEl.innerHTML = '';
  }

  function showSuggestions(questions) {
    suggestEl.innerHTML = '';
    questions.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'zuri-suggestion';
      btn.textContent = q;
      btn.onclick = () => { sendMessage(q); hideSuggestions(); };
      suggestEl.appendChild(btn);
    });
  }

  // ── Toggle panel ──────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle('visible', isOpen);
    launcher.classList.toggle('open', isOpen);
    showBadge(false);

    if (isOpen) {
      if (firstOpen) {
        firstOpen = false;
        // Show welcome message
        addMessage('bot', CONFIG.welcomeMessage);
        showSuggestions(CONFIG.suggestedQuestions);
      }
      inputEl.focus();
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(text) {
    text = (text || inputEl.value).trim();
    if (!text || isTyping) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    hideSuggestions();

    addMessage('user', text);

    // Add to history
    conversationHistory.push({ role: 'user', parts: [{ text }] });

    showTyping(true);

    try {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory })
      });

      const data = await res.json();
      showTyping(false);

      if (data.ok && data.reply) {
        addMessage('bot', data.reply);
        conversationHistory.push({ role: 'model', parts: [{ text: data.reply }] });

        // Show follow-up suggestions after first exchange
        if (conversationHistory.length === 2) {
          showSuggestions(['How do I pay with USDT?', 'What\'s in VIP?', 'Contact support']);
        }
      } else {
        addMessage('bot', data.error || 'Sorry, I encountered an error. Please try again or email support@pipsattendant.com 🙏');
      }
    } catch (err) {
      showTyping(false);
      addMessage('bot', 'I\'m having trouble connecting right now. Please try again in a moment, or reach us at **support@pipsattendant.com** 🙏');
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────────────
  launcher.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', togglePanel);

  inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 90) + 'px';
    sendBtn.disabled = !this.value.trim() || isTyping;
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) togglePanel();
  });

  // Show badge after 4s if panel is still closed (grabs attention)
  setTimeout(() => {
    if (!isOpen) showBadge(true);
  }, 4000);

})();
