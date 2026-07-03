
    feather.replace();

    let TELEGRAM_BOT_USERNAME = 'PipsAttendantBot';

    function showMyAccountModal() {
      const modal = document.getElementById('myAccountModal');
      modal.classList.remove('hidden');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);

      // Populate referral link with the user's ID
      const token = sessionStorage.getItem('vip_session_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userId = payload.id;
          if (userId) {
            const refLink = `${window.location.origin}${window.location.pathname}?ref=${userId}`;
            const refInput = document.getElementById('referralLinkInput');
            if (refInput) refInput.value = refLink;

            // Build Telegram deep link for account linking
            const tgLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${userId}`;
            const tgBtn = document.getElementById('telegramLinkBtn');
            if (tgBtn) tgBtn.href = tgLink;

            // Check if already linked (user object stored after login)
            const telegramId = window.__currentUser__?.telegramId;
            const tgStatus = document.getElementById('telegramLinkStatus');
            if (tgStatus) {
              tgStatus.textContent = telegramId
                ? `✅ Linked (TG ID: ${telegramId})`
                : '⚠️ Not linked — click below to link.';
              tgStatus.className = telegramId ? 'text-emerald-400 text-[11px] mb-3' : 'text-amber-400 text-[11px] mb-3';
            }
          }
        } catch (e) { /* ignore */ }
      }
      fetchUserTickets();
      feather.replace();
    }

    function closeMyAccountModal() {
      const modal = document.getElementById('myAccountModal');
      modal.classList.add('opacity-0');
      setTimeout(() => modal.classList.add('hidden'), 300);
    }

    function copyReferralLink() {
      const input = document.getElementById('referralLinkInput');
      const msgEl = document.getElementById('referralCopyMsg');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value).then(() => {
        msgEl.textContent = '✅ Referral link copied!';
        setTimeout(() => { msgEl.textContent = ''; }, 3000);
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        msgEl.textContent = '✅ Copied!';
        setTimeout(() => { msgEl.textContent = ''; }, 3000);
      });
    }

    function openNewTicketForm() {
      const form = document.getElementById('newTicketForm');
      if (form) {
        form.classList.toggle('hidden');
        const subjectEl = document.getElementById('ticketSubject');
        if (subjectEl && !form.classList.contains('hidden')) subjectEl.focus();
      }
    }

    async function submitTicket() {
      const token = sessionStorage.getItem('vip_session_token');
      const subject = document.getElementById('ticketSubject')?.value.trim();
      const message = document.getElementById('ticketMessage')?.value.trim();
      const msgEl = document.getElementById('ticketSubmitMsg');

      if (!subject || !message) {
        if (msgEl) { msgEl.className = 'text-rose-400 text-xs min-h-[14px]'; msgEl.textContent = '❌ Please fill in all fields.'; }
        return;
      }

      try {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token || '' },
          body: JSON.stringify({ subject, message })
        });
        const data = await res.json();
        if (data.ok) {
          if (msgEl) { msgEl.className = 'text-emerald-400 text-xs min-h-[14px]'; msgEl.textContent = '✅ Ticket submitted! We\'ll reply soon.'; }
          document.getElementById('ticketSubject').value = '';
          document.getElementById('ticketMessage').value = '';
          setTimeout(() => {
            document.getElementById('newTicketForm').classList.add('hidden');
            if (msgEl) msgEl.textContent = '';
          }, 2500);
          fetchUserTickets();
        } else {
          if (msgEl) { msgEl.className = 'text-rose-400 text-xs min-h-[14px]'; msgEl.textContent = `❌ ${data.error}`; }
        }
      } catch (err) {
        if (msgEl) { msgEl.className = 'text-rose-400 text-xs min-h-[14px]'; msgEl.textContent = '❌ Server error. Please try again.'; }
      }
    }

    async function fetchUserTickets() {
      const token = sessionStorage.getItem('vip_session_token');
      const container = document.getElementById('userTicketsList');
      if (!container || !token) return;
      try {
        const res = await fetch('/api/tickets', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (!data.ok || data.tickets.length === 0) {
          container.innerHTML = '<p class="text-gray-500 text-[10px] text-center py-2">No tickets yet. Click "+ New Ticket" to open a support request.</p>';
          return;
        }
        container.innerHTML = data.tickets.map(t => {
          const statusColor = t.status === 'Open' ? 'text-rose-400'
            : t.status === 'Answered' ? 'text-amber-400'
            : 'text-gray-400';
          const lastMsg = t.messages && t.messages.length > 0 ? t.messages[t.messages.length - 1] : null;
          return `
            <div class="rounded-xl border border-white/10 bg-white/5 p-3">
              <div class="flex items-center justify-between gap-2 mb-1">
                <p class="text-white text-xs font-semibold truncate flex-1">${t.subject}</p>
                <span class="shrink-0 text-[9px] font-bold ${statusColor}">${t.status}</span>
              </div>
              ${lastMsg ? `<p class="text-gray-400 text-[10px] italic truncate">${lastMsg.sender}: ${lastMsg.text}</p>` : ''}
            </div>
          `;
        }).join('');
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-[10px] text-center py-2">Failed to load tickets.</p>';
      }
    }

    async function handleUpdateProfile(e) {
      e.preventDefault();
      const name = document.getElementById('profileName').value.trim();
      const errorEl = document.getElementById('profileError');
      const btn = document.getElementById('profileBtn');
      const token = sessionStorage.getItem('vip_session_token');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Updating...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.className = 'text-[11px] min-h-[14px]';

      try {
        const res = await fetch('/api/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ Profile updated!';
          document.getElementById('vipWelcomeText').textContent = `Welcome, ${data.name}!`;
          localStorage.setItem('pa_vip_user_name', data.name);
          setTimeout(() => { errorEl.textContent = ''; }, 3000);
        } else {
          errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errorEl.textContent = `❌ ${data.error}`;
        }
      } catch (err) {
        errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errorEl.textContent = '❌ Server error.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    async function handleChangePassword(e) {
      e.preventDefault();
      const oldPassword = document.getElementById('oldPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const errorEl = document.getElementById('changePwError');
      const btn = document.getElementById('changePwBtn');
      const token = sessionStorage.getItem('vip_session_token');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Changing...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.className = 'text-[11px] min-h-[14px]';

      try {
        const res = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ Password changed successfully!';
          document.getElementById('oldPassword').value = '';
          document.getElementById('newPassword').value = '';
          setTimeout(() => { errorEl.textContent = ''; }, 3000);
        } else {
          errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errorEl.textContent = `❌ ${data.error}`;
        }
      } catch (err) {
        errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errorEl.textContent = '❌ Server error.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    // ── File Management ────────────────────────────────────────
    let pollInterval;
    let selectedNetwork = 'TRC20';
    let selectedMpesaPlan = '1month';
    let selectedCryptoPlan = '1month';
    let authMode = 'login';

    const PLAN_KES  = { '1month': 5000, '2months': 9500, '3months': 14000, '6months': 25000 };
    const PLAN_USDT = { '1month': 50,   '2months': 95,   '3months': 140,   '6months': 250   };
    const PLAN_DAYS = { '1month': 30,   '2months': 60,   '3months': 90,    '6months': 180   };

    function selectMpesaPlan(plan) {
      selectedMpesaPlan = plan;
      ['1month','2months','3months','6months'].forEach(p => {
        const btn = document.getElementById(`mp-${p}`);
        if (!btn) return;
        if (p === plan) {
          btn.className = 'plan-btn-mpesa flex flex-col items-center py-3 px-1 rounded-xl border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-emerald-500 text-black text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
        } else {
          btn.className = 'plan-btn-mpesa flex flex-col items-center py-3 px-1 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:border-emerald-500/30 cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-emerald-500/50 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
        }
        // Remove duplicate popular badges injected by the if-else loop
        const badges = btn.querySelectorAll('div');
        if (badges.length > 1) {
          for (let i = 1; i < badges.length; i++) badges[i].remove();
        }
      });
      const kes = PLAN_KES[plan];
      const btn = document.getElementById('payBtn');
      if (btn) btn.textContent = `Pay KES ${kes.toLocaleString()} via M-Pesa 💸`;
    }

    function selectCryptoPlan(plan) {
      selectedCryptoPlan = plan;
      ['1month','2months','3months','6months'].forEach(p => {
        const btn = document.getElementById(`cp-${p}`);
        if (!btn) return;
        if (p === plan) {
          btn.className = 'plan-btn-crypto flex flex-col items-center py-2.5 px-1 rounded-xl border border-amber-400/50 bg-amber-400/10 text-amber-400 cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-amber-400 text-black text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
        } else {
          btn.className = 'plan-btn-crypto flex flex-col items-center py-2.5 px-1 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:border-amber-400/30 cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-amber-400/50 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
        }
        const badges = btn.querySelectorAll('div');
        if (badges.length > 1) {
          for (let i = 1; i < badges.length; i++) badges[i].remove();
        }
      });
      const usdt = PLAN_USDT[plan];
      const priceEl = document.getElementById('cryptoPriceDisplay');
      if (priceEl) priceEl.textContent = `$${usdt}`;
    }

    // ── Crypto Wallet Addresses per network ───────────────────
    // Fallback defaults — overridden by server on load
    const cryptoWallets = {
      TRC20: '',
      BEP20: '',
      ERC20: ''
    };

    // Fetch wallet addresses from server (populated from env vars)
    async function loadCryptoWallets() {
      try {
        const res = await fetch('/api/crypto-wallets');
        const data = await res.json();
        if (data.ok && data.wallets) {
          Object.assign(cryptoWallets, data.wallets);
          // Update displayed address for currently selected network
          const addrEl = document.getElementById('cryptoWalletAddress');
          if (addrEl && cryptoWallets[selectedNetwork]) {
            addrEl.textContent = cryptoWallets[selectedNetwork];
          }
        }
      } catch (e) { /* silently fail, fallback addresses remain */ }
    }

    const networkNames = {
      TRC20: 'TRC20 (TRON)',
      BEP20: 'BEP20 (BSC)',
      ERC20: 'ERC20 (ETH)'
    };

    // ── Payment Tab Switching ──────────────────────────────────
    function switchPayTab(tab) {
      const mpesaPanel = document.getElementById('mpesaPanel');
      const cryptoPanel = document.getElementById('cryptoPanel');
      const tabMpesa = document.getElementById('tabMpesa');
      const tabCrypto = document.getElementById('tabCrypto');

      if (tab === 'mpesa') {
        mpesaPanel.classList.remove('hidden');
        cryptoPanel.classList.add('hidden');
        tabMpesa.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 transition duration-200 cursor-pointer';
        tabCrypto.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-amber-500/20 bg-white/5 text-gray-400 hover:border-amber-500/40 hover:text-amber-400 transition duration-200 cursor-pointer';
      } else {
        mpesaPanel.classList.add('hidden');
        cryptoPanel.classList.remove('hidden');
        tabCrypto.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 transition duration-200 cursor-pointer';
        tabMpesa.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-emerald-500/20 bg-white/5 text-gray-400 hover:border-emerald-500/40 hover:text-emerald-400 transition duration-200 cursor-pointer';
        feather.replace();
      }
    }

    // ── Crypto Network Selection ───────────────────────────────
    function selectNetwork(net) {
      selectedNetwork = net;
      const networks = ['TRC20', 'BEP20', 'ERC20'];
      networks.forEach(n => {
        const btn = document.getElementById(`net${n}`);
        if (!btn) return;
        if (n === net) {
          btn.className = 'flex-1 py-2 rounded-lg text-xs font-bold border border-amber-400/40 bg-amber-400/10 text-amber-400 transition cursor-pointer';
        } else {
          btn.className = 'flex-1 py-2 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-gray-400 hover:border-amber-400/30 hover:text-amber-300 transition cursor-pointer';
        }
      });
      // Update wallet address display
      const addrEl = document.getElementById('cryptoWalletAddress');
      if (addrEl) addrEl.textContent = cryptoWallets[net] || '—';
      // Update warning note
      const noteEl = document.getElementById('cryptoNetworkNote');
      if (noteEl) noteEl.innerHTML = `⚠️ Only send USDT on the <span class="text-amber-400 font-bold">${networkNames[net]}</span> network to this address`;
    }

    // ── Copy Crypto Wallet Address ─────────────────────────────
    function copyCryptoAddress() {
      const address = cryptoWallets[selectedNetwork];
      if (!address) return;
      navigator.clipboard.writeText(address).then(() => {
        const btn = document.getElementById('copyAddrBtn');
        if (btn) {
          btn.innerHTML = '<i data-feather="check" class="w-3.5 h-3.5 text-emerald-400"></i>';
          feather.replace();
          setTimeout(() => {
            btn.innerHTML = '<i data-feather="copy" class="w-3.5 h-3.5 text-amber-400"></i>';
            feather.replace();
          }, 2000);
        }
      }).catch(() => {
        // Fallback
        const el = document.getElementById('cryptoWalletAddress');
        const range = document.createRange();
        range.selectNode(el);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
      });
    }

    // ── Submit Crypto Payment Proof ────────────────────────────
    async function submitCryptoPayment() {
      const txHash = document.getElementById('cryptoTxHash').value.trim();
      const contact = document.getElementById('cryptoContact').value.trim();
      const errorEl = document.getElementById('cryptoFormError');
      const btn = document.getElementById('cryptoSubmitBtn');

      errorEl.textContent = '';

      if (!txHash) { errorEl.textContent = '❌ Please enter your transaction hash.'; return; }
      if (txHash.length < 10) { errorEl.textContent = '❌ Transaction hash looks too short. Double check.'; return; }
      if (!contact) { errorEl.textContent = '❌ Please enter your Telegram or email to receive the code.'; return; }

      const origText = btn.textContent;
      btn.textContent = '⏳ Submitting...';
      btn.disabled = true;

      try {
        const token = sessionStorage.getItem('vip_session_token');
        const promoCode = document.getElementById('cryptoPromo') ? document.getElementById('cryptoPromo').value.trim() : '';
        const res = await fetch('/api/crypto-pay', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-vip-token': token || ''
          },
          body: JSON.stringify({ txHash, contactInfo: contact, network: selectedNetwork, plan: selectedCryptoPlan, promoCode })
        });
        const data = await res.json();

        if (data.ok) {
          // Show success state
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.innerHTML = '✅ Submitted successfully! We\'ll verify and send your access code within 24 hours.';
          btn.textContent = '✅ Submitted!';
          btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          document.getElementById('cryptoTxHash').value = '';
          document.getElementById('cryptoContact').value = '';
        } else {
          errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errorEl.textContent = `❌ ${data.error || 'Submission failed. Please try again.'}`;
          btn.textContent = origText;
          btn.disabled = false;
        }
      } catch {
        errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errorEl.textContent = '❌ Network error. Please try again.';
        btn.textContent = origText;
        btn.disabled = false;
      }
    }

    function togglePasswordForm() {
      document.getElementById('passwordForm').classList.toggle('hidden');
    }

    // ── Update download & Telegram links with session token ────
    function updateDownloadLinks() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      document.querySelectorAll('a[data-filename]').forEach(link => {
        link.href = `/api/download-vip?file=${encodeURIComponent(link.getAttribute('data-filename'))}&token=${encodeURIComponent(token)}`;
      });
      const tgLink = document.getElementById('vipTelegramLink');
      if (tgLink) tgLink.href = `/api/telegram/generate-invite?token=${encodeURIComponent(token)}`;
    }



    // ── Show "Success" panel after payment ──────────────
    function showSuccessPanel() {
      document.getElementById('paymentPanel').style.display = 'none';
      document.getElementById('saveCodePanel').classList.remove('hidden');
      feather.replace();
    }

    // ── Transition from Success panel → VIP Content ─────────
    function enterVIPFromSavePanel() {
      document.getElementById('saveCodePanel').classList.add('hidden');
      document.getElementById('contentPanel').classList.remove('hidden');
      updateDownloadLinks();
      loadTodaysSetup();
      loadTodaysSetupResults();
      feather.replace();
    }

    // ── M-Pesa Payment Flow ────────────────────────────────────
    async function payMpesa() {
      const phone = document.getElementById('mpesaPhone').value.trim();
      const error = document.getElementById('mpesaError');
      const btn   = document.getElementById('payBtn');

      if (!phone) { error.textContent = '❌ Please enter a phone number.'; return; }

      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse flex items-center justify-center gap-2"><i data-feather="loader" class="w-4 h-4 animate-spin"></i> Initiating STK Push...</span>';
      feather.replace();
      btn.disabled = true;

      try {
        const token = sessionStorage.getItem('vip_session_token');
        const promoCode = document.getElementById('mpesaPromo') ? document.getElementById('mpesaPromo').value.trim() : '';
        const res  = await fetch('/api/pay-vip', { 
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'x-vip-token': token || ''
          }, 
          body: JSON.stringify({ phone, plan: selectedMpesaPlan, amount: PLAN_KES[selectedMpesaPlan], promoCode }) 
        });
        const data = await res.json();

        if (data.ok) {
          error.className = 'text-emerald-400 text-xs min-h-[16px]';
          error.textContent = '✅ STK Push sent! Enter your M-Pesa PIN on your phone.';
          btn.innerHTML = '<span class="animate-pulse flex items-center justify-center gap-2"><i data-feather="loader" class="w-4 h-4 animate-spin"></i> Waiting for payment...</span>';
          feather.replace();
          pollPayment(data.reference, btn, originalText, error);
        } else {
          error.className = 'text-rose-400 text-xs min-h-[16px]';
          error.textContent = `❌ ${data.error}`;
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      } catch {
        error.className = 'text-rose-400 text-xs min-h-[16px]';
        error.textContent = '❌ Server error. Please try again later.';
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    async function applyPromo(type) {
      const codeInput = document.getElementById(type + 'Promo');
      if (!codeInput) return;
      const code = codeInput.value.trim();
      const errorEl = document.getElementById(type === 'mpesa' ? 'mpesaError' : 'cryptoFormError');
      const btn = document.getElementById(type === 'mpesa' ? 'payBtn' : 'cryptoSubmitBtn');
      
      if (!code) {
        errorEl.className = 'text-rose-400 text-xs min-h-[16px]';
        errorEl.textContent = 'Please enter a promo code.';
        return;
      }

      errorEl.textContent = 'Validating...';
      try {
        const res = await fetch(`/api/promos/validate/${code}`);
        const data = await res.json();
        
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-xs min-h-[16px]';
          errorEl.textContent = `✅ Promo applied: ${data.discountPercentage}% off!`;
          
          if (type === 'mpesa') {
            const baseAmount = PLAN_KES[selectedMpesaPlan];
            const newAmount = Math.floor(baseAmount * (1 - (data.discountPercentage / 100)));
            btn.innerHTML = `Pay KES ${newAmount.toLocaleString()} via M-Pesa 💸`;
          } else {
            const baseAmount = PLAN_USDT[selectedCryptoPlan];
            const newAmount = Math.floor(baseAmount * (1 - (data.discountPercentage / 100)));
            btn.innerHTML = `Submit Payment Proof ($${newAmount} USDT) ✅`;
          }
        } else {
          errorEl.className = 'text-rose-400 text-xs min-h-[16px]';
          errorEl.textContent = `❌ ${data.error}`;
        }
      } catch (err) {
        errorEl.className = 'text-rose-400 text-xs min-h-[16px]';
        errorEl.textContent = '❌ Failed to validate promo.';
      }
    }

    async function pollPayment(ref, btn, originalText, errorEl) {
      if (pollInterval) clearInterval(pollInterval);
      let attempts = 0;

      pollInterval = setInterval(async () => {
        if (++attempts > 60) {
          clearInterval(pollInterval);
          errorEl.className = 'text-rose-400 text-xs min-h-[16px]';
          errorEl.textContent = '❌ Payment timed out. Please try again.';
          btn.innerHTML = originalText;
          btn.disabled = false;
          return;
        }

        try {
          const token = sessionStorage.getItem('vip_session_token');
          const res  = await fetch(`/api/check-payment/${ref}`, {
            headers: { 'x-vip-token': token || '' }
          });
          const data = await res.json();

          if (data.ok && data.status === 'Success') {
            clearInterval(pollInterval);
            btn.innerHTML = originalText;
            btn.disabled  = false;
            
            if (data.sessionToken) {
               sessionStorage.setItem('vip_session_token', data.sessionToken);
            }
            if (data.user) {
               localStorage.setItem('pa_vip_user_name', data.user.name || 'VIP Member');
            }

            showSuccessPanel();

          } else if (data.ok && data.status === 'Failed') {
            clearInterval(pollInterval);
            errorEl.className = 'text-rose-400 text-xs min-h-[16px]';
            errorEl.textContent = '❌ Payment failed or was cancelled.';
            btn.innerHTML = originalText;
            btn.disabled  = false;
          }
        } catch { /* ignore transient network errors during polling */ }
      }, 3000);
    }

    // ── User Authentication ────────────────────────────────────
    function switchAuthTab(mode) {
      authMode = mode;
      const btnLogin = document.getElementById('tabLogin');
      const btnRegister = document.getElementById('tabRegister');
      const nameGroup = document.getElementById('nameFieldGroup');
      const btnSubmit = document.getElementById('authBtn');
      const errorEl = document.getElementById('authError');
      
      errorEl.textContent = '';

      if (mode === 'login') {
        btnLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 transition cursor-pointer';
        btnRegister.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-white/5 bg-white/5 text-gray-400 hover:text-amber-400 transition cursor-pointer';
        nameGroup.classList.add('hidden');
        btnSubmit.innerHTML = 'Log In 🔓';
      } else {
        btnRegister.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 transition cursor-pointer';
        btnLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-white/5 bg-white/5 text-gray-400 hover:text-amber-400 transition cursor-pointer';
        nameGroup.classList.remove('hidden');
        btnSubmit.innerHTML = 'Create Account 🚀';
      }
    }
    
    // Auto-switch to login if requested
    window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('action') === 'login') {
        switchAuthTab('login');
      }

      // Show promo fields if ?promo=1 or if admin has enabled globally
      const forcePromo = urlParams.get('promo') === '1';
      if (forcePromo) {
        showPromoFields();
      } else {
        fetch('/api/public-config')
          .then(r => r.json())
          .then(data => { if (data?.config?.promoCodesEnabled) showPromoFields(); })
          .catch(() => {});
      }
    });

    function showPromoFields() {
      const mpesa = document.getElementById('mpesaPromoContainer');
      const crypto = document.getElementById('cryptoPromoContainer');
      if (mpesa) mpesa.classList.remove('hidden');
      if (crypto) crypto.classList.remove('hidden');
    }

    async function handleAuth(e) {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      const name = document.getElementById('authName').value.trim();
      const errorEl = document.getElementById('authError');
      const btn = document.getElementById('authBtn');
      
      if (authMode === 'register') {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(password)) {
          errorEl.textContent = '❌ Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.';
          return;
        }
      }

      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      // Pass referral code from URL if present during registration
      const urlRef = new URLSearchParams(window.location.search).get('ref');
      const body = authMode === 'login' ? { email, password } : { email, password, name, referralCode: urlRef || undefined };
      
      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Processing...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.ok) {
          sessionStorage.setItem('vip_session_token', data.sessionToken);
          localStorage.setItem('vip_session_token', data.sessionToken); // For journal across tabs
          localStorage.setItem('pa_vip_user_name', data.user.name || email.split('@')[0]);
          
          const urlParams = new URLSearchParams(window.location.search);
          const returnUrl = urlParams.get('return');
          if (returnUrl === 'journal') {
            window.location.href = 'journal.html';
            return;
          }
          checkUserAccess();
        } else {
          errorEl.textContent = `❌ ${data.error || 'Authentication failed'}`;
        }
      } catch (err) {
        errorEl.textContent = '❌ Server error. Please try again.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    function showForgotPasswordModal() {
      const modal = document.getElementById('forgotPasswordModal');
      modal.classList.remove('hidden');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeForgotPasswordModal() {
      const modal = document.getElementById('forgotPasswordModal');
      modal.classList.add('opacity-0');
      setTimeout(() => modal.classList.add('hidden'), 300);
    }

    async function handleForgotPassword(e) {
      e.preventDefault();
      const email = document.getElementById('forgotEmail').value.trim();
      const errorEl = document.getElementById('forgotError');
      const btn = document.getElementById('forgotBtn');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Sending...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.className = 'text-[11px] min-h-[14px]';

      try {
        const res = await fetch('/api/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ If that email is registered, a reset link has been sent.';
          setTimeout(closeForgotPasswordModal, 3000);
        } else {
          errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errorEl.textContent = `❌ ${data.error || 'Failed to send reset link.'}`;
        }
      } catch (err) {
        errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errorEl.textContent = '❌ Server error.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    async function handleResetPassword(e) {
      e.preventDefault();
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('resetToken');
      const email = urlParams.get('email');
      const newPassword = document.getElementById('newResetPassword').value;
      const errorEl = document.getElementById('resetError');
      const btn = document.getElementById('resetBtn');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Updating...</span>';
      btn.disabled = true;
      errorEl.className = 'text-[11px] min-h-[14px]';
      errorEl.textContent = '';

      try {
        const res = await fetch('/api/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword })
        });
        const data = await res.json();
        
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ Password updated successfully! Redirecting to login...';
          setTimeout(() => {
            window.location.href = window.location.pathname; // Remove query params
          }, 2000);
        } else {
          errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errorEl.textContent = `❌ ${data.error || 'Failed to reset password.'}`;
        }
      } catch (err) {
        errorEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errorEl.textContent = '❌ Server error.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    async function redeemCode() {
      const code = document.getElementById('vipPassword').value.trim();
      const error = document.getElementById('gateError');
      const btn = document.getElementById('unlockBtn');
      
      if (!code) return;
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Verifying...</span>';
      btn.disabled = true;

      try {
        const res = await fetch('/api/redeem-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.ok) {
          checkUserAccess();
        } else {
          error.textContent = `❌ ${data.error || 'Invalid code'}`;
        }
      } catch (err) {
        error.textContent = '❌ Server error';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    function togglePasswordVisibility(inputId, iconId) {
      const input = document.getElementById(inputId);
      const icon = document.getElementById(iconId);
      if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-feather', 'eye-off');
      } else {
        input.type = 'password';
        icon.setAttribute('data-feather', 'eye');
      }
      feather.replace();
    }

    // -- Socket.io initialization --
    let socket = null;
    let currentRoom = 'vip';

    function initSocket(token) {
      if (socket) return; // already connected
      socket = io({ auth: { token } });

      socket.on('connect', () => {
        socket.emit('joinRoom', currentRoom);
      });

      socket.on('newMessage', (msg) => {
        // If message is for another room, show badge
        if (msg.room && msg.room !== currentRoom) {
          if (msg.room === 'signals') {
            document.getElementById('signalsUnreadBadge').classList.remove('hidden');
          }
          return;
        }

        const chatContainer = document.getElementById('chatMessages');
        if (chatContainer.innerHTML.includes('No messages yet') || chatContainer.innerHTML.includes('Connecting to chat')) {
          chatContainer.innerHTML = '';
        }
        
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const isSelf = msg.author === (localStorage.getItem('pa_vip_user_name') || 'VIP Member');
        
        const msgHtml = `
          <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} w-full mt-2 animate-fade-in-up">
            <span class="text-[10px] text-gray-500 mb-1 ml-1">${msg.author} • ${timeStr}</span>
            <div class="max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isSelf ? 'bg-amber-500/20 border border-amber-500/30 text-amber-50' : 'bg-white/10 border border-white/5 text-gray-200'}">
              ${msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </div>
          </div>
        `;
        chatContainer.insertAdjacentHTML('afterbegin', msgHtml);
      });
      
      socket.on('error', (err) => console.error('Socket error:', err));
    }

    async function checkUserAccess() {
      // Fetch dynamic Telegram bot username
      try {
        const botRes = await fetch('/api/telegram/bot-username');
        const botData = await botRes.json();
        if (botData.ok && botData.botUsername) {
          TELEGRAM_BOT_USERNAME = botData.botUsername;
        }
      } catch (e) {
        console.log('Using default bot username');
      }

      const token = sessionStorage.getItem('vip_session_token');
      if (!token) {
        document.getElementById('authPanel').style.display = 'block';
        document.getElementById('paymentPanel').style.display = 'none';
        document.getElementById('contentPanel').classList.add('hidden');
        return;
      }

      try {
        const res = await fetch('/api/me', { headers: { 'x-vip-token': token } });
        const data = await res.json();

        if (data.ok && data.user) {
          window.__currentUser__ = data.user; // store globally for modals
          document.getElementById('authPanel').style.display = 'none';
          const now = Date.now();
          if (data.user.subscriptionExpiry && data.user.subscriptionExpiry > now) {
            // VIP access granted
            document.getElementById('paymentPanel').style.display = 'none';
            document.getElementById('contentPanel').classList.remove('hidden');
            
            // Show Telegram Blocker if telegramId is not linked
            if (!data.user.telegramId) {
              document.getElementById('telegramBlocker').classList.remove('hidden');
              document.getElementById('vipMainContent').classList.add('hidden');
              
              // Build link for the blocker button
              const tgBtn = document.getElementById('blockerTelegramLinkBtn');
              if (tgBtn) tgBtn.href = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${data.user.id}`;
            } else {
              document.getElementById('telegramBlocker').classList.add('hidden');
              document.getElementById('vipMainContent').classList.remove('hidden');
            }
            
            document.getElementById('vipWelcomeText').textContent = `Welcome, ${data.user.name || 'VIP Member'}!`;
            const daysLeft = Math.ceil((data.user.subscriptionExpiry - now) / (1000 * 60 * 60 * 24));
            document.getElementById('vipExpiryText').textContent = `VIP Access: ${daysLeft} days remaining.`;
            document.getElementById('profileName').value = data.user.name || '';
            
            const tgStatus = document.getElementById('telegramLinkStatus');
            const tgBtnAcc = document.getElementById('telegramLinkBtn');
            if (tgStatus && tgBtnAcc) {
              if (data.user.telegramId) {
                tgStatus.className = 'text-emerald-400 text-[11px] mb-3';
                tgStatus.innerHTML = '✅ Linked successfully';
                tgBtnAcc.classList.add('hidden');
              } else {
                tgStatus.className = 'text-gray-400 text-[11px] mb-3';
                tgStatus.innerHTML = 'Not linked yet';
                tgBtnAcc.classList.remove('hidden');
                tgBtnAcc.href = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${data.user.id}`;
              }
            }

            updateDownloadLinks();
            loadTodaysSetup();
            loadTodaysSetupResults();
            loadChatMessages();
            initSocket(token); // Init real-time chat
            loadCountdownFromSignals();
            feather.replace();
          } else {
            // VIP expired or no VIP
            document.getElementById('contentPanel').classList.add('hidden');
            document.getElementById('paymentPanel').style.display = 'block';
          }
        } else {
          console.error('[checkUserAccess] Failed:', data);
          document.getElementById('authError').textContent = 'Session error: ' + (data.error || 'Unknown');
          // logout(); // Disabled temporarily to prevent instant reload
        }
      } catch (e) {
        // Fallback or offline, just stay where we are or logout
      }
    }

    function logout() {
      sessionStorage.removeItem('vip_session_token');
      localStorage.removeItem('vip_session_token');
      if (socket) socket.disconnect();
      window.location.reload();
    }

    function lockVIP() {
      logout();
    }

    let pollingInterval;
    let countdownInterval;

    // --- LIVE COUNTDOWN TIMER ---
    function startCountdown(entryTime) {
      const section   = document.getElementById('countdownSection');
      const display   = document.getElementById('countdownDisplay');
      const fired     = document.getElementById('countdownFired');
      const label     = document.getElementById('countdownLabel');
      const badge     = document.getElementById('countdownBadge');
      const hEl       = document.getElementById('cdHours');
      const mEl       = document.getElementById('cdMinutes');
      const sEl       = document.getElementById('cdSeconds');

      if (!entryTime) { section.classList.add('hidden'); return; }

      const target = Number(entryTime);

      // If entry time is already more than 1 hour in the past, hide the section entirely
      if (Date.now() - target > 60 * 60 * 1000) {
        section.classList.add('hidden');
        return;
      }

      section.classList.remove('hidden');

      // Format the label with local time
      label.textContent = `Entry at ${new Date(target).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      if (countdownInterval) clearInterval(countdownInterval);

      function tick() {
        const diff = target - Date.now();
        if (diff <= 0) {
          clearInterval(countdownInterval);
          display.classList.add('hidden');
          fired.classList.remove('hidden');
          badge.textContent = 'NOW';
          badge.classList.remove('animate-pulse', 'bg-amber-500/20', 'text-amber-400', 'border-amber-500/30');
          badge.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/30');
          // Auto-hide the section 30 seconds after the countdown fires
          setTimeout(() => {
            section.style.transition = 'opacity 1s ease';
            section.style.opacity = '0';
            setTimeout(() => section.classList.add('hidden'), 1000);
          }, 30000);
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        hEl.textContent = String(h).padStart(2, '0');
        mEl.textContent = String(m).padStart(2, '0');
        sEl.textContent = String(s).padStart(2, '0');
      }
      tick();
      countdownInterval = setInterval(tick, 1000);
    }

    // --- THEME TOGGLE ---
    function initTheme() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark-navy') {
        document.body.classList.add('dark-navy-mode');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.setAttribute('data-feather', 'moon');
      }
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

    // INITIALIZATION
    window.addEventListener('DOMContentLoaded', () => {
      // Check for reset password token
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('resetToken')) {
        const resetModal = document.getElementById('resetPasswordModal');
        resetModal.classList.remove('hidden');
        setTimeout(() => resetModal.classList.remove('opacity-0'), 10);
      }

      feather.replace();
      initTheme();
      checkUserAccess();
    });

    async function loadTodaysSetup() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const res  = await fetch(`/api/todays-setup?token=${token}`);
        const data = await res.json();
        if (data.ok && data.setup) {
          // If the setup has a future entry time, start the countdown
          if (data.setup.entryTime && data.setup.entryTime > Date.now()) {
            startCountdown(data.setup.entryTime);
          }

          if (data.setup.image) {
            document.getElementById('setupPlaceholder').classList.add('hidden');
            const noSetupBanner = document.getElementById('noSetupBanner');
            if (noSetupBanner) noSetupBanner.classList.add('hidden');
            const img  = document.getElementById('todaysSetupImage');
            const dlBtn = document.getElementById('todaysSetupDownload');
            img.src = data.setup.image;
            img.classList.remove('hidden');
            dlBtn.href = data.setup.image;
            dlBtn.download = data.setup.filename || 'todays-setup.png';
            dlBtn.classList.remove('hidden');
            feather.replace();
          }
        }
      } catch (err) { console.error('Failed to load setup:', err); }
    }

    // ── Load Countdown from Latest Signal ──────────────────────────
    async function loadCountdownFromSignals() {
      try {
        const res = await fetch('/api/signals/history');
        const data = await res.json();
        if (data.ok && data.signals && data.signals.length > 0) {
          // Find the most recent signal with a future entry time
          const now = Date.now();
          const futureSignals = data.signals
            .filter(s => s.entryTime && s.entryTime > now)
            .sort((a, b) => a.entryTime - b.entryTime);
          
          if (futureSignals.length > 0) {
            startCountdown(futureSignals[0].entryTime);
          }
        }
      } catch (err) {
        console.error('Failed to load signal countdown:', err);
      }
    }

    // ── Load Today's Setup Results image (VIP only) ────────────────
    async function loadTodaysSetupResults() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const res  = await fetch(`/api/todays-setup-results?token=${token}`);
        const data = await res.json();
        if (data.ok && data.setup && data.setup.image) {
          document.getElementById('setupResultsPlaceholder').classList.add('hidden');
          const img  = document.getElementById('todaysSetupResultsImage');
          const dlBtn = document.getElementById('todaysSetupResultsDownload');
          img.src = data.setup.image;
          img.classList.remove('hidden');
          dlBtn.href = data.setup.image;
          dlBtn.download = data.setup.filename || 'todays-setup-results.png';
          dlBtn.classList.remove('hidden');
          feather.replace();
        }
      } catch (err) { console.error('Failed to load setup results:', err); }
    }

    // ── VIP Chat Wall Logic ────────────────────────────────────────
    
    function switchChatRoom(room) {
      currentRoom = room;
      if (socket) {
        socket.emit('joinRoom', room);
      }
      
      // Update Tab Styles
      ['general', 'vip', 'signals'].forEach(r => {
        const btn = document.getElementById(`tab-room-${r}`);
        if (!btn) return;
        if (r === room) {
          if(r==='vip') btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-amber-400/40 bg-amber-400/10 text-amber-400 relative';
          if(r==='general') btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 relative';
          if(r==='signals') btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-sky-400/40 bg-sky-400/10 text-sky-400 relative';
        } else {
          btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-white/10 bg-white/5 text-gray-400 hover:text-white relative';
        }
      });

      // Clear badges
      if (room === 'signals') {
        const badge = document.getElementById('signalsUnreadBadge');
        if(badge) badge.classList.add('hidden');
      }

      // Hide input if Signals room
      if (room === 'signals') {
        document.getElementById('chatForm').classList.add('hidden');
        document.getElementById('readOnlyNotice').classList.remove('hidden');
      } else {
        document.getElementById('chatForm').classList.remove('hidden');
        document.getElementById('readOnlyNotice').classList.add('hidden');
      }

      // Clear UI and Reload
      const chatContainer = document.getElementById('chatMessages');
      chatContainer.innerHTML = '<div class="text-center text-gray-500 py-10 w-full"><i data-feather="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400/50"></i><p class="text-xs">Loading room...</p></div>';
      feather.replace();
      loadChatMessages();
    }

    async function loadChatMessages() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      const chatContainer = document.getElementById('chatMessages');
      try {
        const res = await fetch(`/api/chat/messages?token=${token}&room=${currentRoom}`);
        const data = await res.json();
        if (data.ok) {
          if (data.messages.length === 0) {
            chatContainer.innerHTML = '<div class="text-center text-gray-500 py-10 w-full"><p class="text-xs">No messages yet. Say hello!</p></div>';
          } else {
            // Reverse so newest is at the top of the flex-col-reverse container
            const reversed = [...data.messages].reverse();
            chatContainer.innerHTML = reversed.map(msg => {
              const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
              const isSelf = msg.author === (localStorage.getItem('pa_vip_user_name') || 'VIP Member');
              return `
                <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} w-full">
                  <span class="text-[10px] text-gray-500 mb-1 ml-1">${msg.author} • ${timeStr}</span>
                  <div class="max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isSelf ? 'bg-amber-500/20 border border-amber-500/30 text-amber-50' : 'bg-white/10 border border-white/5 text-gray-200'}">
                    ${msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      } catch (err) {
        console.error('Failed to load chat:', err);
      }
    }

    async function sendChatMessage(e) {
      e.preventDefault();
      const token = sessionStorage.getItem('vip_session_token');
      if (!token || !socket) return;
      
      if (currentRoom === 'signals') return; // Just in case
      
      const input = document.getElementById('chatInput');
      const btn = document.getElementById('chatBtn');
      const text = input.value.trim();
      if (!text) return;

      input.disabled = true;
      btn.disabled = true;

      // Send via WebSocket instead of HTTP POST
      socket.emit('sendMessage', {
        room: currentRoom,
        text,
        author: localStorage.getItem('pa_vip_user_name') || 'VIP Member'
      });
      
      input.value = '';
      input.disabled = false;
      btn.disabled = false;
      input.focus();
    }

    // Initialize data on page load
    loadCryptoWallets();
  