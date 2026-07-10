
    // Global fetch interceptor to handle 401 Unauthorized errors
    const originalFetch = window.fetch;
    let isLoggingOut = false;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      if (response.status === 401 && typeof args[0] === 'string' && args[0].includes('/api/admin/') && !args[0].includes('/login') && !isLoggingOut) {
        isLoggingOut = true;
        localStorage.removeItem('pa_admin_token');
        localStorage.removeItem('pa_bot_token');
        localStorage.removeItem('pa_chat_id');
        localStorage.removeItem('pa_vip_chat_id');
        localStorage.removeItem('pa_admin_key');
        
        setTimeout(() => { window.location.reload(); }, 500);
      }
      return response;
    };

    // State variables
    let currentTemplate = 'buy';
    
    window.addEventListener('DOMContentLoaded', () => {
      // Set current mock time
      updateMockTime();
      setInterval(updateMockTime, 60000);
      
      // Initialize feather icons
      feather.replace();
      
      // Check for credentials
      checkCredentials();
      // Apply initial template values
      applyTemplate('buy');
    });

    function updateMockTime() {
      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      minutes = minutes < 10 ? '0' + minutes : minutes;
      const strTime = hours + ':' + minutes + ' ' + ampm;
      const tgTimeEl = document.getElementById('tgTime');
      if (tgTimeEl) tgTimeEl.innerText = strTime;
    }

    function checkCredentials() {
      const adminToken = localStorage.getItem('pa_admin_token');
      const token = localStorage.getItem('pa_bot_token');
      const chat = localStorage.getItem('pa_chat_id');
      const vipChat = localStorage.getItem('pa_vip_chat_id');
      const adminKey = localStorage.getItem('pa_admin_key');
      
      if (adminToken && token && chat && adminKey) {
        document.getElementById('setupPanel').classList.add('hidden');
        document.getElementById('dashboardPanel').classList.remove('hidden');
        document.getElementById('engagementPanel').classList.remove('hidden');
        document.getElementById('livePanel').classList.remove('hidden');
        document.getElementById('perfPanel').classList.remove('hidden');
        document.getElementById('vipPanel').classList.remove('hidden');
        document.getElementById('cryptoRequestsPanel').classList.remove('hidden');
        document.getElementById('analyticsPanel').classList.remove('hidden');
        document.getElementById('usersPanel').classList.remove('hidden');
        document.getElementById('promosPanel').classList.remove('hidden');
        document.getElementById('announcementsPanel').classList.remove('hidden');
        document.getElementById('marketingPanel').classList.remove('hidden');
        document.getElementById('bookingsPanel').classList.remove('hidden');
        document.getElementById('ticketsPanel').classList.remove('hidden');
        document.getElementById('paymentsPanel').classList.remove('hidden');
        document.getElementById('signalsPanel').classList.remove('hidden');
        document.getElementById('statusSection').classList.remove('hidden');
        updateLivePreview();
        updateEngPreview();
        updateLiveRoomPreview();
        
        // Load VIP dynamic metrics
        fetchSubscribers();
        fetchWhatsAppList();
        fetchVIPDocuments();
        fetchTodaysSetup();
        fetchTodaysSetupResults();
        fetchCryptoRequests();
        fetchUsers();
        fetchAnalytics();
        fetchPromos();
        fetchAnnouncements();
        fetchBookings();
        fetchAdminTickets();
        fetchPayments();
        fetchSignalsHistory();
      } else {
        document.getElementById('setupPanel').classList.remove('hidden');
        document.getElementById('dashboardPanel').classList.add('hidden');
        document.getElementById('engagementPanel').classList.add('hidden');
        document.getElementById('livePanel').classList.add('hidden');
        document.getElementById('perfPanel').classList.add('hidden');
        document.getElementById('vipPanel').classList.add('hidden');
        document.getElementById('cryptoRequestsPanel').classList.add('hidden');
        document.getElementById('analyticsPanel').classList.add('hidden');
        document.getElementById('usersPanel').classList.add('hidden');
        document.getElementById('promosPanel').classList.add('hidden');
        document.getElementById('announcementsPanel').classList.add('hidden');
        document.getElementById('marketingPanel').classList.add('hidden');
        document.getElementById('bookingsPanel').classList.add('hidden');
        document.getElementById('ticketsPanel').classList.add('hidden');
        document.getElementById('paymentsPanel').classList.add('hidden');
        document.getElementById('signalsPanel').classList.add('hidden');
        document.getElementById('statusSection').classList.add('hidden');
        
        // Pre-fill inputs if credentials exist in localStorage
        if (document.getElementById('botToken')) {
          document.getElementById('botToken').value = token || '';
          document.getElementById('chatId').value = chat || '';
          document.getElementById('vipChatId').value = vipChat || '';
          document.getElementById('adminKey').value = adminKey || '';
        }
      }
    }

    function switchTab(panelId) {
      const panels = ['dashboardPanel', 'engagementPanel', 'livePanel', 'perfPanel', 'vipPanel', 'cryptoRequestsPanel', 'analyticsPanel', 'usersPanel', 'promosPanel', 'announcementsPanel', 'marketingPanel', 'bookingsPanel', 'ticketsPanel', 'paymentsPanel', 'signalsPanel'];
      panels.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
      });
      document.getElementById(panelId).classList.remove('hidden');

      if (panelId === 'analyticsPanel') fetchAnalytics();
      if (panelId === 'usersPanel') fetchUsers();
      if (panelId === 'cryptoRequestsPanel') fetchCryptoRequests();
      if (panelId === 'promosPanel') fetchPromos();
      if (panelId === 'announcementsPanel') fetchAnnouncements();
      if (panelId === 'bookingsPanel') fetchBookings();
      if (panelId === 'ticketsPanel') fetchAdminTickets();
      if (panelId === 'paymentsPanel') fetchPayments();
      if (panelId === 'signalsPanel') fetchSignalsHistory();
    }

    async function saveCredentials(e) {
      e.preventDefault();
      const token = document.getElementById('botToken').value.trim();
      const chat = document.getElementById('chatId').value.trim();
      const vipChat = document.getElementById('vipChatId').value.trim();
      const discordWebhook = document.getElementById('discordWebhook')?.value.trim();
      const adminKey = document.getElementById('adminKey').value.trim();
      const totpToken = document.getElementById('totpToken')?.value.trim();
      
      if (!token || !chat || !adminKey) {
        if (typeof showToast !== 'undefined') showToast('Please fill all required fields.', 'error');
        else alert('Please fill all required fields.');
        return;
      }

      // Authenticate with backend
      try {
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin mx-auto"></i>';
        if(window.feather) feather.replace();

        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ totpToken })
        });
        const data = await res.json();
        
        btn.innerHTML = origText;

        if (data.requiresSetup) {
          // First time setup required
          localStorage.setItem('pa_admin_key', adminKey);
          open2FASetup();
          return;
        }

        if (data.ok && data.adminToken) {
          localStorage.setItem('pa_bot_token', token);
          localStorage.setItem('pa_chat_id', chat);
          if (vipChat) localStorage.setItem('pa_vip_chat_id', vipChat);
          else localStorage.removeItem('pa_vip_chat_id');
          if (discordWebhook) localStorage.setItem('pa_discord_webhook', discordWebhook);
          else localStorage.removeItem('pa_discord_webhook');
          localStorage.setItem('pa_admin_key', adminKey);
          localStorage.setItem('pa_admin_token', data.adminToken);
          
          if (typeof showToast !== 'undefined') showToast('Login successful!');
          checkCredentials();
        } else {
          // Show error and clear totpToken field so user can try a fresh code
          alert(data.error || 'Login failed.');
          const totpEl = document.getElementById('totpToken');
          if (totpEl) { totpEl.value = ''; totpEl.focus(); }
        }
      } catch (err) {
        alert('Network error during login. Check your internet connection.');
      }
    }

    function resetCredentials() {
      if (confirm('Are you sure you want to change your credentials?')) {
        localStorage.removeItem('pa_bot_token');
        localStorage.removeItem('pa_chat_id');
        localStorage.removeItem('pa_vip_chat_id');
        localStorage.removeItem('pa_discord_webhook');
        localStorage.removeItem('pa_admin_key');
        localStorage.removeItem('pa_admin_token');
        checkCredentials();
      }
    }

    async function reset2FA(silent = false) {
      const adminKey = document.getElementById('adminKey').value.trim();
      if (!adminKey) {
        alert('Please enter your Admin Access Key first to reset 2FA.');
        return;
      }
      if (!silent && !confirm('Are you sure you want to reset 2FA? You will need to scan a new QR code.')) return;
      
      try {
        const res = await fetch('/api/admin/2fa/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }
        });
        const data = await res.json();
        if (data.ok) {
          if (!silent) alert('2FA Reset Successful! Opening setup now...');
          // Automatically open the setup flow to scan a new QR
          await open2FASetup();
        } else {
          alert('Reset failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Network error while resetting 2FA.');
      }
    }

    function handlePairChange() {
      const select = document.getElementById('assetPair');
      const customWrapper = document.getElementById('customPairWrapper');
      
      if (select.value === 'CUSTOM') {
        customWrapper.classList.remove('hidden');
      } else {
        customWrapper.classList.add('hidden');
      }
      updateLivePreview();
    }

    function applyTemplate(type) {
      currentTemplate = type;
      
      // Update visual template buttons active state
      const btns = document.querySelectorAll('.template-btn');
      btns.forEach(btn => {
        btn.classList.remove('border-neon-purple', 'bg-neon-purple/10', 'text-white');
      });
      
      // Highlight correct active button
      let activeBtnIndex = 0;
      if (type === 'buy') activeBtnIndex = 0;
      else if (type === 'sell') activeBtnIndex = 1;
      else if (type === 'analysis') activeBtnIndex = 2;
      else if (type === 'update') activeBtnIndex = 3;
      
      btns[activeBtnIndex].classList.add('border-neon-purple', 'bg-neon-purple/10', 'text-white');
      
      // Fields to clear or set defaults
      const entryPrice = document.getElementById('entryPrice');
      const stopLoss = document.getElementById('stopLoss');
      const tp1 = document.getElementById('tp1');
      const tp2 = document.getElementById('tp2');
      const tp3 = document.getElementById('tp3');
      const execType = document.getElementById('execType');
      const notes = document.getElementById('notes');

      if (type === 'buy') {
        execType.disabled = false;
        execType.value = 'MARKET EXECUTION';
        entryPrice.placeholder = 'e.g. 2035.50';
        stopLoss.placeholder = 'e.g. 2025.00';
        tp1.placeholder = 'e.g. 2045.00';
        tp2.placeholder = 'e.g. 2055.00';
        tp3.placeholder = 'e.g. 2065.00';
        notes.placeholder = 'Reason for the buy signal...';
      } else if (type === 'sell') {
        execType.disabled = false;
        execType.value = 'MARKET EXECUTION';
        entryPrice.placeholder = 'e.g. 2050.00';
        stopLoss.placeholder = 'e.g. 2060.00';
        tp1.placeholder = 'e.g. 2040.00';
        tp2.placeholder = 'e.g. 2030.00';
        tp3.placeholder = 'e.g. 2020.00';
        notes.placeholder = 'Reason for the sell signal...';
      } else if (type === 'analysis') {
        execType.value = 'MARKET EXECUTION';
        execType.disabled = true;
        entryPrice.value = '';
        stopLoss.value = '';
        tp1.value = '';
        tp2.value = '';
        tp3.value = '';
        notes.placeholder = 'Share details about current price action, setups or trend direction...';
      } else if (type === 'update') {
        execType.value = 'MARKET EXECUTION';
        execType.disabled = true;
        entryPrice.value = '';
        stopLoss.value = '';
        tp1.value = '';
        tp2.value = '';
        tp3.value = '';
        notes.placeholder = 'Update on active trade: e.g. XAUUSD Buy running +50 pips, move SL to entry!';
      }

      updateLivePreview();
    }

    function buildTelegramMessageText() {
      // Gather inputs
      const pairSelect = document.getElementById('assetPair').value;
      const customPair = document.getElementById('customPair').value.toUpperCase().trim();
      const symbol = pairSelect === 'CUSTOM' ? (customPair || 'CUSTOM') : pairSelect;
      
      const exec = document.getElementById('execType').value;
      const entry = document.getElementById('entryPrice').value.trim();
      const sl = document.getElementById('stopLoss').value.trim();
      const t1 = document.getElementById('tp1').value.trim();
      const t2 = document.getElementById('tp2').value.trim();
      const t3 = document.getElementById('tp3').value.trim();
      const commentary = document.getElementById('notes').value.trim();
      
      let message = "";
      
      if (currentTemplate === 'buy') {
        message += `📈 *TRADE SIGNAL: BUY*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `🔥 *Symbol:* ${symbol}\n`;
        message += `💡 *Type:* ${exec}\n`;
        if (entry) message += `📥 *Entry Zone:* ${entry}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        if (sl) message += `🛡️ *Stop Loss:* ${sl}\n`;
        if (t1) message += `🎯 *Take Profit 1:* ${t1}\n`;
        if (t2) message += `🎯 *Take Profit 2:* ${t2}\n`;
        if (t3) message += `🎯 *Take Profit 3:* ${t3}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      } else if (currentTemplate === 'sell') {
        message += `📉 *TRADE SIGNAL: SELL*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `🔥 *Symbol:* ${symbol}\n`;
        message += `💡 *Type:* ${exec}\n`;
        if (entry) message += `📥 *Entry Zone:* ${entry}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        if (sl) message += `🛡️ *Stop Loss:* ${sl}\n`;
        if (t1) message += `🎯 *Take Profit 1:* ${t1}\n`;
        if (t2) message += `🎯 *Take Profit 2:* ${t2}\n`;
        if (t3) message += `🎯 *Take Profit 3:* ${t3}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      } else if (currentTemplate === 'analysis') {
        message += `📊 *MARKET ANALYSIS: ${symbol}*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      } else if (currentTemplate === 'update') {
        message += `⚠️ *TRADE UPDATE: ${symbol}*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      }

      if (commentary) {
        message += `💬 *Analysis / Notes:*\n${commentary}\n\n`;
      }

      message += `💎 _Trading involves risk. Practice proper risk management!_`;
      return message;
    }

    function updateLivePreview() {
      const plainText = buildTelegramMessageText();
      
      // Formatting preview for HTML display
      // Convert markdown-like symbols to HTML spans
      let htmlText = plainText
        .replace(/\*(.*?)\*/g, '<strong class="font-bold text-white">$1</strong>')
        .replace(/_(.*?)_/g, '<em class="italic text-gray-300">$1</em>');

      document.getElementById('tgPreviewContent').innerHTML = htmlText;
    }

    async function sendBroadcast(e) {
      e.preventDefault();
      
      const token = localStorage.getItem('pa_bot_token');
      const generalChat = localStorage.getItem('pa_chat_id');
      const vipChat = localStorage.getItem('pa_vip_chat_id');
      
      if (!token || !generalChat) {
        alert('Credentials missing! Please setup settings first.');
        checkCredentials();
        return;
      }

      // Determine target channel
      const targetSelection = document.querySelector('input[name="targetChannel"]:checked');
      const isVip = targetSelection && targetSelection.value === 'vip';
      const chat = isVip ? vipChat : generalChat;

      if (isVip && !chat) {
        alert('VIP Channel Chat ID is missing! Please configure it in Setup Credentials.');
        return;
      }

      const messageText = buildTelegramMessageText();
      const broadcastBtn = document.getElementById('broadcastBtn');
      const feedbackMsg = document.getElementById('feedbackMsg');
      
      // Visual Loading State
      broadcastBtn.disabled = true;
      broadcastBtn.classList.add('opacity-75', 'cursor-not-allowed');
      feedbackMsg.innerHTML = '<span class="text-neon-blue animate-pulse flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-neon-blue animate-ping"></span>Broadcasting via API...</span>';
      
      const imageInput = document.getElementById('chartImage');
      const file = imageInput.files ? imageInput.files[0] : null;
      
      const entryTime = document.getElementById('entryTime').value;
      const category = document.getElementById('signalCategory') ? document.getElementById('signalCategory').value : 'Forex';
      const payload = {
        token: token,
        chatId: chat,
        text: messageText,
        type: 'signal',
        category: category,
        entryTime: entryTime ? new Date(entryTime).getTime() : null
      };

      try {
        if (file) {
          const reader = new FileReader();
          reader.onload = async function(event) {
            payload.imageBase64 = event.target.result;
            await doBackendBroadcast(payload, broadcastBtn, feedbackMsg);
          };
          reader.readAsDataURL(file);
        } else {
          await doBackendBroadcast(payload, broadcastBtn, feedbackMsg);
        }
      } catch (err) {
        console.error(err);
        feedbackMsg.innerHTML = '<span class="text-rose-400">Network Error. Check connection.</span>';
        broadcastBtn.disabled = false;
        broadcastBtn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
    }

    async function doBackendBroadcast(payload, btn, feedbackEl) {
      try {
        const response = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (data.ok) {
          showToast();
          feedbackEl.innerHTML = '<span class="text-emerald-400">Broadcast sent successfully!</span>';
          
          document.getElementById('entryPrice').value = '';
          document.getElementById('stopLoss').value = '';
          document.getElementById('tp1').value = '';
          document.getElementById('tp2').value = '';
          document.getElementById('tp3').value = '';
          document.getElementById('notes').value = '';
          // Reset Flatpickr entry time picker
          if (entryTimePicker) entryTimePicker.clear();
          document.getElementById('entryTime').value = '';
          document.getElementById('entryTimeDisplay').textContent = 'Pick date & time...';
          document.getElementById('entryTimeTrigger').classList.remove('has-value');
          document.getElementById('entryTimeClear').classList.add('hidden');
          clearImage();
          updateLivePreview();
        } else {
          feedbackEl.innerHTML = `<span class="text-rose-400">Error: ${data.error || 'Failed to send'}</span>`;
        }
      } catch (err) {
        console.error('Frontend Broadcast Error:', err);
        feedbackEl.innerHTML = `<span class="text-rose-400">Error: ${err.message || 'Network/Server Error'}</span>`;
      } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
    }

    function handleImageUpload(e) {
      const file = e.target.files[0];
      const fileNameLabel = document.getElementById('fileNameLabel');
      const clearBtn = document.getElementById('clearImageBtn');
      const tgImgContainer = document.getElementById('tgImagePreviewContainer');
      const tgImg = document.getElementById('tgImagePreview');
      
      if (file) {
        fileNameLabel.innerText = file.name;
        clearBtn.classList.remove('hidden');
        
        // Show in simulated preview
        const objectUrl = URL.createObjectURL(file);
        tgImg.src = objectUrl;
        tgImgContainer.classList.remove('hidden');
      }
    }

    function clearImage() {
      const fileInput = document.getElementById('chartImage');
      fileInput.value = '';
      
      document.getElementById('fileNameLabel').innerText = 'Choose Image...';
      document.getElementById('clearImageBtn').classList.add('hidden');
      
      const tgImgContainer = document.getElementById('tgImagePreviewContainer');
      const tgImg = document.getElementById('tgImagePreview');
      tgImg.src = '';
      tgImgContainer.classList.add('hidden');
    }

    function shareToWhatsApp() {
      // Build the message text (same as Telegram)
      const rawText = buildTelegramMessageText();
      
      // Strip markdown formatting that Telegram uses (* _ ) since WhatsApp uses different formatting
      const whatsappText = rawText
        .replace(/\*(.*?)\*/g, '*$1*')   // keep bold asterisks (WhatsApp also supports *bold*)
        .replace(/_(.*?)_/g, '_$1_');    // keep italic underscores (WhatsApp also supports _italic_)
      
      // Encode the text for a URL
      const encoded = encodeURIComponent(whatsappText);
      
      // Open WhatsApp with the message pre-filled
      // On mobile: opens the WhatsApp app. On desktop: opens WhatsApp Web.
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, '_blank');
    }

    // --- ENGAGEMENT PANEL LOGIC ---

    const engTemplates = {
      buy_alert: "🟢 *BUY SIGNAL TRIGGERED!* 🟢\n\nPrice action is looking bullish. I'm taking a long position here. 🚀💸\n\nWho's riding this wave with me?",
      sell_alert: "🔴 *SELL SIGNAL TRIGGERED!* 🔴\n\nBears are in control. I'm taking a short position right now. 📉🩸\n\nSecure your entries!",
      tp_hit: "🎯 *TAKE PROFIT HIT!* 🎯\n\nBoom! Target smashed. Secured the bag! 💰🍾\n\nHope you all caught this massive move. Move stops to breakeven if you're holding runners!",
      stop_out: "🛑 *STOP LOSS HIT!* 🛑\n\nMarket reversed on us this time. That's part of the game. We manage risk and move to the next setup. Stay disciplined! 🛡️💯",
      morning: "🌅 *Good morning team!* \n\nHope everyone had a great rest. Let's conquer the markets today! 💰💪\n\nWho is ready for today's setups?",
      ready: "🔔 *Are you ready?*\n\nI'm scanning the charts right now. High probability setups forming... 👀📊\n\nMake sure your notifications are ON! 🚀",
      session: "📈 *London/NY Session Open!*\n\nVolume is kicking in. Let's stick to our trading plan and execute with discipline. 🎯💎\n\nWhat pairs are you watching?",
      mindset: "🧠 *Trader Mindset*\n\nRemember: Patience pays. Don't force trades. Wait for your edge to present itself. Risk management is everything! 🛡️💯",
      weekend: "😎 *Weekend Recap*\n\nGreat week of trading! Take some time to review your trades, rest up, and enjoy the weekend with family. We go hard again on Monday! 🏆🥂",
      friday_close: "🛑 *Market is Closing!*\n\nThe markets are closing soon for the weekend. Make sure to manage any open positions, secure your profits, and avoid holding unnecessary risk over the weekend. 📉🔒\n\nHave a great weekend! 🍻",
      sunday_open: "🔔 *Market Opens Tomorrow!*\n\nGet ready! The markets are opening tomorrow for a brand new trading week. Time to review your charts, plan your setups, and get in the zone. 🚀📈\n\nWho's ready for Monday?",
      news_warning: "⚠️ *HIGH IMPACT NEWS ALERT!* ⚠️\n\nWe have major economic news dropping shortly. Expect high volatility! If you're in active trades, consider securing profits or moving stops to breakeven. Stay safe! 🛡️📊",
      mid_week: "🐪 *Mid-Week Check-in!*\n\nWe are halfway through the trading week. How is everyone's week going so far? Remember to stick to your trading plan and not force any setups. Patience pays! 💎🙌",
      vip_promo: "👑 *VIP Exclusive Win!* 👑\n\nOur VIP members caught this massive move early! If you're tired of missing out and want real-time signals and premium support, it's time to upgrade. 🚀💸\n\nDM me to join the VIP Inner Circle today!",
      weekly_recap: "📊 *Weekly Recap Time!*\n\nWhat a phenomenal week of trading! We bagged some massive pips together. Let's tally up the wins and review the lessons from any losses. Consistent growth is the goal! 🏆📈\n\nHow many pips did you catch this week?",
      risk_mgmt: "🛡️ *Risk Management Check!*\n\nA quick reminder: Protect your capital first, make money second. Never risk more than 1-2% on a single trade. A winning strategy is nothing without proper risk management. Keep your discipline! 🧠💯",
      broker_promo: "🏦 *Ready for the New Week?*\n\nMake sure your trading accounts are fully funded and ready to catch the next wave of setups! If you're looking for tight spreads and fast execution, check out our recommended broker link in the bio. Let's get these pips! 💸⚡",
      free_signal: "🎁 *Free Signal Teaser!*\n\nI'm watching a high-probability setup forming right now... I might drop this one for free for the public channel! 👀 Drop a 🔥 if you want me to share it!",
      motivation: "🔥 *Daily Motivation*\n\nTrading is 20% strategy and 80% psychology. Don't let one bad trade ruin your day, and don't let one good trade inflate your ego. Stay humble, stay focused, and trust the process! 🦅📈",
      custom: ""
    };

    function applyEngagementTemplate(type) {
      document.getElementById('engMessage').value = engTemplates[type] || "";
      updateEngPreview();
    }

    function insertEngEmoji(emoji) {
      const textarea = document.getElementById('engMessage');
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      const text = textarea.value;
      
      textarea.value = text.substring(0, startPos) + emoji + text.substring(endPos, text.length);
      textarea.selectionStart = startPos + emoji.length;
      textarea.selectionEnd = startPos + emoji.length;
      textarea.focus();
      updateEngPreview();
    }

    function updateEngPreview() {
      const msg = document.getElementById('engMessage').value;
      const stickerId = document.getElementById('engStickerId').value.trim();
      const previewEl = document.getElementById('engPreviewContent');
      const stickerPreview = document.getElementById('engStickerPreview');
      
      let html = msg || 'Select a template or type a message...';
      html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                 .replace(/_(.*?)_/g, '<em>$1</em>')
                 .replace(/\n/g, '<br>');
      previewEl.innerHTML = html;

      if (stickerId) {
        stickerPreview.classList.remove('hidden');
      } else {
        stickerPreview.classList.add('hidden');
      }

      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      const timeStr = hours + ':' + minutes + ' ' + ampm;
      const timeEl = document.getElementById('engTime');
      if (timeEl) timeEl.innerText = timeStr;
    }

    function handleEngImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      document.getElementById('engFileLabel').innerText = file.name;
      document.getElementById('clearEngImageBtn').classList.remove('hidden');
      
      const reader = new FileReader();
      reader.onload = function(event) {
        const imgContainer = document.getElementById('engImgContainer');
        const imgPreview = document.getElementById('engImgPreview');
        imgPreview.src = event.target.result;
        imgContainer.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }

    function clearEngImage() {
      document.getElementById('engImage').value = '';
      document.getElementById('engFileLabel').innerText = 'Choose Image...';
      document.getElementById('clearEngImageBtn').classList.add('hidden');
      
      const imgContainer = document.getElementById('engImgContainer');
      const imgPreview = document.getElementById('engImgPreview');
      imgPreview.src = '';
      imgContainer.classList.add('hidden');
    }

    async function sendEngagement() {
      const token = localStorage.getItem('pa_bot_token');
      const generalChat = localStorage.getItem('pa_chat_id');
      const vipChat = localStorage.getItem('pa_vip_chat_id');
      
      const targetSelection = document.querySelector('input[name="targetChannel"]:checked');
      const isVip = targetSelection && targetSelection.value === 'vip';
      const chat = isVip ? vipChat : generalChat;

      const btn = event.currentTarget;
      const feedbackMsg = document.getElementById('engFeedback');
      
      if (!token || !generalChat) {
        feedbackMsg.innerHTML = '<span class="text-rose-400">Error: Missing credentials in Setup.</span>';
        return;
      }
      if (isVip && !chat) {
        feedbackMsg.innerHTML = '<span class="text-rose-400">Error: VIP Channel Chat ID missing in Setup.</span>';
        return;
      }

      const text = document.getElementById('engMessage').value;
      const stickerId = document.getElementById('engStickerId').value.trim();
      const file = document.getElementById('engImage').files[0];

      if (!text && !stickerId && !file) {
        feedbackMsg.innerHTML = '<span class="text-amber-400">Please provide a message, sticker, or image.</span>';
        return;
      }

      btn.disabled = true;
      btn.classList.add('opacity-75', 'cursor-not-allowed');
      feedbackMsg.innerHTML = '<span class="text-sky-400 animate-pulse">Sending via API...</span>';

      const payload = { token, chatId: chat, text, stickerId, type: 'engagement' };

      try {
        if (file) {
          const reader = new FileReader();
          reader.onload = async function(event) {
            payload.imageBase64 = event.target.result;
            await sendPayload('/api/broadcast', payload, btn, feedbackMsg, () => {
              document.getElementById('engMessage').value = '';
              document.getElementById('engStickerId').value = '';
              clearEngImage();
              updateEngPreview();
            });
          };
          reader.readAsDataURL(file);
        } else {
          await sendPayload('/api/broadcast', payload, btn, feedbackMsg, () => {
            document.getElementById('engMessage').value = '';
            document.getElementById('engStickerId').value = '';
            clearEngImage();
            updateEngPreview();
          });
        }
      } catch (err) {
        console.error(err);
        feedbackMsg.innerHTML = `<span class="text-rose-400">Error: ${err.message}</span>`;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
    }

    async function sendPayload(url, payload, btn, feedbackEl, onSuccess) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Request failed');
        
        feedbackEl.innerHTML = '<span class="text-emerald-400">Sent successfully!</span>';
        showToast();
        if (onSuccess) onSuccess();
      } catch (err) {
        feedbackEl.innerHTML = `<span class="text-rose-400">Error: ${err.message}</span>`;
      } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
      }
    }

    function shareEngToWhatsApp() {
      const text = document.getElementById('engMessage').value;
      if (!text) {
        document.getElementById('engFeedback').innerHTML = '<span class="text-amber-400">Please provide a message to share.</span>';
        return;
      }
      
      const whatsappText = text
        .replace(/\*(.*?)\*/g, '*$1*')
        .replace(/_(.*?)_/g, '_$1_');
      
      const encoded = encodeURIComponent(whatsappText);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, '_blank');
    }

    // --- LIVE SESSIONS PANEL LOGIC ---

    const liveTemplates = {
      starting_now: "🔴 *WE ARE LIVE!* 🔴\n\nThe Voice Chat is officially open. Jump in right now as we break down the charts, discuss the latest PA, and find our entries.\n\n👇 *Click the link below to join immediately:*",
      starting_soon: "⏳ *LIVE SESSION STARTING SOON* ⏳\n\nGet your charts ready! I'll be opening a live voice chat in exactly 15 minutes. We will review today's setups.\n\nMake sure your notifications are ON! 🔔",
      qa_session: "🙋‍♂️ *LIVE Q&A SESSION* 🙋‍♂️\n\nI'm opening up the voice room to answer your trading questions. Bring your charts and let's learn together!\n\n👇 *Tap to join the room:*",
      market_breakdown: "📊 *WEEKLY MARKET BREAKDOWN* 📊\n\nJoin the live voice chat now. I'm sharing my screen and going through all the major pairs to prepare for the week ahead.\n\n👇 *Join the stream:*",
      tiktok_live: "🎵 *TIKTOK LIVE STREAM!* 🎵\n\nI'm going live on TikTok right now! Join the stream to watch me trade live, answer your questions, and analyze the markets in real-time.\n\n👇 *Tap to join the live stream:*",
    };

    function applyLiveTemplate(type) {
      document.getElementById('liveMessage').value = liveTemplates[type] || "";
      updateLiveRoomPreview();
    }

    function updateLiveRoomPreview() {
      const msg = document.getElementById('liveMessage').value;
      const link = document.getElementById('liveInviteLink').value.trim();
      const previewEl = document.getElementById('livePreviewContent');
      const linkPreview = document.getElementById('liveLinkPreview');
      
      let html = msg || 'Select a live template...';
      html = html.replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                 .replace(/_(.*?)_/g, '<em>$1</em>')
                 .replace(/\n/g, '<br>');
      
      // If they typed a link, append it visibly to the preview text so they see what will be sent
      if (link) {
         html += `<br><br><a href="${link}" class="text-sky-400 underline break-all">${link}</a>`;
         linkPreview.classList.remove('hidden');
      } else {
         linkPreview.classList.add('hidden');
      }

      previewEl.innerHTML = html;

      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      const timeEl = document.getElementById('liveTime');
      if (timeEl) timeEl.innerText = hours + ':' + minutes + ' ' + ampm;
    }

    async function sendLiveSession() {
      const token = localStorage.getItem('pa_bot_token');
      const generalChat = localStorage.getItem('pa_chat_id');
      const vipChat = localStorage.getItem('pa_vip_chat_id');
      
      const targetSelection = document.querySelector('input[name="targetChannel"]:checked');
      const isVip = targetSelection && targetSelection.value === 'vip';
      const chat = isVip ? vipChat : generalChat;

      const btn = event.currentTarget;
      const feedbackMsg = document.getElementById('liveFeedback');
      
      if (!token || !generalChat) {
        feedbackMsg.innerHTML = '<span class="text-rose-400">Error: Missing credentials in Setup.</span>';
        return;
      }
      if (isVip && !chat) {
        feedbackMsg.innerHTML = '<span class="text-rose-400">Error: VIP Channel Chat ID missing in Setup.</span>';
        return;
      }

      const msg = document.getElementById('liveMessage').value.trim();
      const link = document.getElementById('liveInviteLink').value.trim();

      if (!msg && !link) {
        feedbackMsg.innerHTML = '<span class="text-amber-400">Please provide a message or a link.</span>';
        return;
      }

      let fullMessage = msg;
      if (link) fullMessage += `\n\n${link}`;

      btn.disabled = true;
      btn.classList.add('opacity-75', 'cursor-not-allowed');
      feedbackMsg.innerHTML = '<span class="text-sky-400 animate-pulse">Broadcasting via API...</span>';

      const payload = { token, chatId: chat, text: fullMessage, type: 'live' };
      
      await sendPayload('/api/broadcast', payload, btn, feedbackMsg, () => {
        document.getElementById('liveMessage').value = '';
        document.getElementById('liveInviteLink').value = '';
        updateLiveRoomPreview();
      });
    }

    function shareLiveToWhatsApp() {
      const msg = document.getElementById('liveMessage').value.trim();
      const link = document.getElementById('liveInviteLink').value.trim();
      
      if (!msg && !link) {
        document.getElementById('liveFeedback').innerHTML = '<span class="text-amber-400">Please provide a message to share.</span>';
        return;
      }
      
      let fullMessage = msg;
      if (link) {
         fullMessage += `\n\n${link}`;
      }

      const whatsappText = fullMessage
        .replace(/\*(.*?)\*/g, '*$1*')
        .replace(/_(.*?)_/g, '_$1_');
      
      const encoded = encodeURIComponent(whatsappText);
      const url = `https://api.whatsapp.com/send?text=${encoded}`;
      window.open(url, '_blank');
    }

    // --- PERFORMANCE TRACKER LOGIC ---
    function buildPerfMessage() {
      const wins = parseInt(document.getElementById('perfWins').value) || 0;
      const losses = parseInt(document.getElementById('perfLosses').value) || 0;
      const pips = document.getElementById('perfPips').value || '0';
      const week = document.getElementById('perfWeek').value || 'This Week';
      const notes = document.getElementById('perfNotes').value.trim();
      const total = wins + losses;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

      let ratingEmoji = winRate >= 80 ? '🔥' : winRate >= 60 ? '✅' : '📊';

      let msg = `📊 *WEEKLY PERFORMANCE RECAP* 📊\n`;
      msg += `🗓️ *${week}*\n\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `✅ Wins: *${wins}*\n`;
      msg += `❌ Losses: *${losses}*\n`;
      msg += `🎯 Win Rate: *${winRate}%* ${ratingEmoji}\n`;
      msg += `📈 Total Pips: *+${pips} pips*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      if (notes) msg += `💬 ${notes}\n\n`;
      msg += `Stay consistent, manage risk, and let's go even harder next week! 💪💰`;
      return msg;
    }

    function updatePerfPreview() {
      const msg = buildPerfMessage();
      const previewEl = document.getElementById('perfPreviewContent');
      let html = msg.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      previewEl.innerHTML = html;

      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      const timeEl = document.getElementById('perfTime');
      if (timeEl) timeEl.innerText = `${hours}:${minutes} ${ampm}`;
    }

    async function sendPerformance() {
      const token = localStorage.getItem('pa_bot_token');
      const chat = localStorage.getItem('pa_chat_id');
      const btn = event.currentTarget;
      const feedbackMsg = document.getElementById('perfFeedback');

      if (!token || !chat) {
        feedbackMsg.innerHTML = '<span class="text-rose-400">Error: Missing credentials.</span>';
        return;
      }

      const msg = buildPerfMessage();

      btn.disabled = true;
      btn.classList.add('opacity-75', 'cursor-not-allowed');
      feedbackMsg.innerHTML = '<span class="text-sky-400 animate-pulse">Broadcasting via API...</span>';

      const payload = { token, chatId: chat, text: msg, type: 'performance' };
      
      await sendPayload('/api/broadcast', payload, btn, feedbackMsg);
    }

    function sharePerfToWhatsApp() {
      const msg = buildPerfMessage();
      const encoded = encodeURIComponent(msg.replace(/\*(.*?)\*/g, '*$1*'));
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }

    async function logTradeResult() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const btn = document.getElementById('logTradeBtn');
      const feedback = document.getElementById('logFeedback');
      
      const asset = document.getElementById('logAsset').value.trim();
      const type = document.getElementById('logType').value;
      const result = document.getElementById('logResult').value;
      const pips = document.getElementById('logPips').value;

      if (!asset || pips === '') {
        feedback.innerHTML = '<span class="text-rose-400">Please fill out asset and pips.</span>';
        return;
      }

      btn.disabled = true;
      feedback.innerHTML = '<span class="text-sky-400">Saving...</span>';

      try {
        const res = await fetch('/api/performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ asset, type, result, pips })
        });
        const data = await res.json();
        if (data.ok) {
          feedback.innerHTML = '<span class="text-emerald-400">Trade logged successfully! It is now public.</span>';
          document.getElementById('logAsset').value = '';
          document.getElementById('logPips').value = '';
          setTimeout(() => feedback.innerHTML = '', 4000);
        } else {
          feedback.innerHTML = `<span class="text-rose-400">Error: ${data.error}</span>`;
        }
      } catch (err) {
        feedback.innerHTML = '<span class="text-rose-400">Network Error.</span>';
      } finally {
        btn.disabled = false;
      }
    }

    function showToast() {
      const toast = document.getElementById('toast');
      toast.classList.remove('translate-y-20', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
      
      setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
      }, 4000);
    }

    // --- VIP SUBSCRIBERS LOGIC ---
    async function fetchSubscribers() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const tbody = document.getElementById('subscriberListBody');
      tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto text-amber-400"></i></td></tr>';
      feather.replace();
      try {
        const res = await fetch('/api/admin/subscribers', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        if (data.ok) {
          if (data.subscribers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-500">No subscribers found yet.</td></tr>';
          } else {
            // Sort newest first
            data.subscribers.sort((a,b) => (b.joinedAt || 0) - (a.joinedAt || 0));
            tbody.innerHTML = data.subscribers.map(sub => {
              const dateStr = sub.joinedAt ? new Date(sub.joinedAt).toLocaleString() : '-';
              return `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                  <td class="py-3 px-3 font-medium text-white">${sub.name || '-'}</td>
                  <td class="py-3 px-3 text-sky-400 font-mono">${sub.telegram || '-'}</td>
                  <td class="py-3 px-3 text-gray-300 font-mono">${sub.email || '-'}</td>
                  <td class="py-3 px-3 text-right text-gray-500 font-mono">${dateStr}</td>
                </tr>
              `;
            }).join('');
          }
        } else {
          tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-rose-400">Error: ${data.error}</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-rose-400">Connection error.</td></tr>';
      }
    }

    async function fetchWhatsAppList() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const tbody = document.getElementById('whatsappListBody');
      if(!tbody) return;
      tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto text-emerald-400"></i></td></tr>';
      feather.replace();
      try {
        const res = await fetch('/api/admin/whatsapp-list', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        if (data.ok) {
          if (data.subscribers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="py-8 text-center text-gray-500">No WhatsApp subscribers yet.</td></tr>';
          } else {
            data.subscribers.sort((a,b) => (b.joinedAt || 0) - (a.joinedAt || 0));
            tbody.innerHTML = data.subscribers.map(sub => {
              const dateStr = sub.joinedAt ? new Date(sub.joinedAt).toLocaleString() : '-';
              return `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                  <td class="py-3 px-3 font-medium text-emerald-400 font-mono">${sub.phone || '-'}</td>
                  <td class="py-3 px-3 text-right text-gray-500 font-mono">${dateStr}</td>
                </tr>
              `;
            }).join('');
          }
        } else {
          tbody.innerHTML = `<tr><td colspan="2" class="py-4 text-center text-rose-400">Error: ${data.error}</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-rose-400">Connection error.</td></tr>';
      }
    }

    // VIP Documents & Setup Management
    async function fetchTodaysSetup() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;

      const label = document.getElementById('setupUploadLabel');
      const status = document.getElementById('setupUploadStatus');
      const previewContainer = document.getElementById('todaysSetupPreviewContainer');
      const previewImg = document.getElementById('todaysSetupPreviewImg');
      const filenameEl = document.getElementById('todaysSetupFilename');
      const expiryStatus = document.getElementById('todaysSetupExpiryStatus');

      try {
        const res = await fetch('/api/admin/todays-setup', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        
        if (data.ok && data.setup && data.setup.image) {
          previewImg.src = data.setup.image;
          previewContainer.classList.remove('hidden');
          if (filenameEl) {
            filenameEl.textContent = data.setup.filename || 'todays-setup.png';
          }
          if (expiryStatus) expiryStatus.classList.add('hidden');
          label.innerHTML = 'Update Image Again';
          status.textContent = 'Active Today\'s Setup is loaded.';
          status.className = 'mt-2 text-xs text-emerald-400';
        } else {
          previewContainer.classList.add('hidden');
          previewImg.src = '';
          label.innerHTML = 'Click to Upload Image';
          status.textContent = '';
        }
      } catch (err) {
        console.error('Error fetching today\'s setup:', err);
      }
    }

    async function uploadTodaysSetup() {
      const fileInput = document.getElementById('todaysSetupFile');
      const file = fileInput.files[0];
      if (!file) return;

      const label = document.getElementById('setupUploadLabel');
      const status = document.getElementById('setupUploadStatus');
      const adminToken = localStorage.getItem('pa_admin_token');

      label.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> Uploading...';
      feather.replace();

      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Image = reader.result;
          
          const entryTimeVal = document.getElementById('entryTime') ? document.getElementById('entryTime').value : null;
          const entryTimeMs = entryTimeVal ? new Date(entryTimeVal).getTime() : null;

          const res = await fetch('/api/admin/upload-todays-setup', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-admin-token': adminToken 
            },
            body: JSON.stringify({ image: base64Image, filename: file.name, entryTime: entryTimeMs })
          });
          
          const data = await res.json();
          if (data.ok) {
            status.textContent = '✅ Setup updated successfully!';
            status.className = 'mt-2 text-xs text-emerald-400';
            label.innerHTML = 'Update Image Again';
            fetchTodaysSetup();
          } else {
            status.textContent = '❌ ' + data.error;
            status.className = 'mt-2 text-xs text-rose-400';
            label.innerHTML = 'Click to Upload Image';
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        status.textContent = '❌ Error uploading file.';
        status.className = 'mt-2 text-xs text-rose-400';
        label.innerHTML = 'Click to Upload Image';
      }
    }

    async function removeTodaysSetup() {
      if (!confirm('Are you sure you want to remove the current Today\'s Setup?')) return;
      const adminToken = localStorage.getItem('pa_admin_token');
      const status = document.getElementById('setupUploadStatus');
      const label = document.getElementById('setupUploadLabel');
      
      status.textContent = 'Removing...';
      status.className = 'mt-2 text-xs text-amber-400';
      
      try {
        const res = await fetch('/api/admin/todays-setup', {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        
        if (data.ok) {
          status.textContent = '✅ Setup removed successfully!';
          status.className = 'mt-2 text-xs text-emerald-400';
          label.innerHTML = 'Click to Upload Image';
          
          const previewContainer = document.getElementById('todaysSetupPreviewContainer');
          const previewImg = document.getElementById('todaysSetupPreviewImg');
          if (previewContainer) previewContainer.classList.add('hidden');
          if (previewImg) previewImg.src = '';
        } else {
          status.textContent = '❌ ' + data.error;
          status.className = 'mt-2 text-xs text-rose-400';
        }
      } catch (err) {
        status.textContent = '❌ Network error.';
        status.className = 'mt-2 text-xs text-rose-400';
      }
    }

    async function fetchTodaysSetupResults() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;

      const label = document.getElementById('setupResultsUploadLabel');
      const status = document.getElementById('setupResultsUploadStatus');
      const previewContainer = document.getElementById('todaysSetupResultsPreviewContainer');
      const previewImg = document.getElementById('todaysSetupResultsPreviewImg');
      const filenameEl = document.getElementById('todaysSetupResultsFilename');

      try {
        const res = await fetch('/api/admin/todays-setup-results', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        
        if (data.ok && data.setup && data.setup.image) {
          previewImg.src = data.setup.image;
          previewContainer.classList.remove('hidden');
          if (filenameEl) {
            filenameEl.textContent = data.setup.filename || 'todays-setup-results.png';
          }
          label.innerHTML = 'Update Image Again';
          status.textContent = 'Active Today\'s Setup Results is loaded.';
          status.className = 'mt-2 text-xs text-emerald-400';
        } else {
          previewContainer.classList.add('hidden');
          previewImg.src = '';
          label.innerHTML = 'Click to Upload Results';
          status.textContent = '';
        }
      } catch (err) {
        console.error('Error fetching today\'s setup results:', err);
      }
    }

    async function uploadTodaysSetupResults() {
      const fileInput = document.getElementById('todaysSetupResultsFile');
      const file = fileInput.files[0];
      if (!file) return;

      const label = document.getElementById('setupResultsUploadLabel');
      const status = document.getElementById('setupResultsUploadStatus');
      const adminToken = localStorage.getItem('pa_admin_token');

      label.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> Uploading...';
      feather.replace();

      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Image = reader.result;
          
          const res = await fetch('/api/admin/upload-todays-setup-results', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-admin-token': adminToken 
            },
            body: JSON.stringify({ image: base64Image, filename: file.name })
          });
          
          const data = await res.json();
          if (data.ok) {
            status.textContent = '✅ Setup results updated successfully!';
            status.className = 'mt-2 text-xs text-emerald-400';
            label.innerHTML = 'Update Image Again';
            fetchTodaysSetupResults();
          } else {
            status.textContent = '❌ ' + data.error;
            status.className = 'mt-2 text-xs text-rose-400';
            label.innerHTML = 'Click to Upload Results';
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        status.textContent = '❌ Error uploading file.';
        status.className = 'mt-2 text-xs text-rose-400';
        label.innerHTML = 'Click to Upload Results';
      }
    }

    async function removeTodaysSetupResults() {
      if (!confirm('Are you sure you want to remove the current Today\'s Setup Results?')) return;
      const adminToken = localStorage.getItem('pa_admin_token');
      const status = document.getElementById('setupResultsUploadStatus');
      const label = document.getElementById('setupResultsUploadLabel');
      
      status.textContent = 'Removing...';
      status.className = 'mt-2 text-xs text-amber-400';
      
      try {
        const res = await fetch('/api/admin/todays-setup-results', {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();
        
        if (data.ok) {
          status.textContent = '✅ Setup results removed successfully!';
          status.className = 'mt-2 text-xs text-emerald-400';
          label.innerHTML = 'Click to Upload Results';
          
          const previewContainer = document.getElementById('todaysSetupResultsPreviewContainer');
          const previewImg = document.getElementById('todaysSetupResultsPreviewImg');
          if (previewContainer) previewContainer.classList.add('hidden');
          if (previewImg) previewImg.src = '';
        } else {
          status.textContent = '❌ ' + data.error;
          status.className = 'mt-2 text-xs text-rose-400';
        }
      } catch (err) {
        status.textContent = '❌ Network error.';
        status.className = 'mt-2 text-xs text-rose-400';
      }
    }

    async function fetchVIPDocuments() {
      const adminToken = localStorage.getItem('pa_admin_token');
      const container = document.getElementById('documentListContainer');
      if (!adminToken) return;

      try {
        const res = await fetch('/api/admin/vip-documents', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();

        if (data.ok) {
          if (data.documents.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 text-xs py-8">No documents hosted on server.</p>';
            return;
          }

          container.innerHTML = data.documents.map(doc => {
            const size = (doc.sizeBytes / 1024).toFixed(1) + ' KB';
            const icon = doc.filename.endsWith('.zip') ? 'archive' : 'file';
            return `
              <div class="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <i data-feather="${icon}" class="w-4 h-4"></i>
                  </div>
                  <div class="min-w-0">
                    <p class="text-white text-xs font-semibold truncate" title="${doc.filename}">${doc.filename}</p>
                    <p class="text-gray-500 text-[10px]">${size}</p>
                  </div>
                </div>
                <button type="button" onclick="deleteVIPDocument('${doc.filename}')" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-rose-400 transition cursor-pointer" title="Delete file">
                  <i data-feather="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            `;
          }).join('');
          feather.replace();
        } else {
          container.innerHTML = `<p class="text-center text-rose-400 text-xs py-8">Error: ${data.error || 'Failed to list'}</p>`;
        }
      } catch (err) {
        container.innerHTML = '<p class="text-center text-rose-400 text-xs py-8">Network Error. Check console.</p>';
      }
    }

    let selectedDocFile = null;
    function handleDocUploadSelect(e) {
      const file = e.target.files[0];
      const label = document.getElementById('vipDocFileLabel');
      
      if (file) {
        selectedDocFile = file;
        label.innerText = file.name;
      }
    }

    async function uploadVipDocument() {
      const adminToken = localStorage.getItem('pa_admin_token');
      const btn = document.getElementById('uploadDocBtn');
      const feedback = document.getElementById('uploadFeedback');
      
      if (!selectedDocFile) {
        feedback.innerHTML = '<span class="text-amber-400">Please choose a file first.</span>';
        return;
      }

      if (selectedDocFile.size > 10 * 1024 * 1024) {
        feedback.innerHTML = '<span class="text-rose-400">File size exceeds 10MB limit.</span>';
        return;
      }

      btn.disabled = true;
      feedback.innerHTML = '<span class="text-amber-400 animate-pulse">Uploading document...</span>';

      const reader = new FileReader();
      reader.onload = async function(event) {
        const fileData = event.target.result;
        try {
          const res = await fetch('/api/admin/upload-vip-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-token': adminToken
            },
            body: JSON.stringify({ filename: selectedDocFile.name, fileData })
          });
          const data = await res.json();
          
          if (data.ok) {
            feedback.innerHTML = '<span class="text-emerald-400">Uploaded successfully!</span>';
            selectedDocFile = null;
            document.getElementById('vipDocUploadInput').value = '';
            document.getElementById('vipDocFileLabel').innerText = 'Choose Document...';
            fetchVIPDocuments();
            setTimeout(() => { feedback.innerHTML = ''; }, 3000);
          } else {
            feedback.innerHTML = `<span class="text-rose-400">Error: ${data.error || 'Upload failed'}</span>`;
          }
        } catch (err) {
          feedback.innerHTML = '<span class="text-rose-400">Upload network error.</span>';
        } finally {
          btn.disabled = false;
        }
      };
      reader.readAsDataURL(selectedDocFile);
    }

    async function deleteVIPDocument(filename) {
      if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
      
      const adminToken = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/delete-vip-document/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();

        if (data.ok) {
          fetchVIPDocuments();
        } else {
          alert(`Failed to delete document: ${data.error}`);
        }
      } catch (err) {
        alert('Error communicating with server.');
      }
    }

    // --- VIP PASSWORD LOGIC ---
    async function updateVipPassword() {
      const adminToken = localStorage.getItem('pa_admin_token');
      const newPass = document.getElementById('newVipPassword').value.trim();
      const feedback = document.getElementById('passwordFeedback');

      if (!newPass || newPass.length < 4) {
        feedback.innerHTML = '<span class="text-rose-400">Password must be at least 4 characters long.</span>';
        return;
      }

      feedback.innerHTML = '<span class="text-amber-400 animate-pulse">Updating password...</span>';

      try {
        const res = await fetch('/api/admin/update-vip-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': adminToken
          },
          body: JSON.stringify({ vipPassword: newPass })
        });
        const data = await res.json();

        if (data.ok) {
          feedback.innerHTML = '<span class="text-emerald-400">Password updated successfully!</span>';
          document.getElementById('newVipPassword').value = '';
          setTimeout(() => { feedback.innerHTML = ''; }, 3000);
        } else {
          feedback.innerHTML = `<span class="text-rose-400">Error: ${data.error || 'Failed to update'}</span>`;
        }
      } catch (err) {
        feedback.innerHTML = '<span class="text-rose-400">Network error. Password not updated.</span>';
      }
    }

    // ── Flatpickr Entry Time Picker ─────────────────────────────
    let entryTimePicker;

    document.addEventListener('DOMContentLoaded', () => {
      entryTimePicker = flatpickr('#entryTimeFlatpickr', {
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        time_24hr: false,
        minuteIncrement: 5,
        minDate: 'today',
        disableMobile: false,
        onChange: function(selectedDates, dateStr) {
          if (selectedDates.length > 0) {
            const d = selectedDates[0];
            const display = document.getElementById('entryTimeDisplay');
            const trigger = document.getElementById('entryTimeTrigger');
            const clearBtn = document.getElementById('entryTimeClear');
            const hidden = document.getElementById('entryTime');

            // Format nicely: e.g. "Mon, Jun 9 · 2:30 PM"
            const formatted = d.toLocaleString([], {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
            display.textContent = formatted;
            trigger.classList.add('has-value');
            clearBtn.classList.remove('hidden');

            // Store as datetime-local compatible string for the form
            const pad = n => String(n).padStart(2, '0');
            const localStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            hidden.value = localStr;
            updateLivePreview();
          }
        }
      });
    });

    function clearEntryTime(e) {
      e.stopPropagation();
      entryTimePicker.clear();
      document.getElementById('entryTimeDisplay').textContent = 'Pick date & time...';
      document.getElementById('entryTimeTrigger').classList.remove('has-value');
      document.getElementById('entryTimeClear').classList.add('hidden');
      document.getElementById('entryTime').value = '';
      updateLivePreview();
    }

    // ── Crypto Payment Requests Management ──────────────────────
    async function fetchCryptoRequests() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const tbody = document.getElementById('cryptoRequestsBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto text-amber-400"></i></td></tr>';
      feather.replace();

      try {
        const res = await fetch('/api/admin/crypto-requests', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();

        if (!data.ok || data.requests.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-gray-500">${data.ok ? 'No crypto payment requests yet.' : 'Error: ' + data.error}</td></tr>`;
          return;
        }

        tbody.innerHTML = data.requests.map(req => {
          const date = new Date(req.submittedAt || req.timestamp).toLocaleString();
          const shortTx = req.txHash ? req.txHash.slice(0, 12) + '…' + req.txHash.slice(-6) : '—';
          const statusColor = req.status === 'Approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : req.status === 'Rejected' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/20';

          const actionBtns = req.status === 'Pending'
            ? `<div class="flex gap-2 justify-end">
                <div class="flex gap-2">
                  <button onclick="approveCryptoRequest('${req.id || req._id}', false)" class="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition cursor-pointer">✅ Approve</button>
                  <button onclick="approveCryptoRequest('${req.id || req._id}', true)" class="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-violet-500/15 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 transition cursor-pointer">💎 Platinum</button>
                </div>
                <button onclick="rejectCryptoRequest('${req.id || req._id}')" class="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer">✗ Reject</button>
               </div>`
            : `<span class="text-gray-600 text-[10px]">${req.status}</span>`;

          return `<tr class="border-b border-white/5 hover:bg-white/3 transition">
            <td class="py-3 px-4 text-gray-400 font-mono text-[10px] whitespace-nowrap">${date}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 border border-amber-400/20 text-amber-400">${req.network || 'TRC20'}</span></td>
            <td class="py-3 px-4 font-mono text-[10px] text-gray-300" title="${req.txHash}">${shortTx}</td>
            <td class="py-3 px-4 text-sky-400 text-[10px]">${req.contactInfo || '—'}</td>
            <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}">${req.status}</span></td>
            <td class="py-3 px-4 font-mono text-amber-400 text-[10px] font-bold">${req.accessCode || '—'}</td>
            <td class="py-3 px-4">${actionBtns}</td>
          </tr>`;
        }).join('');
        feather.replace();
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-rose-400">Connection error loading requests.</td></tr>';
      }
    }

    async function approveCryptoRequest(requestId, upgradeToPlatinum = false) {
      const adminToken = localStorage.getItem('pa_admin_token');
      const msg = upgradeToPlatinum 
        ? 'Approve this crypto payment and UPGRADE user to Platinum tier?' 
        : 'Approve this crypto payment (Standard/Gold)?';
      if (!adminToken || !confirm(msg)) return;

      try {
        const res = await fetch('/api/admin/approve-crypto-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ requestId, upgradeToPlatinum })
        });
        const data = await res.json();

        if (data.ok) {
          alert(`✅ APPROVED!\n\n${data.message}`);
          fetchCryptoRequests(); // Refresh list
        } else {
          alert('❌ Error: ' + (data.error || 'Approval failed.'));
        }
      } catch (err) {
        alert('❌ Network error. Please try again.');
      }
    }

    async function rejectCryptoRequest(requestId) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken || !confirm('Reject this crypto payment request?')) return;

      try {
        const res = await fetch('/api/admin/reject-crypto-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ requestId })
        });
        const data = await res.json();

        if (data.ok) {
          fetchCryptoRequests();
        } else {
          alert('❌ Error: ' + (data.error || 'Rejection failed.'));
        }
      } catch (err) {
        alert('❌ Network error.');
      }
    }
    // ── Registered Users Management ──────────────────────
    async function fetchUsers() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const tbody = document.getElementById('userListBody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto text-neon-blue"></i></td></tr>';
      feather.replace();

      try {
        const res = await fetch('/api/admin/users', {
          headers: { 'x-admin-token': adminToken }
        });
        const data = await res.json();

        if (!data.ok || data.users.length === 0) {
          allUsersCache = [];
          tbody.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-gray-500">${data.ok ? 'No registered users yet.' : 'Error: ' + data.error}</td></tr>`;
          return;
        }

        allUsersCache = data.users;
        filterUsers();
        feather.replace();
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-rose-400">Connection error loading users.</td></tr>';
      }
    }

    // ── Analytics Management ──────────────────────────────
    let regChartInstance = null;
    let revChartInstance = null;

    async function fetchAnalytics() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;

      try {
        const res = await fetch('/api/admin/analytics', { headers: { 'x-admin-token': adminToken } });
        const data = await res.json();
        
        if (data.ok && data.stats) {
          const s = data.stats;

          // Core user stats
          document.getElementById('statTotalUsers').textContent = s.totalUsers ?? '--';
          document.getElementById('statActiveVIPs').textContent = s.activeUsers ?? '--';
          document.getElementById('statExpiredUsers').textContent = s.expiredUsers ?? '--';

          const convRate = s.totalUsers > 0 ? Math.round((s.activeUsers / s.totalUsers) * 100) : 0;
          document.getElementById('statConversionRate').textContent = `${convRate}%`;

          // Revenue placeholders (not yet wired to payment data)
          document.getElementById('statTotalKES').textContent = '--';
          document.getElementById('statTotalUSDT').textContent = '--';
          document.getElementById('statMrrKES').textContent = '--';
          document.getElementById('statMrrUSDT').textContent = '--';

          // Update extra detail badge if it already exists, or inject it
          const analyticsPanel = document.getElementById('analyticsPanel');
          let extraRow = document.getElementById('analyticsExtraRow');
          if (!extraRow) {
            extraRow = document.createElement('div');
            extraRow.id = 'analyticsExtraRow';
            extraRow.className = 'grid grid-cols-2 md:grid-cols-3 gap-6 mb-6';
            extraRow.innerHTML = `
              <div class="glass-card rounded-2xl p-6 border border-violet-500/20 bg-violet-500/5 flex flex-col justify-center items-center">
                <span class="text-violet-400 text-[10px] uppercase tracking-wider mb-2 font-bold">Platinum Members</span>
                <span id="statPlatinum" class="text-2xl font-black text-violet-400 font-mono">--</span>
              </div>
              <div class="glass-card rounded-2xl p-6 border border-amber-500/20 bg-amber-500/5 flex flex-col justify-center items-center">
                <span class="text-amber-400 text-[10px] uppercase tracking-wider mb-2 font-bold">Gold Members</span>
                <span id="statGold" class="text-2xl font-black text-amber-400 font-mono">--</span>
              </div>
              <div class="glass-card rounded-2xl p-6 border border-cyan-500/20 bg-cyan-500/5 flex flex-col justify-center items-center">
                <span class="text-cyan-400 text-[10px] uppercase tracking-wider mb-2 font-bold">Pending Bookings</span>
                <span id="statPendingBookings" class="text-2xl font-black text-cyan-400 font-mono">--</span>
              </div>
              <div class="glass-card rounded-2xl p-6 border border-emerald-500/20 bg-emerald-500/5 flex flex-col justify-center items-center">
                <span class="text-emerald-400 text-[10px] uppercase tracking-wider mb-2 font-bold">Total Journal Trades</span>
                <span id="statTrades" class="text-2xl font-black text-emerald-400 font-mono">--</span>
              </div>
            `;
            // Insert before the charts grid
            const chartsGrid = analyticsPanel.querySelector('.grid.grid-cols-1.md\\:grid-cols-2');
            if (chartsGrid) analyticsPanel.insertBefore(extraRow, chartsGrid);
            else analyticsPanel.appendChild(extraRow);
          }

          document.getElementById('statPlatinum').textContent = s.platinumUsers ?? '--';
          document.getElementById('statGold').textContent = s.goldUsers ?? '--';
          document.getElementById('statPendingBookings').textContent = s.pendingBookings ?? '--';
          document.getElementById('statTrades').textContent = s.totalTrades ?? '--';

          // Build simple chart from registration dates if chartData is present
          if (data.chartData) {
            renderChart(data.chartData);
          } else {
            // Render a placeholder "no data" state gracefully
            const canvas = document.getElementById('registrationsChart');
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (regChartInstance) { regChartInstance.destroy(); regChartInstance = null; }
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = 'rgba(156,163,175,0.6)';
              ctx.font = '12px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('Chart data not available yet.', canvas.width / 2, canvas.height / 2 || 60);
            }
          }
          if (data.revenueChart) renderRevenueChart(data.revenueChart);
        }
      } catch (err) {
        console.error('Failed to load analytics', err);
      }
    }

    function renderChart(chartData) {
      const ctx = document.getElementById('registrationsChart').getContext('2d');
      if (regChartInstance) {
        regChartInstance.destroy();
      }

      regChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartData.labels,
          datasets: [{
            label: 'New Users',
            data: chartData.values,
            borderColor: '#b026ff',
            backgroundColor: 'rgba(176, 38, 255, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#b026ff',
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
              ticks: { stepSize: 1, color: '#9ca3af' }
            },
            x: {
              grid: { display: false, drawBorder: false },
              ticks: { color: '#9ca3af' }
            }
          }
        }
      });
    }

    // ── User Search / Filter ─────────────────────────────────────
    let allUsersCache = [];

    function filterUsers() {
      const query = (document.getElementById('userSearchInput')?.value || '').toLowerCase();
      const tbody = document.getElementById('userListBody');
      if (!tbody || !allUsersCache.length) return;

      const now = Date.now();
      const filtered = query
        ? allUsersCache.filter(u =>
            (u.name || '').toLowerCase().includes(query) ||
            (u.email || '').toLowerCase().includes(query)
          )
        : allUsersCache;

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-500">No users match "${query}".</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(u => {
        const date = u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '—';
        const isVip = u.subscriptionExpiry && u.subscriptionExpiry > now;
        const statusSpan = isVip
          ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/10 border border-amber-400/20 text-amber-400">VIP</span>`
          : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/10 border border-gray-500/20 text-gray-400">Free</span>`;
        
        const tier = u.subscriptionTier || 'Gold';
        const isPlatinum = tier.toLowerCase().includes('platinum');
        const tierUI = isVip ? `
          <div class="flex items-center justify-center gap-1">
            <button onclick="setUserTier('${u.id}', 'Gold')" class="px-2 py-1 rounded text-[9px] font-bold transition ${!isPlatinum ? 'bg-gold/20 text-gold border border-gold/40' : 'bg-white/5 text-gray-500 hover:text-white'}">Gold</button>
            <button onclick="setUserTier('${u.id}', 'Platinum')" class="px-2 py-1 rounded text-[9px] font-bold transition ${isPlatinum ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40' : 'bg-white/5 text-gray-500 hover:text-white'}">Platinum</button>
          </div>
        ` : `<span class="text-gray-600 text-[10px] block text-center">—</span>`;

        return `<tr class="border-b border-white/5 hover:bg-white/3 transition">
          <td class="py-3 px-3 text-white text-xs">${u.name || '—'}</td>
          <td class="py-3 px-3 text-gray-400 text-xs">${u.email}</td>
          <td class="py-3 px-3 text-gray-500 font-mono text-[10px]">${date}</td>
          <td class="py-3 px-3">${tierUI}</td>
          <td class="py-3 px-3 text-right">${statusSpan}</td>
        </tr>`;
      }).join('');
    }

    async function setUserTier(userId, newTier) {
      if(!confirm(`Are you sure you want to change this user's tier to ${newTier}?`)) return;
      const adminToken = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/users/${userId}/tier`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ tier: newTier })
        });
        const data = await res.json();
        if(data.ok) {
          fetchUsers(); // Refresh list
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Network error updating tier.');
      }
    }

    // ── CSV Export ───────────────────────────────────────────────
    function exportUsersCSV() {
      if (!allUsersCache.length) {
        alert('⚠️ No user data loaded. Click Refresh first.');
        return;
      }
      const now = Date.now();
      const rows = [
        ['Name', 'Email', 'Joined', 'VIP Status', 'Tier', 'Expiry Date', 'Telegram ID'],
        ...allUsersCache.map(u => [
          u.name || '',
          u.email,
          u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '',
          u.subscriptionExpiry && u.subscriptionExpiry > now ? 'VIP' : 'Free',
          u.subscriptionTier || 'Gold',
          u.subscriptionExpiry ? new Date(u.subscriptionExpiry).toLocaleDateString() : '',
          u.telegramId || ''
        ])
      ];
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pips_users_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // ── 2FA Setup ────────────────────────────────────────────────
    let twoFASecret = null;

    async function open2FASetup() {
      const adminKey = document.getElementById('adminKey')?.value.trim() || localStorage.getItem('pa_admin_key');
      if (!adminKey) { alert('⚠️ Please enter your Admin Key first.'); return; }

      const modal = document.getElementById('twoFAModal');
      modal.classList.remove('hidden');
      document.getElementById('twoFAStep1').classList.remove('hidden');
      document.getElementById('twoFAStep2').classList.add('hidden');
      // Reset QR area to loading state
      document.getElementById('twoFAQRContainer').innerHTML = `
        <div class="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <i data-feather="loader" class="w-6 h-6 animate-spin text-violet-400"></i>
        </div>`;
      feather.replace();

      try {
        const res = await fetch('/api/admin/2fa/setup', { headers: { 'x-admin-key': adminKey } });
        const data = await res.json();
        if (data.ok) {
          twoFASecret = data.secret;
          document.getElementById('twoFASecretDisplay').value = data.secret;
          const qrContainer = document.getElementById('twoFAQRContainer');
          qrContainer.innerHTML = `<img src="${data.qrCode}" alt="2FA QR" class="w-48 h-48 rounded-xl border border-white/10" />`;
        } else if (data.alreadyConfigured) {
          // 2FA already set up — guide user to reset first
          modal.classList.add('hidden');
          const wantsReset = confirm(
            '🔒 2FA is already configured for this admin key.\n\n' +
            'To re-scan a new QR code (e.g. new phone), click OK to reset 2FA first.\n\n' +
            '⚠️ Warning: This will log you out of any active sessions.'
          );
          if (wantsReset) {
            await reset2FA(true); // pass silent=true so reset2FA skips its own confirm
          }
        } else {
          alert('❌ Failed to generate 2FA secret: ' + (data.error || 'Unknown error'));
          modal.classList.add('hidden');
        }
      } catch (err) {
        alert('❌ Server error generating 2FA. Check your connection and try again.');
        modal.classList.add('hidden');
      }
    }

    function show2FAStep2() {
      document.getElementById('twoFAStep1').classList.add('hidden');
      document.getElementById('twoFAStep2').classList.remove('hidden');
      document.getElementById('twoFATokenInput').focus();
    }

    async function verify2FASetup() {
      const token = document.getElementById('twoFATokenInput').value.replace(/\s/g, '');
      const msgEl = document.getElementById('twoFAVerifyMsg');
      if (!token || token.length !== 6) {
        msgEl.className = 'text-rose-400 text-[11px] min-h-[14px] mb-3 text-center';
        msgEl.textContent = '❌ Please enter the 6-digit code.';
        return;
      }
      
      const adminKey = document.getElementById('adminKey')?.value.trim() || localStorage.getItem('pa_admin_key');

      msgEl.className = 'text-gray-400 text-[11px] min-h-[14px] mb-3 text-center';
      msgEl.textContent = 'Verifying…';

      try {
        const res = await fetch('/api/admin/2fa/verify-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ secret: twoFASecret, token })
        });
        const data = await res.json();
        if (data.ok) {
          msgEl.className = 'text-emerald-400 text-[11px] min-h-[14px] mb-3 text-center';
          msgEl.textContent = '✅ 2FA enabled successfully!';
          
          localStorage.setItem('pa_admin_token', data.adminToken);
          const formToken = document.getElementById('botToken')?.value.trim();
          const chat = document.getElementById('chatId')?.value.trim();
          const vipChat = document.getElementById('vipChatId')?.value.trim();
          if (formToken && chat && adminKey) {
            localStorage.setItem('pa_bot_token', formToken);
            localStorage.setItem('pa_chat_id', chat);
            if(vipChat) localStorage.setItem('pa_vip_chat_id', vipChat);
            localStorage.setItem('pa_admin_key', adminKey);
          }
          
          setTimeout(() => { document.getElementById('twoFAModal').classList.add('hidden'); checkCredentials(); }, 1500);
        } else {
          msgEl.className = 'text-rose-400 text-[11px] min-h-[14px] mb-3 text-center';
          msgEl.textContent = '❌ ' + (data.error || 'Invalid code. Please try again.');
          // Clear input so user can type fresh code
          document.getElementById('twoFATokenInput').value = '';
          document.getElementById('twoFATokenInput').focus();
        }
      } catch (err) {
        msgEl.className = 'text-rose-400 text-[11px] min-h-[14px] mb-3 text-center';
        msgEl.textContent = '❌ Server error. Check your connection and try again.';
      }
    }
    // ── Announcements ─────────────────────────────────────────────
    async function fetchAnnouncements() {
      const token = localStorage.getItem('pa_admin_token');
      if (!token) return;
      const container = document.getElementById('announcementsList');
      if (!container) return;
      container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">Loading...</p>';
      try {
        const res = await fetch('/api/admin/announcements', { headers: { 'x-admin-token': token } });
        const data = await res.json();
        if (data.ok && data.announcements) {
          if (data.announcements.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No announcements posted yet.</p>';
            return;
          }
          container.innerHTML = data.announcements.map(a => {
            const typeColor = a.type === 'warning' ? 'text-amber-400 border-amber-400/30'
              : a.type === 'success' ? 'text-emerald-400 border-emerald-500/30'
              : 'text-sky-400 border-sky-500/30';
            const date = new Date(a.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `
              <div class="p-3 rounded-xl bg-white/5 border border-white/10 group">
                <div class="flex items-start justify-between gap-2 mb-1">
                  <div class="flex-1 min-w-0">
                    <p class="text-white text-xs font-bold truncate">${a.title}</p>
                    <p class="text-gray-400 text-[10px] mt-0.5 line-clamp-2">${a.message}</p>
                  </div>
                  <div class="shrink-0 flex flex-col items-end gap-1">
                    <span class="text-[9px] font-bold ${typeColor} px-1.5 py-0.5 rounded border bg-current/5">${a.type.toUpperCase()}</span>
                    <button onclick="deleteAnnouncement('${a._id}')" class="opacity-0 group-hover:opacity-100 transition text-rose-400 hover:text-rose-300 text-[9px] cursor-pointer">Delete</button>
                  </div>
                </div>
                <p class="text-[10px] text-gray-600">${date}</p>
              </div>
            `;
          }).join('');
        }
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-xs text-center py-4">Failed to load announcements.</p>';
      }
    }
    // ── Marketing & Growth ──────────────────────────────────────────
    async function postDailyBrief() {
      const token = localStorage.getItem('pa_admin_token');
      const bias = document.getElementById('briefBiasInput').value;
      const keyLevels = document.getElementById('briefLevelsInput').value;
      const note = document.getElementById('briefNoteInput').value;
      const fb = document.getElementById('briefFeedback');
      
      if (!bias) {
        fb.className = 'text-xs font-semibold text-rose-400 mt-2';
        fb.textContent = 'Market bias is required.';
        return;
      }
      
      fb.className = 'text-xs font-semibold text-gray-400 mt-2';
      fb.textContent = 'Posting...';
      
      try {
        const res = await fetch('/api/admin/daily-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ bias, keyLevels, note })
        });
        const data = await res.json();
        if (data.ok) {
          fb.className = 'text-xs font-semibold text-emerald-400 mt-2';
          fb.textContent = 'Daily brief updated on VIP dashboard!';
          setTimeout(() => fb.textContent='', 3000);
        } else {
          fb.className = 'text-xs font-semibold text-rose-400 mt-2';
          fb.textContent = data.error || 'Failed to update brief.';
        }
      } catch (e) {
        fb.className = 'text-xs font-semibold text-rose-400 mt-2';
        fb.textContent = 'Network error.';
      }
    }

    async function sendEmailBlast() {
      const token = localStorage.getItem('pa_admin_token');
      const tierFilter = document.getElementById('emailBlastTier').value;
      const subject = document.getElementById('emailBlastSubject').value;
      const htmlBody = document.getElementById('emailBlastBody').value;
      const fb = document.getElementById('emailBlastFeedback');
      
      if (!subject || !htmlBody) {
        fb.className = 'text-xs font-semibold text-rose-400 mt-2';
        fb.textContent = 'Subject and body are required.';
        return;
      }
      if (!confirm(`Are you sure you want to send this email to ${tierFilter === 'all' ? 'ALL USERS' : tierFilter.toUpperCase() + ' VIPs'}?`)) return;
      
      fb.className = 'text-xs font-semibold text-amber-400 mt-2';
      fb.innerHTML = '<span class="animate-pulse">Sending emails in background...</span>';
      
      try {
        const res = await fetch('/api/admin/email-blast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ subject, htmlBody, tierFilter })
        });
        const data = await res.json();
        if (data.ok) {
          fb.className = 'text-xs font-semibold text-emerald-400 mt-2';
          fb.textContent = `Sent successfully to ${data.sent} users. (${data.failed} failed)`;
          document.getElementById('emailBlastSubject').value = '';
          document.getElementById('emailBlastBody').value = '';
        } else {
          fb.className = 'text-xs font-semibold text-rose-400 mt-2';
          fb.textContent = data.error || 'Failed to send emails.';
        }
      } catch (e) {
        fb.className = 'text-xs font-semibold text-rose-400 mt-2';
        fb.textContent = 'Network error.';
      }
    }

    async function postAnnouncement() {
      const token = localStorage.getItem('pa_admin_token');
      const title = document.getElementById('annTitle')?.value.trim();
      const message = document.getElementById('annMessage')?.value.trim();
      const type = document.getElementById('annType')?.value || 'info';
      const feedback = document.getElementById('annFeedback');
      if (!title || !message) {
        if (feedback) { feedback.className = 'text-rose-400 text-xs font-semibold min-h-[16px]'; feedback.textContent = '❌ Title and message are required.'; }
        return;
      }
      if (feedback) { feedback.className = 'text-gray-400 text-xs font-semibold min-h-[16px]'; feedback.textContent = 'Posting...'; }
      try {
        const res = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ title, message, type })
        });
        const data = await res.json();
        if (data.ok) {
          if (feedback) { feedback.className = 'text-emerald-400 text-xs font-semibold min-h-[16px]'; feedback.textContent = '✅ Notice posted!'; }
          document.getElementById('annTitle').value = '';
          document.getElementById('annMessage').value = '';
          fetchAnnouncements();
          setTimeout(() => { if (feedback) feedback.textContent = ''; }, 3000);
        } else {
          if (feedback) { feedback.className = 'text-rose-400 text-xs font-semibold min-h-[16px]'; feedback.textContent = `❌ ${data.error}`; }
        }
      } catch (err) {
        if (feedback) { feedback.className = 'text-rose-400 text-xs font-semibold min-h-[16px]'; feedback.textContent = '❌ Server error.'; }
      }
    }

    async function deleteAnnouncement(id) {
      if (!confirm('Delete this notice?')) return;
      const token = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/announcements/${id}`, {
          method: 'DELETE',
          headers: { 'x-admin-token': token }
        });
        const data = await res.json();
        if (data.ok) fetchAnnouncements();
      } catch (err) {
        console.error('Delete announcement failed');
      }
    }

    // ── Mentorship Bookings ─────────────────────────────────────
    async function fetchBookings() {
      const token = localStorage.getItem('pa_admin_token');
      if (!token) return;
      const container = document.getElementById('bookingsListBody');
      if (!container) return;
      container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">Loading...</p>';
      
      try {
        const res = await fetch('/api/admin/bookings?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (data.ok && data.bookings) {
          if (data.bookings.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No bookings found.</p>';
            return;
          }
          container.innerHTML = data.bookings.map(b => {
            const statusColor = b.status === 'Accepted' ? 'text-emerald-400'
              : b.status === 'Completed' ? 'text-gold'
              : b.status === 'Cancelled' ? 'text-rose-400'
              : 'text-gray-400';
            return `
              <div class="p-4 rounded-xl bg-white/5 border border-white/10 group">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 class="text-white text-xs font-bold">${b.userName} <span class="text-[10px] text-gray-500 font-normal">(${b.userEmail})</span></h4>
                    <p class="text-[11px] text-violet-300 font-semibold mt-0.5">${b.date} at ${b.time} (UTC)</p>
                  </div>
                  <span class="shrink-0 text-[10px] font-bold ${statusColor} px-2 py-1 rounded border border-current/20 bg-current/10">${b.status}</span>
                </div>
                <div class="bg-black/30 p-2 rounded border border-white/5 text-[11px] text-gray-300 mb-3">
                  <span class="font-bold text-gray-500">Topic:</span> ${b.topic}
                </div>
                <div class="flex items-center gap-2">
                  ${b.status === 'Pending' ? `<button onclick="updateBookingStatus('${b._id}', 'Accepted')" class="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white transition cursor-pointer text-[10px] font-bold">Accept</button>` : ''}
                  ${['Pending', 'Accepted'].includes(b.status) ? `<button onclick="updateBookingStatus('${b._id}', 'Completed')" class="px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/30 text-gold hover:bg-gold hover:text-dark-navy transition cursor-pointer text-[10px] font-bold">Mark Completed</button>` : ''}
                  ${['Pending', 'Accepted'].includes(b.status) ? `<button onclick="updateBookingStatus('${b._id}', 'Cancelled')" class="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer text-[10px] font-bold">Cancel</button>` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-xs text-center py-4">Failed to load bookings</p>';
      }
    }

    async function updateBookingStatus(id, status) {
      if (!confirm(`Mark this booking as ${status}?`)) return;
      const token = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/bookings/${id}/status?token=` + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.ok) {
          if (typeof showToast !== 'undefined') showToast('Updated', `Booking marked as ${status}`);
          else alert(`Booking marked as ${status}`);
          fetchBookings();
        } else {
          if (typeof showToast !== 'undefined') showToast('Error', data.error || 'Failed to update status', 'error');
          else alert(data.error || 'Failed to update status');
        }
      } catch (err) {
        if (typeof showToast !== 'undefined') showToast('Error', 'Server error', 'error');
        else alert('Server error');
      }
    }

    // ── Promo Codes ──────────────────────────────────────────────
    async function fetchPromos() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const container = document.getElementById('promoListBody');
      if (!container) return;
      container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">Loading...</p>';
      try {
        const res = await fetch('/api/admin/promos', { headers: { 'x-admin-token': adminToken } });
        const data = await res.json();
        
        if (data.ok) {
          const toggle = document.getElementById('globalPromoToggle');
          if (toggle) toggle.checked = data.promoCodesEnabled;
        }

        if (!data.ok || !data.promos || data.promos.length === 0) {
          container.innerHTML = '<p class="text-gray-500 text-xs text-center py-4">No promo codes yet.</p>';
          return;
        }
        container.innerHTML = data.promos.map(p => `
          <div class="flex items-center justify-between py-2 px-3 rounded-xl bg-white/5 border border-white/10 group">
            <div>
              <span class="font-mono text-emerald-400 font-bold text-xs tracking-wider">${p.code}</span>
              <span class="ml-2 text-gray-400 text-[10px]">${p.discountPercentage}% off</span>
            </div>
            <button onclick="deletePromo('${p.code}')" class="text-rose-400 text-[10px] opacity-0 group-hover:opacity-100 transition hover:underline cursor-pointer">Delete</button>
          </div>
        `).join('');
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-xs text-center py-4">Failed to load promos.</p>';
      }
    }

    async function createPromo() {
      const adminToken = localStorage.getItem('pa_admin_token');
      const code = document.getElementById('newPromoCode').value.trim();
      const discount = document.getElementById('newPromoDiscount').value.trim();
      const msgEl = document.getElementById('promoCreateMsg');

      if (!code || !discount) {
        msgEl.className = 'text-rose-400 text-xs min-h-[16px]';
        msgEl.textContent = '❌ Please fill in both fields.';
        return;
      }

      try {
        const res = await fetch('/api/admin/promos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ code, discountPercentage: Number(discount) })
        });
        const data = await res.json();
        if (data.ok) {
          msgEl.className = 'text-emerald-400 text-xs min-h-[16px]';
          msgEl.textContent = `✅ Promo "${code.toUpperCase()}" created!`;
          document.getElementById('newPromoCode').value = '';
          document.getElementById('newPromoDiscount').value = '';
          fetchPromos();
        } else {
          msgEl.className = 'text-rose-400 text-xs min-h-[16px]';
          msgEl.textContent = `❌ ${data.error}`;
        }
      } catch (err) {
        msgEl.className = 'text-rose-400 text-xs min-h-[16px]';
        msgEl.textContent = '❌ Server error.';
      }
    }

    async function deletePromo(code) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!confirm(`Delete promo code "${code}"?`)) return;
      try {
        await fetch(`/api/admin/promos/${code}`, { method: 'DELETE', headers: { 'x-admin-token': adminToken } });
        fetchPromos();
      } catch (err) {
        alert('Failed to delete promo.');
      }
    }

    async function toggleGlobalPromos(enabled) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      try {
        const res = await fetch('/api/admin/toggle-promo-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) {
          if (typeof showToast !== 'undefined') {
            showToast(enabled ? '✅ Promo codes enabled globally!' : '🔒 Promo codes hidden from checkout.');
          }
        } else {
          alert('Failed to update promo setting.');
          document.getElementById('globalPromoToggle').checked = !enabled;
        }
      } catch (err) {
        alert('Network error. Please try again.');
        document.getElementById('globalPromoToggle').checked = !enabled;
      }
    }

    // ── Support Tickets ──────────────────────────────────────────
    async function fetchAdminTickets() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      const container = document.getElementById('adminTicketsList');
      if (!container) return;
      container.innerHTML = '<p class="text-gray-500 text-xs text-center py-8">Loading tickets...</p>';
      try {
        const res = await fetch('/api/admin/tickets', { headers: { 'x-admin-token': adminToken } });
        const data = await res.json();
        if (!data.ok || data.tickets.length === 0) {
          container.innerHTML = '<p class="text-gray-500 text-xs text-center py-8">No support tickets yet. 🎉</p>';
          return;
        }
        container.innerHTML = data.tickets.map(t => {
          const statusColor = t.status === 'Open' ? 'text-rose-400 border-rose-400/30 bg-rose-400/10'
            : t.status === 'Answered' ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
            : 'text-gray-400 border-gray-400/30 bg-gray-400/10';
          const lastMsg = t.messages && t.messages.length > 0 ? t.messages[t.messages.length - 1] : null;
          return `
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div class="flex items-start justify-between gap-4 mb-2">
                <div class="flex-1">
                  <p class="text-white text-sm font-semibold">${t.subject}</p>
                  <p class="text-gray-400 text-[10px]">${t.userEmail} · ${new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}">${t.status}</span>
              </div>
              ${lastMsg ? `<p class="text-gray-400 text-xs italic truncate mb-3">${lastMsg.sender}: ${lastMsg.text}</p>` : ''}
              <div class="flex gap-2 mt-2" id="ticket-actions-${t._id}">
                <input type="text" placeholder="Reply to user..." class="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:border-neon-blue/50 focus:outline-none transition" id="reply-input-${t._id}" />
                <button onclick="replyToTicket('${t._id}')" class="px-3 py-1.5 rounded-xl bg-neon-blue/10 border border-neon-blue/20 text-neon-blue text-xs font-bold hover:bg-neon-blue/20 transition cursor-pointer">Reply</button>
                ${t.status !== 'Closed' ? `<button onclick="closeTicket('${t._id}')" class="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-xs hover:text-rose-400 hover:border-rose-400/30 transition cursor-pointer">Close</button>` : ''}
              </div>
            </div>
          `;
        }).join('');
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-xs text-center py-8">Failed to load tickets.</p>';
      }
    }

    async function replyToTicket(id) {
      const adminToken = localStorage.getItem('pa_admin_token');
      const input = document.getElementById(`reply-input-${id}`);
      const message = input ? input.value.trim() : '';
      if (!message) return;
      try {
        const res = await fetch(`/api/admin/tickets/${id}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (data.ok) {
          if (input) input.value = '';
          fetchAdminTickets();
        }
      } catch (err) {
        alert('Failed to send reply.');
      }
    }

    async function closeTicket(id) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!confirm('Mark this ticket as Closed?')) return;
      try {
        await fetch(`/api/admin/tickets/${id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken }
        });
        fetchAdminTickets();
      } catch (err) {
        alert('Failed to close ticket.');
      }
    }

    // ── Payments Management ────────────────────────────────────
    async function fetchPayments() {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) return;
      
      const tbody = document.getElementById('paymentsListBody');
      tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-gray-500"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto"></i></td></tr>';
      feather.replace();

      try {
        const res = await fetch('/api/admin/payments', { headers: { 'x-admin-token': adminToken } });
        const data = await res.json();
        
        if (!data.ok) {
          tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-rose-400">${data.error}</td></tr>`;
          return;
        }

        if (data.payments.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-gray-500">No payments found.</td></tr>';
          return;
        }

        tbody.innerHTML = '';
        data.payments.forEach(p => {
          const date = new Date(p.timestamp || p.createdAt || 0).toLocaleString();
          const isSuccess = p.status === 'Success';
          const methodColor = p.method === 'crypto' ? 'text-amber-400' : 'text-emerald-400';
          
          tbody.innerHTML += `
            <tr class="border-b border-white/5 hover:bg-white/5 transition">
              <td class="py-3 px-3 text-gray-300">${date}</td>
              <td class="py-3 px-3 font-bold ${methodColor} uppercase">${p.method || 'mpesa'}</td>
              <td class="py-3 px-3 text-white">${p.plan || '1month'}</td>
              <td class="py-3 px-3 text-white font-mono">${p.currency || 'KES'} ${p.amount}</td>
              <td class="py-3 px-3">
                <span class="px-2 py-1 rounded border ${isSuccess ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-rose-500/30 text-rose-400 bg-rose-500/10'} text-[10px] uppercase font-bold">
                  ${p.status}
                </span>
              </td>
              <td class="py-3 px-3 text-gray-400 text-[10px]">${p.phone || p.contactInfo || p.userId || '-'}</td>
            </tr>
          `;
        });
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-rose-400">Error loading payments.</td></tr>';
      }
    }

    // ── Signals Management ──────────────────────────────────────
    async function fetchSignalsHistory() {
      const tbody = document.getElementById('signalsListBody');
      tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-500"><i data-feather="loader" class="w-4 h-4 animate-spin mx-auto"></i></td></tr>';
      feather.replace();

      try {
        const res = await fetch('/api/signals?category=All');
        const data = await res.json();
        
        if (!data.ok) {
          tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-rose-400">${data.error}</td></tr>`;
          return;
        }

        if (!data.signals || data.signals.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-gray-500">No signals found.</td></tr>';
          return;
        }

        tbody.innerHTML = '';
        data.signals.forEach(s => {
          if (s.type !== 'signal') return;
          const date = new Date(Number(s.sentAt) || s.sentAt).toLocaleString();
          const preview = (s.text || '').slice(0, 60).replace(/\n/g, ' ') + '...';
          const out = s.outcome || 'Running';
          const cat = s.category || 'Forex';

          tbody.innerHTML += `
            <tr class="border-b border-white/5 hover:bg-white/5 transition">
              <td class="py-3 px-3 text-gray-300">${date}</td>
              <td class="py-3 px-3 text-white text-[10px] font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title="${s.text}">${preview}</td>
              <td class="py-3 px-3">
                <select onchange="updateSignalCategory('${s.id}', this.value)" class="bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-sky-500/50">
                  <option value="Forex" ${cat==='Forex'?'selected':''}>Forex</option>
                  <option value="Crypto" ${cat==='Crypto'?'selected':''}>Crypto</option>
                  <option value="Indices" ${cat==='Indices'?'selected':''}>Indices</option>
                  <option value="Commodities" ${cat==='Commodities'?'selected':''}>Commodities</option>
                </select>
              </td>
              <td class="py-3 px-3">
                <select onchange="updateSignalOutcome('${s.id}', this.value)" class="bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-sky-500/50">
                  <option value="Running" ${out==='Running'?'selected':''}>⏳ Running</option>
                  <option value="TP Hit" ${out==='TP Hit'?'selected':''}>✅ TP Hit</option>
                  <option value="SL Hit" ${out==='SL Hit'?'selected':''}>❌ SL Hit</option>
                  <option value="Breakeven" ${out==='Breakeven'?'selected':''}>➖ Breakeven</option>
                </select>
              </td>
              <td class="py-3 px-3">
                <button onclick="fireSignalWebhook('${s.id}')" class="text-[10px] px-2 py-1 rounded bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500 hover:text-white transition cursor-pointer">
                  🔗 Fire Webhook
                </button>
              </td>
            </tr>
          `;
        });
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-rose-400">Error loading signals.</td></tr>';
      }
    }

    async function updateSignalOutcome(id, outcome) {
      const adminToken = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/signals/${id}/outcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ outcome })
        });
        const data = await res.json();
        if (data.ok) showToast('Outcome updated!');
        else alert('Error: ' + data.error);
      } catch (err) { alert('Request failed'); }
    }

    async function updateSignalCategory(id, category) {
      const adminToken = localStorage.getItem('pa_admin_token');
      try {
        const res = await fetch(`/api/admin/signals/${id}/category`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ category })
        });
        const data = await res.json();
        if (data.ok) showToast('Category updated!');
        else alert('Error: ' + data.error);
      } catch (err) { alert('Request failed'); }
    }

    async function fireSignalWebhook(id) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!confirm('Send this signal to all Platinum member webhook URLs?')) return;
      try {
        const res = await fetch(`/api/admin/signals/${id}/webhook-trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken }
        });
        const data = await res.json();
        if (data.ok) showToast(data.message);
        else alert('Error: ' + (data.error || 'Unknown'));
      } catch (err) { alert('Request failed'); }
    }

    // ── Social Media & Ticket Broadcast Helpers ──────────────────────────────

    function stripMarkdown(text) {
      return (text || '')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1');
    }

    function showSocialToast(message, color) {
      color = color || '#34d399';
      let el = document.getElementById('socialToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'socialToast';
        el.style.cssText = 'position:fixed;bottom:96px;right:24px;z-index:9999;transition:all 0.3s ease;opacity:0;transform:translateY(16px);pointer-events:none';
        document.body.appendChild(el);
      }
      el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:14px;background:rgba(10,15,28,0.97);border:1px solid ${color}44;box-shadow:0 0 24px ${color}22;font-size:13px;font-weight:600;color:#fff;backdrop-filter:blur(16px)">${message}</div>`;
      requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(16px)'; }, 3600);
    }

    function shareToTwitter(text) {
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to share.', '#fbbf24'); return; }
      const clean = stripMarkdown(text);
      const limited = clean.length > 280 ? clean.substring(0, 277) + '...' : clean;
      window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(limited), '_blank');
    }

    function shareToFacebook(text) {
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to share.', '#fbbf24'); return; }
      const siteUrl = encodeURIComponent('https://pips-attendantke.onrender.com');
      const quote   = encodeURIComponent(stripMarkdown(text).substring(0, 500));
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${siteUrl}&quote=${quote}`, '_blank');
    }

    function shareToInstagram(text) {
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to share.', '#fbbf24'); return; }
      const clean = stripMarkdown(text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(clean)
          .then(() => {
            showSocialToast('📷 Caption copied! Opening Instagram...', '#e1306c');
            setTimeout(() => window.open('https://www.instagram.com', '_blank'), 700);
          })
          .catch(() => {
            showSocialToast('📷 Open Instagram and paste your message manually.', '#e1306c');
            window.open('https://www.instagram.com', '_blank');
          });
      } else {
        showSocialToast('📷 Open Instagram and paste your message manually.', '#e1306c');
        window.open('https://www.instagram.com', '_blank');
      }
    }

    function shareToTikTok(text) {
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to share.', '#fbbf24'); return; }
      const clean = stripMarkdown(text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(clean)
          .then(() => {
            showSocialToast('🎵 Caption copied! Opening TikTok...', '#1e293b');
            setTimeout(() => window.open('https://www.tiktok.com', '_blank'), 700);
          })
          .catch(() => {
            showSocialToast('🎵 Open TikTok and paste your message manually.', '#1e293b');
            window.open('https://www.tiktok.com', '_blank');
          });
      } else {
        showSocialToast('🎵 Open TikTok and paste your message manually.', '#1e293b');
        window.open('https://www.tiktok.com', '_blank');
      }
    }

    function shareToLinkedIn(text) {
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to share.', '#fbbf24'); return; }
      const clean = stripMarkdown(text);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(clean)
          .then(() => {
            showSocialToast('💼 Caption copied! Opening LinkedIn...', '#0a66c2');
            setTimeout(() => window.open('https://www.linkedin.com/feed/', '_blank'), 700);
          })
          .catch(() => {
            showSocialToast('💼 Open LinkedIn and paste your message manually.', '#0a66c2');
            window.open('https://www.linkedin.com/feed/', '_blank');
          });
      } else {
        showSocialToast('💼 Open LinkedIn and paste your message manually.', '#0a66c2');
        window.open('https://www.linkedin.com/feed/', '_blank');
      }
    }

    async function broadcastToTickets(text) {
      const adminToken = localStorage.getItem('pa_admin_token');
      if (!adminToken) { showSocialToast('⚠️ Not logged in as admin.', '#f87171'); return; }
      if (!text || !text.trim()) { showSocialToast('⚠️ No message to broadcast.', '#fbbf24'); return; }
      const clean = stripMarkdown(text);
      try {
        const res = await fetch('/api/admin/broadcast-to-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ message: clean })
        });
        const data = await res.json();
        if (data.ok) {
          showSocialToast(`🎫 Broadcast posted to ${data.count} open ticket(s)!`, '#34d399');
        } else {
          showSocialToast(`❌ ${data.error || 'Failed to post to tickets.'}`, '#f87171');
        }
      } catch (err) {
        showSocialToast('❌ Network error. Could not post to tickets.', '#f87171');
      }
    }

    // Signal section wrappers
    function broadcastSignalToTickets() { broadcastToTickets(buildTelegramMessageText()); }
    function shareSignalToTwitter()     { shareToTwitter(buildTelegramMessageText()); }
    function shareSignalToFacebook()    { shareToFacebook(buildTelegramMessageText()); }
    function shareSignalToInstagram()   { shareToInstagram(buildTelegramMessageText()); }
    function shareSignalToTikTok()      { shareToTikTok(buildTelegramMessageText()); }
    function shareSignalToLinkedIn()    { shareToLinkedIn(buildTelegramMessageText()); }
    function shareSignalToDiscord()     { shareToDiscord(buildTelegramMessageText()); }

    // Community Engagement wrappers
    function broadcastEngToTickets() { broadcastToTickets(document.getElementById('engMessage').value); }
    function shareEngToTwitter()     { shareToTwitter(document.getElementById('engMessage').value); }
    function shareEngToFacebook()    { shareToFacebook(document.getElementById('engMessage').value); }
    function shareEngToInstagram()   { shareToInstagram(document.getElementById('engMessage').value); }
    function shareEngToTikTok()      { shareToTikTok(document.getElementById('engMessage').value); }
    function shareEngToLinkedIn()    { shareToLinkedIn(document.getElementById('engMessage').value); }
    function shareEngToDiscord()     { shareToDiscord(document.getElementById('engMessage').value); }

    // Live Sessions wrappers
    function broadcastLiveToTickets() { broadcastToTickets(document.getElementById('liveMessage').value); }
    function shareLiveToTwitter()     { shareToTwitter(document.getElementById('liveMessage').value); }
    function shareLiveToFacebook()    { shareToFacebook(document.getElementById('liveMessage').value); }
    function shareLiveToInstagram()   { shareToInstagram(document.getElementById('liveMessage').value); }
    function shareLiveToTikTok()      { shareToTikTok(document.getElementById('liveMessage').value); }
    function shareLiveToLinkedIn()    { shareToLinkedIn(document.getElementById('liveMessage').value); }
    function shareLiveToDiscord()     { shareToDiscord(document.getElementById('liveMessage').value); }

    // Performance Tracker wrappers
    function _getPerfText() {
      const wins   = parseInt(document.getElementById('perfWins').value)   || 0;
      const losses = parseInt(document.getElementById('perfLosses').value) || 0;
      const pips   = document.getElementById('perfPips').value  || '0';
      const week   = document.getElementById('perfWeek').value  || 'This Week';
      const notes  = document.getElementById('perfNotes').value || '';
      const total  = wins + losses;
      const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;
      return `📊 WEEKLY RECAP | ${week}\n\nWins: ${wins} | Losses: ${losses} | Win Rate: ${wr}%\nPips Gained: +${pips}\n\n${notes}\n\n💎 Join Pips Attendant → https://pips-attendantke.onrender.com`;
    }
    function broadcastPerfToTickets() { broadcastToTickets(_getPerfText()); }
    function sharePerfToTwitter()     { shareToTwitter(_getPerfText()); }
    function sharePerfToFacebook()    { shareToFacebook(_getPerfText()); }
    function sharePerfToInstagram()   { shareToInstagram(_getPerfText()); }
    function sharePerfToTikTok()      { shareToTikTok(_getPerfText()); }
    function sharePerfToLinkedIn()    { shareToLinkedIn(_getPerfText()); }
    function sharePerfToDiscord()     { shareToDiscord(_getPerfText()); }

    // --- DISCORD WEBHOOK MIRRORING ---
    async function shareToDiscord(text) {
      const webhookUrl = localStorage.getItem('pa_discord_webhook');
      if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        showSocialToast('🎮 No Discord Webhook saved. Add it in Setup Credentials.', '#7c3aed');
        return;
      }
      if (!text || !text.trim()) {
        showSocialToast('⚠️ Nothing to send to Discord.', '#fbbf24');
        return;
      }

      showSocialToast('🎮 Sending to Discord...', '#7c3aed');

      try {
        // Discord webhooks use a { content: "..." } payload
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });

        if (res.ok) {
          showSocialToast('🎮 Successfully mirrored to Discord!', '#22c55e');
        } else {
          showSocialToast('❌ Discord rejected the message. Check your Webhook URL.', '#f87171');
        }
      } catch (err) {
        showSocialToast('❌ Could not reach Discord. Check your connection.', '#f87171');
      }
    }

  