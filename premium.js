feather.replace();
    
    // Set min date for booking to today
    document.addEventListener('DOMContentLoaded', () => {
      const today = new Date().toISOString().split('T')[0];
      const dateInput = document.getElementById('bookingDate');
      if (dateInput) {
        dateInput.setAttribute('min', today);
      }
    });

    // ── Risk / Lot Size Calculator ───────────────────────────────
    function runRiskCalc() {
      try {
          const balance  = parseFloat(document.getElementById('rc_balance').value);
          const risk     = parseFloat(document.getElementById('rc_risk').value);
          const sl       = parseFloat(document.getElementById('rc_sl').value);
          const pipValue = parseFloat(document.getElementById('rc_pair').value);
          const warnEl   = document.getElementById('rc_warning');
          const warnTxt  = document.getElementById('rc_warning_text');

          warnEl.style.display = 'none';

          if (isNaN(balance) || isNaN(risk) || isNaN(sl) || balance <= 0 || risk <= 0 || sl <= 0) {
            warnTxt.textContent = 'Please enter valid numbers for all fields.';
            warnEl.style.display = 'flex';
            feather.replace();
            return;
          }
          if (risk > 5) {
            warnTxt.textContent = 'Warning: risking more than 5% per trade is extremely dangerous.';
            warnEl.style.display = 'flex';
            feather.replace();
          }

          const riskAmount = balance * (risk / 100);
          const lotSize    = riskAmount / (sl * pipValue);

          document.getElementById('rc_riskAmount').textContent = riskAmount.toFixed(2);
          document.getElementById('rc_lots').textContent       = lotSize.toFixed(2);
          document.getElementById('rc_disp_balance').textContent = `$${balance.toLocaleString()}`;
          document.getElementById('rc_disp_risk').textContent    = `${risk}%`;
          document.getElementById('rc_disp_sl').textContent      = `${sl} pips`;
          document.getElementById('rc_disp_lots').textContent    = lotSize.toFixed(2);
      } catch (err) {
          alert("Calculator Error: " + err.message);
          console.error(err);
      }
    }

    let TELEGRAM_BOT_USERNAME = 'PipsAttendantBot';

    function showMyAccountModal() {
      const modal = document.getElementById('myAccountModal');
      modal.classList.remove('hidden');
      setTimeout(() => modal.classList.remove('opacity-0'), 10);
      fetchPropFirmStatus();
    

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
              tgStatus.className = telegramId ? 'text-emerald-400 text-[11px] mb-3' : 'text-gold text-[11px] mb-3';
            }

            // Webhook for Platinum only
            const tier = String(window.__currentUser__?.subscriptionTier || 'Gold').toLowerCase();
            const webhookSection = document.getElementById('webhookSection');
            const webhookDivider = document.getElementById('webhookDivider');
            if (tier.includes('platinum')) {
              webhookSection.classList.remove('hidden');
              webhookDivider.classList.remove('hidden');
              document.getElementById('webhookUrl').value = window.__currentUser__?.webhookUrl || '';
            } else {
              webhookSection.classList.add('hidden');
              webhookDivider.classList.add('hidden');
            }
          }
        } catch (e) { /* ignore */ }
      }
      fetchUserTickets();
      feather.replace();
    }
    async function fetchPropFirmStatus() {
      try {
        const res = await fetch('/api/propfirm/status', {
          headers: { 'Authorization': 'Bearer ' + _token }
        });
        const data = await res.json();
        if (data.ok && data.account) {
          const acc = data.account;
          document.getElementById('propFirmSection').classList.remove('hidden');
          document.getElementById('propFirmDivider').classList.remove('hidden');
          
          document.getElementById('pfUserFirm').innerText = acc.firm;
          document.getElementById('pfUserPhase').innerText = acc.phase;
          document.getElementById('pfUserSize').innerText = '$' + acc.accountSize.toLocaleString();
          document.getElementById('pfUserCurrent').innerText = acc.currentPercent;
          document.getElementById('pfUserTarget').innerText = acc.targetPercent;
          
          let progress = (acc.currentPercent / acc.targetPercent) * 100;
          if (progress < 0) progress = 0;
          if (progress > 100) progress = 100;
          document.getElementById('pfUserProgress').style.width = progress + '%';
          
          document.getElementById('pfUserDrawdown').innerText = acc.maxDrawdown + '%';
          
          const statusEl = document.getElementById('pfUserStatus');
          statusEl.innerText = acc.status;
          if (acc.status === 'passed') { statusEl.className = 'text-xs font-bold uppercase text-emerald-400'; }
          else if (acc.status === 'failed') { statusEl.className = 'text-xs font-bold uppercase text-rose-400'; }
          else { statusEl.className = 'text-xs font-bold uppercase text-amber-400'; }
          
          if (acc.notes) {
            document.getElementById('pfUserNotes').innerText = '"' + acc.notes + '"';
            document.getElementById('pfUserNotes').classList.remove('hidden');
          } else {
            document.getElementById('pfUserNotes').classList.add('hidden');
          }
        }
      } catch(err) { console.error('PropFirm error:', err); }
    }

    async function handleWebhookSave(e) {
      e.preventDefault();
      const url = document.getElementById('webhookUrl').value.trim();
      const btn = document.getElementById('webhookBtn');
      const errorEl = document.getElementById('webhookError');
      const token = sessionStorage.getItem('vip_session_token');
      
      const origText = btn.innerHTML;
      btn.innerHTML = 'Saving...';
      btn.disabled = true;
      errorEl.textContent = '';
      
      try {
        const res = await fetch('/api/webhook-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ webhookUrl: url })
        });
        const data = await res.json();
        
        if (data.ok) {
          if (window.__currentUser__) window.__currentUser__.webhookUrl = data.webhookUrl;
          btn.innerHTML = 'Saved ✅';
          setTimeout(() => { btn.innerHTML = origText; btn.disabled = false; }, 2000);
        } else {
          errorEl.textContent = data.error || 'Failed to save';
          errorEl.className = 'text-rose-400 text-[11px] mt-1';
          btn.innerHTML = origText;
          btn.disabled = false;
        }
      } catch (err) {
        errorEl.textContent = 'Network error';
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    function closeMyAccountModal() {
      const modal = document.getElementById('myAccountModal');
      modal.classList.add('opacity-0');
      setTimeout(() => modal.classList.add('hidden'), 300);
    }

    // ── Notices Panel ────────────────────────────────────────────
    function toggleNoticesPanel() {
      const panel = document.getElementById('noticesPanel');
      if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        loadAnnouncements();
        feather.replace();
      } else {
        panel.classList.add('hidden');
      }
    }

    async function loadAnnouncements() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      const list = document.getElementById('noticesList');
      if (!list) return;
      list.innerHTML = '<p class="text-gray-500 text-xs text-center py-8 animate-pulse">Loading...</p>';

      try {
        const res = await fetch('/api/announcements', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.announcements) {
          if (data.announcements.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-xs text-center py-8">No notices at this time.</p>';
            document.getElementById('noticesBadge')?.classList.add('hidden');
            return;
          }
          document.getElementById('noticesBadge')?.classList.remove('hidden');
          list.innerHTML = data.announcements.map(a => {
            const typeStyle = a.type === 'warning'
              ? 'border-amber-400/30 bg-amber-400/5'
              : a.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-sky-500/30 bg-sky-500/5';
            const iconColor = a.type === 'warning' ? 'text-amber-400' : a.type === 'success' ? 'text-emerald-400' : 'text-sky-400';
            const icon = a.type === 'warning' ? 'alert-triangle' : a.type === 'success' ? 'check-circle' : 'info';
            const date = new Date(a.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `
              <div class="rounded-xl border ${typeStyle} p-3">
                <div class="flex items-start gap-2 mb-1">
                  <i data-feather="${icon}" class="w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor}"></i>
                  <p class="text-white text-xs font-bold leading-snug flex-1">${a.title}</p>
                </div>
                <p class="text-gray-300 text-[11px] leading-relaxed mb-1.5 pl-5">${a.message}</p>
                <p class="text-[10px] text-gray-500 pl-5">${date}</p>
              </div>
            `;
          }).join('');
          feather.replace();
        }
      } catch (err) {
        list.innerHTML = '<p class="text-rose-400 text-xs text-center py-8">Failed to load notices.</p>';
      }
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
            : t.status === 'Answered' ? 'text-gold'
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

    function setAvatar(avatarStr) {
      document.getElementById('profileAvatar').value = avatarStr;
      
      const preview = document.getElementById('avatarPreview');
      if (avatarStr.startsWith('data:image')) {
        preview.innerHTML = `<img src="${avatarStr}" class="w-full h-full object-cover rounded-full" />`;
      } else {
        preview.innerHTML = avatarStr;
      }
    }

    function handleAvatarUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      if (file.size > 300000) {
        alert("Image is too large. Please choose an image under 300KB.");
        event.target.value = '';
        return;
      }
      
      const reader = new FileReader();
      reader.onload = function(e) {
        setAvatar(e.target.result);
      };
      reader.readAsDataURL(file);
    }
    // ── Trade Journal ────────────────────────────────────────────
    async function handleJournalEntry(e) {
      e.preventDefault();
      const asset = document.getElementById('jAsset').value.trim().toUpperCase();
      const type = document.getElementById('jType').value;
      const entryPrice = document.getElementById('jEntry').value;
      const exitPrice = document.getElementById('jExit').value;
      const pips = document.getElementById('jPips').value;
      const notes = document.getElementById('jNotes').value.trim();
      const imageFile = document.getElementById('jImage').files[0];
      const errEl = document.getElementById('journalFormError');
      const btn = document.getElementById('journalSubmitBtn');
      const token = sessionStorage.getItem('vip_session_token');

      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Saving...</span>';
      btn.disabled = true;
      errEl.textContent = '';
      errEl.className = 'text-[11px] min-h-[14px]';

      let imageData = null;
      if (imageFile) {
        imageData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.readAsDataURL(imageFile);
        });
      }

      try {
        const res = await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ asset, type, entry: entryPrice, exit: exitPrice, pl: pips, date: Date.now(), notes, image: imageData })
        });
        const data = await res.json();
        if (data.ok) {
          errEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errEl.textContent = '✅ Trade logged!';
          document.getElementById('journalForm').reset();
          loadJournalEntries();
          setTimeout(() => { errEl.textContent = ''; }, 3000);
        } else {
          errEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
          errEl.textContent = `❌ ${data.error}`;
        }
      } catch (err) {
        errEl.className = 'text-rose-400 text-[11px] min-h-[14px]';
        errEl.textContent = '❌ Server error.';
      } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    }

    async function loadJournalEntries() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      const list = document.getElementById('journalList');
      const summary = document.getElementById('journalSummary');
      if (!list) return;

      try {
        const res = await fetch('/api/journal', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.entries) {
          if (data.entries.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">No trades logged yet. Start tracking your performance!</p>';
            if (summary) summary.classList.add('hidden');
            return;
          }

          // Compute summary
          _journalCache = data.entries;
          const totalPips = data.entries.reduce((acc, j) => acc + (parseFloat(j.pl) || 0), 0);
          updateJournalAnalytics(data.entries);
          if (summary) {
            summary.classList.remove('hidden');
            document.getElementById('journalTotalTrades').textContent = data.entries.length;
            const pipsEl = document.getElementById('journalTotalPips');
            pipsEl.textContent = (totalPips >= 0 ? '+' : '') + totalPips.toFixed(1);
            pipsEl.className = totalPips >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';
          }

          list.innerHTML = data.entries.map(j => {
            const pips = parseFloat(j.pl) || 0;
            const pipsColor = pips > 0 ? 'text-emerald-400' : pips < 0 ? 'text-rose-400' : 'text-gray-400';
            const typeColor = j.type === 'Buy' ? 'text-sky-400' : 'text-orange-400';
            const date = new Date(j.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `
              <div class="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition group">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-white font-bold text-xs">${j.asset}</span>
                    <span class="text-[9px] font-bold ${typeColor} px-1.5 py-0.5 rounded border border-current/20 bg-current/10">${j.type.toUpperCase()}</span>
                    <span class="text-[9px] text-gray-500 ml-auto">${date}</span>
                  </div>
                  ${j.notes || j.pl !== undefined ? `<p class="text-gray-500 text-[10px] truncate mt-0.5 italic">${j.notes || (j.entry ? `Entry: ${j.entry} → Exit: ${j.exit}` : '')}</p>` : ''}
                  ${j.image ? `<a href="${j.image}" target="_blank" class="inline-flex items-center gap-1 mt-1 text-[10px] text-emerald-400 hover:text-emerald-300"><i data-feather="image" class="w-3 h-3"></i> View Chart</a>` : ''}
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-bold text-sm ${pipsColor}">${pips >= 0 ? '+' : ''}${pips} <span class="text-[9px] font-normal">pips</span></p>
                </div>
                <button onclick="deleteJournalEntry('${j._id}')" class="opacity-0 group-hover:opacity-100 transition p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                </button>
              </div>
            `;
          }).join('');
          feather.replace();
        }
      } catch (err) {
        list.innerHTML = '<p class="text-rose-400 text-[11px] text-center py-4">Failed to load journal</p>';
      }
    }

    function exportJournalCSV() {
      if (!_journalCache || _journalCache.length === 0) {
        showToast('Export Failed', 'No trades to export.', 'error');
        return;
      }
      
      const headers = ['Date', 'Asset', 'Position', 'Entry', 'Exit', 'Pips', 'Notes', 'Has Chart'];
      const rows = _journalCache.map(j => {
        const date = new Date(j.date).toLocaleDateString('en-GB');
        const notes = (j.notes || '').replace(/"/g, '""');
        return `"${date}","${j.asset}","${j.type}","${j.entry || ''}","${j.exit || ''}","${j.pl || 0}","${notes}","${j.image ? 'Yes' : 'No'}"`;
      });
      
      const csvContent = [headers.join(','), ...rows].join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `trade_journal_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    let equityChartInstance = null;
    let winLossChartInstance = null;

    function updateJournalAnalytics(entries) {
      const container = document.getElementById('journalAnalytics');
      if (!entries || entries.length === 0) {
        if (container) container.classList.add('hidden');
        return;
      }
      if (container) container.classList.remove('hidden');

      // Sort entries chronologically for equity curve
      const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
      
      let cumulativePips = 0;
      const equityData = [0]; // start at 0
      const labels = ['Start'];
      
      let wins = 0, losses = 0, breakevens = 0;

      sorted.forEach((e, idx) => {
        const pips = parseFloat(e.pl) || 0;
        cumulativePips += pips;
        equityData.push(cumulativePips);
        labels.push(e.asset || `Trade ${idx+1}`);
        
        if (pips > 0) wins++;
        else if (pips < 0) losses++;
        else breakevens++;
      });

      // Render Equity Curve
      const eqCtx = document.getElementById('equityChart');
      if (eqCtx) {
        if (equityChartInstance) equityChartInstance.destroy();
        equityChartInstance = new Chart(eqCtx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Cumulative Pips',
              data: equityData,
              borderColor: '#34d399', // emerald-400
              backgroundColor: 'rgba(52, 211, 153, 0.1)',
              borderWidth: 2,
              pointBackgroundColor: '#065f46',
              pointBorderColor: '#34d399',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
              x: { grid: { display: false }, ticks: { display: false } }
            }
          }
        });
      }

      // Render Win/Loss Pie
      const wlCtx = document.getElementById('winLossChart');
      if (wlCtx) {
        if (winLossChartInstance) winLossChartInstance.destroy();
        winLossChartInstance = new Chart(wlCtx, {
          type: 'doughnut',
          data: {
            labels: ['Wins', 'Losses', 'Breakeven'],
            datasets: [{
              data: [wins, losses, breakevens],
              backgroundColor: ['#34d399', '#fb7185', '#9ca3af'], // emerald, rose, gray
              borderWidth: 0,
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#d1d5db', font: { size: 10 }, boxWidth: 10 } }
            }
          }
        });
      }
    }

    async function deleteJournalEntry(id) {
      if (!confirm('Delete this trade entry?')) return;
      const token = sessionStorage.getItem('vip_session_token');
      try {
        const res = await fetch(`/api/journal/${id}`, {
          method: 'DELETE',
          headers: { 'x-vip-token': token }
        });
        const data = await res.json();
        if (data.ok) loadJournalEntries();
      } catch (err) {
        console.error('Failed to delete entry');
      }
    }

    async function handleMentorshipBooking(e) {
      e.preventDefault();
      const date = document.getElementById('bookingDate').value;
      const time = document.getElementById('bookingTime').value;
      const topic = document.getElementById('bookingTopic').value.trim();
      const errorEl = document.getElementById('bookingError');
      const btn = document.getElementById('bookingBtn');
      const token = sessionStorage.getItem('vip_session_token');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Submitting...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.className = 'text-[11px] min-h-[14px]';

      try {
        const res = await fetch('/api/book-mentorship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ date, time, topic })
        });
        const data = await res.json();
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ Session requested successfully!';
          document.getElementById('bookingForm').reset();
          loadMyBookings();
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

    // ── Signal Performance Stats ───────────────────────────────────
    async function loadSignalStats() {
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const res = await fetch('/api/signals/stats', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.stats) {
          const s = data.stats;
          document.getElementById('statWinRate').textContent = s.winRate + '%';
          document.getElementById('statNetPips').textContent = (s.netPips > 0 ? '+' : '') + s.netPips;
          document.getElementById('statTotalSignals').textContent = s.total;
          document.getElementById('statWins').innerHTML = `<span class="text-emerald-400">${s.wins}</span>/<span class="text-rose-400">${s.losses}</span>`;
        }
      } catch (e) {}
    }

    // ── Daily Market Brief ────────────────────────────────────────
    async function loadDailyBrief() {
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const res = await fetch('/api/daily-brief', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.brief) {
          const brief = data.brief;
          const section = document.getElementById('dailyBriefSection');
          if (section) section.classList.remove('hidden');
          const biasEl = document.getElementById('briefBias');
          if (biasEl) {
            biasEl.textContent = brief.bias;
            const biasLower = brief.bias.toLowerCase();
            if (biasLower.includes('bull')) {
              biasEl.className = 'px-3 py-0.5 rounded-full text-xs font-black border text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
            } else if (biasLower.includes('bear')) {
              biasEl.className = 'px-3 py-0.5 rounded-full text-xs font-black border text-rose-400 border-rose-400/40 bg-rose-400/10';
            } else {
              biasEl.className = 'px-3 py-0.5 rounded-full text-xs font-black border text-amber-400 border-amber-400/40 bg-amber-400/10';
            }
          }
          if (brief.keyLevels) {
            document.getElementById('briefKeyLevels').classList.remove('hidden');
            document.getElementById('briefKeyLevelsText').textContent = brief.keyLevels;
          }
          if (brief.note) {
            const noteEl = document.getElementById('briefNote');
            noteEl.classList.remove('hidden');
            noteEl.textContent = brief.note;
          }
          if (brief.postedAt) {
            document.getElementById('briefPostedTime').textContent = '· ' + new Date(brief.postedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
          }
        }
      } catch (e) {}
    }

    // ── Signal Archive ────────────────────────────────────────────
    let _signalArchiveCache = [];
    let _journalCache = [];
    // ── Academy Modules ──
    function renderCompletedModules(modules) {
      if (!modules || !Array.isArray(modules)) return;
      modules.forEach(moduleId => {
        const modCard = document.getElementById(moduleId);
        if (modCard) {
          const btn = modCard.querySelector('.academy-complete-btn');
          if (btn) {
            btn.innerHTML = '<i data-feather="check-circle" class="w-3.5 h-3.5"></i> Completed';
            btn.className = 'flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700/30 border border-gray-600/30 text-emerald-500 text-xs font-bold cursor-default';
            btn.removeAttribute('onclick');
            modCard.classList.add('border-emerald-500/30');
            modCard.classList.remove('border');
          }
        }
      });
      feather.replace();
    }

    async function markModuleComplete(moduleId) {
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const btn = document.querySelector(`#${moduleId} .academy-complete-btn`);
        if (btn) btn.innerHTML = '<i data-feather="loader" class="w-3.5 h-3.5 animate-spin"></i> Saving...';
        
        const res = await fetch('/api/academy/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify({ moduleId })
        });
        const data = await res.json();
        if (data.ok && data.completedModules) {
          if (window.__currentUser__) window.__currentUser__.completedModules = data.completedModules;
          renderCompletedModules(data.completedModules);
        } else {
          alert('Failed to mark complete: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        console.error(err);
      }
    }

    // ── Partner Program ──
    async function loadPartnerStats() {
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      if (!token) return;
      try {
        const res = await fetch('/api/partner/stats', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.stats) {
          document.getElementById('partnerProgramSection').classList.remove('hidden');
          document.getElementById('partnerSignups').textContent = data.stats.paidSignups;
          document.getElementById('partnerEarnings').textContent = '$' + parseFloat(data.stats.totalEarnings).toFixed(2);
          document.getElementById('partnerLink').value = data.stats.referralLink;
        }
      } catch (err) {
        console.error('Failed to load partner stats', err);
      }
    }

    function copyPartnerLink() {
      const input = document.getElementById('partnerLink');
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value);
      alert('Invite link copied to clipboard!');
    }

    async function loadSignalArchive() {
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      const container = document.getElementById('signalArchiveList');
      if (!container) return;
      if (!token) {
        container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">Please log in to view signal archive.</p>';
        return;
      }
      container.innerHTML = '<p class="text-gray-400 text-[11px] text-center py-4 animate-pulse">Loading archive...</p>';
      try {
        const res = await fetch('/api/signals?limit=100', { headers: { 'x-vip-token': token } });
        if (!res.ok) {
          container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">No signals found.</p>';
          return;
        }
        const data = await res.json();
        if (data.ok && data.signals && data.signals.length) {
          _signalArchiveCache = data.signals;
          renderArchive(_signalArchiveCache);
        } else {
          container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">No signals found.</p>';
        }
      } catch (e) {
        container.innerHTML = '<p class="text-rose-400 text-[11px] text-center py-4">Error loading archive.</p>';
      }
    }
    let _archiveCategoryFilter = '';
    let _archivePage = 0;


    function setArchiveCategory(cat) {
      _archiveCategoryFilter = cat;
      // Update chip styles
      ['', 'Forex', 'Gold', 'Crypto', 'Indices', 'Commodities'].forEach(c => {
        const chipId = c === '' ? 'chip-all' : 'chip-' + c;
        const chip = document.getElementById(chipId);
        if (!chip) return;
        if (c === cat) {
          chip.className = 'px-3 py-1 rounded-full text-[10px] font-bold border border-sky-400/50 bg-sky-400/20 text-sky-300 transition cursor-pointer';
        } else {
          chip.className = 'px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 bg-black/30 text-gray-400 hover:text-white hover:border-white/30 transition cursor-pointer';
        }
      });
      filterArchive();
    }

    function filterArchive() {
      _archivePage = 0;
      const filter = document.getElementById('archiveFilter')?.value || '';
      const search = (document.getElementById('archiveSearch')?.value || '').toLowerCase();
      
      let filtered = _signalArchiveCache;
      
      if (filter) {
        filtered = filtered.filter(s => (s.outcome || 'Running') === filter);
      }
      
      if (_archiveCategoryFilter) {
        filtered = filtered.filter(s => {
          const cat = (s.category || '').toLowerCase();
          const text = (s.text || '').toLowerCase();
          const filterLower = _archiveCategoryFilter.toLowerCase();
          // Match Gold against XAUUSD text
          if (_archiveCategoryFilter === 'Gold') {
            return cat === 'gold' || cat === 'commodities' && text.includes('xau') || text.includes('xauusd') || text.includes('gold');
          }
          return cat === filterLower;
        });
      }
      
      if (search) {
        filtered = filtered.filter(s => {
          const text = (s.text || '').toLowerCase();
          const category = (s.category || '').toLowerCase();
          return text.includes(search) || category.includes(search);
        });
      }
      
      renderArchive(filtered);
    }
    function archiveChangePage(delta) {
      _archivePage += delta;
      filterArchive();
    }
    const _SIGNAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    function renderArchive(signals) {
      const container = document.getElementById('signalArchiveList');
      if (!container) return;
      if (!signals || !signals.length) {
        container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">No signals match this filter.</p>';
        return;
      }

      const now = Date.now();
      const outcomeMap = {
        'TP Hit':    ['text-emerald-400', '✅'],
        'SL Hit':    ['text-rose-400',    '❌'],
        'Breakeven': ['text-amber-400',   '➖'],
        'Running':   ['text-sky-400',     '🔄'],
        'Expired':   ['text-gray-500',    '⏱️'],
      };

      container.innerHTML = signals.map((s, idx) => {
        const rawDate = s.postedAt || s.sentAt;
        const sentMs  = rawDate ? new Date(rawDate).getTime() : 0;

        // Client-side 24h auto-expiry: if Running but older than 24h, show as Expired
        let outcome = s.outcome || 'Running';
        if (outcome === 'Running' && sentMs && (now - sentMs) > _SIGNAL_TTL_MS) {
          outcome = 'Expired';
        }

        const [cls, icon] = outcomeMap[outcome] || ['text-gray-400', '—'];
        const date = sentMs ? new Date(sentMs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

        // Pair from server or fallback regex
        const pair = s.pair && s.pair !== 'N/A'
          ? s.pair
          : (s.text?.match(/\b(XAUUSD|XAGUSD|BTCUSD|ETHUSD|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD|GBPJPY|EURJPY|US30|NAS100|SPX500|US100|OIL|GER40)\b/i)?.[1]?.toUpperCase() || 'SIGNAL');
        const cat = s.category || 'Forex';

        // First 5 are rendered normally; rest rendered but hidden behind scroll
        return `<div class="flex items-center justify-between py-1.5 px-3 rounded-xl bg-black/30 border border-white/5 hover:bg-white/5 transition">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[9px] text-gray-500 font-bold uppercase tracking-wider w-14 shrink-0">${cat}</span>
            <span class="text-white text-xs font-bold truncate">${pair}</span>
          </div>
          <div class="flex items-center gap-3 shrink-0 ml-2">
            <span class="text-gray-600 text-[9px]">${date}</span>
            <span class="${cls} text-[10px] font-bold whitespace-nowrap">${icon} ${outcome}</span>
          </div>
        </div>`;
      }).join('');

      // Scroll to top so most recent signal is always first
      container.scrollTop = 0;
    }



    // ── Badges ───────────────────────────────────────────────────
    function renderBadges(badges) {
      const section = document.getElementById('badgesSection');
      const list = document.getElementById('badgesList');
      if (!list) return;
      if (!badges || badges.length === 0) { if (section) section.classList.add('hidden'); return; }
      if (section) section.classList.remove('hidden');
      list.innerHTML = badges.map(b => `
        <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-300" title="${b.description}">
          <span class="text-base">${b.icon}</span>
          <span class="text-[10px] font-black">${b.name}</span>
        </div>`).join('');
    }

    // ── PWA Install Prompt ────────────────────────────────────────
    let _pwaPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _pwaPrompt = e;
      if (!localStorage.getItem('pwa_dismissed')) showPwaBanner();
    });
    function showPwaBanner() {
      if (document.getElementById('pwaBanner')) return;
      const banner = document.createElement('div');
      banner.id = 'pwaBanner';
      banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;width:calc(100% - 32px);max-width:440px;';
      banner.innerHTML = `
        <div style="background:linear-gradient(135deg,#1c1020,#111827);border:1px solid rgba(251,191,36,0.3);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 40px rgba(0,0,0,0.6);">
          <span style="font-size:24px;flex-shrink:0;">📲</span>
          <div style="flex:1;min-width:0;">
            <p style="color:#fff;font-weight:800;font-size:12px;margin:0 0 2px;">Add to Home Screen</p>
            <p style="color:#9ca3af;font-size:10px;margin:0;">Get faster access & better notifications</p>
          </div>
          <button onclick="installPwa()" style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#0d0800;font-weight:800;font-size:11px;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;flex-shrink:0;">Install</button>
          <button onclick="dismissPwa()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:18px;padding:4px;flex-shrink:0;">×</button>
        </div>`;
      document.body.appendChild(banner);
    }
    async function installPwa() {
      if (!_pwaPrompt) return;
      _pwaPrompt.prompt();
      const { outcome } = await _pwaPrompt.userChoice;
      if (outcome === 'accepted') localStorage.setItem('pwa_dismissed', '1');
      document.getElementById('pwaBanner')?.remove();
    }
    function dismissPwa() {
      localStorage.setItem('pwa_dismissed', '1');
      document.getElementById('pwaBanner')?.remove();
    }

    async function loadLeaderboard() {
      const container = document.getElementById('leaderboardList');
      if (!container) return;
      
      const token = sessionStorage.getItem('vip_session_token') || localStorage.getItem('vip_session_token');
      if (!token) return;

      try {
        container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">Loading leaderboard...</p>';
        const res = await fetch('/api/journal/leaderboard', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        
        if (data.ok && data.leaderboard && data.leaderboard.length > 0) {
          container.innerHTML = '';
          data.leaderboard.forEach((user, index) => {
            let rankBadge = `<div class="w-6 h-6 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-[10px] font-black text-gray-400">${index + 1}</div>`;
            if (index === 0) rankBadge = `<div class="w-6 h-6 rounded-full bg-yellow-400/20 border border-yellow-400/50 flex items-center justify-center text-[10px] font-black text-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]">1</div>`;
            if (index === 1) rankBadge = `<div class="w-6 h-6 rounded-full bg-gray-300/20 border border-gray-300/50 flex items-center justify-center text-[10px] font-black text-gray-300 shadow-[0_0_10px_rgba(209,213,219,0.3)]">2</div>`;
            if (index === 2) rankBadge = `<div class="w-6 h-6 rounded-full bg-amber-700/20 border border-amber-700/50 flex items-center justify-center text-[10px] font-black text-amber-600 shadow-[0_0_10px_rgba(180,83,9,0.3)]">3</div>`;
            
            const pipsClass = user.netPL >= 0 ? 'text-emerald-400' : 'text-rose-400';
            
            const html = `
              <div class="grid grid-cols-12 gap-2 p-3 border-b border-white/5 items-center hover:bg-white/5 transition">
                <div class="col-span-2 flex justify-center">${rankBadge}</div>
                <div class="col-span-6 flex flex-col">
                  <span class="text-white text-xs font-bold truncate">${user.name}</span>
                  <span class="text-gray-500 text-[9px] font-medium">${user.winRate}% Win Rate</span>
                </div>
                <div class="col-span-4 text-right">
                  <span class="${pipsClass} font-black text-sm">${user.netPL > 0 ? '+' : ''}${user.netPL}</span>
                </div>
              </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
          });
        } else {
          container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-4">No data yet.</p>';
        }
      } catch (err) {
        container.innerHTML = '<p class="text-rose-400 text-[11px] text-center py-4">Error loading leaderboard.</p>';
      }
    }

    async function loadMyBookings() {
      const token = sessionStorage.getItem('vip_session_token');
      if (!token) return;
      const container = document.getElementById('bookingsList');
      const wrapper = document.getElementById('myBookingsContainer');
      if (!container || !wrapper) return;
      
      try {
        const res = await fetch('/api/bookings', { headers: { 'x-vip-token': token } });
        const data = await res.json();
        if (data.ok && data.bookings && data.bookings.length > 0) {
          wrapper.classList.remove('hidden');
          container.innerHTML = data.bookings.map(b => {
            const statusColor = b.status === 'Accepted' ? 'text-emerald-400'
              : b.status === 'Completed' ? 'text-gold'
              : b.status === 'Cancelled' ? 'text-rose-400'
              : 'text-gray-400';
            return `
              <div class="rounded-xl border border-white/10 bg-white/5 p-3">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <p class="text-white text-xs font-semibold truncate flex-1">${b.date} at ${b.time} (UTC)</p>
                  <span class="shrink-0 text-[9px] font-bold ${statusColor} px-2 py-0.5 rounded border border-current/20 bg-current/10">${b.status}</span>
                </div>
                <p class="text-gray-400 text-[10px] italic truncate">Topic: ${b.topic}</p>
              </div>
            `;
          }).join('');
        } else {
          wrapper.classList.remove('hidden');
          container.innerHTML = '<p class="text-gray-500 text-[11px] text-center py-3 italic">No sessions booked yet — request one above.</p>';
        }
      } catch (err) {
        console.error('Failed to load bookings');
      }
    }

    async function handleUpdateProfile(e) {
      e.preventDefault();
      const name = document.getElementById('profileName').value.trim();
      const avatar = document.getElementById('profileAvatar').value;
      const leaderboardOptOut = document.getElementById('leaderboardOptOut').checked;
      const errorEl = document.getElementById('profileError');
      const btn = document.getElementById('profileBtn');
      const token = sessionStorage.getItem('vip_session_token');

      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Updating...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.className = 'text-[11px] min-h-[14px]';

      try {
        const payload = { name, leaderboardOptOut };
        if (avatar) payload.avatar = avatar;

        const res = await fetch('/api/update-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          errorEl.className = 'text-emerald-400 text-[11px] min-h-[14px]';
          errorEl.textContent = '✅ Profile updated!';
          document.getElementById('vipWelcomeText').textContent = `Welcome, ${data.name}!`;
          localStorage.setItem('pa_vip_user_name', data.name);
          if (data.avatar) {
             localStorage.setItem('pa_vip_user_avatar', data.avatar);
             setAvatar(data.avatar);
          }
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
          btn.className = 'plan-btn-crypto flex flex-col items-center py-2.5 px-1 rounded-xl border border-gold/50 bg-gold/10 text-gold cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-gold text-black text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
        } else {
          btn.className = 'plan-btn-crypto flex flex-col items-center py-2.5 px-1 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:border-gold/30 cursor-pointer transition text-center relative overflow-hidden';
          if(p === '6months') btn.innerHTML += '<div class="absolute top-0 right-0 bg-gold/50 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-bl-lg">POPULAR</div>';
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
    // ── Tier Switching (Gold / Platinum) ───────────────────────
    let activeTier = 'gold';
    function switchTier(tier) {
      activeTier = tier;
      const goldBtn = document.getElementById('tierGoldBtn');
      const platBtn = document.getElementById('tierPlatinumBtn');
      const banner  = document.getElementById('platinumBanner');
      // Gold plan divs
      const mpGold  = document.getElementById('mpesaGoldPlans');
      const cpGold  = document.getElementById('cryptoGoldPlans');
      // Platinum plan divs
      const mpPlat  = document.getElementById('mpesaPlatinumPlans');
      const cpPlat  = document.getElementById('cryptoPlatinumPlans');

      if (tier === 'platinum') {
        goldBtn.className = 'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-white/10 bg-white/5 text-gray-400 hover:border-amber-400/30 cursor-pointer transition-all';
        platBtn.className = 'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-violet-500/60 bg-gradient-to-b from-violet-500/15 to-transparent text-violet-300 cursor-pointer transition-all';
        banner.classList.remove('hidden');
        mpGold.classList.add('hidden'); mpPlat.classList.remove('hidden');
        cpGold.classList.add('hidden'); cpPlat.classList.remove('hidden');
        // Auto-select first platinum plan in active tab
        selectMpesaPlan('1month_platinum');
        selectCryptoPlan('1month_platinum');
      } else {
        platBtn.className = 'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-white/10 bg-white/5 text-gray-400 hover:border-violet-400/40 cursor-pointer transition-all';
        goldBtn.className = 'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-amber-400/60 bg-gradient-to-b from-amber-400/15 to-transparent text-amber-400 cursor-pointer transition-all';
        banner.classList.add('hidden');
        mpPlat.classList.add('hidden'); mpGold.classList.remove('hidden');
        cpPlat.classList.add('hidden'); cpGold.classList.remove('hidden');
        // Auto-select first gold plan
        selectMpesaPlan('1month');
        selectCryptoPlan('1month');
      }
    }

    function switchPayTab(tab) {
      const mpesaPanel = document.getElementById('mpesaPanel');
      const cryptoPanel = document.getElementById('cryptoPanel');
      const tabMpesa = document.getElementById('tabMpesa');
      const tabCrypto = document.getElementById('tabCrypto');

      if (tab === 'mpesa') {
        mpesaPanel.classList.remove('hidden');
        cryptoPanel.classList.add('hidden');
        tabMpesa.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 transition duration-200 cursor-pointer';
        tabCrypto.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-gold-hover/20 bg-white/5 text-gray-400 hover:border-gold-hover/40 hover:text-gold transition duration-200 cursor-pointer';
      } else {
        mpesaPanel.classList.add('hidden');
        cryptoPanel.classList.remove('hidden');
        tabCrypto.className = 'flex-1 py-2.5 rounded-xl text-xs font-bold border border-gold-hover/40 bg-gold-hover/10 text-gold transition duration-200 cursor-pointer';
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
          btn.className = 'flex-1 py-2 rounded-lg text-xs font-bold border border-gold/40 bg-gold/10 text-gold transition cursor-pointer';
        } else {
          btn.className = 'flex-1 py-2 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-gray-400 hover:border-gold/30 hover:text-amber-300 transition cursor-pointer';
        }
      });
      // Update wallet address display
      const addrEl = document.getElementById('cryptoWalletAddress');
      if (addrEl) addrEl.textContent = cryptoWallets[net] || '—';
      // Update warning note
      const noteEl = document.getElementById('cryptoNetworkNote');
      if (noteEl) noteEl.innerHTML = `⚠️ Only send USDT on the <span class="text-gold font-bold">${networkNames[net]}</span> network to this address`;
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
            btn.innerHTML = '<i data-feather="copy" class="w-3.5 h-3.5 text-gold"></i>';
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
      const msgEl = document.getElementById(type + 'PromoMsg');
      const token = sessionStorage.getItem('vip_session_token');

      if (!code) {
        if (msgEl) { msgEl.className = 'text-rose-400 text-xs'; msgEl.textContent = 'Please enter a promo code.'; }
        return;
      }
      if (msgEl) { msgEl.className = 'text-gray-400 text-xs'; msgEl.textContent = 'Validating…'; }

      try {
        const plan = type === 'mpesa' ? selectedMpesaPlan : selectedCryptoPlan;
        const res = await fetch('/api/payment/validate-promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vip-token': token || '' },
          body: JSON.stringify({ promoCode: code, plan })
        });
        const data = await res.json();

        if (data.ok) {
          if (msgEl) {
            msgEl.className = 'text-emerald-400 text-xs font-bold';
            msgEl.innerHTML = `🎉 ${data.discount}% discount applied!`;
          }
          const payBtn = document.getElementById(type === 'mpesa' ? 'payBtn' : 'cryptoSubmitBtn');
          if (type === 'mpesa' && payBtn) {
            payBtn.innerHTML = `Pay KES ${Number(data.finalKes).toLocaleString()} via M-Pesa 💸`;
          } else if (payBtn) {
            payBtn.innerHTML = `Submit Payment Proof ($${data.finalUsd} USDT) ✅`;
          }
        } else {
          if (msgEl) { msgEl.className = 'text-rose-400 text-xs'; msgEl.textContent = `❌ ${data.error}`; }
        }
      } catch (err) {
        if (msgEl) { msgEl.className = 'text-rose-400 text-xs'; msgEl.textContent = '❌ Failed to validate promo.'; }
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
        btnLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-gold-hover/40 bg-gold-hover/10 text-gold transition cursor-pointer';
        btnRegister.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-white/5 bg-white/5 text-gray-400 hover:text-gold transition cursor-pointer';
        nameGroup.classList.add('hidden');
        btnSubmit.innerHTML = 'Log In 🔓';
      } else {
        btnRegister.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-gold-hover/40 bg-gold-hover/10 text-gold transition cursor-pointer';
        btnLogin.className = 'flex-1 py-2 rounded-xl text-xs font-bold border border-white/5 bg-white/5 text-gray-400 hover:text-gold transition cursor-pointer';
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

    // 2FA state
    let _2faEmail = '';

    function cancelTwoFa() {
      _2faEmail = '';
      document.getElementById('twoFaStep').classList.add('hidden');
      document.getElementById('loginFields').classList.remove('hidden');
      document.getElementById('authBtn').classList.remove('hidden');
      document.getElementById('authError').textContent = '';
    }

    async function handleOtpVerify() {
      const otp = document.getElementById('authOtp').value.trim();
      const errorEl = document.getElementById('authError');
      const btn = document.getElementById('otpVerifyBtn');
      if (!otp || otp.length !== 6) { errorEl.textContent = '❌ Enter the full 6-digit code.'; return; }
      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Verifying...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      try {
        const res = await fetch('/api/verify-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: _2faEmail, otp })
        });
        const data = await res.json();
        if (data.ok) {
          sessionStorage.setItem('vip_session_token', data.sessionToken);
          localStorage.setItem('vip_session_token', data.sessionToken);
          localStorage.setItem('pa_vip_user_name', data.user.name || _2faEmail.split('@')[0]);
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('return') === 'journal') { window.location.href = 'journal.html'; return; }
          checkUserAccess();
        } else {
          errorEl.textContent = '❌ ' + (data.error || 'Invalid code.');
        }
      } catch (err) {
        errorEl.textContent = '❌ Server error. Try again.';
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }

    let isAuthenticating = false;
    async function handleAuth(e) {
      e.preventDefault();
      if (isAuthenticating) return;
      isAuthenticating = true;

      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      const name = document.getElementById('authName').value.trim();
      const errorEl = document.getElementById('authError');
      const btn = document.getElementById('authBtn');
      
      if (authMode === 'register') {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!passwordRegex.test(password)) {
          errorEl.textContent = '❌ Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.';
          isAuthenticating = false;
          return;
        }
      }

      const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
      const urlRef = new URLSearchParams(window.location.search).get('ref');
      const body = authMode === 'login' ? { email, password } : { email, password, name, referralCode: urlRef || undefined };
      
      const origText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Processing...</span>';
      btn.disabled = true;
      errorEl.textContent = '';
      errorEl.style.color = '';

      const wakeTimeout = setTimeout(() => {
        if (btn.disabled && !errorEl.textContent) {
          errorEl.style.color = '#fbbf24'; // text-yellow-400
          errorEl.textContent = 'Server is waking up (can take up to 60s). Please wait...';
        }
      }, 5000);
      
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.ok && data.twoFaRequired) {
          // 2FA: show OTP step
          _2faEmail = email;
          document.getElementById('loginFields').classList.add('hidden');
          document.getElementById('authBtn').classList.add('hidden');
          document.getElementById('twoFaStep').classList.remove('hidden');
          document.getElementById('authOtp').focus();
          errorEl.textContent = '';
        } else if (data.ok) {
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
          errorEl.style.color = '';
          errorEl.textContent = `❌ ${data.error || 'Authentication failed'}`;
        }
      } catch (err) {
        errorEl.style.color = '';
        errorEl.textContent = '❌ Server error. Please try again.';
      } finally {
        clearTimeout(wakeTimeout);
        btn.innerHTML = origText;
        btn.disabled = false;
        isAuthenticating = false;
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

      socket.on('paymentSuccess', (data) => {
        const userId = localStorage.getItem('pa_user_id');
        if (data.userId === userId) {
          showToast('Payment Successful', data.message || 'VIP Access Unlocked! Please refresh if the page doesn\'t automatically update.', 'success');
          // Optionally trigger a silent reload of the user's data here
          setTimeout(() => window.location.reload(), 3000);
        }
      });

      socket.on('newSignal', (data) => {
        showToast('New Trade Signal ⚡', 'A new signal has been posted to the VIP group!', 'info');
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
        
        let avatarHtml = '';
        if (msg.avatar) {
          if (msg.avatar.startsWith('data:image')) {
            avatarHtml = `<img src="${msg.avatar}" class="w-5 h-5 rounded-full object-cover shrink-0 border border-white/10" />`;
          } else {
            avatarHtml = `<div class="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] shrink-0 border border-white/10">${msg.avatar}</div>`;
          }
        } else {
          avatarHtml = `<div class="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10"><i data-feather="user" class="w-2.5 h-2.5 text-gray-500"></i></div>`;
        }

        const msgHtml = `
          <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} w-full mt-2 animate-fade-in-up">
            <div class="flex items-center gap-1.5 mb-1 ${isSelf ? 'flex-row-reverse' : ''}">
              ${avatarHtml}
              <span class="text-[10px] text-gray-500">${msg.author} • ${timeStr}</span>
            </div>
            <div class="max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isSelf ? 'bg-gold-hover/20 border border-gold-hover/30 text-amber-50 rounded-tr-sm' : 'bg-white/10 border border-white/5 text-gray-200 rounded-tl-sm'}">
              ${msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </div>
          </div>
        `;
        chatContainer.insertAdjacentHTML('afterbegin', msgHtml);
        if (typeof feather !== 'undefined') feather.replace();
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
        const res = await fetch(`/api/me?t=${Date.now()}`, { headers: { 'x-vip-token': token } });
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
              // 12-hour grace period for new members
              const GRACE_HOURS = 12;
              const createdAt = data.user.createdAt ? new Date(data.user.createdAt).getTime() : Date.now();
              const hoursSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60);

              // Build Telegram link for all buttons
              const tgLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${data.user.id}`;
              const tgBtn = document.getElementById('blockerTelegramLinkBtn');
              if (tgBtn) tgBtn.href = tgLink;
              const softTgBtn = document.getElementById('softWarningTelegramBtn');
              if (softTgBtn) softTgBtn.href = tgLink;

              if (hoursSinceCreation < GRACE_HOURS) {
                // Within grace period: show resources with a soft warning banner
                document.getElementById('telegramBlocker').classList.add('hidden');
                document.getElementById('vipMainContent').classList.remove('hidden');
                const softWarning = document.getElementById('telegramSoftWarning');
                if (softWarning) {
                  const hoursLeft = Math.ceil(GRACE_HOURS - hoursSinceCreation);
                  const warningText = document.getElementById('telegramWarningText');
                  if (warningText) warningText.textContent = `You have ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left to link your Telegram before access is restricted.`;
                  softWarning.classList.remove('hidden');
                }
              } else {
                // Grace period expired: show hard blocker
                document.getElementById('telegramBlocker').classList.remove('hidden');
                document.getElementById('vipMainContent').classList.add('hidden');
              }
            } else {
              document.getElementById('telegramBlocker').classList.add('hidden');
              document.getElementById('vipMainContent').classList.remove('hidden');
            }
            
            document.getElementById('vipWelcomeText').textContent = `Welcome, ${data.user.name || 'VIP Member'}!`;
            updateDownloadLinks();
            loadTodaysSetup();
            loadTodaysSetupResults();
            loadLeaderboard();
            loadSignalStats();
            loadDailyBrief();
            loadSignalArchive();
            loadPartnerStats();
            if (data.user.badges) renderBadges(data.user.badges);
            if (data.user.completedModules) renderCompletedModules(data.user.completedModules);
            loadChatMessages();
            try {
              if (typeof io !== 'undefined') {
                initSocket(token); // Init real-time chat
              } else {
                console.warn('[Premium] socket.io not loaded, chat real-time updates disabled.');
              }
            } catch (err) {
              console.error('[Premium] initSocket error:', err);
            }
            loadCountdownFromSignals();

            // ── Onboarding Tour (first login only) ──────────────
            if (!localStorage.getItem('pa_tour_done')) {
              setTimeout(() => startOnboardingTour(), 1200);
            }

            // ── Show/Hide Platinum Mentorship Card ────────────────────────
            const tier = String(data.user.subscriptionTier || 'Gold').toLowerCase();
            const isPlatinum = tier.includes('platinum');
            const mentorCard = document.getElementById('mentorshipCard');
            const mentorLock = document.getElementById('mentorshipLockCard');
            if (mentorCard && mentorLock) {
              if (isPlatinum) {
                mentorCard.classList.remove('hidden');
                mentorLock.classList.add('hidden');
                loadMyBookings();
                loadJournalEntries();
              } else {
                mentorCard.classList.add('hidden');
                mentorLock.classList.remove('hidden');
                loadJournalEntries();
              }
            }

            // ── Show/Hide Resources ───────────────────────────────────────
            const goldRes = document.getElementById('goldResources');
            const platRes = document.getElementById('platinumResources');
            if (goldRes) goldRes.classList.remove('hidden'); // Available to everyone
            if (platRes) {
              if (isPlatinum) platRes.classList.remove('hidden');
              else platRes.classList.add('hidden');
            }

            // ── Tier badge on welcome banner ──────────────────────────
            const tierBadge = document.getElementById('tierBadge');
            if (tierBadge) {
              if (isPlatinum) {
                tierBadge.textContent = '💎 Platinum';
                tierBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-violet-500/20 border-violet-400/40 text-violet-300';
              } else {
                tierBadge.textContent = '⭐ Gold';
                tierBadge.className = 'text-[10px] font-black px-2.5 py-0.5 rounded-full border bg-gold/10 border-gold/30 text-gold';
              }
              tierBadge.classList.remove('hidden');
            }

            // ── Expiry date on welcome banner + account modal ─────────
            const expiryEl = document.getElementById('vipExpiryText');
            const accountExpiryEl = document.getElementById('accountExpiryLabel');
            const accountTierEl = document.getElementById('accountTierLabel');
            let daysLeft = null;
            if (data.user.subscriptionExpiry) {
              const expiryDate = new Date(data.user.subscriptionExpiry);
              daysLeft = Math.ceil((data.user.subscriptionExpiry - Date.now()) / (1000 * 60 * 60 * 24));
              const expiryStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              if (expiryEl) {
                if (data.user.isTrial) {
                  expiryEl.innerHTML = `<span class="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30 text-[10px] font-black tracking-wider uppercase mr-2 shadow-[0_0_10px_rgba(245,158,11,0.2)]">Trial Active</span> Expires ${expiryStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;
                } else {
                  expiryEl.textContent = `Expires ${expiryStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`;
                }
              }
              if (accountExpiryEl) accountExpiryEl.textContent = expiryStr;
            }
            if (accountTierEl) accountTierEl.textContent = isPlatinum ? '💎 VIP Platinum' : '⭐ VIP Gold';

            // ── Expiry warning toast (≤7 days left) ────────────────
            if (daysLeft !== null && daysLeft <= 7 && daysLeft > 0) {
              showToast('VIP Expiring Soon', `⚠️ Your VIP expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}! Renew now to keep access.`, 'info');
            }

            // ── Platinum-only chat tab ────────────────────────────────
            const platTab = document.getElementById('tab-room-platinum');
            if (platTab) {
              if (isPlatinum) platTab.classList.remove('hidden');
              else platTab.classList.add('hidden');
            }

            feather.replace();
            document.getElementById('profileName').value = data.user.name || '';
            document.getElementById('leaderboardOptOut').checked = !!data.user.leaderboardOptOut;
            if (data.user.avatar) {
              setAvatar(data.user.avatar);
              localStorage.setItem('pa_vip_user_avatar', data.user.avatar);
            }
            
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

            feather.replace();
          } else {
            // VIP expired or no VIP
            document.getElementById('contentPanel').classList.add('hidden');
            document.getElementById('paymentPanel').style.display = 'block';
            if (data.user && data.user.isTrial) {
              const trialMsg = document.getElementById('trialExpiredMessage');
              if (trialMsg) trialMsg.classList.remove('hidden');
            }
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
          badge.classList.remove('animate-pulse', 'bg-gold-hover/20', 'text-gold', 'border-gold-hover/30');
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



    // INITIALIZATION — safe whether script loads before or after DOMContentLoaded
    function initPremiumDashboard() {
      // Check for reset password token
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('resetToken')) {
        const resetModal = document.getElementById('resetPasswordModal');
        resetModal.classList.remove('hidden');
        setTimeout(() => resetModal.classList.remove('opacity-0'), 10);
      }

      feather.replace();
      checkUserAccess();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initPremiumDashboard);
    } else {
      // DOM already loaded (script is at bottom of body) — run immediately
      initPremiumDashboard();
    }

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
      ['general', 'vip', 'signals', 'platinum'].forEach(r => {
        const btn = document.getElementById(`tab-room-${r}`);
        if (!btn) return;
        if (r === room) {
          if(r==='vip')      btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-gold/40 bg-gold/10 text-gold relative';
          if(r==='general')  btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 relative';
          if(r==='signals')  btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-sky-400/40 bg-sky-400/10 text-sky-400 relative';
          if(r==='platinum') btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-violet-500/60 bg-violet-500/20 text-violet-300 relative';
        } else {
          if(r==='platinum') btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 relative';
          else btn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition border border-white/10 bg-white/5 text-gray-400 hover:text-white relative';
        }
      });

      // Clear badges
      if (room === 'signals') {
        const badge = document.getElementById('signalsUnreadBadge');
        if(badge) badge.classList.add('hidden');
      }

      // Hide input if Signals room; read-only notice
      if (room === 'signals') {
        document.getElementById('chatForm').classList.add('hidden');
        document.getElementById('readOnlyNotice').classList.remove('hidden');
      } else {
        document.getElementById('chatForm').classList.remove('hidden');
        document.getElementById('readOnlyNotice').classList.add('hidden');
      }

      // Clear UI and Reload
      const chatContainer = document.getElementById('chatMessages');
      chatContainer.innerHTML = '<div class="text-center text-gray-500 py-10 w-full"><i data-feather="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-gold/50"></i><p class="text-xs">Loading room...</p></div>';
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
              
              let avatarHtml = '';
              if (msg.avatar) {
                if (msg.avatar.startsWith('data:image')) {
                  avatarHtml = `<img src="${msg.avatar}" class="w-5 h-5 rounded-full object-cover shrink-0 border border-white/10" />`;
                } else {
                  avatarHtml = `<div class="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] shrink-0 border border-white/10">${msg.avatar}</div>`;
                }
              } else {
                avatarHtml = `<div class="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10"><i data-feather="user" class="w-2.5 h-2.5 text-gray-500"></i></div>`;
              }

              return `
                <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} w-full mt-2">
                  <div class="flex items-center gap-1.5 mb-1 ${isSelf ? 'flex-row-reverse' : ''}">
                    ${avatarHtml}
                    <span class="text-[10px] text-gray-500">${msg.author} • ${timeStr}</span>
                  </div>
                  <div class="max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isSelf ? 'bg-gold-hover/20 border border-gold-hover/30 text-amber-50 rounded-tr-sm' : 'bg-white/10 border border-white/5 text-gray-200 rounded-tl-sm'}">
                    ${msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </div>
                </div>
              `;
            }).join('');
            if (typeof feather !== 'undefined') feather.replace();
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
