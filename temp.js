
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize AOS
            AOS.init({
                duration: 800,
                once: true,
                offset: 80,
                disable: false,
            });

            // Initialize VanillaTilt on all glass-cards
            VanillaTilt.init(document.querySelectorAll(".glass-card"), {
                max: 5,
                speed: 400,
                glare: true,
                "max-glare": 0.2,
            });

            // ── Live Signals Results Cards ────────────────────────────────────────────
            async function loadLiveResults() {
                const container = document.getElementById('results-scroll');
                if (!container) return;
                try {
                    const res = await fetch('/api/performance/all');
                    if (!res.ok) throw new Error('API error');
                    const data = await res.json();
                    
                    const logs = data.logs || [];
                    const signals = logs.slice(0, 8);

                    if (!signals.length) {
                        throw new Error('No signals in database, falling back to dummy data');
                    }

                    container.innerHTML = signals.map(s => {
                        const pair     = s.asset ? s.asset.toUpperCase() : 'Signal';
                        const dir      = s.type ? s.type.toUpperCase() : '';
                        const isWin    = s.result === 'Win' || s.result === 'TP Hit';
                        const isLoss   = s.result === 'Loss' || s.result === 'SL Hit';
                        const isBreak  = s.result === 'Breakeven';
                        const isLive   = s.result === 'Running';

                        const badgeClass = isWin  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                         : isLoss ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                         : isBreak? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                         : 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                        const badgeIcon = isWin  ? 'arrow-up-right'
                                        : isLoss ? 'x'
                                        : isBreak? 'minus' : 'activity';
                        const badgeText = isWin ? 'WIN' : isLoss ? 'LOSS' : isBreak ? 'B/E' : 'LIVE';
                        const pipsClass = isWin ? 'text-gold' : isLoss ? 'text-red-400' : isBreak ? 'text-yellow-400' : 'text-blue-400';
                        
                        const pipsVal   = Math.abs(Number(s.pips) || 0);
                        const pipsStr   = pipsVal ? `${isWin?'+':isLoss?'-':''}${pipsVal} Pips` : (isLive ? 'In Progress' : '—');
                        const date      = s.date ? new Date(s.date).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'2-digit'}) : '';

                        return `
                        <div class="min-w-[280px] md:min-w-[320px] glass-card p-6 snap-start flex-shrink-0">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <h4 class="text-lg font-bold text-white font-heading">${pair}</h4>
                                    <span class="text-xs text-gray-400 capitalize">${dir}</span>
                                </div>
                                <span class="text-xs font-bold px-2.5 py-1 rounded border flex items-center gap-1 ${badgeClass}">
                                    <i data-feather="${badgeIcon}" class="w-3 h-3"></i> ${badgeText}
                                </span>
                            </div>
                            <div class="space-y-2 text-sm text-gray-300 mb-4">
                                <div class="flex justify-between border-b border-white/5 pb-2">
                                    <span>${isWin?'Profit':isLoss?'Loss':isLive?'Status':'Result'}</span>
                                    <span class="font-bold ${pipsClass}">${pipsStr}</span>
                                </div>
                            </div>
                            <div class="text-xs text-gray-500 text-right mt-2">${date}</div>
                        </div>`;
                    }).join('');
                    feather.replace();
                } catch (e) {
                    // Fallback static cards
                    container.innerHTML = `
                    <div class="min-w-[280px] md:min-w-[320px] glass-card p-6 snap-start flex-shrink-0">
                        <div class="flex justify-between items-start mb-4">
                            <div><h4 class="text-lg font-bold text-white font-heading">XAUUSD</h4><span class="text-xs text-gray-400">Gold · Buy</span></div>
                            <span class="bg-green-500/10 text-green-400 text-xs font-bold px-2.5 py-1 rounded border border-green-500/20 flex items-center gap-1"><i data-feather="arrow-up-right" class="w-3 h-3"></i> WIN</span>
                        </div>
                        <div class="space-y-2 text-sm text-gray-300 mb-4">
                            <div class="flex justify-between"><span>Entry</span> <span class="font-mono">2345.50</span></div>
                            <div class="flex justify-between"><span>SL</span> <span class="font-mono text-red-400/80">2330.00</span></div>
                            <div class="flex justify-between border-t border-white/5 pt-2"><span>Profit</span> <span class="font-bold text-gold">+145 Pips</span></div>
                        </div>
                    </div>
                    <div class="min-w-[280px] md:min-w-[320px] glass-card p-6 snap-start flex-shrink-0">
                        <div class="flex justify-between items-start mb-4">
                            <div><h4 class="text-lg font-bold text-white font-heading">GBPUSD</h4><span class="text-xs text-gray-400">Cable · Sell</span></div>
                            <span class="bg-green-500/10 text-green-400 text-xs font-bold px-2.5 py-1 rounded border border-green-500/20 flex items-center gap-1"><i data-feather="arrow-up-right" class="w-3 h-3"></i> WIN</span>
                        </div>
                        <div class="space-y-2 text-sm text-gray-300 mb-4">
                            <div class="flex justify-between"><span>Entry</span> <span class="font-mono">1.2780</span></div>
                            <div class="flex justify-between"><span>SL</span> <span class="font-mono text-red-400/80">1.2810</span></div>
                            <div class="flex justify-between border-t border-white/5 pt-2"><span>Profit</span> <span class="font-bold text-gold">+80 Pips</span></div>
                        </div>
                    </div>`;
                    feather.replace();
                }
            }
            loadLiveResults();

            // ── Also fetch live stats from /api/performance/stats ─────────────
            async function loadLiveStats() {
                try {
                    const res = await fetch('/api/performance/stats');
                    if (!res.ok) throw new Error('no stats');
                    const data = await res.json();
                    if (data.winRate != null) {
                        const el = document.getElementById('publicWinRate');
                        if (el) el.setAttribute('data-target', Math.round(data.winRate));
                    }
                    if (data.totalPips != null) {
                        const el = document.getElementById('publicTotalPips');
                        const val = Math.abs(data.totalPips) > 999 ? Math.round(Math.abs(data.totalPips) / 1000) : Math.abs(data.totalPips);
                        if (el) el.setAttribute('data-target', val);
                    }
                    if (data.totalTrades != null) {
                        const el = document.getElementById('publicTotalTrades');
                        if (el) el.setAttribute('data-target', data.totalTrades);
                    }
                } catch(e) {}
            }
            loadLiveStats();

            // ── Animated Number Counter ───────────────────────────────────
            function animateCounter(el, target, suffix) {
                let start = 0;
                const duration = 1800;
                const step = (timestamp) => {
                    if (!start) start = timestamp;
                    const progress = Math.min((timestamp - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
                    el.textContent = Math.round(eased * target) + (suffix || '');
                    if (progress < 1) requestAnimationFrame(step);
                    else el.textContent = target + (suffix || '');
                };
                requestAnimationFrame(step);
            }

            const statsObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-target') || el.textContent.replace(/\D/g, ''), 10);
                    if (!isNaN(target)) animateCounter(el, target);
                    statsObserver.unobserve(el);
                });
            }, { threshold: 0.5 });

            ['publicWinRate', 'publicTotalPips', 'publicTotalTrades'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    // Store the original value as target
                    el.setAttribute('data-target', el.textContent.replace(/\D/g,''));
                    statsObserver.observe(el);
                }
            });
        });
    